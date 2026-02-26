import json
import os
from functools import lru_cache

CATEGORY_FILE = os.path.join(
    os.path.dirname(__file__),
    "app_categories.json"
)

DEFAULT_CATEGORY = "other"


@lru_cache(maxsize=1)
def load_categories():
    if not os.path.exists(CATEGORY_FILE):
        return {}

    with open(CATEGORY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_app_category(app_name: str) -> str:
    categories = load_categories()
    return categories.get(app_name.lower(), DEFAULT_CATEGORY)

def get_category(app_name: str, url: str = None):
    data = load_categories()

    app_name = app_name.lower()

    # 1️⃣ URL based override (if browser + URL exists)
    if url:
        for domain, cat in data.get("url_rules", {}).items():
            if domain in url.lower():
                return cat["main"], cat["sub"]

    # 2️⃣ App based fallback
    app_rules = data.get("apps", {})
    if app_name in app_rules:
        return app_rules[app_name]["main"], app_rules[app_name]["sub"]

    return "other", "other"
