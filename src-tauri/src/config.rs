use anyhow::{Error, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AppConfig {
    pub backend_url: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ApiConfig {
    pub google_maps: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct LoadedConfig {
    pub build_version: String,
    pub api_keys: ApiConfig,
    pub app: AppConfig,
}

#[derive(Debug, Deserialize)]
struct RawConfig {
    pub build_version: String,
    api_keys: ApiConfig,
    development: AppConfig,
    production: AppConfig,
}

pub fn load_config() -> Result<LoadedConfig, Error> {
    let raw: RawConfig = toml::from_str(include_str!("../config.toml"))?;

    Ok(LoadedConfig {
        build_version: raw.build_version,
        api_keys: raw.api_keys,
        app: if cfg!(debug_assertions) {
            raw.development
        } else {
            raw.production
        },
    })
}
