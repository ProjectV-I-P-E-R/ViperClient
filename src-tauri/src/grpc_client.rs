use tauri::{AppHandle, Emitter, Manager, State};
use tonic::transport::Channel;
use tokio::sync::Mutex;

pub mod viper {
    tonic::include_proto!("viper");
    include!(concat!(env!("OUT_DIR"), "/viper.serde.rs"));
}

use viper::intelligence_engine_client::IntelligenceEngineClient;

pub struct GrpcState {
    pub client: Mutex<Option<IntelligenceEngineClient<Channel>>>,
}

impl GrpcState {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn connect_grpc(state: State<'_, GrpcState>, endpoint: String) -> Result<(), String> {
    let client = IntelligenceEngineClient::connect(endpoint)
        .await
        .map_err(|e| e.to_string())?;

    *state.client.lock().await = Some(client);
    Ok(())
}

#[tauri::command]
pub async fn fetch_orbitals(
    state: State<'_, GrpcState>,
    min_lat: f64,
    max_lat: f64,
    min_lon: f64,
    max_lon: f64,
    zoom_level: u32,
) -> Result<String, String> {
    let mut client_guard = state.client.lock().await;
    let client = client_guard.as_mut().ok_or("gRPC client not connected")?;

    let request = tonic::Request::new(viper::AreaOfInterest {
        min_lat,
        max_lat,
        min_lon,
        max_lon,
        zoom_level,
    });

    let response = client
        .fetch_orbital_objects(request)
        .await
        .map_err(|e| e.to_string())?;

    serde_json::to_string(&response.into_inner()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn subscribe_aircraft(
    app: AppHandle,
    state: State<'_, GrpcState>,
    min_lat: f64,
    max_lat: f64,
    min_lon: f64,
    max_lon: f64,
    zoom_level: u32,
) -> Result<(), String> {
    let mut client = {
        let client_guard = state.client.lock().await;
        client_guard.as_ref().ok_or("gRPC client not connected")?.clone()
    };

    let request = tonic::Request::new(viper::AreaOfInterest {
        min_lat,
        max_lat,
        min_lon,
        max_lon,
        zoom_level,
    });

    let response = client
        .stream_aircraft(request)
        .await
        .map_err(|e| e.to_string())?;

    let mut stream = response.into_inner();

    tauri::async_runtime::spawn(async move {
        while let Ok(Some(entity)) = stream.message().await {
            let _ = app.emit("aircraft-update", format!("{:?}", entity));
        }
    });

    Ok(())
}