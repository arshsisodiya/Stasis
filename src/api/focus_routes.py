from flask import jsonify
import time

from src.api.wellbeing_routes import wellbeing_bp, safe, get_selected_date, get_active_user_id, user_filter_sql
from src.database.database import get_connection
from src.config.ignored_apps_manager import is_ignored
from src.core.engagement_scorer import compute_productivity_score, compute_focus_score

# ── Focus score cache ─────────────────────────────────────────────────────────
# Today's date is cached for up to _TTL seconds; historical dates are cached
# permanently (they can never change).
# Now partitioned per user as (date, user_id) -> (result_dict, timestamp)
_focus_cache: dict = {}  # (date, user_id) -> (result_dict, timestamp)
_FOCUS_TTL = 45          # seconds — today's score refreshes this often


@wellbeing_bp.route("/api/focus")
def focus():

    selected_date = get_selected_date()
    user_id = get_active_user_id()
    uid_sql, uid_params = user_filter_sql(user_id)

    # Check cache
    import datetime as _dt
    today = _dt.date.today().isoformat()
    cache_key = (selected_date, user_id)
    if cache_key in _focus_cache:
        cached_result, cached_at = _focus_cache[cache_key]
        if selected_date != today or (time.monotonic() - cached_at) < _FOCUS_TTL:
            return jsonify(cached_result)

    conn = get_connection()
    cursor = conn.cursor()

    BASELINE_KPM = 35

    try:

        cursor.execute(f"""
            SELECT
                app_name,
                main_category,
                sub_category,
                SUM(active_seconds),
                SUM(idle_seconds),
                SUM(sessions),
                SUM(keystrokes),
                SUM(clicks)
            FROM daily_stats
            WHERE date = ? AND {uid_sql}
            GROUP BY app_name, main_category, sub_category
        """, (selected_date, *uid_params))

        app_rows        = []   # for engagement_scorer
        productive_sessions = 0
        total_sessions  = 0
        total_active    = 0
        app_category    = {}

        for app, category, sub_cat, active, idle, sessions, keys, clicks in cursor.fetchall():

            if is_ignored(app):
                continue

            active   = safe(active)
            sessions = safe(sessions)

            app_category[app] = category
            total_active  += active
            total_sessions += sessions

            if category == "productive":
                productive_sessions += sessions

            app_rows.append({
                "app_name":      app,
                "main_category": category,
                "sub_category":  sub_cat or "other",
                "active_seconds": active,
                "idle_seconds":  safe(idle),
                "sessions":      sessions,
                "keystrokes":    safe(keys),
                "clicks":        safe(clicks),
            })

        if total_active <= 0:
            return jsonify({"score": 0})

        # Raw productive seconds still needed for deepWorkSeconds reporting
        productive_seconds = sum(
            r["active_seconds"] for r in app_rows
            if r["main_category"] == "productive"
        )

        # Calculate the centralized global Focus Score
        score = compute_focus_score(app_rows)

        # Calculate distracting sessions for the frontend insights
        productive_apps = [r for r in app_rows if r["main_category"] == "productive"]
        productive_apps.sort(key=lambda x: x["active_seconds"], reverse=True)
        core_names = {a["app_name"] for a in productive_apps[:3]}
        distracting_sessions = sum(r["sessions"] for r in app_rows if r["app_name"] not in core_names)

        result = {
            "score": score,
            "deepWorkSeconds": productive_seconds,
            "flowBonus": 0,
            "engagementScore": 0,
            "switchPenalty": distracting_sessions * 0.5, # Frontend uses this to estimate context switches
            "idlePenalty": 0
        }

        # Store in cache
        _focus_cache[cache_key] = (result, time.monotonic())

        return jsonify(result)

    finally:
        conn.close()