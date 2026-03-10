from flask import jsonify

from src.api.wellbeing_routes import wellbeing_bp, safe, get_selected_date
from src.database.database import get_connection
from src.config.ignored_apps_manager import is_ignored


@wellbeing_bp.route("/api/focus")
def focus():

    selected_date = get_selected_date()

    conn = get_connection()
    cursor = conn.cursor()

    BASELINE_KPM = 35

    try:

        cursor.execute("""
            SELECT
                app_name,
                main_category,
                SUM(active_seconds),
                SUM(sessions)
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name, main_category
        """, (selected_date,))

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

        cursor.execute("""
            SELECT timestamp, app_name
            FROM activity_logs
            WHERE date(timestamp) = ?
            ORDER BY timestamp ASC
        """, (selected_date,))

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

        cursor.execute("""
            SELECT SUM(keystrokes), SUM(idle_seconds), app_name
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
        """, (selected_date,))

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