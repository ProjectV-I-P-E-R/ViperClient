mod config;

pub mod commands {
    use crate::config::LoadedConfig;
    use anyhow::Result;

    #[tauri::command]
    pub fn get_config(config: tauri::State<'_, LoadedConfig>) -> Result<LoadedConfig, String> {
        Ok(config.inner().clone())
    }
}

use crate::commands::get_config;
use config::load_config;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = load_config().expect("failed to load config");

    tauri::Builder::default()
        .manage(app_config)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
