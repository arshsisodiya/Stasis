from flask import jsonify, request
from collections import defaultdict
from urllib.parse import urlparse
from datetime import datetime, timedelta

from src.api.wellbeing_routes import wellbeing_bp, safe, get_selected_date
from src.database.database import get_connection
from src.config.category_manager import get_category
from src.config.ignored_apps_manager import is_ignored


def _week_bounds(date_str=None):
    if date_str:
        date_value = datetime.strptime(date_str, "%Y-%m-%d").date()
    else:
        date_value = datetime.now().date()
    monday = date_value - timedelta(days=date_value.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


# =====================================
# Available Dates
# =====================================

@wellbeing_bp.route("/api/available-dates")
def available_dates():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT DISTINCT date FROM daily_stats ORDER BY date DESC"
        )

        dates = [row[0] for row in cursor.fetchall()]

        return jsonify(dates)

    finally:
        conn.close()


# =====================================
# Heatmap Data
# =====================================

@wellbeing_bp.route("/api/heatmap")
def heatmap():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                date,
                app_name,
                active_seconds,
                CASE
                    WHEN main_category = 'productive'
                    THEN active_seconds
                    ELSE 0
                END
            FROM daily_stats
            WHERE date >= date('now', '-60 days')
            ORDER BY date DESC
        """)

        rows = cursor.fetchall()

        result = {}

        for row in rows:
            date, app, screen, prod = row

            if is_ignored(app):
                continue

            if date not in result:
                result[date] = {
                    "screen_time": 0,
                    "productive_time": 0
                }

            result[date]["screen_time"] += safe(screen)
            result[date]["productive_time"] += safe(prod)

        filtered = {}

        for date in sorted(result.keys(), reverse=True)[:60]:
            screen = result[date]["screen_time"]
            prod = result[date]["productive_time"]

            pct = round((prod / safe(screen, 1)) * 100) if screen else 0

            filtered[date] = {
                "screenTime": screen,
                "productivityPct": pct
            }

        return jsonify(filtered)

    finally:
        conn.close()


# =====================================
# Session Timeline
# =====================================

@wellbeing_bp.route("/api/sessions")
def sessions():
    selected_date = get_selected_date()

    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                al.timestamp,
                al.app_name,
                al.active_seconds,
                al.idle_seconds,
                al.keystrokes,
                al.clicks,
                ds.main_category
            FROM activity_logs al
            LEFT JOIN daily_stats ds
                ON ds.date = ?
                AND ds.app_name = al.app_name
            WHERE al.timestamp LIKE ?
              AND al.active_seconds > 0
            ORDER BY al.timestamp ASC
        """, (selected_date, selected_date + "%"))

        rows = cursor.fetchall()

        return jsonify([
            {
                "ts": r[0],
                "app": r[1],
                "active": safe(r[2]),
                "idle": safe(r[3]),
                "keys": safe(r[4]),
                "clicks": safe(r[5]),
                "cat": r[6] or "other"
            }
            for r in rows if not is_ignored(r[1])
        ])

    finally:
        conn.close()


# =====================================
# Weekly Trend
# =====================================

@wellbeing_bp.route("/api/weekly-trend")
def weekly_trend():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                date,
                app_name,
                active_seconds,
                CASE
                    WHEN main_category = 'productive'
                    THEN active_seconds
                    ELSE 0
                END
            FROM daily_stats
            WHERE date >= date('now', '-14 days')
            ORDER BY date DESC
        """)

        rows = cursor.fetchall()

        grouped = {}

        for row in rows:
            date, app, screen, prod = row

            if is_ignored(app):
                continue

            if date not in grouped:
                grouped[date] = {
                    "screen_time": 0,
                    "prod_time": 0
                }

            grouped[date]["screen_time"] += safe(screen)
            grouped[date]["prod_time"] += safe(prod)

        result = []

        for date in sorted(grouped.keys(), reverse=True)[:14]:
            screen = grouped[date]["screen_time"]
            prod = grouped[date]["prod_time"]

            pct = round((prod / max(screen, 1)) * 100)

            result.append({
                "date": date,
                "screenTime": screen,
                "productivityPct": pct
            })

        result.reverse()

        return jsonify(result)

    finally:
        conn.close()


# =====================================
# Hourly Activity
# =====================================

@wellbeing_bp.route("/api/hourly")
def hourly():
    selected_date = get_selected_date()

    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                strftime('%H', timestamp),
                app_name,
                SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY 1,2
        """, (selected_date + "%",))

        rows = cursor.fetchall()

        hourly_map = {}

        for hour, app, act in rows:

            if is_ignored(app):
                continue

            hourly_map[hour] = hourly_map.get(hour, 0) + act

        hourly_data = [
            safe(hourly_map.get(f"{h:02d}")) // 60
            for h in range(24)
        ]

        return jsonify(hourly_data)

    finally:
        conn.close()


@wellbeing_bp.route("/api/hourly-activity")
def weekly_hourly_activity():
    week_of = request.args.get("week_of")

    try:
        monday, sunday = _week_bounds(week_of)
    except ValueError:
        return jsonify({"error": "week_of must be YYYY-MM-DD"}), 400

    week_end_exclusive = (
        datetime.strptime(sunday, "%Y-%m-%d") + timedelta(days=1)
    ).strftime("%Y-%m-%d")

    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                substr(timestamp, 1, 10) AS log_date,
                strftime('%H', timestamp) AS hour,
                app_name,
                url,
                SUM(active_seconds) AS total_active
            FROM activity_logs
            WHERE timestamp >= ?
              AND timestamp < ?
              AND active_seconds > 0
            GROUP BY log_date, hour, app_name, url
            ORDER BY log_date ASC, hour ASC
        """, (monday, week_end_exclusive))

        buckets = defaultdict(lambda: {"total_seconds": 0, "productive_seconds": 0, "category_seconds": {}})
        for log_date, hour, app_name, url, total_active in cursor.fetchall():
            if is_ignored(app_name):
                continue

            seconds = safe(total_active)
            if seconds <= 0:
                continue

            main_category, _ = get_category(app_name, url)
            # After you compute main_category, track which category dominates the bucket
            bucket = buckets[(log_date, int(hour))]
            bucket["total_seconds"] += seconds
            bucket["category_seconds"][main_category] = bucket["category_seconds"].get(main_category, 0) + seconds
            if main_category == "productive":
                bucket["productive_seconds"] += seconds

        grid = []
        for (log_date, hour), totals in sorted(buckets.items()):
            total_seconds = totals["total_seconds"]
            productive_seconds = totals["productive_seconds"]
            productive_pct = round((productive_seconds / total_seconds) * 100, 1) if total_seconds > 0 else 0

            # Pick the category with most seconds in this hour.
            dominant_category = max(
                totals["category_seconds"],
                key=totals["category_seconds"].get,
            ) if totals["category_seconds"] else "other"

            grid.append({
                "date": log_date,
                "hour": hour,
                "total_seconds": total_seconds,
                "productive_pct": productive_pct,
                "dominant_category": dominant_category,
            })

        return jsonify({
            "week": {"start": monday, "end": sunday},
            "grid": grid,
        })

    finally:
        conn.close()


# =====================================
# Hourly Top Apps
# =====================================

@wellbeing_bp.route("/api/hourly-stats")
def hourly_stats():

    selected_date = get_selected_date()

    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                strftime('%H', timestamp),
                app_name,
                SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY 1,2
            HAVING SUM(active_seconds) > 0
        """, (selected_date + "%",))

        rows = cursor.fetchall()

        by_hour = {}

        for hour, app, active in rows:

            if is_ignored(app):
                continue

            by_hour.setdefault(hour, []).append({
                "app": app.replace(".exe", ""),
                "active": int(active)
            })

        result = {}

        for h in range(24):
            h_str = f"{h:02d}"

            apps = by_hour.get(h_str, [])

            apps.sort(key=lambda x: x["active"], reverse=True)

            result[h_str] = apps[:3]

        return jsonify(result)

    finally:
        conn.close()


# =====================================
# Website Stats
# =====================================

@wellbeing_bp.route("/api/site-stats")
def site_stats():

    selected_date = get_selected_date()
    app = request.args.get("app")

    conn = get_connection()
    cursor = conn.cursor()

    try:

        query = """
            SELECT url, app_name, SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
              AND url IS NOT NULL
              AND url != 'N/A'
        """

        params = [selected_date + "%"]

        if app:
            query += " AND app_name = ?"
            params.append(app)

        query += " GROUP BY url, app_name ORDER BY SUM(active_seconds) DESC"

        cursor.execute(query, tuple(params))

        rows = cursor.fetchall()

        domain_map = defaultdict(int)

        for url, app_name, active in rows:

            if is_ignored(app_name):
                continue

            try:
                parsed = urlparse(url)

                domain = parsed.netloc or parsed.path

                domain = domain.lower().replace("www.", "")

                if "reply" in domain or ".." in domain:
                    continue

                if domain:
                    domain_map[domain] += safe(active)

            except Exception:
                continue

        result = [
            {
                "domain": d,
                "seconds": s,
                "minutes": round(s / 60, 2)
            }
            for d, s in domain_map.items()
        ]

        result = sorted(result, key=lambda x: x["seconds"], reverse=True)[:50]

        return jsonify(result)

    finally:
        conn.close()