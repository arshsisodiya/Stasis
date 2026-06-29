from flask import jsonify, request
from src.api.wellbeing_routes import wellbeing_bp, get_active_user_id
from src.database.database import (
    get_connection, get_all_goals, get_all_goal_logs_range,
    get_limit_events_range, get_limit_events_summary
)
from src.config.ignored_apps_manager import is_ignored
from src.config.settings_manager import SettingsManager
from datetime import datetime, timedelta
import math
import time
import os
import json
from src.utils.logger import setup_logger
from src.config.storage import get_reports_cache_dir

logger = setup_logger()


def _normalize_verbosity(value):
    v = (value or "").strip().lower()
    if v in ("compact", "standard", "detailed"):
        return v
    return "standard"


def _get_cache_path(week_of, verbosity, user_id=None):
    if user_id is not None:
        filename = f"user_{user_id}_report_{week_of}_{verbosity}.json"
    else:
        filename = f"report_{week_of}_{verbosity}.json"
    return os.path.join(get_reports_cache_dir(), filename)


def _load_cache(week_of, verbosity, ttl_minutes=None, user_id=None):
    path = _get_cache_path(week_of, verbosity, user_id=user_id)
    if not os.path.exists(path):
        return None
    
    if ttl_minutes:
        mtime = os.path.getmtime(path)
        age_seconds = time.time() - mtime
        if age_seconds > (ttl_minutes * 60):
            return None
            
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load cache {path}: {e}")
        return None


def _save_cache(week_of, verbosity, data, user_id=None):
    path = _get_cache_path(week_of, verbosity, user_id=user_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Failed to save cache {path}: {e}")


def _range_app_totals(conn, start_date, end_date, user_id=None):
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("""
            SELECT app_name, SUM(active_seconds)
            FROM daily_stats
            WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL)
            GROUP BY app_name
        """, (start_date, end_date, user_id))
    else:
        cursor.execute("""
            SELECT app_name, SUM(active_seconds)
            FROM daily_stats
            WHERE date >= ? AND date <= ? AND user_id IS NULL
            GROUP BY app_name
        """, (start_date, end_date))
    totals = {}
    for app_name, secs in cursor.fetchall():
        if is_ignored(app_name):
            continue
        totals[app_name] = (totals.get(app_name, 0) + (secs or 0))
    return totals


def _range_category_totals(conn, start_date, end_date, user_id=None):
    cursor = conn.cursor()
    if user_id is not None:
        cursor.execute("""
            SELECT main_category, app_name, SUM(active_seconds)
            FROM daily_stats
            WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL)
            GROUP BY main_category, app_name
        """, (start_date, end_date, user_id))
    else:
        cursor.execute("""
            SELECT main_category, app_name, SUM(active_seconds)
            FROM daily_stats
            WHERE date >= ? AND date <= ? AND user_id IS NULL
            GROUP BY main_category, app_name
        """, (start_date, end_date))
    totals = {}
    for cat, app_name, secs in cursor.fetchall():
        if is_ignored(app_name):
            continue
        totals[cat] = totals.get(cat, 0) + (secs or 0)
    return totals


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


def _generate_sparkline(daily_breakdown):
    """Generates an emoji-based sparkline for the week."""
    if not daily_breakdown:
        return ""
    
    # 🟦: < 2h, 🟩: < 4h, 🟨: < 6h, 🟧: < 8h, 🟥: 8h+
    blocks = []
    for day in daily_breakdown:
        sec = day.get("total_seconds", 0)
        h = sec / 3600
        if h == 0: blocks.append("▫️")
        elif h < 2: blocks.append("🟦")
        elif h < 4: blocks.append("🟩")
        elif h < 6: blocks.append("🟨")
        elif h < 8: blocks.append("🟧")
        else: blocks.append("🟥")
    return "".join(blocks)


def _generate_ascii_bar(pct, width=10):
    """Generates a text-based progress bar."""
    filled = int(round((pct / 100) * width))
    empty = width - filled
    return "█" * filled + "░" * empty


def _weekly_trend_series(conn, week_of, weeks=6, user_id=None):
    """Build compact trend series for recent weeks ending at week_of."""
    end_monday, _ = _week_bounds(week_of)
    end_monday_date = datetime.strptime(end_monday, "%Y-%m-%d").date()
    series = []

    for i in range(weeks - 1, -1, -1):
        mon = end_monday_date - timedelta(days=7 * i)
        sun = mon + timedelta(days=6)
        cursor = conn.cursor()
        if user_id is not None:
            cursor.execute("""
                SELECT date, app_name, main_category, SUM(active_seconds)
                FROM daily_stats
                WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL)
                GROUP BY date, app_name, main_category
                ORDER BY date
            """, (mon.isoformat(), sun.isoformat(), user_id))
        else:
            cursor.execute("""
                SELECT date, app_name, main_category, SUM(active_seconds)
                FROM daily_stats
                WHERE date >= ? AND date <= ? AND user_id IS NULL
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


def _generate_report(week_of=None, verbosity=None, include_previous=True, user_id=None):
    """Generate the full weekly report data dict."""
    verbosity = _normalize_verbosity(verbosity or SettingsManager.get("weekly_report_verbosity", user_id=user_id) or "standard")
    monday, sunday = _week_bounds(week_of)
    monday_date = datetime.strptime(monday, "%Y-%m-%d").date()

    # --- CACHE CHECK ---
    # Only use TTL for current week or future weeks. Past weeks are static.
    now = datetime.now().date()
    # Sunday is the end of the week. If current date > sunday, the week is finalized.
    sunday_date = datetime.strptime(sunday, "%Y-%m-%d").date()
    is_current_week = now <= sunday_date
    
    # 10 minute TTL for the week that is still in progress
    ttl = 10 if is_current_week else None
    cached_data = _load_cache(monday, verbosity, ttl_minutes=ttl, user_id=user_id)
    if cached_data:
        return cached_data

    prev_monday = (monday_date - timedelta(days=7)).isoformat()
    prev_sunday = (monday_date - timedelta(days=1)).isoformat()
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # 1. Daily breakdown
        if user_id is not None:
            cursor.execute("""
                SELECT date, app_name, main_category, SUM(active_seconds), SUM(keystrokes), SUM(clicks)
                FROM daily_stats
                WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL)
                GROUP BY date, app_name, main_category
                ORDER BY date
            """, (monday, sunday, user_id))
        else:
            cursor.execute("""
                SELECT date, app_name, main_category, SUM(active_seconds), SUM(keystrokes), SUM(clicks)
                FROM daily_stats
                WHERE date >= ? AND date <= ? AND user_id IS NULL
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

        prev_app_totals = _range_app_totals(conn, prev_monday, prev_sunday, user_id=user_id)

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
        limit_summary = get_limit_events_summary(monday, sunday, user_id=user_id)
        limit_events = get_limit_events_range(monday, sunday, user_id=user_id)

        total_hits = sum(v["hits"] for v in limit_summary.values())
        total_edits = sum(v["edits"] for v in limit_summary.values())

        # 3. Goals progress
        goal_logs = get_all_goal_logs_range(monday, sunday, user_id=user_id)
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

        prev_cat_totals = _range_category_totals(conn, prev_monday, prev_sunday, user_id=user_id)
        category_insights = _build_category_insights(cat_totals, prev_cat_totals)

        # 5. Focus score average (from daily_stats)
        if user_id is not None:
            cursor.execute("""
                SELECT AVG(focus_score) FROM (
                    SELECT date, CASE WHEN SUM(active_seconds) > 0
                        THEN ROUND(100.0 * MAX(active_seconds) / SUM(active_seconds))
                        ELSE 0 END as focus_score
                    FROM daily_stats
                    WHERE date >= ? AND date <= ? AND (user_id = ? OR user_id IS NULL)
                    GROUP BY date
                )
            """, (monday, sunday, user_id))
        else:
            cursor.execute("""
                SELECT AVG(focus_score) FROM (
                    SELECT date, CASE WHEN SUM(active_seconds) > 0
                        THEN ROUND(100.0 * MAX(active_seconds) / SUM(active_seconds))
                        ELSE 0 END as focus_score
                    FROM daily_stats
                    WHERE date >= ? AND date <= ? AND user_id IS NULL
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

        trends = _weekly_trend_series(conn, week_of, weeks=6, user_id=user_id)

        # Goal drift alerts + goal impact correlation
        date_goal_met = {}
        for gl_id, gl_date, actual, target, met, g_type, g_label, g_unit, g_dir in goal_logs:
            date_goal_met[gl_date] = date_goal_met.get(gl_date, False) or bool(met)

        goal_drift_alerts = []
        goals_array = []
        for gid, g in goals_by_id.items():
            tracked = g["days_tracked"]
            rate = round(g["days_met"] / tracked * 100) if tracked > 0 else 0
            label = g["label"] or g["type"].replace("_", " ").title()
            goals_array.append({
                "label": label,
                "goal_type": g["type"],
                "target": g["target"],
                "unit": g["unit"],
                "direction": g["direction"],
                "days_met": g["days_met"],
                "total_days": tracked,
                "success_rate": rate,
            })
            if tracked >= 3 and rate < 50:
                goal_drift_alerts.append({
                    "goal": label,
                    "severity": "high" if rate < 35 else "medium",
                    "message": f"{label} is off-track at {rate}% this week ({g['days_met']}/{tracked} days met).",
                })

        daily_prod_by_date = {d["date"]: d["productive_pct"] for d in daily_breakdown}
        met_days = [daily_prod_by_date[d] for d in daily_prod_by_date if date_goal_met.get(d)]
        non_met_days = [daily_prod_by_date[d] for d in daily_prod_by_date if d in date_goal_met and not date_goal_met.get(d)]
        avg_with = round(sum(met_days) / len(met_days), 1) if met_days else None
        avg_without = round(sum(non_met_days) / len(non_met_days), 1) if non_met_days else None
        corr_delta = round(avg_with - avg_without, 1) if avg_with is not None and avg_without is not None else None
        goal_impact = {
            "with_goal_met_productivity": avg_with,
            "without_goal_met_productivity": avg_without,
            "delta": corr_delta,
            "summary": (
                f"Productivity is {abs(corr_delta)}% {'higher' if corr_delta >= 0 else 'lower'} on days you meet at least one goal."
                if corr_delta is not None else "Not enough mixed goal outcomes this week to estimate goal impact."
            ),
        }

        # What changed this week
        prev_report = _generate_report(prev_monday, verbosity="compact", include_previous=False, user_id=user_id) if (include_previous and total_screen > 0) else None
        changed = []
        if prev_report:
            prev_summary = prev_report.get("summary", {})
            prev_top = (prev_report.get("top_apps") or [{}])[0].get("app_name")
            cur_top = (top_apps[0][0] if top_apps else None)
            prev_screen = prev_summary.get("total_screen_time", 0) or 0
            if prev_screen > 0:
                pct = round(((total_screen - prev_screen) / prev_screen) * 100, 1)
                changed.append(f"Screen time {'rose' if pct >= 0 else 'dropped'} {abs(pct)}% vs last week.")
            if cur_top and prev_top and cur_top != prev_top:
                changed.append(f"Top app changed from {prev_top.replace('.exe','')} to {cur_top.replace('.exe','')}.")
            prod_prev = prev_summary.get("productivity_pct", 0)
            prod_delta = round(prod_pct - prod_prev, 1)
            changed.append(f"Productivity {'improved' if prod_delta >= 0 else 'declined'} by {abs(prod_delta)} points week-over-week.")

        # Verbosity filtering
        if verbosity == "compact":
            insights = insights[:3]
            category_insights = category_insights[:1]
        elif verbosity == "standard":
            insights = insights[:6]
            category_insights = category_insights[:2]

        report_data = {
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
            "verbosity": verbosity,
            "daily_breakdown": daily_breakdown,
            "category_breakdown": [
                {"category": k, "total_seconds": v}
                for k, v in sorted(cat_totals.items(), key=lambda x: -x[1]) if v > 0
            ],
            "category_insights": category_insights,
            "top_apps": [
                {
                    "app_name": app,
                    "total_seconds": secs,
                    "pct": round(secs / total_screen * 100, 1) if total_screen > 0 else 0,
                    "delta_pct": (
                        round(((secs - prev_app_totals.get(app, 0)) / prev_app_totals.get(app, 1)) * 100, 1)
                        if prev_app_totals.get(app, 0) > 0 else None
                    ),
                    "trend": (
                        "up" if prev_app_totals.get(app, 0) and secs > prev_app_totals.get(app, 0)
                        else "down" if prev_app_totals.get(app, 0) and secs < prev_app_totals.get(app, 0)
                        else "new" if prev_app_totals.get(app, 0) == 0
                        else "flat"
                    )
                }
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
            "goals": goals_array,
            "goal_drift_alerts": goal_drift_alerts,
            "goal_impact_correlation": goal_impact,
            "what_changed": changed,
            "insights": insights,
        }
        
        # --- SAVE TO CACHE ---
        _save_cache(monday, verbosity, report_data, user_id=user_id)
        return report_data
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


def _build_category_insights(current_totals, prev_totals):
    insights = []
    if not current_totals:
        return insights
    ordered = sorted(current_totals.items(), key=lambda x: -x[1])
    top_cat, top_secs = ordered[0]
    insights.append(f"{top_cat.title()} was your biggest category at {_fmt_time(top_secs)}.")

    for cat, cur in ordered[:3]:
        prev = prev_totals.get(cat, 0)
        if prev <= 0:
            continue
        delta = round(((cur - prev) / prev) * 100, 1)
        if abs(delta) >= 12:
            insights.append(f"{cat.title()} {'rose' if delta > 0 else 'fell'} {abs(delta)}% vs last week.")
    return insights[:3]


    return insights[:3]


def _report_to_telegram_html(report):
    """Convert report dict to a premium readable Telegram HTML message."""
    p = report["period"]
    s = report["summary"]
    
    # Calculate a simple "Performance Score"
    # Weighted: Productivity (40%), Goal Met Ratio (40%), Focus (20%)
    goals = report.get("goals", [])
    met_ratio = 0
    if goals:
        met_ratio = sum(g["days_met"] for g in goals) / sum(g["total_days"] for g in goals) if sum(g["total_days"] for g in goals) > 0 else 0
    
    score = int((s["productivity_pct"] * 0.4) + (met_ratio * 100 * 0.4) + (s["avg_focus_score"] * 0.2))
    score_emoji = "⭐️" if score >= 85 else "✅" if score >= 70 else "⚖️" if score >= 50 else "⚠️"

    lines = [
        f"<b>📊 WEEKLY PERFORMANCE REPORT</b>",
        f"<i>{p['start']} → {p['end']}</i>",
        f"────────────────────",
        f"{score_emoji} <b>Overall Score: {score}/100</b>",
        "",
        f"⏱ <b>{_fmt_time(s['total_screen_time'])}</b> on screen",
        f"🔥 <b>{s['productivity_pct']}%</b> productivity",
        f"🎯 <b>{s['avg_focus_score']}</b> focus score",
        f"📅 <b>{s['active_days']}</b> active days",
        "",
        "<b>📅 Daily Rhythm</b>",
        f"{_generate_sparkline(report.get('daily_breakdown', []))}",
        "<i>(Mon → Sun)</i>",
        "",
        "<b>📱 Top Applications</b>",
    ]

    import html
    for app in report["top_apps"][:5]:
        name = html.escape(app['app_name'].replace('.exe', ''))
        trend = "🔺" if app.get("trend") == "up" else "🔻" if app.get("trend") == "down" else "🔹"
        bar = _generate_ascii_bar(app['pct'])
        lines.append(f"• <b>{name}</b> {trend}")
        lines.append(f"  {bar} {app['pct']}% ({_fmt_time(app['total_seconds'])})")

    lines.append("")

    verbosity = report.get("verbosity", "standard")

    # Limits
    lim = report["limits"]
    if verbosity != "compact" and (lim["total_hits"] > 0 or lim["total_edits"] > 0):
        lines.append("<b>🚫 App Limits</b>")
        lines.append(f"Hits: {lim['total_hits']} | Edits: {lim['total_edits']}")
        for item in lim["per_app"][:3]:
            lines.append(f"• {item['app_name'].replace('.exe', '')}: {item['hits']} hits")
        lines.append("")

    # Goals
    if verbosity != "compact" and report["goals"]:
        lines.append("<b>🎯 Goals Summary</b>")
        for g in report["goals"]:
            emoji = "✅" if g["days_met"] == g["total_days"] and g["total_days"] > 0 else "⚠️"
            lines.append(f"{emoji} {g['label']}: {g['days_met']}/{g['total_days']} met ({g['success_rate']}%)")
        lines.append("")

    # Insights
    if report["insights"]:
        lines.append("<b>💡 Key Insights</b>")
        for insight in report["insights"][:3 if verbosity == "compact" else 5]:
            lines.append(f"• {insight}")
    
    if report.get("what_changed"):
        lines.append("\n<b>🔄 What Changed</b>")
        for change in report["what_changed"][:3]:
            lines.append(f"• {change}")

    return "\n".join(lines)

@wellbeing_bp.route("/api/weekly-report")
def api_weekly_report():
    week_of = request.args.get("week_of")
    verbosity = request.args.get("verbosity")
    user_id = get_active_user_id()
    report = _generate_report(week_of, verbosity=verbosity, user_id=user_id)
    return jsonify(report)


@wellbeing_bp.route("/api/weekly-report/compare")
def api_weekly_report_compare():
    week_a = request.args.get("week_a")
    week_b = request.args.get("week_b")
    if not week_a or not week_b:
        return jsonify({"error": "week_a and week_b are required"}), 400

    user_id = get_active_user_id()
    a = _generate_report(week_a, verbosity="compact", user_id=user_id)
    b = _generate_report(week_b, verbosity="compact", user_id=user_id)
    sa = a.get("summary", {})
    sb = b.get("summary", {})
    diff = {
        "screen_time_delta": (sa.get("total_screen_time", 0) - sb.get("total_screen_time", 0)),
        "avg_daily_delta": (sa.get("avg_daily", 0) - sb.get("avg_daily", 0)),
        "productivity_delta": round((sa.get("productivity_pct", 0) - sb.get("productivity_pct", 0)), 1),
        "focus_delta": round((sa.get("avg_focus_score", 0) - sb.get("avg_focus_score", 0)), 1),
    }
    return jsonify({"week_a": a, "week_b": b, "diff": diff})


@wellbeing_bp.route("/api/weekly-report/available-weeks")
def api_weekly_report_available_weeks():
    conn = get_connection()
    cursor = conn.cursor()
    user_id = get_active_user_id()
    try:
        if user_id is not None:
            cursor.execute("SELECT DISTINCT date FROM daily_stats WHERE (user_id = ? OR user_id IS NULL) ORDER BY date DESC", (user_id,))
        else:
            cursor.execute("SELECT DISTINCT date FROM daily_stats WHERE user_id IS NULL ORDER BY date DESC")
        rows = [r[0] for r in cursor.fetchall() if r and r[0]]
        weeks = set()
        for date_str in rows:
            monday, sunday = _week_bounds(date_str)
            weeks.add((monday, sunday))

        current_monday, current_sunday = _week_bounds()
        weeks.add((current_monday, current_sunday))

        sorted_weeks = sorted(weeks, key=lambda x: x[0], reverse=True)
        return jsonify([
            {
                "value": monday,
                "start": monday,
                "end": sunday,
                "label": f"{datetime.strptime(monday, '%Y-%m-%d').strftime('%b %d')} - {datetime.strptime(sunday, '%Y-%m-%d').strftime('%b %d, %Y')}"
            }
            for monday, sunday in sorted_weeks
        ])
    finally:
        conn.close()


def _generate_report_html(report):
    """Generates a standalone, premium HTML report with animated charts and modern dashboard design."""
    import json
    p = report["period"]
    s = report["summary"]

    # Prepare chart data
    day_labels = [datetime.strptime(d["date"], "%Y-%m-%d").strftime("%a") for d in report["daily_breakdown"]]
    screen_data = [round(d["total_seconds"] / 3600, 2) for d in report["daily_breakdown"]]
    prod_data = [d["productive_pct"] for d in report["daily_breakdown"]]

    top_apps_labels = [a["app_name"].replace(".exe", "") for a in report["top_apps"][:8]]
    top_apps_data = [round(a["total_seconds"] / 3600, 2) for a in report["top_apps"][:8]]
    top_apps_pct = [a["pct"] for a in report["top_apps"][:8]]

    cat_labels = [c["category"].title() for c in report["category_breakdown"]]
    cat_data = [round(c["total_seconds"] / 3600, 2) for c in report["category_breakdown"]]

    # Trend series
    trend_labels = [t["week_start"] for t in report.get("trends", [])]
    trend_screen = [round(t["screen_time"] / 3600, 1) for t in report.get("trends", [])]
    trend_prod = [t["productivity_pct"] for t in report.get("trends", [])]

    # Goals
    goals = report.get("goals", [])
    goals_html = ""
    for g in goals:
        rate = g["success_rate"]
        color = "#22c55e" if rate >= 80 else "#f59e0b" if rate >= 50 else "#f43f5e"
        goals_html += f"""
        <div class="goal-item">
            <div class="goal-header">
                <span class="goal-label">{g['label']}</span>
                <span class="goal-rate" style="color:{color}">{rate}%</span>
            </div>
            <div class="goal-bar-bg"><div class="goal-bar-fill" style="width:{rate}%;background:{color}"></div></div>
            <div class="goal-sub">{g['days_met']}/{g['total_days']} days met</div>
        </div>"""

    # Insights
    insights_html = "".join([
        f'<div class="insight-item" style="animation-delay:{i*0.08}s"><span class="insight-dot"></span>{ins}</div>'
        for i, ins in enumerate(report.get("insights", [])[:6])
    ])

    # What changed
    changed_html = "".join([
        f'<div class="change-item" style="animation-delay:{i*0.1}s">{c}</div>'
        for i, c in enumerate(report.get("what_changed", [])[:5])
    ])

    # Limit events
    lim = report.get("limits", {})
    limit_apps_html = ""
    for item in lim.get("per_app", [])[:5]:
        if item["hits"] > 0 or item["edits"] > 0:
            limit_apps_html += f"""
            <div class="limit-row">
                <span class="limit-app">{item['app_name'].replace('.exe','')}</span>
                <span class="limit-badge hits">{item['hits']} hits</span>
                <span class="limit-badge edits">{item['edits']} edits</span>
            </div>"""

    # Performance score
    met_ratio = 0
    if goals:
        total_days_g = sum(g["total_days"] for g in goals)
        if total_days_g > 0:
            met_ratio = sum(g["days_met"] for g in goals) / total_days_g
    perf_score = int((s["productivity_pct"] * 0.4) + (met_ratio * 100 * 0.4) + (s["avg_focus_score"] * 0.2))
    perf_grade = "S" if perf_score >= 90 else "A" if perf_score >= 80 else "B" if perf_score >= 65 else "C" if perf_score >= 50 else "D"
    perf_color = "#22c55e" if perf_score >= 80 else "#f59e0b" if perf_score >= 60 else "#f43f5e"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stasis Report · {p['start']}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;1,9..40,300&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

        :root {{
            --bg:        #080c14;
            --surface:   #0d1320;
            --card:      #111827;
            --card2:     #161f30;
            --border:    rgba(255,255,255,0.07);
            --border2:   rgba(255,255,255,0.12);
            --text:      #e2e8f0;
            --muted:     #64748b;
            --accent:    #3b82f6;
            --accent2:   #6366f1;
            --green:     #10b981;
            --amber:     #f59e0b;
            --red:       #ef4444;
            --purple:    #a855f7;
            --cyan:      #06b6d4;
            --glow-blue: rgba(59,130,246,0.15);
            --glow-green:rgba(16,185,129,0.12);
            --font: 'DM Sans', sans-serif;
            --mono: 'DM Mono', monospace;
        }}

        html {{ scroll-behavior: smooth; }}

        body {{
            font-family: var(--font);
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            overflow-x: hidden;
        }}

        /* ── Background grid ── */
        body::before {{
            content: '';
            position: fixed; inset: 0;
            background-image:
                linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
            z-index: 0;
        }}

        /* ── Glow orbs ── */
        .orb {{
            position: fixed;
            border-radius: 50%;
            filter: blur(120px);
            pointer-events: none;
            z-index: 0;
            animation: orbFloat 12s ease-in-out infinite;
        }}
        .orb-1 {{ width:500px;height:500px;top:-100px;left:-100px;background:rgba(59,130,246,0.08); animation-delay:0s; }}
        .orb-2 {{ width:400px;height:400px;bottom:-80px;right:-80px;background:rgba(99,102,241,0.07); animation-delay:-6s; }}
        @keyframes orbFloat {{
            0%,100% {{ transform: translate(0,0); }}
            50%      {{ transform: translate(30px, 20px); }}
        }}

        /* ── Layout ── */
        .page {{
            position: relative; z-index: 1;
            max-width: 1400px;
            margin: 0 auto;
            padding: 32px 24px 64px;
        }}

        /* ── Header ── */
        .header {{
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 16px;
            margin-bottom: 40px;
            padding-bottom: 28px;
            border-bottom: 1px solid var(--border);
            animation: fadeDown 0.6s ease both;
        }}
        .header-left {{ display:flex; align-items:center; gap:16px; }}
        .logo-mark {{
            width:44px; height:44px;
            background: linear-gradient(135deg, var(--accent), var(--accent2));
            border-radius: 12px;
            display: flex; align-items:center; justify-content:center;
            font-size:20px; flex-shrink:0;
            box-shadow: 0 0 24px var(--glow-blue);
        }}
        .header h1 {{
            font-size: clamp(1.4rem,3vw,2rem);
            font-weight: 700;
            letter-spacing: -0.02em;
            background: linear-gradient(135deg, #fff 30%, #94a3b8);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text;
        }}
        .header-period {{
            font-family: var(--mono);
            font-size: 0.8rem;
            color: var(--muted);
            letter-spacing: 0.05em;
        }}
        .perf-badge {{
            display: flex; align-items:center; gap:12px;
            background: var(--card2);
            border: 1px solid var(--border2);
            border-radius: 16px;
            padding: 12px 20px;
        }}
        .perf-grade {{
            font-size: 2rem; font-weight: 700;
            color: {perf_color};
            line-height:1;
            filter: drop-shadow(0 0 12px {perf_color});
        }}
        .perf-info {{ display:flex;flex-direction:column; gap:2px; }}
        .perf-score {{ font-size:0.85rem; color:var(--muted); }}
        .perf-score strong {{ color:var(--text); font-size:1.1rem; }}

        /* ── Stat Grid ── */
        .stats-row {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }}
        @media(max-width:900px) {{ .stats-row {{ grid-template-columns: repeat(2,1fr); }} }}
        @media(max-width:500px) {{ .stats-row {{ grid-template-columns: 1fr 1fr; }} }}

        .stat-card {{
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px 22px;
            position: relative;
            overflow: hidden;
            transition: transform 0.25s, border-color 0.25s, box-shadow 0.25s;
            animation: fadeUp 0.5s ease both;
        }}
        .stat-card:hover {{
            transform: translateY(-3px);
            border-color: var(--border2);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }}
        .stat-card::before {{
            content: '';
            position: absolute; top:0; left:0; right:0; height:2px;
            border-radius:2px 2px 0 0;
        }}
        .stat-card.blue::before  {{ background: var(--accent); box-shadow:0 0 12px var(--accent); }}
        .stat-card.green::before {{ background: var(--green);  box-shadow:0 0 12px var(--green); }}
        .stat-card.amber::before {{ background: var(--amber);  box-shadow:0 0 12px var(--amber); }}
        .stat-card.purple::before{{ background: var(--purple); box-shadow:0 0 12px var(--purple); }}
        .stat-card.cyan::before  {{ background: var(--cyan);   box-shadow:0 0 12px var(--cyan); }}

        .stat-icon {{ font-size:1.3rem; margin-bottom:10px; display:block; }}
        .stat-value {{
            font-size: clamp(1.6rem,3vw,2.2rem);
            font-weight: 700;
            letter-spacing: -0.03em;
            line-height: 1;
            display: block;
            margin-bottom: 6px;
        }}
        .stat-label {{
            font-size: 0.72rem;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-weight: 500;
        }}
        .stat-sub {{
            font-size: 0.75rem;
            color: var(--muted);
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid var(--border);
        }}

        /* ── Main grid ── */
        .main-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr 360px;
            gap: 20px;
            margin-bottom: 20px;
        }}
        .main-grid .span-2 {{ grid-column: span 2; }}
        @media(max-width:1100px) {{
            .main-grid {{ grid-template-columns: 1fr 1fr; }}
            .main-grid .span-2 {{ grid-column: span 2; }}
            .main-grid .sidebar {{ grid-column: span 2; }}
        }}
        @media(max-width:700px) {{
            .main-grid {{ grid-template-columns: 1fr; }}
            .main-grid .span-2, .main-grid .sidebar {{ grid-column: span 1; }}
        }}

        .bottom-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
        }}
        @media(max-width:900px) {{ .bottom-grid {{ grid-template-columns:1fr 1fr; }} }}
        @media(max-width:600px) {{ .bottom-grid {{ grid-template-columns:1fr; }} }}

        /* ── Card ── */
        .card {{
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 22px 24px;
            animation: fadeUp 0.5s ease both;
            transition: border-color 0.25s;
        }}
        .card:hover {{ border-color: var(--border2); }}
        .card-header {{
            display: flex; align-items:center; justify-content:space-between;
            margin-bottom: 18px;
        }}
        .card-title {{
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--muted);
            text-transform: uppercase;
            letter-spacing: 0.1em;
            display: flex; align-items:center; gap:8px;
        }}
        .card-title-dot {{
            width:6px; height:6px; border-radius:50%;
        }}
        .card-badge {{
            font-family: var(--mono);
            font-size: 0.7rem;
            padding: 3px 8px;
            border-radius: 20px;
            background: rgba(255,255,255,0.05);
            color: var(--muted);
        }}
        .chart-wrap {{ position:relative; }}

        /* ── Insight items ── */
        .insight-item {{
            display: flex; align-items:flex-start; gap:10px;
            padding: 10px 12px;
            border-radius: 10px;
            font-size: 0.855rem;
            line-height: 1.5;
            background: rgba(255,255,255,0.02);
            border: 1px solid transparent;
            margin-bottom: 8px;
            animation: fadeRight 0.4s ease both;
            transition: background 0.2s, border-color 0.2s;
        }}
        .insight-item:hover {{ background: rgba(59,130,246,0.06); border-color: rgba(59,130,246,0.15); }}
        .insight-dot {{
            width: 6px; height: 6px; border-radius:50%;
            background: var(--accent);
            margin-top:6px; flex-shrink:0;
            box-shadow: 0 0 6px var(--accent);
        }}

        /* ── Change items ── */
        .change-item {{
            padding: 10px 14px;
            border-radius: 10px;
            font-size: 0.845rem;
            line-height: 1.5;
            border-left: 3px solid var(--purple);
            background: rgba(168,85,247,0.05);
            margin-bottom: 8px;
            animation: fadeRight 0.4s ease both;
        }}

        /* ── Goal items ── */
        .goal-item {{ margin-bottom:16px; }}
        .goal-header {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }}
        .goal-label {{ font-size:0.85rem; font-weight:500; }}
        .goal-rate {{ font-size:0.85rem; font-weight:700; font-family:var(--mono); }}
        .goal-bar-bg {{
            height:5px; background:rgba(255,255,255,0.06); border-radius:99px; overflow:hidden;
        }}
        .goal-bar-fill {{
            height:100%; border-radius:99px;
            transition: width 1.2s cubic-bezier(0.16,1,0.3,1);
        }}
        .goal-sub {{ font-size:0.72rem; color:var(--muted); margin-top:4px; }}

        /* ── Limit rows ── */
        .limit-row {{
            display:flex; align-items:center; gap:8px;
            padding:8px 0;
            border-bottom:1px solid var(--border);
            font-size:0.85rem;
        }}
        .limit-row:last-child {{ border-bottom:none; }}
        .limit-app {{ flex:1; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }}
        .limit-badge {{
            font-family:var(--mono); font-size:0.7rem;
            padding:2px 8px; border-radius:20px;
            white-space:nowrap;
        }}
        .limit-badge.hits {{ background:rgba(239,68,68,0.12); color:var(--red); }}
        .limit-badge.edits {{ background:rgba(245,158,11,0.12); color:var(--amber); }}

        /* ── Mini sparkline row ── */
        .sparkline-row {{
            display:grid; grid-template-columns:repeat(7,1fr); gap:4px; margin-top:4px;
        }}
        .spark-bar {{
            border-radius:4px 4px 0 0;
            min-height:4px;
            transition: height 0.8s cubic-bezier(0.34,1.56,0.64,1);
            position: relative;
        }}
        .spark-bar:hover .spark-tooltip {{
            opacity:1; transform:translateY(0);
        }}
        .spark-tooltip {{
            position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%) translateY(4px);
            background:#1e293b; border:1px solid var(--border2); border-radius:6px;
            font-size:0.7rem; padding:4px 8px; white-space:nowrap;
            opacity:0; transition:opacity 0.15s, transform 0.15s;
            pointer-events:none; z-index:10; color:var(--text);
        }}
        .day-labels {{
            display:grid; grid-template-columns:repeat(7,1fr); gap:4px;
            margin-top:4px;
        }}
        .day-label {{
            text-align:center; font-size:0.65rem; color:var(--muted); font-family:var(--mono);
        }}

        /* ── Trend mini cards ── */
        .trend-numbers {{
            display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px;
        }}
        .trend-num {{
            background:rgba(255,255,255,0.03); border:1px solid var(--border);
            border-radius:10px; padding:10px 12px;
        }}
        .trend-num-val {{ font-size:1.1rem; font-weight:700; font-family:var(--mono); color:var(--text); }}
        .trend-num-lab {{ font-size:0.65rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; margin-top:2px; }}

        /* ── Animations ── */
        @keyframes fadeUp   {{ from{{ opacity:0; transform:translateY(18px); }} to{{ opacity:1; transform:none; }} }}
        @keyframes fadeDown {{ from{{ opacity:0; transform:translateY(-14px); }} to{{ opacity:1; transform:none; }} }}
        @keyframes fadeRight{{ from{{ opacity:0; transform:translateX(-12px); }} to{{ opacity:1; transform:none; }} }}

        /* ── Scrollbar ── */
        ::-webkit-scrollbar {{ width:6px; height:6px; }}
        ::-webkit-scrollbar-track {{ background:transparent; }}
        ::-webkit-scrollbar-thumb {{ background:rgba(255,255,255,0.1); border-radius:3px; }}

        /* ── Responsive typography ── */
        @media(max-width:600px) {{
            .page {{ padding:16px 14px 48px; }}
            .header h1 {{ font-size:1.2rem; }}
            .perf-badge {{ padding:10px 14px; }}
            .card {{ padding:16px; }}
        }}
    </style>
</head>
<body>
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>

    <div class="page">

        <!-- ── Header ── -->
        <header class="header">
            <div class="header-left">
                <div class="logo-mark">⚡</div>
                <div>
                    <h1>Stasis Weekly Report</h1>
                    <div class="header-period">{p['start']} → {p['end']}</div>
                </div>
            </div>
            <div class="perf-badge">
                <div class="perf-grade">{perf_grade}</div>
                <div class="perf-info">
                    <div style="font-size:0.75rem;color:var(--muted);">Performance</div>
                    <div class="perf-score"><strong>{perf_score}</strong>/100</div>
                </div>
            </div>
        </header>

        <!-- ── KPI Stats ── -->
        <div class="stats-row">
            <div class="stat-card blue" style="animation-delay:0.05s">
                <span class="stat-icon">⏱</span>
                <span class="stat-value">{_fmt_time(s['total_screen_time'])}</span>
                <span class="stat-label">Total Screen Time</span>
                <div class="stat-sub">~{_fmt_time(s['avg_daily'])} / day · {s['active_days']}/7 active</div>
            </div>
            <div class="stat-card green" style="animation-delay:0.1s">
                <span class="stat-icon">🔥</span>
                <span class="stat-value" style="color:var(--green)">{s['productivity_pct']}%</span>
                <span class="stat-label">Productivity</span>
                <div class="stat-sub">of total screen time</div>
            </div>
            <div class="stat-card amber" style="animation-delay:0.15s">
                <span class="stat-icon">🎯</span>
                <span class="stat-value" style="color:var(--amber)">{s['avg_focus_score']}</span>
                <span class="stat-label">Avg Focus Score</span>
                <div class="stat-sub">out of 100</div>
            </div>
            <div class="stat-card purple" style="animation-delay:0.2s">
                <span class="stat-icon">⌨️</span>
                <span class="stat-value" style="color:var(--purple)">{s['total_keystrokes']:,}</span>
                <span class="stat-label">Keystrokes</span>
                <div class="stat-sub">{s['total_clicks']:,} clicks</div>
            </div>
        </div>

        <!-- ── Daily Activity Heatmap Bar ── -->
        <div class="card" style="margin-bottom:20px;animation-delay:0.22s">
            <div class="card-header">
                <div class="card-title"><span class="card-title-dot" style="background:var(--accent)"></span>Daily Activity Rhythm</div>
                <div class="card-badge">Mon → Sun</div>
            </div>
            <div id="sparklineContainer" style="padding:8px 0 4px;">
                <div class="sparkline-row" id="sparkBars"></div>
                <div class="day-labels" id="dayLabels"></div>
            </div>
        </div>

        <!-- ── Main Charts Grid ── -->
        <div class="main-grid">

            <!-- Activity line chart -->
            <div class="card span-2" style="animation-delay:0.25s">
                <div class="card-header">
                    <div class="card-title"><span class="card-title-dot" style="background:var(--accent)"></span>Screen Time &amp; Productivity</div>
                    <div class="card-badge">This Week</div>
                </div>
                <div class="chart-wrap" style="height:220px"><canvas id="weeklyChart"></canvas></div>
            </div>

            <!-- Sidebar: Goals -->
            <div class="card sidebar" style="animation-delay:0.3s">
                <div class="card-header">
                    <div class="card-title"><span class="card-title-dot" style="background:var(--green)"></span>Goals Progress</div>
                </div>
                {goals_html if goals_html else '<div style="color:var(--muted);font-size:0.85rem;padding:20px 0;text-align:center">No goals tracked</div>'}
            </div>

            <!-- Apps chart -->
            <div class="card" style="animation-delay:0.32s">
                <div class="card-header">
                    <div class="card-title"><span class="card-title-dot" style="background:var(--cyan)"></span>Top Applications</div>
                    <div class="card-badge">Hours</div>
                </div>
                <div class="chart-wrap" style="height:240px"><canvas id="appsChart"></canvas></div>
            </div>

            <!-- Category donut -->
            <div class="card" style="animation-delay:0.35s">
                <div class="card-header">
                    <div class="card-title"><span class="card-title-dot" style="background:var(--purple)"></span>Category Breakdown</div>
                </div>
                <div class="chart-wrap" style="height:240px"><canvas id="categoryChart"></canvas></div>
            </div>

        </div>

        <!-- ── Bottom Grid ── -->
        <div class="bottom-grid">

            <!-- 6-week trend -->
            <div class="card" style="animation-delay:0.38s">
                <div class="card-header">
                    <div class="card-title"><span class="card-title-dot" style="background:var(--accent2)"></span>6-Week Trend</div>
                </div>
                <div class="chart-wrap" style="height:150px"><canvas id="trendChart"></canvas></div>
                <div class="trend-numbers">
                    <div class="trend-num">
                        <div class="trend-num-val">{_fmt_time(s['total_screen_time'])}</div>
                        <div class="trend-num-lab">This Week</div>
                    </div>
                    <div class="trend-num">
                        <div class="trend-num-val" style="color:var(--green)">{s['productivity_pct']}%</div>
                        <div class="trend-num-lab">Productive</div>
                    </div>
                </div>
            </div>

            <!-- Insights -->
            <div class="card" style="animation-delay:0.4s">
                <div class="card-header">
                    <div class="card-title"><span class="card-title-dot" style="background:var(--amber)"></span>Key Insights</div>
                </div>
                {insights_html if insights_html else '<div style="color:var(--muted);font-size:0.85rem">No insights available.</div>'}
            </div>

            <!-- What changed + limits -->
            <div class="card" style="animation-delay:0.42s">
                <div class="card-header">
                    <div class="card-title"><span class="card-title-dot" style="background:var(--purple)"></span>What Changed</div>
                </div>
                {changed_html if changed_html else '<div style="color:var(--muted);font-size:0.85rem;margin-bottom:16px">No comparison data.</div>'}

                {"" if not limit_apps_html else f'''
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                    <div class="card-title" style="margin-bottom:12px"><span class="card-title-dot" style="background:var(--red)"></span>App Limits</div>
                    {limit_apps_html}
                </div>'''}
            </div>

        </div>

    </div><!-- /page -->

    <script>
    (() => {{
        // ── Sparkline heatmap ──
        const sparkData   = {json.dumps(screen_data)};
        const sparkLabels = {json.dumps(day_labels)};
        const sparkProd   = {json.dumps(prod_data)};
        const maxSpark    = Math.max(...sparkData, 0.1);
        const container   = document.getElementById('sparkBars');
        const labelsEl    = document.getElementById('dayLabels');

        sparkData.forEach((hrs, i) => {{
            const pct = hrs / maxSpark;
            const h   = Math.max(pct * 80, 4);
            const alpha = 0.2 + pct * 0.8;
            const bar = document.createElement('div');
            bar.className = 'spark-bar';
            bar.style.cssText = `
                height:${{h}}px;
                background:rgba(59,130,246,${{alpha.toFixed(2)}});
                border:1px solid rgba(59,130,246,${{(alpha*0.5).toFixed(2)}});
            `;
            const tip = document.createElement('div');
            tip.className = 'spark-tooltip';
            tip.textContent = `${{sparkLabels[i]}}: ${{hrs.toFixed(1)}}h · ${{sparkProd[i]}}% prod`;
            bar.appendChild(tip);
            container.appendChild(bar);

            const lbl = document.createElement('div');
            lbl.className = 'day-label';
            lbl.textContent = sparkLabels[i];
            labelsEl.appendChild(lbl);
        }});

        // ── Chart defaults ──
        Chart.defaults.color = '#64748b';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
        Chart.defaults.font.family = "'DM Sans', sans-serif";

        const gridColor  = 'rgba(255,255,255,0.05)';
        const tickColor  = '#64748b';

        // ── Weekly Activity Chart ──
        new Chart(document.getElementById('weeklyChart'), {{
            type: 'line',
            data: {{
                labels: {json.dumps(day_labels)},
                datasets: [
                    {{
                        label: 'Hours Online',
                        data: {json.dumps(screen_data)},
                        borderColor: '#3b82f6',
                        backgroundColor: (ctx) => {{
                            const g = ctx.chart.ctx.createLinearGradient(0,0,0,220);
                            g.addColorStop(0,'rgba(59,130,246,0.25)');
                            g.addColorStop(1,'rgba(59,130,246,0)');
                            return g;
                        }},
                        fill: true,
                        tension: 0.45,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#3b82f6',
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        yAxisID: 'y'
                    }},
                    {{
                        label: 'Productivity %',
                        data: {json.dumps(prod_data)},
                        borderColor: '#10b981',
                        backgroundColor: 'transparent',
                        tension: 0.4,
                        borderWidth: 2,
                        borderDash: [5,4],
                        pointBackgroundColor: '#10b981',
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        yAxisID: 'yPct'
                    }}
                ]
            }},
            options: {{
                responsive: true, maintainAspectRatio: false,
                interaction: {{ mode:'index', intersect:false }},
                plugins: {{
                    legend: {{ labels: {{ color:'#94a3b8', usePointStyle:true, pointStyleWidth:8, padding:20 }} }},
                    tooltip: {{
                        backgroundColor:'#1e293b',
                        borderColor:'rgba(255,255,255,0.1)',
                        borderWidth:1,
                        titleColor:'#e2e8f0',
                        bodyColor:'#94a3b8',
                        padding:12,
                        callbacks: {{
                            label: (ctx) => ctx.dataset.label === 'Hours Online'
                                ? ` ${{ctx.parsed.y.toFixed(1)}}h`
                                : ` ${{ctx.parsed.y}}%`
                        }}
                    }}
                }},
                scales: {{
                    x: {{ grid:{{color:gridColor}}, ticks:{{color:tickColor}} }},
                    y: {{
                        grid:{{color:gridColor}}, ticks:{{color:'#3b82f6',callback:v=>v+'h'}},
                        title:{{display:false}}
                    }},
                    yPct: {{
                        position:'right', min:0, max:100,
                        grid:{{display:false}},
                        ticks:{{color:'#10b981',callback:v=>v+'%'}}
                    }}
                }}
            }}
        }});

        // ── Apps horizontal bar ──
        new Chart(document.getElementById('appsChart'), {{
            type: 'bar',
            data: {{
                labels: {json.dumps(top_apps_labels)},
                datasets: [{{
                    label: 'Hours',
                    data: {json.dumps(top_apps_data)},
                    backgroundColor: {json.dumps(top_apps_labels)}.map((_,i) => `hsla(${{200 + i*15}},80%,60%,0.75)`),
                    borderColor:      {json.dumps(top_apps_labels)}.map((_,i) => `hsla(${{200 + i*15}},80%,60%,1)`),
                    borderWidth: 1,
                    borderRadius: 6,
                    borderSkipped: false
                }}]
            }},
            options: {{
                indexAxis: 'y',
                responsive: true, maintainAspectRatio: false,
                plugins: {{
                    legend: {{display:false}},
                    tooltip: {{
                        backgroundColor:'#1e293b', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
                        titleColor:'#e2e8f0', bodyColor:'#94a3b8', padding:10,
                        callbacks: {{ label: (ctx) => ` ${{ctx.parsed.x.toFixed(1)}}h (${{({json.dumps(top_apps_pct)})[ctx.dataIndex]}}%)` }}
                    }}
                }},
                scales: {{
                    x: {{ grid:{{color:gridColor}}, ticks:{{color:tickColor,callback:v=>v+'h'}} }},
                    y: {{ grid:{{display:false}}, ticks:{{color:'#e2e8f0',font:{{size:12}}}} }}
                }}
            }}
        }});

        // ── Category doughnut ──
        new Chart(document.getElementById('categoryChart'), {{
            type: 'doughnut',
            data: {{
                labels: {json.dumps(cat_labels)},
                datasets: [{{
                    data: {json.dumps(cat_data)},
                    backgroundColor: ['#10b981','#6366f1','#ef4444','#f59e0b','#06b6d4','#a855f7'],
                    borderColor: '#111827',
                    borderWidth: 3,
                    hoverBorderWidth: 2,
                    hoverOffset: 6
                }}]
            }},
            options: {{
                responsive: true, maintainAspectRatio: false,
                cutout: '65%',
                plugins: {{
                    legend: {{
                        position:'bottom',
                        labels:{{color:'#94a3b8',usePointStyle:true,pointStyleWidth:8,padding:14,font:{{size:11}}}}
                    }},
                    tooltip: {{
                        backgroundColor:'#1e293b', borderColor:'rgba(255,255,255,0.1)', borderWidth:1,
                        titleColor:'#e2e8f0', bodyColor:'#94a3b8', padding:10,
                        callbacks: {{ label:(ctx)=>` ${{ctx.parsed.toFixed(1)}}h` }}
                    }}
                }}
            }}
        }});

        // ── 6-Week Trend ──
        new Chart(document.getElementById('trendChart'), {{
            type: 'bar',
            data: {{
                labels: {json.dumps(trend_labels)}.map(d => d ? d.slice(5) : ''),
                datasets: [
                    {{
                        type: 'bar',
                        label: 'Hours/week',
                        data: {json.dumps(trend_screen)},
                        backgroundColor: 'rgba(99,102,241,0.5)',
                        borderColor: 'rgba(99,102,241,0.9)',
                        borderWidth:1, borderRadius:4,
                        yAxisID:'y'
                    }},
                    {{
                        type: 'line',
                        label: 'Prod %',
                        data: {json.dumps(trend_prod)},
                        borderColor: '#10b981',
                        tension: 0.4, borderWidth:2,
                        pointRadius:3, pointBackgroundColor:'#10b981',
                        yAxisID:'yPct'
                    }}
                ]
            }},
            options: {{
                responsive:true, maintainAspectRatio:false,
                plugins:{{ legend:{{display:false}}, tooltip:{{
                    backgroundColor:'#1e293b',borderColor:'rgba(255,255,255,0.1)',borderWidth:1,
                    titleColor:'#e2e8f0',bodyColor:'#94a3b8',padding:8
                }} }},
                scales:{{
                    x:{{ grid:{{display:false}}, ticks:{{color:tickColor,font:{{size:10}}}} }},
                    y:{{ grid:{{color:gridColor}}, ticks:{{color:'#6366f1',font:{{size:10}},callback:v=>v+'h'}} }},
                    yPct:{{ position:'right',min:0,max:100, grid:{{display:false}}, ticks:{{color:'#10b981',font:{{size:10}},callback:v=>v+'%'}} }}
                }}
            }}
        }});

        // ── Animate goal bars on load ──
        document.querySelectorAll('.goal-bar-fill').forEach(el => {{
            const target = el.style.width;
            el.style.width = '0';
            setTimeout(() => el.style.width = target, 400);
        }});

    }})();
    </script>
</body>
</html>"""
    return html


@wellbeing_bp.route("/api/weekly-report/send-telegram", methods=["POST"])
def api_send_weekly_report_telegram():
    """Send the weekly report via Telegram (Text + HTML Page)."""
    from src.config.settings_manager import TelegramSettingsManager
    from src.config.crypto import decrypt
    from src.config.storage import get_data_dir

    user_id = get_active_user_id()

    enabled = SettingsManager.get_bool("weekly_report_telegram", False, user_id=user_id)
    if not enabled:
        return jsonify({"error": "Telegram weekly reports are disabled in settings"}), 400

    tg_enabled = TelegramSettingsManager.get("telegram_enabled", user_id=user_id)
    if tg_enabled != "true":
        return jsonify({"error": "Telegram is not enabled"}), 400

    token_enc = TelegramSettingsManager.get("telegram_token", user_id=user_id)
    chat_id_enc = TelegramSettingsManager.get("telegram_chat_id", user_id=user_id)
    if not token_enc or not chat_id_enc:
        return jsonify({"error": "Telegram credentials not configured"}), 400

    try:
        token = decrypt(token_enc)
        chat_id = decrypt(chat_id_enc)
    except Exception:
        token = token_enc
        chat_id = chat_id_enc

    week_of = request.json.get("week_of") if request.json else None
    verbosity = _normalize_verbosity(SettingsManager.get("weekly_report_verbosity", user_id=user_id) or "standard")
    logger.info(f"Generating weekly report for week_of={week_of}...")
    try:
        report = _generate_report(week_of, verbosity=verbosity, user_id=user_id)
        logger.info("Report data generated successfully.")
    except Exception as e:
        logger.error(f"Failed to generate report data: {e}")
        return jsonify({"error": f"Report generation failed: {str(e)}"}), 500
    
    # 1. Generate text message
    try:
        text = _report_to_telegram_html(report)
        logger.info("Report text formatted successfully.")
    except Exception as e:
        logger.error(f"Failed to format report text: {e}")
        return jsonify({"error": f"Text formatting failed: {str(e)}"}), 500
    
    # 2. Generate HTML file
    try:
        report_html = _generate_report_html(report)
        temp_dir = get_data_dir()
        file_name = f"Stasis_Report_{report['period']['start']}.html"
        file_path = os.path.join(temp_dir, file_name)
        
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(report_html)
        logger.info(f"HTML report saved to {file_path}")
    except Exception as e:
        logger.error(f"Failed to generate/save HTML report: {e}")
        return jsonify({"error": f"HTML generation failed: {str(e)}"}), 500

    try:
        from src.core.telegram.api import TelegramAPI
        api = TelegramAPI(token, chat_id)
        
        logger.info("Sending text summary to Telegram...")
        api.send_message(text)
        
        logger.info("Sending HTML document to Telegram...")
        api.send_document(file_path, caption=f"📄 Full Interactive Report ({report['period']['start']})")
        
        # Cleanup
        try: 
            os.remove(file_path)
            logger.info("Cleanup: Temporary HTML report removed.")
        except: pass
        
        return jsonify({"ok": True, "status": "sent"})
    except Exception as e:
        logger.exception("Failed to send weekly report to Telegram.")
        return jsonify({"error": str(e)}), 500


def run_weekly_report_scheduler(stop_event=None, check_interval_sec=300):
    """Background worker: auto-send weekly report once each Sunday when enabled."""
    from src.config.settings_manager import TelegramSettingsManager
    from src.config.crypto import decrypt
    from src.config.storage import get_data_dir
    from src.api.auth_routes import _app_controller

    while True:
        if stop_event and stop_event.is_set():
            return
        try:
            active_user_id = None
            if _app_controller and _app_controller.auth_manager:
                active_user_id = _app_controller.auth_manager.active_user_id

            enabled = SettingsManager.get_bool("weekly_report_telegram", False, user_id=active_user_id)
            tg_enabled = TelegramSettingsManager.get("telegram_enabled", user_id=active_user_id) == "true"

            now = datetime.now()
            
            # Determine which week we are reporting on.
            # If today is Sunday evening (>= 18:00), we report on the current week.
            # Otherwise (Mon-Sat, or early Sun), we report on the previous week.
            if now.weekday() == 6 and now.hour >= 18:
                target_date = now
            else:
                target_date = now - timedelta(days=now.weekday() + 1)
                
            report_monday, _ = _week_bounds(target_date.date().isoformat())
            sent_week = SettingsManager.get("weekly_report_last_sent_week", user_id=active_user_id) or ""

            if enabled and tg_enabled:
                if sent_week == "":
                    # Initialize to avoid sending retroactive reports on first run
                    SettingsManager.set("weekly_report_last_sent_week", report_monday, user_id=active_user_id)
                elif sent_week != report_monday:
                    token_enc = TelegramSettingsManager.get("telegram_token", user_id=active_user_id)
                    chat_id_enc = TelegramSettingsManager.get("telegram_chat_id", user_id=active_user_id)
                    if token_enc and chat_id_enc:
                        try:
                            token = decrypt(token_enc)
                            chat_id = decrypt(chat_id_enc)
                        except Exception:
                            token = token_enc
                            chat_id = chat_id_enc

                        verbosity = _normalize_verbosity(SettingsManager.get("weekly_report_verbosity", user_id=active_user_id) or "standard")
                        report = _generate_report(target_date.date().isoformat(), verbosity=verbosity, user_id=active_user_id)
                        
                        text = _report_to_telegram_html(report)
                        report_html = _generate_report_html(report)
                        
                        temp_dir = get_data_dir()
                        file_name = f"Stasis_Report_{report_monday}.html"
                        file_path = os.path.join(temp_dir, file_name)
                        
                        with open(file_path, "w", encoding="utf-8") as f:
                            f.write(report_html)

                        from src.core.telegram.api import TelegramAPI
                        api = TelegramAPI(token, chat_id)
                        if api.send_message(text):
                            api.send_document(file_path, caption=f"📄 Full Interactive Report ({report_monday})")
                            SettingsManager.set("weekly_report_last_sent_week", report_monday, user_id=active_user_id)
                    
                    try: os.remove(file_path)
                    except: pass
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
    user_id = get_active_user_id()
    events = get_limit_events_range(start, end, user_id=user_id)
    return jsonify([
        {"app": e[0], "type": e[1], "old_value": e[2], "new_value": e[3], "timestamp": e[4], "date": e[5]}
        for e in events
    ])