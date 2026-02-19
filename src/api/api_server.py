"""
Wellbeing API Server
--------------------
Provides REST endpoints for the React Wellbeing Dashboard.

Run separately alongside main tracker.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from src.database.database import get_connection
import datetime

app = Flask(__name__)
CORS(app)  # Allow React frontend to connect


# ===============================
# Helper
# ===============================

def safe(value, default=0):
    return value if value is not None else default

def get_selected_date():
    date_param = request.args.get("date")

    if date_param:
        try:
            datetime.datetime.strptime(date_param, "%Y-%m-%d")
            return date_param
        except ValueError:
            return datetime.date.today().isoformat()

    return datetime.date.today().isoformat()
# ===============================
# 1️⃣ Wellbeing Summary
# ===============================

@app.route("/api/available-dates")
def available_dates():
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT date FROM daily_stats ORDER BY date DESC")
        dates = [row[0] for row in cursor.fetchall()]
        return jsonify(dates)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()

@app.route("/api/wellbeing")
def wellbeing():
    #today = datetime.date.today().isoformat()
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Overall totals
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

        # Productive time
        cursor.execute("""
            SELECT SUM(active_seconds)
            FROM daily_stats
            WHERE date = ? AND main_category = 'productive'
        """, (selected_date,))
        productive = safe(cursor.fetchone()[0])

        # Most used app
        cursor.execute("""
            SELECT app_name
            FROM daily_stats
            WHERE date = ?
            ORDER BY active_seconds DESC
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

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        conn.close()


# ===============================
# 2️⃣ Daily App Stats
# ===============================

@app.route("/api/daily-stats")
def daily_stats():
    #today = datetime.date.today().isoformat()
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                app_name,
                main_category,
                sub_category,
                active_seconds,
                idle_seconds,
                keystrokes,
                clicks
            FROM daily_stats
            WHERE date = ?
            ORDER BY active_seconds DESC
        """, (selected_date,))

        rows = cursor.fetchall()

        return jsonify([
            {
                "app": r[0],
                "main": r[1],
                "sub": r[2],
                "active": safe(r[3]),
                "idle": safe(r[4]),
                "keys": safe(r[5]),
                "clicks": safe(r[6]),
            }
            for r in rows
        ])

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        conn.close()



# ===============================
# 3️⃣ Hourly Activity (minutes per hour)
# ===============================
@app.route("/api/hourly")
def hourly():
    #today = datetime.date.today().isoformat()
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                strftime('%H', timestamp) as hour,
                SUM(active_seconds)
            FROM activity_logs
            WHERE timestamp LIKE ?
            GROUP BY hour
        """, (selected_date + "%",))

        rows = cursor.fetchall()
        hourly_map = {row[0]: row[1] for row in rows}

        # Convert to 24-hour list (minutes)
        hourly_data = [
            safe(hourly_map.get(f"{h:02d}")) // 60
            for h in range(24)
        ]

        return jsonify(hourly_data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        conn.close()
# ===============================
# Focus Score
# ===============================

@app.route("/api/focus")
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

        # ----------------------------
        # 1️⃣ Stability Score
        # Fewer sessions = better focus
        # ----------------------------
        stability_score = max(0, 40 - (total_sessions * 1.5))
        stability_score = min(stability_score, 40)

        # ----------------------------
        # 2️⃣ Deep Work Score
        # Longer total active time boosts focus
        # ----------------------------
        deep_work_score = min(40, total_active / 3600 * 10)  # 10 points per hour
        deep_work_score = min(deep_work_score, 40)

        # ----------------------------
        # 3️⃣ Idle Penalty
        # ----------------------------
        cursor.execute("""
            SELECT SUM(idle_seconds)
            FROM daily_stats
            WHERE date = ?
        """, (selected_date,))

        idle = safe(cursor.fetchone()[0])

        idle_ratio = idle / total_active if total_active > 0 else 0
        idle_penalty = min(20, idle_ratio * 20)

        # ----------------------------
        # Final Score
        # ----------------------------
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

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        conn.close()

# ===============================
# Health Check
# ===============================


@app.route("/api/health")
def health():
    return jsonify({"status": "running"})
@app.route("/api/dashboard")
def dashboard():
    selected_date = get_selected_date()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # ---- SUMMARY ----
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
            SELECT app_name
            FROM daily_stats
            WHERE date = ?
            ORDER BY active_seconds DESC
            LIMIT 1
        """, (selected_date,))
        top_app_row = cursor.fetchone()
        top_app = top_app_row[0] if top_app_row else "N/A"

        # ---- APPS ----
        cursor.execute("""
            SELECT
                app_name,
                main_category,
                sub_category,
                active_seconds,
                idle_seconds,
                keystrokes,
                clicks
            FROM daily_stats
            WHERE date = ?
            ORDER BY active_seconds DESC
        """, (selected_date,))
        apps_rows = cursor.fetchall()

        apps = [
            {
                "app": r[0],
                "main": r[1],
                "sub": r[2],
                "active": safe(r[3]),
                "idle": safe(r[4]),
                "keys": safe(r[5]),
                "clicks": safe(r[6]),
            }
            for r in apps_rows
        ]

        # ---- HOURLY ----
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

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        conn.close()

# ===============================
# Run Server
# ===============================

if __name__ == "__main__":
    print("Starting Wellbeing API on http://localhost:7432")
    app.run(host="0.0.0.0", port=7432, debug=False)
