"""
Wellbeing API Core
------------------
Contains:
• wellbeing blueprint
• shared helpers
• shared utilities
• route module imports
"""

import datetime
from flask import Blueprint, request

# =====================================
# Blueprint
# =====================================

wellbeing_bp = Blueprint("wellbeing", __name__)

# =====================================
# Shared Helpers
# =====================================

def safe(value, default=0):
    """
    Safely return numeric values from database queries.
    Prevents None values from breaking calculations.
    """
    return value if value is not None else default


def get_selected_date():
    """
    Reads ?date=YYYY-MM-DD from request.
    Falls back to today's date.
    """
    date_param = request.args.get("date")

    if date_param:
        try:
            datetime.datetime.strptime(date_param, "%Y-%m-%d")
            return date_param
        except ValueError:
            pass

    return datetime.date.today().isoformat()


def get_active_user_id():
    """Return the active user_id from auth_manager, or None if not logged in."""
    try:
        from flask import request
        from src.api.auth_routes import _app_controller
        if _app_controller and _app_controller.auth_manager:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
                user = _app_controller.auth_manager.validate_token(token)
                if user:
                    _app_controller.auth_manager.active_user_id = user["id"]
                    return user["id"]
            return _app_controller.auth_manager.active_user_id
    except Exception:
        pass
    return None


def user_filter_sql(user_id, col="user_id"):
    """
    Return a SQL WHERE fragment and params that selects data belonging to the
    active user.
    """
    if user_id is not None:
        return f"({col} = ? OR {col} IS NULL)", (user_id,)
    else:
        return f"{col} IS NULL", ()



# =====================================
# Register Route Modules
# =====================================

import src.api.health_routes
import src.api.settings_routes
import src.api.system_routes
import src.api.activity_routes
import src.api.stats_routes
import src.api.dashboard_routes
import src.api.focus_routes
import src.api.limits_routes
import src.api.danger_routes
import src.api.spark_routes
import src.api.goals_routes
import src.api.report_routes