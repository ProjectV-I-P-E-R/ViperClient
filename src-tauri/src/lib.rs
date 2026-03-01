mod config;
mod grpc_client;

pub mod commands {
    use crate::config::LoadedConfig;
    use anyhow::Result;

    #[tauri::command]
    pub fn get_config(config: tauri::State<'_, LoadedConfig>) -> Result<LoadedConfig, String> {
        Ok(config.inner().clone())
    }
}

use config::load_config;
use crate::commands::get_config;
use crate::grpc_client::{GrpcState, connect_grpc, fetch_orbitals, subscribe_aircraft};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_config = load_config().expect("failed to load config");

    tauri::Builder::default()
        .manage(app_config)
        .manage(GrpcState::new())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_config, connect_grpc, fetch_orbitals, subscribe_aircraft])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
