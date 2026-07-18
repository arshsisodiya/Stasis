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
    import re
    # Strip protocols to normalize
    u_norm = re.sub(r'^https?://', '', url_lower)
    r_norm = re.sub(r'^https?://', '', domain_rule)
    
    # Strip trailing slash on rule if it has exactly one (prevents strict path rule for simple domains)
    if r_norm.endswith("/") and r_norm.count("/") == 1:
        r_norm = r_norm[:-1]

    # Path-based rule: contains a slash — do substring check on normalized URL
    if "/" in r_norm or "?" in r_norm:
        return r_norm in u_norm

    # Domain/subdomain rule or IP prefix rule
    host = _hostname(u_norm)
    if host == r_norm or host.endswith("." + r_norm):
        return True
        
    # Local IP prefix matching (e.g. 192.168., 10.0.)
    if r_norm in ("192.168.", "10.", "10.0.") and host.startswith(r_norm):
        return True
        
    return False


def get_app_category(app_name: str) -> str:
    categories = load_categories()
    return categories.get(app_name.lower(), DEFAULT_CATEGORY)


def get_category(app_name: str, url: str = None, exe_path: str = None):
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

        # URL present but no rule matched
        
        # Apply strict heuristics for development sites before defaulting
        dev_keywords = [".dev", "dev.", "/dev/", "developer.", "developers."]
        if any(kw in url_lower for kw in dev_keywords):
            return "productive", "coding"
            
        doc_keywords = [".doc", "doc.", "docs.", "/doc/", "/docs/"]
        if any(kw in url_lower for kw in doc_keywords):
            return "productive", "learning"
            
        # Browser default = neutral
        if app_name in BROWSER_EXES or app_name.replace(".exe", "") in BROWSER_EXES:
            return "neutral", "browser"

    # 2️⃣  App-based lookup
    app_rules = data.get("apps", {})
    
    # Priority A: Check the actual executable name from exe_path
    if exe_path:
        exe_name = os.path.basename(exe_path).lower()
        if exe_name in app_rules:
            return app_rules[exe_name]["main"], app_rules[exe_name]["sub"]
            
    # Priority B: Check the app_name (could be friendly name or raw exe name)
    if app_name in app_rules:
        return app_rules[app_name]["main"], app_rules[app_name]["sub"]
        
    # Priority C: Check if app_name without .exe matches
    if not app_name.endswith(".exe"):
        app_exe = app_name + ".exe"
        if app_exe in app_rules:
            return app_rules[app_exe]["main"], app_rules[app_exe]["sub"]

    # 3️⃣  Heuristic Auto-Categorization (if not found)
    cat_main, cat_sub = _auto_categorize_app(app_name, exe_path, url)
    if cat_main != "other":
        _save_auto_category(app_name, cat_main, cat_sub)
        return cat_main, cat_sub

    return "other", "other"

def _auto_categorize_app(app_name: str, exe_path: str, url: str):
    """Heuristics to auto-categorize unknown apps based on name/url keywords."""
    name = (app_name or "").lower()
    url_str = (url or "").lower()
    path = (exe_path or "").lower()

    # Productive Keywords
    productive_kws = ["code", "studio", "zoom", "teams", "slack", "word", "excel", "powerpoint", "notion", "figma", "obsidian", "edit", "dev", "term", "bash"]
    if any(kw in name for kw in productive_kws) or any(kw in url_str for kw in productive_kws):
        return "productive", "work"

    # Distraction Keywords
    distract_kws = ["game", "steam", "epic", "play", "netflix", "youtube", "social", "insta", "twitter", "reddit", "tiktok", "whatsapp"]
    if any(kw in name for kw in distract_kws) or any(kw in url_str for kw in distract_kws):
        return "distraction", "entertainment"

    # Neutral Keywords
    neutral_kws = ["settings", "system", "task", "file", "explorer", "update", "manager", "calc", "mail", "spotify", "music", "discord"]
    if any(kw in name for kw in neutral_kws) or any(kw in url_str for kw in neutral_kws):
        return "neutral", "utility"

    return "other", "other"

def _save_auto_category(app_name: str, main_cat: str, sub_cat: str):
    """Saves the auto-categorized app to app_categories.json"""
    try:
        categories = load_categories()
        
        # Ensure 'apps' key exists
        if "apps" not in categories:
            categories["apps"] = {}
            
        app_key = app_name.lower()
        if not app_key.endswith(".exe") and "." not in app_key:
            app_key += ".exe"
            
        categories["apps"][app_key] = {
            "main": main_cat,
            "sub": sub_cat,
            "auto_categorized": True
        }
        
        with open(CATEGORY_FILE, "w", encoding="utf-8") as f:
            json.dump(categories, f, indent=4)
            
        load_categories.cache_clear()
    except Exception as e:
        print(f"Failed to save auto-category for {app_name}: {e}")
