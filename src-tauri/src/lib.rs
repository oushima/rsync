//! RSync Tauri backend library.

pub mod errors;
pub mod file_ops;
pub mod permissions;
pub mod power;
pub mod sync_engine;
pub mod transfer_state;

use parking_lot::RwLock;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

use errors::SyncError;
use file_ops::{DirectoryInfo, VolumeInfo};
use sync_engine::{SyncEngine, SyncOptions, SyncResult_};
use transfer_state::TransferState;

pub struct AppState {
    pub sync_engine: RwLock<Option<Arc<SyncEngine>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            sync_engine: RwLock::new(None),
        }
    }

    pub fn init_sync_engine(&self, app_handle: tauri::AppHandle) -> Result<(), SyncError> {
        let engine = Arc::new(SyncEngine::new(Some(app_handle))?);
        *self.sync_engine.write() = Some(engine);
        Ok(())
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
async fn sync_files(
    state: State<'_, Arc<AppState>>,
    source: String,
    destination: String,
    options: SyncOptions,
) -> Result<SyncResult_, String> {
    let source_path = PathBuf::from(&source);
    let dest_path = PathBuf::from(&destination);

    if !source_path.exists() {
        return Err(format!("Source path does not exist: {}", source));
    }

    let engine = {
        let engine_guard = state.sync_engine.read();
        engine_guard
            .as_ref()
            .cloned()
            .ok_or_else(|| "Sync engine not initialized".to_string())?
    };

    engine
        .sync_files(source_path, dest_path, options)
        .await
        .map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn get_transfer_state(
    state: State<'_, Arc<AppState>>,
    transfer_id: String,
) -> Result<TransferState, String> {
    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    engine
        .get_transfer_state(&transfer_id)
        .map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn pause_transfer(state: State<'_, Arc<AppState>>, transfer_id: String) -> Result<(), String> {
    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    engine
        .pause_transfer(&transfer_id)
        .map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn resume_transfer(state: State<'_, Arc<AppState>>, transfer_id: String) -> Result<(), String> {
    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    engine
        .resume_transfer(&transfer_id)
        .map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn cancel_transfer(state: State<'_, Arc<AppState>>, transfer_id: String) -> Result<(), String> {
    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    engine
        .cancel_transfer(&transfer_id)
        .map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn check_fda() -> bool {
    permissions::check_full_disk_access()
}

#[tauri::command]
fn open_fda_settings() -> Result<(), String> {
    permissions::open_full_disk_access_settings().map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn get_directory_info(state: State<'_, Arc<AppState>>, path: String) -> Result<DirectoryInfo, String> {
    let path_buf = PathBuf::from(&path);

    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    engine
        .get_directory_info(&path_buf)
        .map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn get_active_transfers(state: State<'_, Arc<AppState>>) -> Result<Vec<TransferState>, String> {
    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    Ok(engine.get_active_transfers())
}

#[tauri::command]
fn is_path_accessible(path: String) -> bool {
    let path_buf = PathBuf::from(&path);
    permissions::check_path_accessible(&path_buf)
}

#[tauri::command]
fn is_path_writable(path: String) -> bool {
    let path_buf = PathBuf::from(&path);
    permissions::check_write_access(&path_buf)
}

#[tauri::command]
fn hash_file(path: String) -> Result<String, String> {
    let path_buf = PathBuf::from(&path);
    file_ops::compute_file_hash(&path_buf)
        .map(|hash| format!("{:016x}", hash))
        .map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
fn prevent_sleep(reason: String) -> bool {
    power::prevent_sleep(&reason)
}

#[tauri::command]
fn allow_sleep() -> bool {
    power::allow_sleep()
}

#[tauri::command]
fn is_preventing_sleep() -> bool {
    power::is_preventing_sleep()
}

#[tauri::command]
fn get_volume_info(path: String) -> Result<VolumeInfo, String> {
    file_ops::get_volume_info(std::path::Path::new(&path))
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state.clone())
        .setup(move |app| {
            let handle = app.handle().clone();
            app_state
                .init_sync_engine(handle)
                .expect("Failed to initialize sync engine");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sync_files,
            get_transfer_state,
            pause_transfer,
            resume_transfer,
            cancel_transfer,
            check_fda,
            open_fda_settings,
            get_directory_info,
            get_active_transfers,
            is_path_accessible,
            is_path_writable,
            hash_file,
            prevent_sleep,
            allow_sleep,
            is_preventing_sleep,
            get_volume_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

