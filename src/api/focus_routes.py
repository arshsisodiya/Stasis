from flask import jsonify
import time

from src.api.wellbeing_routes import wellbeing_bp, safe, get_selected_date, get_active_user_id, user_filter_sql
from src.database.database import get_connection
from src.config.ignored_apps_manager import is_ignored

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
                SUM(active_seconds),
                SUM(sessions)
            FROM daily_stats
            WHERE date = ? AND {uid_sql}
            GROUP BY app_name, main_category
        """, (selected_date, *uid_params))

        productive_seconds = 0
        productive_sessions = 0
        total_sessions = 0
        total_active = 0

        app_category = {}

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

        cursor.execute(f"""
            SELECT timestamp, app_name
            FROM activity_logs
            WHERE timestamp >= ? AND timestamp < date(?, '+1 day') AND {uid_sql}
            ORDER BY timestamp ASC
        """, (selected_date, selected_date, *uid_params))

        logs = [
            (ts, app)
            for ts, app in cursor.fetchall()
            if not is_ignored(app)
        ]

        switch_penalty = 0
        prev = None

        for _, app in logs:

            if prev is None:
                prev = app
                continue

            if app != prev:

                prev_cat = app_category.get(prev, "neutral")
                curr_cat = app_category.get(app, "neutral")

                if prev_cat == "productive":

                    if curr_cat == "productive":
                        switch_penalty += 0.2

                    elif curr_cat == "neutral":
                        switch_penalty += 1.0

                    elif curr_cat == "unproductive":
                        switch_penalty += 5.0

            prev = app

        switch_penalty = min(30, switch_penalty)

        flow_bonus = 0
        streak = 0
        prev_app = None

        for _, app in logs:

            category = app_category.get(app, "neutral")

            if category == "productive":

                if prev_app == app:
                    streak += 60
                else:
                    streak = 60

            else:

                if streak >= 1200:
                    flow_bonus += 5

                streak = 0

            prev_app = app

        if streak >= 1200:
            flow_bonus += 5

        flow_bonus = min(15, flow_bonus)

        cursor.execute(f"""
            SELECT SUM(keystrokes), SUM(idle_seconds), app_name
            FROM daily_stats
            WHERE date = ? AND {uid_sql}
            GROUP BY app_name
        """, (selected_date, *uid_params))

        total_keys = 0
        idle_seconds = 0

        for keys, idle, app in cursor.fetchall():

            if is_ignored(app):
                continue

            total_keys += safe(keys)
            idle_seconds += safe(idle)

        minutes_active = total_active / 60

        kpm = total_keys / minutes_active if minutes_active > 0 else 0

        engagement_factor = min(1.0, kpm / BASELINE_KPM)

        effective_productive = productive_seconds * engagement_factor

        engagement_score = engagement_factor * 15

        deep_work_score = min(40, (effective_productive / 3600) * 20)

        idle_ratio = idle_seconds / total_active

        idle_penalty = min(20, idle_ratio * 25)

        score = (
            deep_work_score
            + flow_bonus
            + engagement_score
            - switch_penalty
            - idle_penalty
        )

        score = max(0, min(100, round(score)))

        result = {
            "score": score,
            "deepWorkSeconds": productive_seconds,
            "flowBonus": flow_bonus,
            "engagementScore": round(engagement_score, 1),
            "switchPenalty": round(switch_penalty, 1),
            "idlePenalty": round(idle_penalty, 1)
        }

        # Store in cache
        _focus_cache[cache_key] = (result, time.monotonic())

        return jsonify(result)

    finally:
        conn.close()