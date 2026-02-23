# src/services/dashboard_service.py

from src.database.database import get_connection


# ===============================
# Helper
# ===============================

def safe(value, default=0):
    return value if value is not None else default


# ===============================
# Dashboard Data
# ===============================

def get_dashboard_data(selected_date: str):
    """
    Returns complete dashboard payload:
    {
        "date": "",
        "summary": {},
        "apps": [],
        "hourly": []
    }
    """

    conn = get_connection()
    cursor = conn.cursor()

    try:
        # ---------------------------
        # SUMMARY
        # ---------------------------
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
        total_idle = safe(row[1])
        total_keys = safe(row[2])
        total_clicks = safe(row[3])
        total_sessions = safe(row[4])

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

        summary = {
            "totalScreenTime": total_active,
            "totalIdleTime": total_idle,
            "totalKeystrokes": total_keys,
            "totalClicks": total_clicks,
            "totalSessions": total_sessions,
            "mostUsedApp": top_app,
        }

        # ---------------------------
        # APPS
        # ---------------------------
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

        # ---------------------------
        # HOURLY (Minutes per hour)
        # ---------------------------
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

        return {
            "date": selected_date,
            "summary": summary,
            "apps": apps,
            "hourly": hourly_data
        }

    finally:
        conn.close()


# ===============================
# Available Dates
# ===============================

def get_available_dates():
    conn = get_connection()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT DISTINCT date
            FROM daily_stats
            ORDER BY date DESC
        """)
        return [row[0] for row in cursor.fetchall()]

    finally:
        conn.close()