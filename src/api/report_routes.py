from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp
from src.database.database import (
    get_connection, get_all_goals, get_all_goal_logs_range,
    get_limit_events_range, get_limit_events_summary
)
from src.config.ignored_apps_manager import is_ignored
from src.config.settings_manager import SettingsManager
from datetime import datetime, timedelta
import math
import time


def _week_bounds(date_str=None):
    """Return (monday, sunday) ISO date strings for the week containing date_str."""
    if date_str:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    else:
        d = datetime.now().date()
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday.isoformat(), sunday.isoformat()


def _fmt_time(sec):
    sec = int(sec)
    h, rem = divmod(sec, 3600)
    m = rem // 60
    if h > 0:
        return f"{h}h {m}m"
    return f"{m}m"


def _weekly_trend_series(conn, week_of, weeks=6):
    """Build compact trend series for recent weeks ending at week_of."""
    end_monday, _ = _week_bounds(week_of)
    end_monday_date = datetime.strptime(end_monday, "%Y-%m-%d").date()
    series = []

    for i in range(weeks - 1, -1, -1):
        mon = end_monday_date - timedelta(days=7 * i)
        sun = mon + timedelta(days=6)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date, app_name, main_category, SUM(active_seconds)
            FROM daily_stats
            WHERE date >= ? AND date <= ?
            GROUP BY date, app_name, main_category
            ORDER BY date
        """, (mon.isoformat(), sun.isoformat()))
        rows = cursor.fetchall()

        total = 0
        productive = 0
        daily_totals = {}
        for date, app_name, main_category, active in rows:
            if is_ignored(app_name):
                continue
            total += active
            daily_totals[date] = daily_totals.get(date, 0) + active
            if main_category == "productive":
                productive += active

        active_days = len(daily_totals) if daily_totals else 1
        avg_daily = round(total / active_days)
        prod_pct = round((productive / total) * 100, 1) if total > 0 else 0
        focus_score = round((max(daily_totals.values()) / total) * 100, 1) if total > 0 and daily_totals else 0

        series.append({
            "week_start": mon.isoformat(),
            "screen_time": total,
            "avg_daily": avg_daily,
            "productivity_pct": prod_pct,
            "focus_score": focus_score,
        })

    return series


def _generate_report(week_of=None):
    """Generate the full weekly report data dict."""
    monday, sunday = _week_bounds(week_of)
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # 1. Daily breakdown
        cursor.execute("""
            SELECT date, app_name, main_category, SUM(active_seconds), SUM(keystrokes), SUM(clicks)
            FROM daily_stats
            WHERE date >= ? AND date <= ?
            GROUP BY date, app_name, main_category
            ORDER BY date
        """, (monday, sunday))
        rows = cursor.fetchall()

        daily = {}
        app_totals = {}
        cat_totals = {"productive": 0, "neutral": 0, "unproductive": 0, "other": 0}
        total_screen = 0
        total_keys = 0
        total_clicks = 0

        for date, app_name, main_cat, active, keys, clicks in rows:
            if is_ignored(app_name):
                continue
            if date not in daily:
                daily[date] = {"screen_time": 0, "productive": 0, "neutral": 0, "unproductive": 0, "keys": 0, "clicks": 0}
            daily[date]["screen_time"] += active
            daily[date]["keys"] += keys or 0
            daily[date]["clicks"] += clicks or 0
            if main_cat in ("productive",):
                daily[date]["productive"] += active
            elif main_cat in ("neutral", "other"):
                daily[date]["neutral"] += active
            else:
                daily[date]["unproductive"] += active

            app_totals[app_name] = app_totals.get(app_name, 0) + active
            cat_totals[main_cat] = cat_totals.get(main_cat, 0) + active
            total_screen += active
            total_keys += keys or 0
            total_clicks += clicks or 0

        # Top apps
        top_apps = sorted(app_totals.items(), key=lambda x: -x[1])[:8]

        # Average daily screen time
        active_days = len(daily) if daily else 1
        avg_daily = total_screen / active_days

        # Productivity %
        if total_screen > 0:
            prod_pct = round(cat_totals.get("productive", 0) / total_screen * 100, 1)
        else:
            prod_pct = 0

        # Peak day
        if daily:
            peak_entry = max(daily.items(), key=lambda x: x[1]["screen_time"])
            lightest_entry = min(daily.items(), key=lambda x: x[1]["screen_time"])
            peak_day = {"date": peak_entry[0], "total_seconds": peak_entry[1]["screen_time"]}
            lightest_day = {"date": lightest_entry[0], "total_seconds": lightest_entry[1]["screen_time"]}
        else:
            peak_day = None
            lightest_day = None

        # 2. App limit stats
        limit_summary = get_limit_events_summary(monday, sunday)
        limit_events = get_limit_events_range(monday, sunday)

        total_hits = sum(v["hits"] for v in limit_summary.values())
        total_edits = sum(v["edits"] for v in limit_summary.values())

        # 3. Goals progress
        goal_logs = get_all_goal_logs_range(monday, sunday)
        goals_by_id = {}
        for gl_id, gl_date, actual, target, met, g_type, g_label, g_unit, g_dir in goal_logs:
            if gl_id not in goals_by_id:
                goals_by_id[gl_id] = {
                    "type": g_type, "label": g_label, "unit": g_unit, "direction": g_dir,
                    "days_met": 0, "days_tracked": 0, "target": target
                }
            goals_by_id[gl_id]["days_tracked"] += 1
            if met:
                goals_by_id[gl_id]["days_met"] += 1

        # 4. Humanized insights
        insights = _generate_insights(
            daily, total_screen, avg_daily, prod_pct, top_apps,
            limit_summary, total_hits, total_edits, goals_by_id,
            peak_day["date"] if peak_day else None,
            lightest_day["date"] if lightest_day else None
        )

        # 5. Focus score average (from daily_stats)
        cursor.execute("""
            SELECT AVG(focus_score) FROM (
                SELECT date, CASE WHEN SUM(active_seconds) > 0
                    THEN ROUND(100.0 * MAX(active_seconds) / SUM(active_seconds))
                    ELSE 0 END as focus_score
                FROM daily_stats
                WHERE date >= ? AND date <= ?
                GROUP BY date
            )
        """, (monday, sunday))
        avg_focus = cursor.fetchone()[0] or 0

        # Build daily breakdown array (always Mon-Sun, including empty days)
        daily_breakdown = []
        start_date = datetime.strptime(monday, "%Y-%m-%d").date()
        for offset in range(7):
            date = (start_date + timedelta(days=offset)).isoformat()
            d = daily.get(date, {"screen_time": 0, "productive": 0})
            st = d["screen_time"]
            prod = d["productive"]
            ppct = round(prod / st * 100, 1) if st > 0 else 0
            daily_breakdown.append({
                "date": date,
                "total_seconds": st,
                "productive_pct": ppct,
            })

        trends = _weekly_trend_series(conn, week_of, weeks=6)

        return {
            "period": {"start": monday, "end": sunday},
            "summary": {
                "total_screen_time": total_screen,
                "avg_daily": round(avg_daily),
                "active_days": active_days,
                "total_keystrokes": total_keys,
                "total_clicks": total_clicks,
                "productivity_pct": prod_pct,
                "avg_focus_score": round(avg_focus, 1),
            },
            "trends": trends,
            "daily_breakdown": daily_breakdown,
            "category_breakdown": [
                {"category": k, "total_seconds": v}
                for k, v in sorted(cat_totals.items(), key=lambda x: -x[1]) if v > 0
            ],
            "top_apps": [
                {"app_name": app, "total_seconds": secs, "pct": round(secs / total_screen * 100, 1) if total_screen > 0 else 0}
                for app, secs in top_apps
            ],
            "peak_day": peak_day,
            "lightest_day": lightest_day,
            "limits": {
                "total_hits": total_hits,
                "total_edits": total_edits,
                "per_app": [
                    {"app_name": app, "hits": stats["hits"], "edits": stats["edits"]}
                    for app, stats in limit_summary.items()
                ],
                "events": [
                    {
                        "app": e[0].replace(".exe", ""), "type": e[1],
                        "old_value": e[2], "new_value": e[3],
                        "timestamp": e[4], "date": e[5]
                    }
                    for e in limit_events[-20:]
                ]
            },
            "goals": [
                {
                    "label": g["label"] or g["type"].replace("_", " ").title(),
                    "goal_type": g["type"],
                    "target": g["target"],
                    "unit": g["unit"],
                    "direction": g["direction"],
                    "days_met": g["days_met"],
                    "total_days": g["days_tracked"],
                    "success_rate": round(g["days_met"] / g["days_tracked"] * 100) if g["days_tracked"] > 0 else 0
                }
                for gid, g in goals_by_id.items()
            ],
            "insights": insights,
        }
    finally:
        conn.close()


def _generate_insights(daily, total_screen, avg_daily, prod_pct, top_apps,
                       limit_summary, total_hits, total_edits, goals_by_id, peak_day, lightest_day):
    """Generate humanized insight strings."""
    insights = []

    # Screen time insight
    avg_h = avg_daily / 3600
    if avg_h < 2:
        insights.append("You kept your screen time light this week — nice balance! 🌿")
    elif avg_h < 5:
        insights.append(f"You averaged about {_fmt_time(avg_daily)} on screen each day — a solid, balanced week.")
    elif avg_h < 8:
        insights.append(f"Your daily average was {_fmt_time(avg_daily)} — that's a full workday on screen. Consider taking more breaks.")
    else:
        insights.append(f"Heavy week — you averaged {_fmt_time(avg_daily)} per day. Your eyes deserve a rest! 👀")

    # Productivity
    if prod_pct >= 70:
        insights.append(f"Productivity was outstanding at {prod_pct}% — you were in the zone most of the time. 🔥")
    elif prod_pct >= 45:
        insights.append(f"Productivity hovered around {prod_pct}% — room to focus more, but not bad at all.")
    elif prod_pct > 0:
        insights.append(f"Only {prod_pct}% of your time was productive. Try blocking distracting apps next week.")

    # Top app
    if top_apps:
        app_name, app_secs = top_apps[0]
        insights.append(f"Your #1 app was {app_name.replace('.exe', '')} at {_fmt_time(app_secs)} total. That's where most of your attention went.")

    # Peak vs lightest
    if peak_day and lightest_day and peak_day != lightest_day:
        peak_name = datetime.strptime(peak_day, "%Y-%m-%d").strftime("%A")
        light_name = datetime.strptime(lightest_day, "%Y-%m-%d").strftime("%A")
        insights.append(f"{peak_name} was your busiest day, while {light_name} was the lightest — interesting rhythm!")

    # Limit discipline
    if total_hits == 0 and limit_summary:
        insights.append("You didn't hit a single app limit this week — great self-discipline! 🎯")
    elif total_hits > 0:
        worst_app = max(limit_summary.items(), key=lambda x: x[1]["hits"])[0].replace(".exe", "")
        insights.append(f"You hit app limits {total_hits} time{'s' if total_hits > 1 else ''} this week. {worst_app} was the hardest to stay away from.")

    if total_edits > 0:
        insights.append(f"You edited limits {total_edits} time{'s' if total_edits > 1 else ''} — be honest with yourself, raising limits often can undermine your goals.")

    # Goals
    goals_met_all = sum(1 for g in goals_by_id.values() if g["days_met"] == g["days_tracked"] and g["days_tracked"] > 0)
    goals_with_data = sum(1 for g in goals_by_id.values() if g["days_tracked"] > 0)
    if goals_with_data > 0:
        if goals_met_all == goals_with_data:
            insights.append("You crushed every single goal this week! Keep that momentum going. 🏆")
        elif goals_met_all > 0:
            insights.append(f"You fully met {goals_met_all} out of {goals_with_data} goals — close to a clean sweep!")
        else:
            insights.append("None of your goals were fully met this week. Consider adjusting targets or habits.")

    return insights


def _report_to_telegram_html(report):
    """Convert report dict to a readable Telegram HTML message."""
    p = report["period"]
    s = report["summary"]

    lines = [
        f"<b>📊 Weekly Report</b>",
        f"<i>{p['start']} → {p['end']}</i>",
        "",
        f"<b>Screen Time:</b> {_fmt_time(s['total_screen_time'])} total",
        f"<b>Daily Average:</b> {_fmt_time(s['avg_daily'])}",
        f"<b>Productivity:</b> {s['productivity_pct']}%",
        f"<b>Active Days:</b> {s['active_days']}",
        "",
        "<b>Top Apps</b>",
    ]

    for app in report["top_apps"][:5]:
        lines.append(f"  • {app['app_name'].replace('.exe', '')} — {_fmt_time(app['total_seconds'])}")

    lines.append("")

    # Limits
    lim = report["limits"]
    if lim["total_hits"] > 0 or lim["total_edits"] > 0:
        lines.append("<b>App Limits</b>")
        lines.append(f"  Limit hits: {lim['total_hits']}  |  Limit edits: {lim['total_edits']}")
        for item in lim["per_app"][:5]:
            parts = []
            if item["hits"]:
                parts.append(f"{item['hits']} hit{'s' if item['hits'] > 1 else ''}")
            if item["edits"]:
                parts.append(f"{item['edits']} edit{'s' if item['edits'] > 1 else ''}")
            lines.append(f"  • {item['app_name'].replace('.exe', '')}: {', '.join(parts)}")
        lines.append("")

    # Goals
    if report["goals"]:
        lines.append("<b>Goals</b>")
        for g in report["goals"]:
            emoji = "✅" if g["days_met"] == g["total_days"] and g["total_days"] > 0 else "⚠️"
            lines.append(f"  {emoji} {g['label']}: {g['days_met']}/{g['total_days']} days met ({g['success_rate']}%)")
        lines.append("")

    # Insights
    if report["insights"]:
        lines.append("<b>💡 Insights</b>")
        for insight in report["insights"]:
            lines.append(f"  • {insight}")

    return "\n".join(lines)


# ─── API ROUTES ───────────────────────────────────────────────────────────────

@wellbeing_bp.route("/api/weekly-report")
def api_weekly_report():
    week_of = request.args.get("week_of")
    report = _generate_report(week_of)
    return jsonify(report)


@wellbeing_bp.route("/api/weekly-report/send-telegram", methods=["POST"])
def api_send_weekly_report_telegram():
    """Send the weekly report via Telegram."""
    from src.config.settings_manager import TelegramSettingsManager
    from src.config.crypto import decrypt

    enabled = SettingsManager.get_bool("weekly_report_telegram", False)
    if not enabled:
        return jsonify({"error": "Telegram weekly reports are disabled in settings"}), 400

    tg_enabled = TelegramSettingsManager.get("telegram_enabled")
    if tg_enabled != "true":
        return jsonify({"error": "Telegram is not enabled"}), 400

    token_enc = TelegramSettingsManager.get("telegram_token")
    chat_id_enc = TelegramSettingsManager.get("telegram_chat_id")
    if not token_enc or not chat_id_enc:
        return jsonify({"error": "Telegram credentials not configured"}), 400

    try:
        token = decrypt(token_enc)
        chat_id = decrypt(chat_id_enc)
    except Exception:
        token = token_enc
        chat_id = chat_id_enc

    week_of = request.json.get("week_of") if request.json else None
    report = _generate_report(week_of)
    html = _report_to_telegram_html(report)

    try:
        from src.core.telegram.api import TelegramAPI
        api = TelegramAPI(token, chat_id)
        api.send_message(html)
        return jsonify({"ok": True, "status": "sent"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def run_weekly_report_scheduler(stop_event=None, check_interval_sec=300):
    """Background worker: auto-send weekly report once each Sunday when enabled."""
    from src.config.settings_manager import TelegramSettingsManager
    from src.config.crypto import decrypt
    from src.core.telegram.api import TelegramAPI

    while True:
        if stop_event and stop_event.is_set():
            return
        try:
            enabled = SettingsManager.get_bool("weekly_report_telegram", False)
            tg_enabled = TelegramSettingsManager.get("telegram_enabled") == "true"

            now = datetime.now()
            is_sunday = now.weekday() == 6
            monday, _ = _week_bounds(now.date().isoformat())
            sent_week = SettingsManager.get("weekly_report_last_sent_week") or ""

            if enabled and tg_enabled and is_sunday and sent_week != monday:
                token_enc = TelegramSettingsManager.get("telegram_token")
                chat_id_enc = TelegramSettingsManager.get("telegram_chat_id")
                if token_enc and chat_id_enc:
                    try:
                        token = decrypt(token_enc)
                        chat_id = decrypt(chat_id_enc)
                    except Exception:
                        token = token_enc
                        chat_id = chat_id_enc

                    report = _generate_report(now.date().isoformat())
                    html = _report_to_telegram_html(report)
                    api = TelegramAPI(token, chat_id)
                    if api.send_message(html):
                        SettingsManager.set("weekly_report_last_sent_week", monday)
        except Exception:
            pass

        slept = 0
        while slept < check_interval_sec:
            if stop_event and stop_event.is_set():
                return
            time.sleep(1)
            slept += 1


@wellbeing_bp.route("/api/limit-events")
def api_limit_events():
    """Return limit events for a date range."""
    start = request.args.get("start")
    end = request.args.get("end")
    if not start or not end:
        # Default to current week
        from datetime import date
        today = date.today()
        start = (today - timedelta(days=today.weekday())).isoformat()
        end = today.isoformat()
    events = get_limit_events_range(start, end)
    return jsonify([
        {"app": e[0], "type": e[1], "old_value": e[2], "new_value": e[3], "timestamp": e[4], "date": e[5]}
        for e in events
    ])
