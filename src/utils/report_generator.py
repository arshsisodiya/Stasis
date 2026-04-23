import os
from datetime import datetime
from src.utils.time_utils import format_duration

def generate_daily_digest_html(data: dict, template_path: str, output_path: str):
    """
    Generates a rich HTML report for the daily digest.
    """
    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()

        date_val = data.get("date", datetime.now().date().isoformat())
        dt = datetime.fromisoformat(date_val)
        full_date = dt.strftime("%A, %B %d, %Y")

        total_active = data.get("total_active", 0)
        total_active_str = format_duration(total_active)

        goal_secs = data.get("goal_seconds")
        goal_diff_str = ""
        goal_class = ""
        if goal_secs:
            delta = total_active - goal_secs
            status = "+" if delta > 0 else "-"
            goal_diff_str = f"{status}{format_duration(abs(delta))} vs goal"
            goal_class = "negative" if delta > 0 else "positive"

        ratio = data.get("productive_ratio", 0)
        # Ring circumference is 2 * pi * r = 2 * 3.14159 * 36 = 226.19
        dash_offset = 226.19 * (1 - (ratio / 100))

        # Productive time estimate
        productive_time = total_active * (ratio / 100)
        productive_time_str = format_duration(productive_time)

        # Top distraction
        top_dist = data.get("top_distraction")
        top_dist_name = "None"
        top_dist_time = "0m"
        dist_initial = "-"
        dist_ratio = 0
        if top_dist:
            top_dist_name = top_dist['app_name'].replace('.exe', '')
            top_dist_time = format_duration(top_dist['seconds'])
            dist_initial = top_dist_name[0].upper() if top_dist_name else "?"
            dist_ratio = min(100, (top_dist['seconds'] / total_active) * 100) if total_active > 0 else 0

        # Top 5 apps
        top_5 = data.get("top_apps", [])
        app_items_html = ""
        for app in top_5:
            name = app['app_name'].replace('.exe', '')
            time_str = format_duration(app['seconds'])
            initial = name[0].upper() if name else "?"
            bar_width = (app['seconds'] / total_active) * 100 if total_active > 0 else 0
            
            app_items_html += f"""
            <li class="app-item">
                <div class="app-info" style="width: 100%;">
                    <div class="app-icon-placeholder">{initial}</div>
                    <div style="flex-grow: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span class="app-name">{name}</span>
                            <span class="app-time">{time_str}</span>
                        </div>
                        <div class="progress-bar-container" style="height: 4px; margin-top: 6px;">
                            <div class="progress-bar" style="--bar-width: {bar_width}%; animation-delay: 1.2s;"></div>
                        </div>
                    </div>
                </div>
            </li>
            """

        # Populate template
        html = template.format(
            date=date_val,
            full_date=full_date,
            total_active_str=total_active_str,
            goal_diff_str=goal_diff_str,
            goal_class=goal_class,
            ring_dash_offset=dash_offset,
            productive_ratio=ratio,
            productive_time_str=productive_time_str,
            focus_score=data.get("best_streak", 0), # Using best_streak as focus_score for now
            top_dist_name=top_dist_name,
            top_dist_time=top_dist_time,
            dist_initial=dist_initial,
            dist_ratio=dist_ratio,
            app_items_html=app_items_html
        )

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html)

        return True
    except Exception as e:
        print(f"Error generating daily digest HTML: {e}")
        return False
