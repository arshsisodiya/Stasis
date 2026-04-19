"""
Time-related utility functions for Stasis.
"""

def format_duration(seconds: float, include_seconds: bool = False) -> str:
    """
    Formats a duration in seconds into a human-readable string like '1h 20m 15s' or '45m'.
    
    Args:
        seconds: Duration in seconds.
        include_seconds: Whether to include the seconds part.
        
    Returns:
        A human-readable string.
    """
    total = int(max(0, round(seconds)))
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    
    parts = []
    if h > 0:
        parts.append(f"{h}h")
    
    # Show minutes if h > 0 (even if m=0, e.g., '1h 0m') or if m > 0
    if h > 0 or m > 0:
        parts.append(f"{m}m")
    
    # Always show at least '0m' if the duration is less than a minute and we aren't showing seconds
    if not parts and not include_seconds:
        parts.append("0m")
        
    if include_seconds:
        parts.append(f"{s}s")
        
    return " ".join(parts)
