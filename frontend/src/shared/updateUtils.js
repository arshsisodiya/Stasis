/**
 * Shared Update Utilities
 * Centralizes the update interval logic and constants for LoadingScreen and Settings.
 */

export const UPDATE_CHECK_INTERVAL = 6; // Frequency of startup/auto update checks in hours
export const GITHUB_REPO = "arshsisodiya/Stasis";

/**
 * Checks if enough time has passed since the last check to perform an automatic one.
 */
export function shouldAutoCheckUpdate() {
    const lastCheck = localStorage.getItem("stasis_last_update_check");
    if (!lastCheck) return true;

    const now = Date.now();
    const intervalMs = UPDATE_CHECK_INTERVAL * 60 * 60 * 1000;
    return now - parseInt(lastCheck) >= intervalMs;
}

/**
 * Returns the number of hours remaining until the next automatic check.
 */
export function getHoursUntilNextCheck() {
    const lastCheck = localStorage.getItem("stasis_last_update_check");
    if (!lastCheck) return 0;

    const now = Date.now();
    const intervalMs = UPDATE_CHECK_INTERVAL * 60 * 60 * 1000;
    const remaining = intervalMs - (now - parseInt(lastCheck));
    return remaining > 0 ? (remaining / 3600000).toFixed(1) : 0;
}

/**
 * Marks a successful/attempted check in storage.
 */
export function recordUpdateCheck() {
    localStorage.setItem("stasis_last_update_check", Date.now().toString());
}
