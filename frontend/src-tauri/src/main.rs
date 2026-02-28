// main.rs — Stasis Desktop App Entry Point
// Launches the Python backend EXE (bundled as a resource) and manages its lifecycle.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Child;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri::tray::TrayIconBuilder;
use tauri::menu::{Menu, MenuItem};
use tauri_plugin_dialog::{MessageDialogBuilder, MessageDialogButtons, DialogExt};

struct BackendState(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .manage(BackendState(Mutex::new(None)))

        .setup(|app| {
            start_backend(app.handle());

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
                            }
                        }

                        "close" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
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

        // Close button → hide only
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })

        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn start_backend(app: &AppHandle) {
    // Resolve the bundled backend EXE path relative to the Resources dir
    let resource_path = app
        .path()
        .resolve("bin/stasis-backend.exe", tauri::path::BaseDirectory::Resource)
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
        println!("Stopping backend...");
        let _ = child.kill();
        let _ = child.wait();
        println!("Backend stopped.");
    }
}