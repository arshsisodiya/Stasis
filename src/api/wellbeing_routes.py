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
from flask import Blueprint, jsonify, request
import datetime

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

@wellbeing_bp.route("/api/health")
def health():
    return jsonify({"status": "running"})


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
                SUM(active_seconds)                                         AS screen_time,
                SUM(CASE WHEN main_category = 'productive' THEN active_seconds ELSE 0 END) AS productive_time
            FROM daily_stats
            GROUP BY date
            ORDER BY date DESC
            LIMIT 60
        """)
        rows = cursor.fetchall()
        result = {}
        for row in rows:
            date, screen, prod = row
            pct = round((safe(prod) / safe(screen, 1)) * 100) if screen else 0
            result[date] = {"screenTime": safe(screen), "productivityPct": pct}
        return jsonify(result)
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
            for r in rows
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
                SUM(active_seconds) AS screen_time,
                SUM(CASE WHEN main_category = 'productive' THEN active_seconds ELSE 0 END) AS prod_time
            FROM daily_stats
            GROUP BY date
            ORDER BY date DESC
            LIMIT 14
        """)
        rows = cursor.fetchall()
        result = []
        for row in rows:
            date, screen, prod = row
            pct = round((safe(prod) / max(safe(screen), 1)) * 100)
            result.append({"date": date, "screenTime": safe(screen), "productivityPct": pct})
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

    try:
        cursor.execute("""
            SELECT
                SUM(active_seconds),
                SUM(idle_seconds),
                SUM(keystrokes),
                SUM(clicks),
                SUM(sessions)
            FROM daily_stats
            WHERE date = ?
        """, (selected_date,))

        row = cursor.fetchone() or (0, 0, 0, 0, 0)

        total_active = safe(row[0])
        total_idle   = safe(row[1])
        total_keys   = safe(row[2])
        total_clicks = safe(row[3])
        total_sessions = safe(row[4])

        cursor.execute("""
            SELECT SUM(active_seconds)
            FROM daily_stats
            WHERE date = ? AND main_category = 'productive'
        """, (selected_date,))
        productive = safe(cursor.fetchone()[0])

        cursor.execute("""
            SELECT app_name, SUM(active_seconds) AS total
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
            ORDER BY total DESC
            LIMIT 1
        """, (selected_date,))
        top_app_row = cursor.fetchone()
        top_app = top_app_row[0] if top_app_row else "N/A"

        total_for_percent = total_active if total_active > 0 else 1

        return jsonify({
            "totalScreenTime": total_active,
            "totalIdleTime": total_idle,
            "totalKeystrokes": total_keys,
            "totalClicks": total_clicks,
            "totalSessions": total_sessions,
            "productivityPercent": round((productive / total_for_percent) * 100, 1),
            "mostUsedApp": top_app,
        })

    finally:
        conn.close()


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
            for r in rows
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
                SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY 1
        """, (selected_date + "%",))

        rows = cursor.fetchall()
        hourly_map = {row[0]: row[1] for row in rows}

        hourly_data = [
            safe(hourly_map.get(f"{h:02d}")) // 60
            for h in range(24)
        ]

        return jsonify(hourly_data)

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

    try:
        cursor.execute("""
            SELECT
                SUM(active_seconds),
                SUM(sessions)
            FROM daily_stats
            WHERE date = ?
        """, (selected_date,))

        row = cursor.fetchone() or (0, 0)

        total_active = safe(row[0])
        total_sessions = safe(row[1])

        if total_active <= 0:
            return jsonify({
                "score": 0,
                "deepWorkSeconds": 0,
                "sessionCount": 0,
                "stabilityScore": 0,
                "deepWorkScore": 0
            })

        stability_score = max(0, 40 - (total_sessions * 1.5))
        stability_score = min(stability_score, 40)

        deep_work_score = min(40, total_active / 3600 * 10)
        deep_work_score = min(deep_work_score, 40)

        cursor.execute("""
            SELECT SUM(idle_seconds)
            FROM daily_stats
            WHERE date = ?
        """, (selected_date,))

        idle = safe(cursor.fetchone()[0])

        idle_ratio = idle / total_active if total_active > 0 else 0
        idle_penalty = min(20, idle_ratio * 20)

        score = stability_score + deep_work_score - idle_penalty
        score = max(0, min(100, round(score)))

        return jsonify({
            "score": score,
            "deepWorkSeconds": total_active,
            "sessionCount": total_sessions,
            "stabilityScore": round(stability_score, 1),
            "deepWorkScore": round(deep_work_score, 1),
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
        # SUMMARY
        cursor.execute("""
            SELECT
                SUM(active_seconds),
                SUM(idle_seconds),
                SUM(keystrokes),
                SUM(clicks),
                SUM(sessions)
            FROM daily_stats
            WHERE date = ?
        """, (selected_date,))
        row = cursor.fetchone() or (0, 0, 0, 0, 0)

        total_active = safe(row[0])
        total_idle   = safe(row[1])
        total_keys   = safe(row[2])
        total_clicks = safe(row[3])
        total_sessions = safe(row[4])

        cursor.execute("""
            SELECT app_name, SUM(active_seconds) AS total
            FROM daily_stats
            WHERE date = ?
            GROUP BY app_name
            ORDER BY total DESC
            LIMIT 1
        """, (selected_date,))
        top_app_row = cursor.fetchone()
        top_app = top_app_row[0] if top_app_row else "N/A"

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
                SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY 1
        """, (selected_date + "%",))

        hourly_rows = cursor.fetchall()
        hourly_map = {row[0]: row[1] for row in hourly_rows}

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
# Limits
# =====================================

@wellbeing_bp.route("/limits/set", methods=["POST"])
def api_set_limit():
    data = request.json
    set_app_limit(data["app_name"], int(data["limit_seconds"]))
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
