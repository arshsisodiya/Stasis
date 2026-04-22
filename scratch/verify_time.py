from src.utils.time_utils import format_duration

test_cases = [
    (0, False, "0m"),
    (30, False, "0m"),
    (60, False, "1m"),
    (3600, False, "1h 0m"),
    (3660, False, "1h 1m"),
    (21600, False, "6h 0m"),
    (21675, False, "6h 1m"),
    (30, True, "30s"),
    (3665, True, "1h 1m 5s"),
]

for sec, inc_s, expected in test_cases:
    actual = format_duration(sec, include_seconds=inc_s)
    print(f"Sec: {sec}, IncSec: {inc_s} -> Result: '{actual}' (Expected: '{expected}')")
    assert actual == expected

print("\nAll time formatting tests passed!")
