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