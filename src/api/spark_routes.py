"""
/api/spark-series
-----------------
Returns the last N days (default 7, max 30) of per-day aggregated metrics
used by the overview sparklines:

  {
    "2026-03-04": {
      "screenTime":      18420,   # active seconds
      "productivityPct": 62,      # % of active time on productive apps
      "focusScore":      71,      # simplified focus score (0-100)
      "keystrokes":      4821,    # total keystrokes across all apps
      "clicks":          1204,    # total clicks across all apps
      "inputActivity":   6025     # keystrokes + clicks (merged input trend)
    },
    ...
  }

Focus score is a lightweight approximation of the full /api/focus formula:
  deep_work_score  = min(40, (productive_seconds * engagement) / 3600 * 20)
  engagement_score = min(15, kpm / 35)  — capped
  idle_penalty     = min(20, idle_ratio * 25)
  score            = deep_work_score + engagement_score - idle_penalty  (clamped 0-100)

Switch-penalty and flow-bonus are omitted here (they require per-log iteration)
which keeps this endpoint to a single aggregation query — fast even for 30 days.
"""

from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp, safe
from src.database.database import get_connection
from src.config.ignored_apps_manager import is_ignored
from src.core.engagement_scorer import compute_productivity_score, compute_app_weighted_seconds


@wellbeing_bp.route("/api/spark-series")
def spark_series():
    try:
        days = int(request.args.get("days", 7))
        days = max(2, min(30, days))   # clamp: 2..30
    except (TypeError, ValueError):
        days = 7

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # One query: aggregate everything we need per (date, category)
        # Limited to the requested window to avoid scanning the full table
        cursor.execute("""
            SELECT
                date,
                main_category,
                sub_category,
                SUM(active_seconds)  AS active,
                SUM(idle_seconds)    AS idle,
                SUM(keystrokes)      AS keys,
                SUM(clicks)          AS clicks,
                SUM(sessions)        AS sessions,
                app_name
            FROM daily_stats
            WHERE date >= date('now', ? || ' days')
            GROUP BY date, main_category, sub_category, app_name
            ORDER BY date DESC
        """, (str(-days),))

        rows = cursor.fetchall()

        # Group into per-date buckets, respecting ignored apps
        by_date: dict[str, list[dict]] = {}
        for date, category, sub_cat, active, idle, keys, clicks, sessions, app in rows:
            if is_ignored(app):
                continue
            if date not in by_date:
                by_date[date] = []
            by_date[date].append({
                "app_name":      app,
                "main_category": category,
                "sub_category":  sub_cat or "other",
                "active_seconds": safe(active),
                "idle":          safe(idle),
                "keystrokes":    safe(keys),
                "clicks":        safe(clicks),
            })

        # Keep only the most-recent N days that have any data
        sorted_dates = sorted(by_date.keys())[-days:]

        result = {}
        for date in sorted_dates:
            app_rows     = by_date[date]
            total_active = sum(r["active_seconds"] for r in app_rows)
            total_idle   = sum(r["idle"]           for r in app_rows)
            total_keys   = sum(r["keystrokes"]     for r in app_rows)
            total_clicks = sum(r["clicks"]         for r in app_rows)

            if total_active <= 0:
                result[date] = {
                    "screenTime": 0, "productivityPct": 0,
                    "focusScore": 0, "keystrokes": 0,
                    "clicks": 0,     "inputActivity": 0,
                }
                continue

            # Engagement-weighted Productivity % (Ideas 2, 3, 4)
            productivity_pct = compute_productivity_score(app_rows)

            # Lightweight focus score — deep_work now uses engagement-weighted seconds
            effective_productive = sum(
                compute_app_weighted_seconds(
                    active_seconds=r["active_seconds"],
                    keystrokes=r["keystrokes"],
                    clicks=r["clicks"],
                    sub_category=r["sub_category"],
                    main_category=r["main_category"],
                )
                for r in app_rows
            )
            minutes_active   = total_active / 60
            kpm              = total_keys / minutes_active if minutes_active > 0 else 0
            engagement       = min(1.0, kpm / 35.0)
            deep_work_score  = min(40.0, (effective_productive / 3600.0) * 20.0)
            engagement_score = engagement * 15.0
            idle_ratio       = total_idle / total_active
            idle_penalty     = min(20.0, idle_ratio * 25.0)
            focus_score      = max(0, min(100, round(
                deep_work_score + engagement_score - idle_penalty
            )))

            result[date] = {
                "screenTime":      total_active,
                "productivityPct": productivity_pct,
                "focusScore":      focus_score,
                "keystrokes":      total_keys,
                "clicks":          total_clicks,
                "inputActivity":   total_keys + total_clicks,
            }

        return jsonify(result)

    finally:
        conn.close()
