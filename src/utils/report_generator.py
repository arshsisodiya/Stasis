import os
import json
from datetime import datetime
from src.utils.time_utils import format_duration

def generate_daily_digest_html(data: dict, template_path: str, output_path: str):
    """
    Generates a rich, animated HTML report for the daily digest.
    """
    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()

        date_val = data.get("date", datetime.now().date().isoformat())
        dt = datetime.fromisoformat(date_val)
        full_date = dt.strftime("%A, %B %d, %Y")

        total_active = data.get("total_active", 0)
        total_active_str = format_duration(total_active)

        # Goal Status
        goal_secs = data.get("goal_seconds")
        goal_status_str = "Stay focused and reach your goals."
        if goal_secs:
            delta = total_active - goal_secs
            status_text = "over" if delta > 0 else "under"
            goal_status_str = f"<b>{format_duration(abs(delta))}</b> {status_text} your {format_duration(goal_secs)} daily goal &mdash; {'keep pushing' if delta > 0 else 'solid day'}."

        ratio = data.get("productive_ratio", 0)
        ratio_decimal = round(ratio / 100, 2)

        # Distraction stats
        dist_time = data.get("distraction_time", 0)
        dist_time_str = format_duration(dist_time)

        # Top distraction
        top_dist = data.get("top_distraction")
        top_dist_name = "None"
        top_dist_summary_str = "No major distractions detected."
        if top_dist:
            top_dist_name = top_dist['app_name'].replace('.exe', '')
            dist_app_time = format_duration(top_dist['seconds'])
            dist_pct = round((top_dist['seconds'] / dist_time) * 100) if dist_time > 0 else 0
            top_dist_summary_str = f"{dist_app_time} &middot; {dist_pct}% of distractions"

        # Categories for Donut
        cats = data.get("categories", {})
        sorted_cats = sorted(cats.items(), key=lambda x: x[1], reverse=True)
        category_split = []
        for name, secs in sorted_cats:
            category_split.append({
                "name": name.capitalize(),
                "time": format_duration(secs),
                "pct": round((secs / total_active) * 100) if total_active > 0 else 0,
                "secs": secs
            })

        # Peak Hour
        peak_hour = data.get("peak_hour", "N/A")
        peak_hour_focus = format_duration(data.get("max_focus_hour_secs", 0))

        # Hourly Data for JS
        hourly_stats = data.get("hourly_stats", [])

        # App List for JS
        top_apps = data.get("top_apps", [])
        app_list_data = []
        colors = ["#818cf8", "#f87171", "#34d399", "#60a5fa", "#f472b6", "#fbbf24"]
        for i, app in enumerate(top_apps):
            name = app['app_name'].replace('.exe', '')
            app_list_data.append({
                "name": name,
                "time": format_duration(app['seconds']),
                "pct": round((app['seconds'] / total_active) * 100) if total_active > 0 else 0,
                "color": colors[i % len(colors)],
                "icon": name[:2].upper(),
                "tag": "prod" # Simplified
            })

        # Streak for JS
        streak_days = data.get("streak_days", [])

        # Populate template safely
        replacements = {
            "{full_date}": full_date,
            "{total_active_str}": total_active_str,
            "{goal_status_str}": goal_status_str,
            "{productive_ratio_pct}": f"{ratio}%",
            "{productive_ratio_decimal}": str(ratio_decimal),
            "{focus_score}": str(int(ratio * 0.8 + (data.get('best_streak', 0)/3600) * 10)), # Custom score
            "{distraction_time_str}": dist_time_str,
            "{peak_hour}": peak_hour,
            "{peak_hour_focus}": peak_hour_focus,
            "{best_streak_str}": format_duration(data.get("best_streak", 0)),
            "{top_dist_name}": top_dist_name,
            "{top_dist_summary_str}": top_dist_summary_str,
            
            # JSON Data for JS
            "__HOURLY_DATA__": json.dumps(hourly_stats),
            "__APP_LIST_DATA__": json.dumps(app_list_data),
            "__CATEGORY_DATA__": json.dumps(category_split),
            "__STREAK_DATA__": json.dumps(streak_days)
        }

        html = template
        for key, value in replacements.items():
            html = html.replace(key, value)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)
        
        return True
    except Exception as e:
        print(f"Error generating daily digest HTML: {e}")
        return False

        return True
    except Exception as e:
        print(f"Error generating daily digest HTML: {e}")
        return False
