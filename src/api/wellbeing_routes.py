"""
Wellbeing API Routes
--------------------
All dashboard, stats, focus, limits endpoints.
"""

import sys
import subprocess
import os
import threading
import time
from flask import Blueprint, jsonify, request, send_file
import datetime
import io
import base64

from src.database.database import (
    get_connection,
    set_app_limit,
    get_all_limits,
    toggle_limit,
    get_blocked_apps,
    delete_app_limit,
    set_temporary_unblock,
    clear_all_tracked_events,
    factory_reset
)
from src.config.storage import get_icons_dir
from src.utils.icon_extractor import extract_icon_as_base64, get_exe_path_by_name
from src.utils.app_discovery import get_installed_apps

wellbeing_bp = Blueprint("wellbeing", __name__)

# =====================================
# Helpers
# =====================================

def safe(value, default=0):
    return value if value is not None else default


def get_selected_date():
    date_param = request.args.get("date")

    if date_param:
        try:
            datetime.datetime.strptime(date_param, "%Y-%m-%d")
            return date_param
        except ValueError:
            pass

    return datetime.date.today().isoformat()


# =====================================
# Health
# =====================================

from src.config.settings_manager import SettingsManager
import json

@wellbeing_bp.route("/api/health")
def health():
    return jsonify({"status": "running"})

from src.config.ignored_apps_manager import load_ignored_apps, is_ignored

# =====================================
# Ignored Apps
# =====================================

@wellbeing_bp.route("/api/ignored-apps")
def ignored_apps():
    try:
        return jsonify(load_ignored_apps())
    except Exception as e:
        print(f"Error loading ignored apps: {e}")
    return jsonify([])

# =====================================
# App Icon
# =====================================

@wellbeing_bp.route("/api/app-icon/<app_name>")
def app_icon(app_name):
    """
    Returns the app icon as a PNG image, with disk and browser caching.
    """
    import hashlib
    safe_name = hashlib.md5(app_name.lower().encode()).hexdigest()
    cache_path = os.path.join(get_icons_dir(), f"{safe_name}.png")

    # 1. Try disk cache first
    if os.path.exists(cache_path):
        return send_file(cache_path, mimetype='image/png', max_age=86400)

    # 2. Extract and cache if not found
    conn = get_connection()
    cursor = conn.cursor()
    try:
        exe_path = get_exe_path_by_name(cursor, app_name)
        if not exe_path:
            return "No icon", 404
        
        icon_b64 = extract_icon_as_base64(exe_path)
        if not icon_b64:
            return "Failed to extract", 404
            
        icon_data = base64.b64decode(icon_b64)
        
        # Save to disk cache
        with open(cache_path, 'wb') as f:
            f.write(icon_data)
            
        return send_file(
            io.BytesIO(icon_data),
            mimetype='image/png',
            max_age=86400
        )
    except Exception as e:
        print(f"Error serving icon for {app_name}: {e}")
        return str(e), 500
    finally:
        conn.close()

# =====================================
# Settings
# =====================================

@wellbeing_bp.route("/api/settings", methods=["GET"])
def get_settings():
    return jsonify({
        "file_logging_enabled": SettingsManager.get_bool("file_logging_enabled", True),
        "file_logging_essential_only": SettingsManager.get_bool("file_logging_essential_only", True),
        "show_yesterday_comparison": SettingsManager.get_bool("show_yesterday_comparison", True),
        "hardware_acceleration": SettingsManager.get_bool("hardware_acceleration", True)
    })

@wellbeing_bp.route("/api/settings/update", methods=["POST"])
def update_settings():
    data = request.json
    if "file_logging_enabled" in data:
        val = "true" if data["file_logging_enabled"] else "false"
        SettingsManager.set("file_logging_enabled", val)
    
    if "file_logging_essential_only" in data:
        val = "true" if data["file_logging_essential_only"] else "false"
        SettingsManager.set("file_logging_essential_only", val)

    if "show_yesterday_comparison" in data:
        val = "true" if data["show_yesterday_comparison"] else "false"
        SettingsManager.set("show_yesterday_comparison", val)
        
    if "hardware_acceleration" in data:
        val = "true" if data["hardware_acceleration"] else "false"
        SettingsManager.set("hardware_acceleration", val)
        
        from src.config.storage import get_base_dir
        import os
        flag_file = os.path.join(get_base_dir(), "hardware_acceleration_disabled.txt")
        if data["hardware_acceleration"]:
            if os.path.exists(flag_file):
                os.remove(flag_file)
        else:
            with open(flag_file, "w") as f:
                f.write("disabled")
        
    return jsonify({"status": "updated"})


# =====================================
# Available Dates
# =====================================

@wellbeing_bp.route("/api/available-dates")
def available_dates():
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT date FROM daily_stats ORDER BY date DESC")
        dates = [row[0] for row in cursor.fetchall()]
        return jsonify(dates)
    finally:
        conn.close()


# =====================================
# Heatmap Data (per-date intensity)
# =====================================

@wellbeing_bp.route("/api/heatmap")
def heatmap():
    """Returns lightweight per-date stats for the calendar heatmap dots."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                date,
                app_name,
                active_seconds,
                CASE WHEN main_category = 'productive' THEN active_seconds ELSE 0 END AS productive_time
            FROM daily_stats
            ORDER BY date DESC
        """)
        rows = cursor.fetchall()
        result = {}
        for row in rows:
            date, app_name, screen, prod = row
            if is_ignored(app_name): continue
            if date not in result:
                result[date] = {"screen_time": 0, "productive_time": 0}
            result[date]["screen_time"] += safe(screen)
            result[date]["productive_time"] += safe(prod)
            
        filtered = {}
        for date in sorted(result.keys(), reverse=True)[:60]:
            screen = result[date]["screen_time"]
            prod = result[date]["productive_time"]
            pct = round((prod / safe(screen, 1)) * 100) if screen else 0
            filtered[date] = {"screenTime": screen, "productivityPct": pct}
            
        return jsonify(filtered)
    finally:
        conn.close()


# =====================================
# Session Timeline (raw activity rows)
# =====================================

@wellbeing_bp.route("/api/sessions")
def sessions():
    """
    Returns activity_logs rows for a date, enriched with category.
    Each row = one tracker tick. Frontend groups these into session blocks.
    """
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
                ON  ds.date      = ?
                AND ds.app_name  = al.app_name
            WHERE al.timestamp LIKE ?
              AND al.active_seconds > 0
            ORDER BY al.timestamp ASC
        """, (selected_date, selected_date + "%"))
        rows = cursor.fetchall()
        return jsonify([
            {
                "ts":     r[0],
                "app":    r[1],
                "active": safe(r[2]),
                "idle":   safe(r[3]),
                "keys":   safe(r[4]),
                "clicks": safe(r[5]),
                "cat":    r[6] or "other",
            }
            for r in rows if not is_ignored(r[1])
        ])
    finally:
        conn.close()


# =====================================
# Weekly Trend (interactive line graph)
# =====================================

@wellbeing_bp.route("/api/weekly-trend")
def weekly_trend():
    """Last 14 days of daily screen time + productivity % for the line graph."""
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                date,
                app_name,
                active_seconds,
                CASE WHEN main_category = 'productive' THEN active_seconds ELSE 0 END AS prod_time
            FROM daily_stats
            ORDER BY date DESC
        """)
        rows = cursor.fetchall()
        grouped = {}
        for row in rows:
            date, app_name, screen, prod = row
            if is_ignored(app_name): continue
            if date not in grouped:
                grouped[date] = {"screen_time": 0, "prod_time": 0}
            grouped[date]["screen_time"] += safe(screen)
            grouped[date]["prod_time"] += safe(prod)
            
        result = []
        for date in sorted(grouped.keys(), reverse=True)[:14]:
            screen = grouped[date]["screen_time"]
            prod = grouped[date]["prod_time"]
            pct = round((prod / max(screen, 1)) * 100)
            result.append({"date": date, "screenTime": screen, "productivityPct": pct})
        result.reverse()   # oldest → newest
        return jsonify(result)
    finally:
        conn.close()


# =====================================
# Wellbeing Summary
# =====================================

@wellbeing_bp.route("/api/wellbeing")
def wellbeing():
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    BASELINE_KPM = 35  # tune later after observing real user data

    try:
        # ---------------------------------
        # 1️⃣ Get category-wise active time
        # ---------------------------------
        cursor.execute("""
            SELECT main_category, SUM(active_seconds), app_name
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
        """, (selected_date,))
        
        category_rows_raw = cursor.fetchall()
        category_data = {}
        for row in category_rows_raw:
            main_cat, active_secs, app_name = row
            if is_ignored(app_name):
                continue
            category_data[main_cat] = category_data.get(main_cat, 0) + active_secs

        productive = safe(category_data.get("productive", 0))

        # Treat "other" as neutral
        neutral = (
            safe(category_data.get("neutral", 0)) +
            safe(category_data.get("other", 0))
        )

        unproductive = safe(category_data.get("unproductive", 0))

        total_active = productive + neutral + unproductive

        # ---------------------------------
        # 2️⃣ Get other totals
        # ---------------------------------
        cursor.execute("""
            SELECT
                SUM(idle_seconds),
                SUM(keystrokes),
                SUM(clicks),
                SUM(sessions),
                app_name
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
        """, (selected_date,))

        rows = cursor.fetchall()
        total_idle = 0
        total_keys = 0
        total_clicks = 0
        total_sessions = 0

        for row in rows:
            if is_ignored(row[4]):
                continue
            total_idle += safe(row[0])
            total_keys += safe(row[1])
            total_clicks += safe(row[2])
            total_sessions += safe(row[3])

        # ---------------------------------
        # 3️⃣ Most used app
        # ---------------------------------
        cursor.execute("""
            SELECT app_name, SUM(active_seconds) AS total
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
            ORDER BY total DESC
        """, (selected_date,))

        top_app = "N/A"
        for app_name, total in cursor.fetchall():
            if not is_ignored(app_name):
                top_app = app_name
                break

        # ---------------------------------
        # 4️⃣ Weighted Productivity Logic
        # ---------------------------------
        if total_active == 0:
            productivity_percent = 0.0
        else:
            minutes_active = total_active / 60
            kpm = total_keys / minutes_active if minutes_active > 0 else 0

            engagement_factor = min(1.0, kpm / BASELINE_KPM)

            # Apply engagement only to productive time
            effective_productive = productive * engagement_factor

            weighted_time = (
                effective_productive * 1.0 +
                neutral * 0.4 +
                unproductive * 0.0
            )

            productivity_percent = round(
                (weighted_time / total_active) * 100,
                1
            )

        # ---------------------------------
        # 5️⃣ Return Response
        # ---------------------------------
        return jsonify({
            "totalScreenTime": total_active,
            "totalIdleTime": total_idle,
            "totalKeystrokes": total_keys,
            "totalClicks": total_clicks,
            "totalSessions": total_sessions,
            "productivityPercent": productivity_percent,
            "mostUsedApp": top_app,
            "sessionDuration": get_session_duration()
        })

    finally:
        conn.close()

# Helper to get session duration safely
def get_session_duration():
    try:
        from src.core.activity_logger import get_current_session_duration
        return int(get_current_session_duration())
    except Exception:
        return 0

# =====================================
# Daily App Stats
# =====================================

@wellbeing_bp.route("/api/daily-stats")
def daily_stats():
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Each (app_name, main_category) pair is a separate row now.
        # Return them all — the donut chart groups by main_category while
        # the Apps tab groups by app_name (summing across categories).
        cursor.execute("""
            SELECT
                app_name,
                main_category,
                sub_category,
                SUM(active_seconds)  AS active,
                SUM(idle_seconds)    AS idle,
                SUM(keystrokes)      AS keys,
                SUM(clicks)          AS clicks
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
            ORDER BY active DESC
        """, (selected_date,))

        rows = cursor.fetchall()

        return jsonify([
            {
                "app":    r[0],
                "main":   r[1],
                "sub":    r[2],
                "active": safe(r[3]),
                "idle":   safe(r[4]),
                "keys":   safe(r[5]),
                "clicks": safe(r[6]),
            }
            for r in rows if not is_ignored(r[0])
        ])

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
            GROUP BY 1, 2
        """, (selected_date + "%",))

        rows = cursor.fetchall()
        hourly_map = {}
        for row in rows:
            hour, app, act = row
            if is_ignored(app): continue
            hourly_map[hour] = hourly_map.get(hour, 0) + act

        hourly_data = [
            safe(hourly_map.get(f"{h:02d}")) // 60
            for h in range(24)
        ]

        return jsonify(hourly_data)

    finally:
        conn.close()


# =====================================
# Hourly Top Apps Stats
# =====================================

@wellbeing_bp.route("/api/hourly-stats")
def hourly_stats():
    """
    Returns the top 3 apps for each hour of the day for the given date.
    Output: { "00": [{"app": "Chrome", "active": 3600}, ...], "01": ... }
    """
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # We group by hour and app name, summing the active seconds
        cursor.execute("""
            SELECT
                strftime('%H', timestamp) as hour,
                app_name,
                SUM(active_seconds) as active
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY 1, 2
            HAVING active > 0
        """, (selected_date + "%",))

        rows = cursor.fetchall()
        
        # Structure the data by hour
        by_hour = {}
        for row in rows:
            hour_str, app_name, active = row
            if is_ignored(app_name):
                continue
            
            h = hour_str # Keeping it as string "00", "01"...
            if h not in by_hour:
                by_hour[h] = []
            
            by_hour[h].append({
                "app": app_name.replace(".exe", ""),
                "active": int(active)
            })
            
        # For each hour, sort by active time and take top 3
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
# Focus Score
# =====================================

@wellbeing_bp.route("/api/focus")
def focus():
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    BASELINE_KPM = 35

    try:
        # ---------------------------------
        # 1️⃣ Load category mapping for apps
        # ---------------------------------
        cursor.execute("""
            SELECT app_name, main_category, SUM(active_seconds), SUM(sessions)
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
        """, (selected_date,))

        app_category = {}
        productive_seconds = 0
        productive_sessions = 0
        total_sessions = 0
        total_active = 0

        for app, category, active, sessions in cursor.fetchall():
            if is_ignored(app):
                continue
            active = safe(active)
            sessions = safe(sessions)

            app_category[app] = category
            total_active += active
            total_sessions += sessions

            if category == "productive":
                productive_seconds += active
                productive_sessions += sessions

        if total_active <= 0:
            return jsonify({"score": 0})

        # ---------------------------------
        # 2️⃣ Load activity logs (ordered)
        # ---------------------------------
        cursor.execute("""
            SELECT timestamp, app_name
            FROM activity_logs
            WHERE date(timestamp) = ?
            ORDER BY timestamp ASC
        """, (selected_date,))

        logs_raw = cursor.fetchall()
        logs = [(ts, app) for ts, app in logs_raw if not is_ignored(app)]

        # ---------------------------------
        # 3️⃣ Detect Context Switching
        # ---------------------------------
        switch_penalty = 0
        previous_app = None

        for _, app in logs:
            if previous_app is None:
                previous_app = app
                continue

            if app != previous_app:
                prev_cat = app_category.get(previous_app, "neutral")
                curr_cat = app_category.get(app, "neutral")

                if prev_cat == "productive":
                    if curr_cat == "productive":
                        switch_penalty += 0.2
                    elif curr_cat == "neutral":
                        switch_penalty += 1.0
                    elif curr_cat == "unproductive":
                        switch_penalty += 5.0

            previous_app = app

        switch_penalty = min(30, switch_penalty)

        # ---------------------------------
        # 4️⃣ Flow State Detection
        # ---------------------------------
        flow_bonus = 0
        current_streak = 0
        previous_app = None
        previous_timestamp = None

        for timestamp, app in logs:
            category = app_category.get(app, "neutral")

            if category == "productive":
                if previous_app == app:
                    current_streak += 60  # assuming 1-min log granularity
                else:
                    current_streak = 60
            else:
                if current_streak >= 1200:  # 20 minutes
                    flow_bonus += 5
                current_streak = 0

            previous_app = app

        if current_streak >= 1200:
            flow_bonus += 5

        flow_bonus = min(15, flow_bonus)

        # ---------------------------------
        # 5️⃣ Engagement Factor
        # ---------------------------------
        cursor.execute("""
            SELECT SUM(keystrokes), SUM(idle_seconds), app_name
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
        """, (selected_date,))

        total_keys = 0
        idle_seconds = 0
        for row in cursor.fetchall():
            if is_ignored(row[2]):
                continue
            total_keys += safe(row[0])
            idle_seconds += safe(row[1])

        minutes_active = total_active / 60
        kpm = total_keys / minutes_active if minutes_active > 0 else 0
        engagement_factor = min(1.0, kpm / BASELINE_KPM)

        effective_productive = productive_seconds * engagement_factor

        engagement_score = engagement_factor * 15

        # ---------------------------------
        # 6️⃣ Deep Work Score
        # ---------------------------------
        deep_work_score = min(40, (effective_productive / 3600) * 20)

        # ---------------------------------
        # 7️⃣ Idle Penalty
        # ---------------------------------
        idle_ratio = idle_seconds / total_active
        idle_penalty = min(20, idle_ratio * 25)

        # ---------------------------------
        # 8️⃣ Final Focus Score
        # ---------------------------------
        score = (
            deep_work_score
            + flow_bonus
            + engagement_score
            - switch_penalty
            - idle_penalty
        )

        score = max(0, min(100, round(score)))

        return jsonify({
            "score": score,
            "deepWorkSeconds": productive_seconds,
            "flowBonus": flow_bonus,
            "engagementScore": round(engagement_score, 1),
            "switchPenalty": round(switch_penalty, 1),
            "idlePenalty": round(idle_penalty, 1)
        })

    finally:
        conn.close()
        
# =====================================
# Combined Dashboard Endpoint
# =====================================

@wellbeing_bp.route("/api/dashboard")
def dashboard():
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                app_name,
                SUM(active_seconds),
                SUM(idle_seconds),
                SUM(keystrokes),
                SUM(clicks),
                SUM(sessions)
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
        """, (selected_date,))
        rows = cursor.fetchall()
        
        total_active = 0
        total_idle = 0
        total_keys = 0
        total_clicks = 0
        total_sessions = 0
        
        top_app = "N/A"
        max_active = -1
        
        for row in rows:
            app_name, act, idl, key, clk, sess = row
            if is_ignored(app_name): continue
            
            total_active += safe(act)
            total_idle += safe(idl)
            total_keys += safe(key)
            total_clicks += safe(clk)
            total_sessions += safe(sess)
            
            if safe(act) > max_active:
                max_active = safe(act)
                top_app = app_name

        # APPS: return per-(app_name, main_category) rows for the donut chart;
        # the frontend Apps tab will group by app and pick the dominant category.
        cursor.execute("""
            SELECT
                app_name,
                main_category,
                sub_category,
                SUM(active_seconds)  AS active,
                SUM(idle_seconds)    AS idle,
                SUM(keystrokes)      AS keys,
                SUM(clicks)          AS clicks
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
            ORDER BY active DESC
        """, (selected_date,))
        apps_rows = cursor.fetchall()

        # Build per-app aggregated view for the Apps tab list
        app_map = {}
        for r in apps_rows:
            aname = r[0]
            if is_ignored(aname):
                continue
            if aname not in app_map:
                app_map[aname] = {"app": aname, "main": r[1], "sub": r[2],
                                  "active": 0, "idle": 0, "keys": 0, "clicks": 0}
            app_map[aname]["active"] += safe(r[3])
            app_map[aname]["idle"]   += safe(r[4])
            app_map[aname]["keys"]   += safe(r[5])
            app_map[aname]["clicks"] += safe(r[6])
            # Update dominant category if this category has more active time
            if safe(r[3]) > app_map[aname].get("_dom_secs", 0):
                app_map[aname]["main"] = r[1]
                app_map[aname]["sub"]  = r[2]
                app_map[aname]["_dom_secs"] = safe(r[3])

        apps = sorted(
            [{k: v for k, v in a.items() if k != "_dom_secs"} for a in app_map.values()],
            key=lambda a: a["active"], reverse=True
        )

        # HOURLY
        cursor.execute("""
            SELECT
                strftime('%H', timestamp),
                app_name,
                SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY 1, 2
        """, (selected_date + "%",))

        hourly_rows = cursor.fetchall()
        hourly_map = {}
        for row in hourly_rows:
            hour, app, act = row
            if is_ignored(app): continue
            hourly_map[hour] = hourly_map.get(hour, 0) + act

        hourly_data = [
            safe(hourly_map.get(f"{h:02d}")) // 60
            for h in range(24)
        ]

        return jsonify({
            "date": selected_date,
            "summary": {
                "totalScreenTime": total_active,
                "totalIdleTime": total_idle,
                "totalKeystrokes": total_keys,
                "totalClicks": total_clicks,
                "totalSessions": total_sessions,
                "mostUsedApp": top_app,
            },
            "apps": apps,
            "hourly": hourly_data
        })

    finally:
        conn.close()


# =====================================
# Site Stats (Websites)
# =====================================

from urllib.parse import urlparse
from collections import defaultdict

@wellbeing_bp.route("/api/site-stats")
def site_stats():
    selected_date = get_selected_date()
    app = request.args.get("app")

    conn = get_connection()
    cursor = conn.cursor()

    try:
        query = """
            SELECT url, app_name, SUM(active_seconds) as total_active
            FROM activity_logs
            WHERE timestamp LIKE ?
              AND url IS NOT NULL
              AND url != 'N/A'
        """
        params = [selected_date + "%"]

        if app:
            query += " AND app_name = ?"
            params.append(app)

        query += """
            GROUP BY url, app_name
            ORDER BY total_active DESC
        """

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        domain_map = defaultdict(int)

        for url, app_name, active in rows:
            if is_ignored(app_name): continue
            try:
                parsed = urlparse(url)
                domain = parsed.netloc or parsed.path
                domain = domain.lower().replace("www.", "")

                # Filter out falsely mapped elements like "Reply..." textboxes
                if "reply" in domain or ".." in domain:
                    continue

                if domain:
                    domain_map[domain] += safe(active)

            except Exception:
                continue  # skip malformed URLs safely

        result = [
            {
                "domain": domain,
                "seconds": total,
                "minutes": round(total / 60, 2)
            }
            for domain, total in domain_map.items()
        ]

        result = sorted(result, key=lambda x: x["seconds"], reverse=True)[:50]

        return jsonify(result)

    finally:
        conn.close()


# =====================================
# Limits
# =====================================

@wellbeing_bp.route("/limits/set", methods=["POST"])
def api_set_limit():
    data = request.json
    set_app_limit(data["app_name"], int(data["limit_seconds"]))
    
    # Ensure blocking service starts as soon as a limit is added
    from src.services.blocking_service import BlockingService
    BlockingService().start()
    
    return jsonify({"status": "success"})


@wellbeing_bp.route("/limits/all", methods=["GET"])
def api_get_limits():
    limits = get_all_limits()
    return jsonify([
        {
            "id": row[0],
            "app_name": row[1],
            "daily_limit_seconds": row[2],
            "is_enabled": bool(row[3])
        }
        for row in limits
    ])


@wellbeing_bp.route("/limits/toggle", methods=["POST"])
def api_toggle_limit():
    data = request.json
    toggle_limit(data["app_name"], bool(data["enabled"]))
    return jsonify({"status": "updated"})


@wellbeing_bp.route("/limits/unblock", methods=["POST"])
def api_unblock():
    data = request.json
    set_temporary_unblock(data["app_name"], int(data["minutes"]))
    return jsonify({"status": "temporarily_unblocked"})


@wellbeing_bp.route("/limits/delete", methods=["POST"])
def api_delete_limit():
    delete_app_limit(request.json["app_name"])
    return jsonify({"status": "limit_deleted"})


@wellbeing_bp.route("/limits/blocked", methods=["GET"])
def api_blocked_apps():
    return jsonify(get_blocked_apps())

@wellbeing_bp.route("/api/system/apps", methods=["GET"])
def api_system_apps():
    conn = get_connection()
    cursor = conn.cursor()
    try:
        apps = get_installed_apps(cursor)
        return jsonify({
            "total": len(apps),
            "apps": apps
        })
    finally:
        conn.close()
# =====================================
# Danger
# =====================================

@wellbeing_bp.route("/api/clear-data", methods=["DELETE"])
def clear_data():
    confirm = request.headers.get("X-Confirm-Clear")

    if confirm != "true":
        return jsonify({
            "success": False,
            "error": "Confirmation header missing."
        }), 400

    try:
        clear_all_tracked_events()

        return jsonify({
            "success": True,
            "message": "All tracked data permanently deleted."
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500




@wellbeing_bp.route("/api/factory-reset", methods=["DELETE"])
def reset_everything():
    confirm = request.headers.get("X-Confirm-Reset")

    if confirm != "RESET_ALL":
        return jsonify({
            "success": False,
            "error": "Reset confirmation missing."
        }), 400

    try:
        # 1️⃣ Wipe database
        factory_reset()

        # 2️⃣ Trigger restart AFTER response is sent
        def delayed_restart():
            time.sleep(1)  # allow response to flush

            subprocess.Popen(
                [sys.executable, "-m", "src.main"],
                cwd=os.getcwd()
            )

            os._exit(0)

        threading.Thread(target=delayed_restart, daemon=True).start()

        # 3️⃣ Return success immediately
        return jsonify({
            "success": True,
            "message": "Factory reset completed. Restarting..."
        }), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


