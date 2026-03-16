// main.rs — Stasis Desktop App Entry Point
// Launches the Python backend EXE (bundled as a resource) and manages its lifecycle.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Child;
use std::io::Write;
use std::net::TcpStream;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, Emitter};
use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_dialog::{MessageDialogBuilder, MessageDialogButtons, DialogExt};

static SHOULD_EXIT: AtomicBool = AtomicBool::new(false);

struct BackendState(Mutex<Option<Child>>);

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

        .setup(|app| {
            start_backend(app.handle());

            // Handle deep-link when app is launched directly via protocol.
            let args: Vec<String> = std::env::args().collect();
            if let Some(url) = extract_deep_link(&args) {
                if is_backend_only_action(&url) {
                    let _ = handle_backend_only_action(&url);
                } else {
                    emit_deep_link(app.handle(), &url);
                }
            }

            // -------- Tray Menu --------
            let open = MenuItem::with_id(app, "open", "Open Stasis", true, None::<&str>)?;
            let close = MenuItem::with_id(app, "close", "Close Window", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Stasis", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&open, &close, &quit])?;

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
                                .build();
                            }
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
            if let Some(url) = extract_deep_link(&args) {
                if is_backend_only_action(&url) {
                    let _ = handle_backend_only_action(&url);
                    return;
                }

                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else {
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
                    .build();
                }
                emit_deep_link(app, &url);
            } else {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else {
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
                    .build();
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())

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