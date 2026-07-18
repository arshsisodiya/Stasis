"""
engagement_scorer.py
--------------------
Shared engine for computing *engagement-weighted* productive seconds and
the resulting Productivity Score.

Three ideas combined:
  Idea 2 – App-specific (sub-category) engagement multipliers
  Idea 3 – True Engagement Thresholding  (APM tiers)
  Idea 4 – Click vs Keystroke weighting  (effort score)

Public API
----------
compute_app_weighted_seconds(active_seconds, keystrokes, clicks,
                              sub_category, main_category) -> float
    Returns the engagement-adjusted productive seconds for a single app.

compute_productivity_score(app_rows) -> float
    Accepts a list of dicts (one per app) and returns a 0-100 score.
"""

from __future__ import annotations

# ── APM Tier thresholds (Idea 3) ──────────────────────────────────────────────
# Actions Per Minute = (keystrokes + clicks) / active_minutes
# These map to a time multiplier that discounts "zombie" time.

_APM_HIGH_THRESHOLD  = 30    # > 30 APM  → actively working
_APM_LOW_THRESHOLD   = 5     # 5-30 APM  → somewhat engaged
# < 5 APM = passive (app open, barely interacting)

_TIER_HIGH_MULT    = 1.00
_TIER_LOW_MULT     = 0.70
_TIER_PASSIVE_MULT = 0.30

# ── Click vs Keystroke weighting (Idea 4) ─────────────────────────────────────
# A click is a more deliberate intent action than a single keystroke.
_KEYSTROKE_WEIGHT = 1.0
_CLICK_WEIGHT     = 2.5

# ── Sub-category profiles (Idea 2) ───────────────────────────────────────────
# Maps sub_category -> (dominant_input, baseline_apm)
# dominant_input: 'keys' | 'clicks' | 'mixed' | 'passive'
# baseline_apm  : the "expected" APM for someone actively doing this work type.
#
# If actual APM ≥ 1.5x baseline  → multiplier boosted  (cap 1.15)
# If actual APM is 0.5x-1.5x     → multiplier = 1.00   (on target)
# If actual APM < 0.5x baseline   → multiplier scales linearly down to 0.50

_SUBCATEGORY_PROFILES: dict[str, tuple[str, float]] = {
    # --- Productive sub-categories ---
    "coding":              ("keys",    35.0),
    "development_tools":   ("keys",    25.0),
    "office":              ("keys",    20.0),
    "writing":             ("keys",    25.0),
    "reading":             ("mixed",   10.0),   # mostly passive reading
    "design":              ("clicks",  15.0),
    "video_editing":       ("clicks",  12.0),
    "content_creation":    ("clicks",  10.0),
    "communication":       ("mixed",   10.0),
    "work_chat":           ("mixed",   10.0),
    "email":               ("keys",    10.0),
    "video_calls":         ("passive",  5.0),   # talking counts, low input ok
    "learning":            ("mixed",   15.0),
    "ai_tools":            ("mixed",   15.0),
    "project_management":  ("mixed",   10.0),
    "networking":          ("mixed",   10.0),
    # --- Neutral sub-categories ---
    "browser":             ("mixed",   10.0),
    "utility":             ("mixed",    8.0),
    "file_manager":        ("clicks",   8.0),
    "system_tools":        ("clicks",   8.0),
    # --- Entertainment / distraction — always 0 weight ---
    "gaming":              ("clicks",   0.0),
    "streaming":           ("passive",  0.0),
    "video":               ("passive",  0.0),
    "video_player":        ("passive",  0.0),
    "music":               ("passive",  0.0),
    "social_media":        ("mixed",    0.0),
    # Default for unknown sub-categories
    "other":               ("mixed",   10.0),
}

# ── Internal helpers ──────────────────────────────────────────────────────────

def _effort_score(keystrokes: float, clicks: float) -> float:
    """Weighted input effort (Idea 4)."""
    return (keystrokes * _KEYSTROKE_WEIGHT) + (clicks * _CLICK_WEIGHT)


def _engagement_tier_mult(apm: float) -> float:
    """Map raw APM to an engagement-tier time multiplier (Idea 3)."""
    if apm >= _APM_HIGH_THRESHOLD:
        return _TIER_HIGH_MULT
    if apm >= _APM_LOW_THRESHOLD:
        return _TIER_LOW_MULT
    return _TIER_PASSIVE_MULT


def _subcategory_mult(sub_category: str, apm: float) -> float:
    """
    Return a sub-category engagement modifier (Idea 2).
    Compares actual APM against the expected baseline for this work type.
    """
    profile = _SUBCATEGORY_PROFILES.get((sub_category or "other").lower(),
                                        _SUBCATEGORY_PROFILES["other"])
    _, baseline_apm = profile

    # Sub-categories with 0 baseline are non-productive by definition
    if baseline_apm <= 0:
        return 0.0

    ratio = apm / baseline_apm  # how well they're performing vs. expected

    if ratio >= 1.5:
        return 1.15   # over-performing → small reward
    if ratio >= 0.5:
        return 1.00   # on-target → neutral
    # Under-performing: linear scale from 1.0 (at ratio=0.5) down to 0.5 (at ratio=0)
    # formula: 0.5 + ratio * (1.0 - 0.5) / 0.5  = 0.5 + ratio
    return max(0.50, 0.50 + ratio)


# ── Public API ────────────────────────────────────────────────────────────────

def compute_app_weighted_seconds(
    active_seconds: float,
    keystrokes: float,
    clicks: float,
    sub_category: str,
    main_category: str,
) -> float:
    """
    Return engagement-adjusted effective productive seconds for a single app.

    Only apps whose main_category is 'productive' contribute positively.
    Neutral/other apps contribute 0. Distracting/entertainment apps contribute 0
    (but they still dilute total_active in the final score).

    Parameters
    ----------
    active_seconds : raw active time from daily_stats
    keystrokes     : total keystrokes in that app for the period
    clicks         : total clicks in that app for the period
    sub_category   : e.g. "coding", "design", "video_calls"
    main_category  : e.g. "productive", "neutral", "entertainment"
    """
    if active_seconds <= 0:
        return 0.0

    # Non-productive categories don't contribute weighted seconds
    if main_category not in ("productive",):
        return 0.0

    active_minutes = active_seconds / 60.0
    apm = ((keystrokes + clicks) / active_minutes) if active_minutes > 0 else 0.0

    tier_mult    = _engagement_tier_mult(apm)
    sub_mult     = _subcategory_mult(sub_category, apm)

    return active_seconds * tier_mult * sub_mult


def compute_productivity_score(app_rows: list[dict]) -> float:
    """
    Compute the engagement-weighted Productivity Score (0–100).

    Parameters
    ----------
    app_rows : list of dicts, each containing:
        {
            'app_name':      str,
            'main_category': str,
            'sub_category':  str,
            'active_seconds': float,
            'keystrokes':     float,
            'clicks':         float,
        }

    Returns
    -------
    float : productivity score 0–100 (rounded to 1 decimal)
    """
    if not app_rows:
        return 0.0

    total_active   = 0.0
    total_weighted = 0.0

    for row in app_rows:
        active = float(row.get("active_seconds") or 0)
        if active <= 0:
            continue

        total_active += active

        weighted = compute_app_weighted_seconds(
            active_seconds=active,
            keystrokes=float(row.get("keystrokes") or 0),
            clicks=float(row.get("clicks") or 0),
            sub_category=str(row.get("sub_category") or "other"),
            main_category=str(row.get("main_category") or "other"),
        )
        total_weighted += weighted

    if total_active <= 0:
        return 0.0

    raw = (total_weighted / total_active) * 100.0
    return round(min(100.0, max(0.0, raw)), 1)


def compute_focus_score(app_rows: list[dict]) -> float:
    """
    Computes a daily Focus Score (0-100) based on three pillars:
    1. Deep Work Density (40%): Concentration of time in your top 3 productive apps.
    2. Context Switching Penalty (40%): Distracting switches per hour (ignoring core apps).
    3. Sustained Engagement (20%): Low idle ratio during productive time.
    """
    if not app_rows:
        return 0.0

    total_active = 0.0
    productive_apps = []

    for row in app_rows:
        active = float(row.get("active_seconds") or 0)
        total_active += active
        
        if row.get("main_category") == "productive":
            productive_apps.append({
                "app_name": row.get("app_name"),
                "active_seconds": active,
                "idle_seconds": float(row.get("idle_seconds") or 0),
                "sessions": float(row.get("sessions") or 0),
            })

    if total_active <= 0:
        return 0.0

    # Sort productive apps by active time descending to find the Core Workflow (Top 3)
    productive_apps.sort(key=lambda x: x["active_seconds"], reverse=True)
    core_apps = productive_apps[:3]
    core_app_names = {app["app_name"] for app in core_apps}

    # Pillar 1: Deep Work Density (40 points)
    # Goal: 66% of your day spent in your core top 3 tools
    core_active_time = sum(app["active_seconds"] for app in core_apps)
    deep_work_ratio = core_active_time / total_active
    # If ratio >= 0.66 -> 40 pts. Scale linearly up to 0.66.
    p1_score = min(40.0, (deep_work_ratio / 0.66) * 40.0)

    # Pillar 2: Context Switching Penalty (40 points)
    # We only count sessions (switches) for apps OUTSIDE the Core Workflow.
    distracting_sessions = 0.0
    for row in app_rows:
        if row.get("app_name") not in core_app_names:
            distracting_sessions += float(row.get("sessions") or 0)

    total_active_hours = total_active / 3600.0
    switches_per_hour = distracting_sessions / total_active_hours

    if switches_per_hour <= 5:
        p2_score = 40.0
    elif switches_per_hour >= 20:
        p2_score = 0.0
    else:
        # Scale linearly between 5 and 20 switches
        p2_score = 40.0 - ((switches_per_hour - 5) / 15.0) * 40.0

    # Pillar 3: Sustained Engagement / Low Idle (20 points)
    # Calculate idle ratio only for productive apps
    prod_active = sum(app["active_seconds"] for app in productive_apps)
    prod_idle = sum(app["idle_seconds"] for app in productive_apps)
    
    if (prod_active + prod_idle) > 0:
        idle_ratio = prod_idle / (prod_active + prod_idle)
    else:
        idle_ratio = 1.0

    if idle_ratio <= 0.20:
        p3_score = 20.0
    elif idle_ratio >= 0.50:
        p3_score = 0.0
    else:
        # Scale linearly between 20% and 50% idle
        p3_score = 20.0 - ((idle_ratio - 0.20) / 0.30) * 20.0

    final_score = p1_score + p2_score + p3_score
    return round(min(100.0, max(0.0, final_score)), 1)

