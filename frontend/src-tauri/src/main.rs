// main.rs — Stasis Desktop App Entry Point
// Launches the Python backend EXE (bundled as a resource) and manages its lifecycle.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Child;
use std::io::Write;
use std::net::TcpStream;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_dialog::{DialogExt, MessageDialogBuilder, MessageDialogButtons};

use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect, GetWindowLongW, SetWindowLongW, SetWindowPos, 
    GetClassNameW, GWL_EXSTYLE, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, 
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
};
use windows_sys::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};

static SHOULD_EXIT: AtomicBool = AtomicBool::new(false);
static WIDGET_RESIZING: AtomicBool = AtomicBool::new(false);
static WIDGET_HIDDEN_BY_FULLSCREEN: AtomicBool = AtomicBool::new(false);

struct BackendState(Mutex<Option<Child>>);

// Bottom-right anchor in physical pixels — stays constant during resize
struct WidgetAnchor(Mutex<Option<(i32, i32)>>);

// Widget logical sizes
const WIDGET_COLLAPSED_W: f64 = 200.0;
const WIDGET_COLLAPSED_H: f64 = 44.0;
const WIDGET_EXPANDED_W: f64 = 320.0;
const WIDGET_EXPANDED_H: f64 = 440.0;


fn extract_deep_link(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| a.to_lowercase().starts_with("stasis://"))
        .cloned()
}

fn emit_deep_link(app: &AppHandle, url: &str) {
    let _ = app.emit("stasis-deep-link", url.to_string());
}

fn get_query_param(url: &str, key: &str) -> Option<String> {
    let q_start = url.find('?')?;
    let query = &url[q_start + 1..];
    for part in query.split('&') {
        let mut kv = part.splitn(2, '=');
        let k = kv.next().unwrap_or("");
        let v = kv.next().unwrap_or("");
        if k.eq_ignore_ascii_case(key) {
            return Some(v.to_string());
        }
    }
    None
}

fn deep_link_action(url: &str) -> Option<String> {
    get_query_param(url, "action").map(|a| a.to_lowercase())
}

fn is_backend_only_action(url: &str) -> bool {
    matches!(
        deep_link_action(url).as_deref(),
        Some("snooze-limit") | Some("extend-limit") | Some("keep-blocked")
    )
}

fn backend_action_path(url: &str) -> Option<String> {
    let action = deep_link_action(url)?;
    match action.as_str() {
        "snooze-limit" => {
            let minutes = get_query_param(url, "minutes").unwrap_or_else(|| "60".to_string());
            Some(format!("/api/settings/notifications/action/snooze-limit?minutes={}", minutes))
        }
        "extend-limit" => {
            let app = get_query_param(url, "app")?;
            let minutes = get_query_param(url, "minutes").unwrap_or_else(|| "10".to_string());
            Some(format!(
                "/api/settings/notifications/action/extend-limit?app={}&minutes={}",
                app, minutes
            ))
        }
        "keep-blocked" => {
            let app = get_query_param(url, "app")?;
            Some(format!("/api/settings/notifications/action/keep-blocked?app={}", app))
        }
        _ => None,
    }
}

fn call_backend_get(path: &str) -> bool {
    let addr = "127.0.0.1:7432";
    let mut stream = match TcpStream::connect(addr) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let req = format!(
        "GET {} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        path
    );
    stream.write_all(req.as_bytes()).is_ok()
}

fn handle_backend_only_action(url: &str) -> bool {
    if let Some(path) = backend_action_path(url) {
        return call_backend_get(&path);
    }
    false
}

#[tauri::command]
fn set_widget_visibility(app: tauri::AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window("widget") {
        let current = window.is_visible().unwrap_or(false);
        if visible && !current {
            // Start at collapsed size
            let _ = window.set_size(tauri::LogicalSize::<f64> { width: WIDGET_COLLAPSED_W, height: WIDGET_COLLAPSED_H });

            // Restore to stored anchor position, or default position if first show
            let state = app.state::<WidgetAnchor>();
            let anchor = state.0.lock().unwrap();
            if let Some((ax, ay)) = *anchor {
                let scale = window.scale_factor().unwrap_or(1.0);
                let phys_w = (WIDGET_COLLAPSED_W * scale) as i32;
                let phys_h = (WIDGET_COLLAPSED_H * scale) as i32;
                drop(anchor);
                let _ = window.set_position(tauri::PhysicalPosition { x: ax - phys_w, y: ay - phys_h });
            } else {
                drop(anchor);
                position_widget(&app, &window);
            }

            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.set_always_on_top(true);
        } else if !visible && current {
            let _ = window.hide();
        }
    } else if visible {
        match tauri::WebviewWindowBuilder::new(
            &app,
            "widget",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("Stasis Widget")
        .inner_size(WIDGET_COLLAPSED_W, WIDGET_COLLAPSED_H)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false) // Start hidden — position first, show after
        .build() {
            Ok(window) => {
                // Check if an anchor was pre-set (from DB via set_widget_anchor)
                let state = app.state::<WidgetAnchor>();
                let anchor = state.0.lock().unwrap();
                if let Some((ax, ay)) = *anchor {
                    let scale = window.scale_factor().unwrap_or(1.0);
                    let phys_w = (WIDGET_COLLAPSED_W * scale) as i32;
                    let phys_h = (WIDGET_COLLAPSED_H * scale) as i32;
                    drop(anchor);
                    let _ = window.set_position(tauri::PhysicalPosition { x: ax - phys_w, y: ay - phys_h });
                } else {
                    drop(anchor);
                    position_widget(&app, &window);
                }
                let _ = window.show();
            }
            Err(e) => {
                eprintln!("Failed to create widget window: {}", e);
            }
        }
    }

    // We no longer persist here, as it's handled by the DB via Python/Frontend
}

#[tauri::command]
fn set_widget_anchor(app: tauri::AppHandle, x: i32, y: i32) {
    let state = app.state::<WidgetAnchor>();
    let mut anchor = state.0.lock().unwrap();
    *anchor = Some((x, y));
}

#[tauri::command]
fn toggle_widget(app: tauri::AppHandle) {
    let current_visible = if let Some(window) = app.get_webview_window("widget") {
        window.is_visible().unwrap_or(false)
    } else {
        false
    };
    set_widget_visibility(app, !current_visible);
}

#[tauri::command]
fn expand_widget(window: tauri::WebviewWindow) {
    resize_widget_anchored(&window, WIDGET_EXPANDED_W, WIDGET_EXPANDED_H);
}

#[tauri::command]
fn shrink_widget(window: tauri::WebviewWindow) {
    resize_widget_anchored(&window, WIDGET_COLLAPSED_W, WIDGET_COLLAPSED_H);
}

fn resize_widget_anchored(window: &tauri::WebviewWindow, width: f64, height: f64) {
    let scale = window.scale_factor().unwrap_or(1.0);
    let app = window.app_handle();
    let state = app.state::<WidgetAnchor>();
    let anchor = state.0.lock().unwrap();

    if let Some((ax, ay)) = *anchor {
        WIDGET_RESIZING.store(true, Ordering::SeqCst);
        
        let phys_w = (width * scale) as i32;
        let phys_h = (height * scale) as i32;
        
        let _ = window.set_size(tauri::LogicalSize { width, height });
        let _ = window.set_position(tauri::PhysicalPosition {
            x: ax - phys_w,
            y: ay - phys_h,
        });

        // Small delay before clearing flag to prevent feedback loops
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            WIDGET_RESIZING.store(false, Ordering::SeqCst);
        });
    }
}



/// Position the widget at the bottom-right of the primary monitor and initialize anchor.
fn position_widget(app: &AppHandle, window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let monitor_size = monitor.size();
        let scale = monitor.scale_factor();
        let phys_w = (WIDGET_COLLAPSED_W * scale) as i32;
        let phys_h = (WIDGET_COLLAPSED_H * scale) as i32;

        let x = monitor_size.width as i32 - phys_w - (20.0 * scale) as i32;
        let y = monitor_size.height as i32 - phys_h - (60.0 * scale) as i32;

        let _ = window.set_position(tauri::PhysicalPosition { x, y });

        // Store bottom-right corner as the stable anchor
        let state = app.state::<WidgetAnchor>();
        let mut anchor = state.0.lock().unwrap();
        *anchor = Some((x + phys_w, y + phys_h));
    }
}

#[cfg(target_os = "windows")]
fn apply_widget_styles(window: &tauri::WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        let hwnd_val = hwnd.0 as isize;
        unsafe {
            let mut style = GetWindowLongW(hwnd_val, GWL_EXSTYLE) as usize;
            style |= WS_EX_TOOLWINDOW as usize;
            style |= WS_EX_NOACTIVATE as usize;
            SetWindowLongW(hwnd_val, GWL_EXSTYLE, style as i32);
            
            // Initial topmost setting
            SetWindowPos(hwnd_val, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}

#[cfg(target_os = "windows")]
fn is_foreground_fullscreen() -> bool {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == 0 { return false; }

        // Skip shell windows (Desktop background)
        let mut class_name = [0u16; 256];
        let class_len = GetClassNameW(hwnd, class_name.as_mut_ptr(), 256);
        if class_len > 0 {
            let name = String::from_utf16_lossy(&class_name[..class_len as usize]);
            if name == "Progman" || name == "WorkerW" {
                return false;
            }
        }
        
        let mut rect = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut rect) != 0 {
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut mi: MONITORINFO = std::mem::zeroed();
            mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            if GetMonitorInfoW(monitor, &mut mi) != 0 {
                let window_w = rect.right - rect.left;
                let window_h = rect.bottom - rect.top;
                let monitor_w = mi.rcMonitor.right - mi.rcMonitor.left;
                let monitor_h = mi.rcMonitor.bottom - mi.rcMonitor.top;
                
                // If the foreground window covers the entire monitor, it's fullscreen
                if window_w >= monitor_w && window_h >= monitor_h {
                    return true;
                }
            }
        }
        false
    }
}

fn main() {
    // Check if hardware acceleration should be disabled
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let disabled_flag_path = std::path::Path::new(&local_app_data)
            .join("Stasis")
            .join("hardware_acceleration_disabled.txt");
            
        if disabled_flag_path.exists() {
            println!("Hardware acceleration disabled via settings, disabling WebView2 GPU process");
            std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--disable-gpu --disable-software-rasterizer");
        }
    }
    tauri::Builder::default()
        .manage(BackendState(Mutex::new(None)))
        .manage(WidgetAnchor(Mutex::new(None)))

        .setup(|app| {
            // -------- Background Maintenance --------
            // Re-enforce always_on_top for the widget aggressively (500ms) to fight Windows layering issues
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                // Give the app 3 seconds to fully initialize before managing layers
                std::thread::sleep(std::time::Duration::from_secs(3));

                let mut show_delay_count: u32 = 0;

                loop {
                    std::thread::sleep(std::time::Duration::from_millis(250));
                    if SHOULD_EXIT.load(Ordering::SeqCst) { break; }

                    if let Some(window) = app_handle.get_webview_window("widget") {
                        #[cfg(target_os = "windows")]
                        {
                            let is_fullscreen = is_foreground_fullscreen();
                            let is_visible = window.is_visible().unwrap_or(false);

                            if is_fullscreen {
                                // Reset the show-delay counter while fullscreen is active
                                show_delay_count = 0;

                                if is_visible {
                                    // Hide immediately — no delay for hiding
                                    let _ = window.hide();
                                    WIDGET_HIDDEN_BY_FULLSCREEN.store(true, Ordering::SeqCst);
                                }
                            } else if WIDGET_HIDDEN_BY_FULLSCREEN.load(Ordering::SeqCst) {
                                // Fullscreen ended, but debounce the show:
                                // require 4 consecutive non-fullscreen checks (~1s)
                                // before restoring the widget to avoid bounce
                                show_delay_count += 1;
                                if show_delay_count >= 4 {
                                    let _ = window.show();
                                    WIDGET_HIDDEN_BY_FULLSCREEN.store(false, Ordering::SeqCst);
                                    show_delay_count = 0;
                                    // Re-enforce topmost after restoring
                                    if let Ok(hwnd) = window.hwnd() {
                                        unsafe {
                                            SetWindowPos(hwnd.0 as isize, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                                        }
                                    }
                                }
                            } else if is_visible && !WIDGET_RESIZING.load(Ordering::SeqCst) {
                                // Normal desktop — keep widget on top
                                // Skip during resize to prevent hover flicker
                                if let Ok(hwnd) = window.hwnd() {
                                    unsafe {
                                        SetWindowPos(hwnd.0 as isize, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                                    }
                                }
                            }
                        }
                        
                        #[cfg(not(target_os = "windows"))]
                        {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.set_always_on_top(true);
                            }
                        }
                    }
                }
            });

            // Also re-enforce on focus changes for the widget and apply initial styles
            if let Some(window) = app.get_webview_window("widget") {
                #[cfg(target_os = "windows")]
                apply_widget_styles(&window);

                let w = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::Focused(_) => {
                            #[cfg(target_os = "windows")]
                            if let Ok(hwnd) = w.hwnd() {
                                unsafe {
                                    SetWindowPos(hwnd.0 as isize, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                                }
                            }
                            #[cfg(not(target_os = "windows"))]
                            let _ = w.set_always_on_top(true);
                        }
                        tauri::WindowEvent::Moved(new_pos) => {
                            // Only update anchor for user-initiated moves (drags), not programmatic resizes
                            if !WIDGET_RESIZING.load(Ordering::SeqCst) {
                                if let Ok(size) = w.outer_size() {
                                    let state = w.state::<WidgetAnchor>();
                                    let mut anchor = state.0.lock().unwrap();
                                    
                                    let ax = new_pos.x + size.width as i32;
                                    let ay = new_pos.y + size.height as i32;
                                    *anchor = Some((ax, ay));
                                    
                                    // Persist to DB asynchronously
                                    std::thread::spawn(move || {
                                        let path = format!(
                                            "/api/settings/update?widget_anchor_x={}&widget_anchor_y={}",
                                            ax, ay
                                        );
                                        call_backend_get(&path);
                                    });
                                }
                            }
                            // Re-enforce topmost on any move
                            #[cfg(target_os = "windows")]
                            if let Ok(hwnd) = w.hwnd() {
                                unsafe {
                                    SetWindowPos(hwnd.0 as isize, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                                }
                            }
                        }
                        _ => {}
                    }
                });
            }

            // -------- Persistence & Autostart --------
            // Widget visibility is now restored by the frontend (App.jsx)
            // after it fetches settings from the DB and pre-sets the anchor.
            // This avoids the widget flashing at the default position before
            // jumping to the saved coordinates.

            // Ensure the main app starts with Windows (Production only)
            #[cfg(not(debug_assertions))]
            {
                use tauri_plugin_autostart::ManagerExt;
                let _ = app.autolaunch().enable();
            }

            start_backend(app.handle());

            // Handle deep-link when app is launched directly via protocol.
            let args: Vec<String> = std::env::args().collect();
            let is_quiet = args.iter().any(|arg| arg == "--quiet" || arg == "--hidden");
            let is_backend_action = extract_deep_link(&args).map(|u| is_backend_only_action(&u)).unwrap_or(false);

            if !is_quiet && !is_backend_action {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            if let Some(url) = extract_deep_link(&args) {
                if is_backend_only_action(&url) {
                    let _ = handle_backend_only_action(&url);
                } else {
                    emit_deep_link(app.handle(), &url);
                }
            }

            // -------- Tray Menu --------
            let open = MenuItem::with_id(app, "open", "Open Stasis", true, None::<&str>)?;
            let widget = MenuItem::with_id(app, "widget", "Toggle Widget", true, None::<&str>)?;
            let close = MenuItem::with_id(app, "close", "Close Window", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Stasis", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&open, &widget, &close, &quit])?;

            let icon = app
                .default_window_icon()
                .expect("No default window icon found")
                .clone();

            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Stasis is running")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {

                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            } else {
                                // Recreate the window if it was closed to save RAM
                                let _ = tauri::WebviewWindowBuilder::new(
                                    app,
                                    "main",
                                    tauri::WebviewUrl::App("index.html".into()),
                                )
                                .title("Stasis")
                                .inner_size(1100.0, 700.0)
                                .resizable(true)
                                .fullscreen(false)
                                .decorations(true)
                                .visible(true)
                                .build();
                            }
                        }

                        "widget" => {
                            toggle_widget(app.clone());
                        }

                        "close" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.close(); // Use close instead of hide to free RAM
                            }
                        }

                        "quit" => {
                            let app_handle = app.clone();

                            MessageDialogBuilder::new(
                                app_handle.dialog().clone(),
                                "Quit Stasis?",
                                "Quitting Stasis will immediately stop all activity tracking and digital wellbeing monitoring.\n\nAre you sure you want to exit?"
                            )
                            .buttons(MessageDialogButtons::OkCancel)
                            .show(move |confirmed| {
                                if confirmed {
                                    stop_backend(&app_handle);
                                    SHOULD_EXIT.store(true, Ordering::SeqCst);
                                    app_handle.exit(0);
                                }
                            });
                        }

                        _ => {}
                    }
                })
                .build(app)?;

            Ok(())
        })

        // By default, closing the window will now destroy it (freeing RAM).
        // The RunEvent handler below will prevent the app from exiting.

        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let is_quiet = args.iter().any(|arg| arg == "--quiet" || arg == "--hidden");

            if let Some(url) = extract_deep_link(&args) {
                if is_backend_only_action(&url) {
                    let _ = handle_backend_only_action(&url);
                    return;
                }

                if let Some(window) = app.get_webview_window("main") {
                    if !is_quiet {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                } else {
                    // Recreate window but respect quiet mode
                    let _ = tauri::WebviewWindowBuilder::new(
                        app,
                        "main",
                        tauri::WebviewUrl::App("index.html".into()),
                    )
                    .title("Stasis")
                    .inner_size(1100.0, 700.0)
                    .resizable(true)
                    .fullscreen(false)
                    .decorations(true)
                    .visible(!is_quiet)
                    .build();
                }
                emit_deep_link(app, &url);
            } else {
                if let Some(window) = app.get_webview_window("main") {
                    if !is_quiet {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                } else if !is_quiet {
                    let _ = tauri::WebviewWindowBuilder::new(
                        app,
                        "main",
                        tauri::WebviewUrl::App("index.html".into()),
                    )
                    .title("Stasis")
                    .inner_size(1100.0, 700.0)
                    .resizable(true)
                    .fullscreen(false)
                    .decorations(true)
                    .visible(true)
                    .build();
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--quiet"])))
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["widget"]).build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            toggle_widget,
            set_widget_visibility,
            expand_widget,
            shrink_widget,
            set_widget_anchor
        ])

        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if !SHOULD_EXIT.load(Ordering::SeqCst) {
                    api.prevent_exit();
                }
            }
            _ => {}
        });
}

fn start_backend(app: &AppHandle) {
    // Resolve the bundled backend EXE path relative to the Resources dir
    let resource_path = app
        .path()
        .resolve("bin/stasis-backend/stasis-backend.exe", tauri::path::BaseDirectory::Resource)
        .expect("Failed to resolve backend EXE path");

    #[cfg(not(debug_assertions))]
    {
        // Production: launch bundled EXE silently
        let mut cmd = std::process::Command::new(&resource_path);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child) => {
                println!("Backend started: {:?}", resource_path);
                let state = app.state::<BackendState>();
                let mut guard = state.0.lock().unwrap();
                *guard = Some(child);
            }
            Err(e) => {
                eprintln!("Failed to start backend: {}", e);
            }
        }
    }

    #[cfg(debug_assertions)]
    {
        // Development: try to launch the EXE if it exists, otherwise skip
        // (the Python process is started manually in dev mode)
        if resource_path.exists() {
            let mut cmd = std::process::Command::new(&resource_path);

            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                cmd.creation_flags(CREATE_NO_WINDOW);
            }

            match cmd.spawn() {
                Ok(child) => {
                    println!("Dev backend started: {:?}", resource_path);
                    let state = app.state::<BackendState>();
                    let mut guard = state.0.lock().unwrap();
                    *guard = Some(child);
                }
                Err(e) => {
                    eprintln!("Dev backend not started: {}", e);
                }
            }
        } else {
            println!("Dev mode: backend EXE not found at {:?}, skipping auto-launch.", resource_path);
        }
    }
}

fn stop_backend(app: &AppHandle) {
    let state = app.state::<BackendState>();
    let mut guard = state.0.lock().unwrap();

    if let Some(mut child) = guard.take() {
        println!("Stopping backend immediate child...");
        let _ = child.kill();
        let _ = child.wait();
    }

    println!("Force killing any independent stasis-backend.exe instances...");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "stasis-backend.exe", "/T"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("pkill")
            .arg("-f")
            .arg("stasis-backend")
            .output();
    }
    
    println!("Backend fully stopped.");
}