// lib.rs — re-exports the public run() entry point for mobile targets.
// For desktop, main.rs is the actual entry point and handles backend
// lifecycle directly.

pub fn run() {
    // Intentionally empty — desktop builds use main.rs directly.
    // Mobile builds would configure the app here.
}
