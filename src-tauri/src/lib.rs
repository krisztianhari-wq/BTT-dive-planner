#[cfg(desktop)]
use tauri::Manager;

/// Native print dialog of the main webview (macOS / Windows).
#[cfg(desktop)]
#[tauri::command]
fn print_page(app: tauri::AppHandle) -> Result<(), String> {
    let webview = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    webview.print().map_err(|e| e.to_string())
}

/// No print dialog on iOS / Android: the UI offers PDF sharing instead.
#[cfg(mobile)]
#[tauri::command]
fn print_page(_app: tauri::AppHandle) -> Result<(), String> {
    Err("printing is not available on mobile".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![print_page])
        .run(tauri::generate_context!())
        .expect("error while running BTT Dive Planner");
}
