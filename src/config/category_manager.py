import json
import os
import re
from functools import lru_cache

CATEGORY_FILE = os.path.join(
    os.path.dirname(__file__),
    "app_categories.json"
)

DEFAULT_CATEGORY = "other"

# All browser executable names — URL rules take priority over app-level fallback
BROWSER_EXES = {
    "chrome.exe", "firefox.exe", "msedge.exe", "opera.exe", "brave.exe",
    "vivaldi.exe", "arc.exe", "thorium.exe", "waterfox.exe", "librewolf.exe",
    "floorp.exe", "zen.exe", "chromium.exe", "iexplore.exe",
}


@lru_cache(maxsize=1)
def load_categories():
    if not os.path.exists(CATEGORY_FILE):
        return {}
    with open(CATEGORY_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def reload_categories():
    """Force reload the category file (clears the lru_cache)."""
    load_categories.cache_clear()
    return load_categories()


def _hostname(url: str) -> str:
    """Extract lowercase hostname from a URL string."""
    if not url or url == "N/A":
        return ""
    # Remove protocol
    url = re.sub(r'^https?://', '', url.lower())
    # Take only up to the first / or ?
    return url.split("/")[0].split("?")[0]


def _url_matches_rule(url_lower: str, domain_rule: str) -> bool:
    """
    Returns True if url_lower belongs to domain_rule.
    Handles:
      - Exact host match:      "github.com" matches "github.com"
      - Subdomain match:       "github.com" matches "*.github.com"
      - Path match:            "youtube.com/watch?v=" matches "youtube.com/watch?v="
    """
    # Path-based rule: contains a slash — do substring check on full URL
    if "/" in domain_rule or "?" in domain_rule:
        return domain_rule in url_lower

    # Domain/subdomain rule
    host = _hostname(url_lower)
    # Direct match OR subdomain: domain = "github.com" → host ends with ".github.com" or == "github.com"
    return host == domain_rule or host.endswith("." + domain_rule)


def get_app_category(app_name: str) -> str:
    categories = load_categories()
    return categories.get(app_name.lower(), DEFAULT_CATEGORY)


def get_category(app_name: str, url: str = None):
    data = load_categories()
    app_name = app_name.lower()

    # 1️⃣  URL-based rule — applies to ALL browsers when a URL is present
    if url and url != "N/A":
        url_lower = url.lower()
        url_rules = data.get("url_rules", {})
        # Sort rules longest-first so specific paths beat generic domains
        for domain, cat in sorted(url_rules.items(), key=lambda x: -len(x[0])):
            if _url_matches_rule(url_lower, domain):
                return cat["main"], cat["sub"]

        # URL present but no rule matched → browser default = neutral
        if app_name in BROWSER_EXES or app_name.replace(".exe", "") in BROWSER_EXES:
            return "neutral", "browser"

    # 2️⃣  App-based fallback
    app_rules = data.get("apps", {})
    if app_name in app_rules:
        return app_rules[app_name]["main"], app_rules[app_name]["sub"]

    return "other", "other"
