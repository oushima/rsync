//! RSync Tauri backend library.

pub mod errors;
pub mod file_ops;
pub mod launch_agent;
pub mod permissions;
pub mod power;
pub mod sync_engine;
pub mod transfer_state;
pub mod tray;
pub mod volume_watcher;

use parking_lot::RwLock;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Emitter, Manager, State};

use errors::SyncError;
use file_ops::{DirectoryInfo, DirectorySummary, FileChunk, VolumeInfo};
use sync_engine::{SyncEngine, SyncOptions, SyncResult_};
use transfer_state::TransferState;
use tray::{TrayState, TrayStatus};
use volume_watcher::VolumeWatcher;

/// Sensitive system directories that should never be accessed for sync operations.
/// This list covers macOS system directories that could cause security issues.
const BLOCKED_PATHS: &[&str] = &[
    "/System",
    "/Library",
    "/private/var",
    "/private/etc",
    "/etc",
    "/var",
    "/usr",
    "/bin",
    "/sbin",
    "/dev",
    "/cores",
];

/// Validates that a path is safe to access for sync operations.
/// Returns an error if the path:
/// - Cannot be canonicalized (doesn't exist or permission denied)
/// - Points to or is within a sensitive system directory
/// - Uses path traversal sequences (..)
fn validate_path(path: &Path) -> Result<PathBuf, SyncError> {
    // First, canonicalize to resolve symlinks and .. sequences
    let canonical = path.canonicalize().map_err(|e| {
        SyncError::PermissionDenied(format!(
            "Cannot access path '{}': {}",
            path.display(),
            e
        ))
    })?;

    let canonical_str = canonical.to_string_lossy();

    // Check for blocked system directories
    for blocked in BLOCKED_PATHS {
        if canonical_str.starts_with(blocked) {
            return Err(SyncError::PermissionDenied(format!(
                "Access to system directory '{}' is not allowed for security reasons",
                blocked
            )));
        }
    }

    // Additional check: ensure no path component is ".."
    for component in canonical.components() {
        if let std::path::Component::ParentDir = component {
            return Err(SyncError::PermissionDenied(
                "Path traversal sequences (..) are not allowed".to_string(),
            ));
        }
    }

    Ok(canonical)
}

pub struct AppState {
    pub sync_engine: RwLock<Option<Arc<SyncEngine>>>,
    pub tray_state: Arc<TrayState>,
    pub volume_watcher: RwLock<Option<Arc<tokio::sync::RwLock<VolumeWatcher>>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            sync_engine: RwLock::new(None),
            tray_state: Arc::new(TrayState::new()),
            volume_watcher: RwLock::new(None),
        }
    }

    pub fn init_sync_engine(&self, app_handle: tauri::AppHandle) -> Result<(), SyncError> {
        let engine = Arc::new(SyncEngine::new(Some(app_handle.clone()))?);
        *self.sync_engine.write() = Some(engine);
        
        // Initialize volume watcher
        let watcher = VolumeWatcher::new(Some(app_handle));
        *self.volume_watcher.write() = Some(Arc::new(tokio::sync::RwLock::new(watcher)));
        
        Ok(())
    }
    
    /// Starts the volume watcher for drive disconnect detection.
    pub async fn start_volume_watcher(&self) -> Result<(), SyncError> {
        // Clone the Arc outside the guard scope to avoid holding non-Send guard across await
        let watcher_opt = self.volume_watcher.read().clone();
        
        if let Some(watcher) = watcher_opt {
            watcher.write().await.start().await?;
        }
        Ok(())
    }
    
    /// Registers a transfer with the volume watcher.
    pub async fn register_transfer_volumes(&self, transfer_id: &str, source: &Path, dest: &Path) {
        // Clone the Arc outside the guard scope
        let watcher_opt = self.volume_watcher.read().clone();
        
        if let Some(watcher) = watcher_opt {
            watcher.read().await.register_transfer(transfer_id, source, dest);
        }
    }
    
    /// Unregisters a transfer from the volume watcher.
    pub async fn unregister_transfer_volumes(&self, transfer_id: &str) {
        // Clone the Arc outside the guard scope
        let watcher_opt = self.volume_watcher.read().clone();
        
        if let Some(watcher) = watcher_opt {
            watcher.read().await.unregister_transfer(transfer_id);
        }
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

    // Validate source path for security
    let source_path = validate_path(&source_path).map_err(|e| e.to_string())?;
    
    // For destination, we need to handle the case where it doesn't exist yet
    // Validate the parent directory instead if destination doesn't exist
    let dest_path = if dest_path.exists() {
        validate_path(&dest_path).map_err(|e| e.to_string())?
    } else {
        // Check if parent exists and is valid
        let parent = dest_path.parent().ok_or_else(|| {
            "Destination path has no parent directory".to_string()
        })?;
        let validated_parent = validate_path(parent).map_err(|e| e.to_string())?;
        validated_parent.join(dest_path.file_name().ok_or_else(|| {
            "Destination path has no file name".to_string()
        })?)
    };

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

// ============================================================================
// Interrupted/Resumable Transfer Commands
// ============================================================================

/// Gets all interrupted transfers that can be resumed.
/// These are transfers that were started but not completed (paused, failed, or interrupted).
/// The state manager persists transfer state to disk, so these survive app restarts.
#[tauri::command]
fn get_interrupted_transfers(state: State<'_, Arc<AppState>>) -> Result<Vec<TransferState>, String> {
    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    Ok(engine.get_interrupted_transfers())
}

/// Resumes an interrupted transfer from where it left off.
/// This restarts the sync operation using the persisted state.
#[tauri::command]
async fn resume_interrupted_transfer(
    state: State<'_, Arc<AppState>>,
    transfer_id: String,
) -> Result<bool, String> {
    let engine = {
        let engine_guard = state.sync_engine.read();
        engine_guard
            .as_ref()
            .cloned()
            .ok_or_else(|| "Sync engine not initialized".to_string())?
    };

    engine
        .resume_interrupted_transfer(&transfer_id)
        .await
        .map(|_| true)
        .map_err(|e: SyncError| e.to_string())
}

/// Discards an interrupted transfer, removing its state from disk.
/// Use when the user decides not to resume a transfer.
#[tauri::command]
fn discard_transfer(state: State<'_, Arc<AppState>>, transfer_id: String) -> Result<bool, String> {
    let engine_guard = state.sync_engine.read();
    let engine = engine_guard
        .as_ref()
        .ok_or_else(|| "Sync engine not initialized".to_string())?;

    engine
        .discard_transfer(&transfer_id)
        .map(|_| true)
        .map_err(|e: SyncError| e.to_string())
}


#[tauri::command]
async fn check_fda() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(permissions::check_full_disk_access)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_fda_settings() -> Result<(), String> {
    permissions::open_full_disk_access_settings().map_err(|e: SyncError| e.to_string())
}

#[tauri::command]
async fn get_directory_info(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<DirectoryInfo, String> {
    let path_buf = PathBuf::from(&path);
    
    // Validate path for security
    let path_buf = validate_path(&path_buf).map_err(|e| e.to_string())?;

    let engine = {
        let engine_guard = state.sync_engine.read();
        engine_guard
            .as_ref()
            .cloned()
            .ok_or_else(|| "Sync engine not initialized".to_string())?
    };

    tauri::async_runtime::spawn_blocking(move || engine.get_directory_info(&path_buf))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e: SyncError| e.to_string())
}

/// Quick directory scan - returns summary immediately without file list
/// Use this for fast UI feedback, then call scan_directory_stream for files
#[tauri::command]
async fn quick_scan_directory(path: String) -> Result<DirectorySummary, String> {
    let path_buf = PathBuf::from(&path);
    
    // Validate path for security
    let path_buf = validate_path(&path_buf).map_err(|e| e.to_string())?;
    
    tauri::async_runtime::spawn_blocking(move || {
        file_ops::quick_scan_directory(&path_buf)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e: SyncError| e.to_string())
}

/// Streaming directory scan - emits file chunks via events as they're discovered
/// This allows the UI to start rendering files immediately without waiting for full scan
#[tauri::command]
async fn scan_directory_stream(
    app: tauri::AppHandle,
    path: String,
    scan_id: String,
) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    
    // Validate path for security
    let path_buf = validate_path(&path_buf).map_err(|e| e.to_string())?;
    
    // Spawn the scanning task
    tauri::async_runtime::spawn_blocking(move || {
        /// Number of files to batch in each chunk sent to the frontend.
        /// 1000 files per chunk balances UI responsiveness with IPC overhead.
        /// Smaller chunks = more responsive UI but more IPC calls.
        /// Larger chunks = fewer IPC calls but UI updates less frequently.
        const CHUNK_SIZE: usize = 1000;
        
        let mut scanner = match file_ops::DirectoryScanner::new(&path_buf, false, CHUNK_SIZE) {
            Ok(s) => s,
            Err(e) => {
                // Emit error event
                let _ = app.emit("scan_error", serde_json::json!({
                    "scan_id": scan_id,
                    "error": e.to_string()
                }));
                return;
            }
        };
        
        let mut chunk_index = 0;
        
        loop {
            match scanner.next_chunk() {
                Some(files) => {
                    let chunk = FileChunk {
                        scan_id: scan_id.clone(),
                        files,
                        chunk_index,
                        is_final: false,
                    };
                    
                    if app.emit("file_chunk", &chunk).is_err() {
                        // App probably closed, stop scanning
                        break;
                    }
                    
                    chunk_index += 1;
                }
                None => {
                    // Send final empty chunk to signal completion
                    let final_chunk = FileChunk {
                        scan_id: scan_id.clone(),
                        files: vec![],
                        chunk_index,
                        is_final: true,
                    };
                    let _ = app.emit("file_chunk", &final_chunk);
                    break;
                }
            }
        }
    });
    
    Ok(())
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

/// Resolution type for file conflicts from the frontend.
/// Maps to user decisions in the conflict resolution dialog.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FrontendConflictResolution {
    KeepSource,
    KeepDest,
    KeepBoth,
    Skip,
}

/// Resolves a file conflict by applying the user's chosen resolution.
/// This command is called from the frontend when the user makes a decision
/// in the conflict resolution dialog.
#[tauri::command]
async fn resolve_conflict(
    state: State<'_, Arc<AppState>>,
    conflict_id: String,
    resolution: FrontendConflictResolution,
    transfer_id: Option<String>,
) -> Result<(), String> {
    // Get the sync engine
    let engine = {
        let engine_guard = state.sync_engine.read();
        engine_guard
            .as_ref()
            .cloned()
            .ok_or_else(|| "Sync engine not initialized".to_string())?
    };

    // Delegate to the sync engine's conflict resolution handler
    engine
        .resolve_conflict(&conflict_id, resolution, transfer_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_volume_info(path: String) -> Result<VolumeInfo, String> {
    tauri::async_runtime::spawn_blocking(move || file_ops::get_volume_info(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

// ============================================================================
// Volume Watcher Commands
// ============================================================================

/// Gets all currently mounted volumes.
#[tauri::command]
async fn get_mounted_volumes(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<volume_watcher::VolumeInfo>, String> {
    // Clone the Arc outside the guard scope to avoid holding non-Send guard across await
    let watcher_opt = state.volume_watcher.read().clone();
    
    if let Some(watcher) = watcher_opt {
        Ok(watcher.read().await.get_volumes())
    } else {
        // Fallback: scan directly (synchronous)
        Ok(volume_watcher::VolumeWatcher::new(None).get_volumes())
    }
}

/// Checks if a path is on a removable/external volume.
/// Useful for warning users before sync operations to external drives.
#[tauri::command]
fn is_on_removable_volume(path: String) -> bool {
    volume_watcher::is_on_removable_volume(Path::new(&path))
}

/// Gets volume information for a specific path (mount point, space, etc.).
#[tauri::command]
fn get_path_volume_info(path: String) -> Option<volume_watcher::VolumeInfo> {
    let path_buf = PathBuf::from(&path);
    volume_watcher::get_volume_for_path(&path_buf)
}

/// Validates that source and destination volumes are accessible before starting sync.
/// Returns specific error types for drive disconnection vs other issues.
#[tauri::command]
fn validate_sync_volumes(source: String, destination: String) -> Result<(), String> {
    let source_path = PathBuf::from(&source);
    let dest_path = PathBuf::from(&destination);
    
    volume_watcher::validate_volumes_for_sync(&source_path, &dest_path)
        .map_err(|e| e.to_string())
}

/// Checks if a volume for the given path is still accessible.
/// Use this during sync operations to detect disconnection.
#[tauri::command]
async fn is_volume_accessible(
    state: State<'_, Arc<AppState>>,
    path: String,
) -> Result<bool, String> {
    let path_buf = PathBuf::from(&path);
    
    // Clone the Arc outside the guard scope to avoid holding non-Send guard across await
    let watcher_opt = state.volume_watcher.read().clone();
    
    if let Some(watcher) = watcher_opt {
        Ok(watcher.read().await.is_volume_accessible(&path_buf))
    } else {
        // Fallback: just check if path exists
        Ok(path_buf.exists())
    }
}

/// Validates a glob pattern and returns an error message if invalid.
/// Returns Ok(()) if the pattern is valid.
#[tauri::command]
fn validate_glob_pattern(pattern: String) -> Result<(), String> {
    use globset::Glob;
    
    if pattern.trim().is_empty() {
        return Err("Pattern cannot be empty".to_string());
    }
    
    // Try to parse the pattern
    match Glob::new(&pattern) {
        Ok(_) => Ok(()),
        Err(e) => {
            // Also try with **/ prefix for directory matching
            match Glob::new(&format!("**/{}", pattern)) {
                Ok(_) => Ok(()),
                Err(_) => Err(format!("Invalid glob pattern: {}", e)),
            }
        }
    }
}

/// Checks if a path exists on the filesystem.
/// Used by the schedule runner to validate paths before starting transfers.
#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Seconds to wait before shutdown, giving user time to cancel.
const SHUTDOWN_DELAY_SECONDS: u32 = 5;

/// Initiates a system shutdown after a brief delay.
/// Uses macOS osascript to display a confirmation and then shut down.
/// The delay gives the user time to cancel if needed.
#[tauri::command]
async fn initiate_shutdown() -> Result<(), String> {
    use std::process::Command;
    
    // Use osascript to trigger shutdown with a delay
    // The delay allows user to cancel via the frontend countdown
    let script = format!(
        r#"do shell script "sleep {} && shutdown -h now" with administrator privileges"#,
        SHUTDOWN_DELAY_SECONDS
    );
    
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("osascript")
            .args([&"-e", &script.as_str()])
            .output();
        
        match output {
            Ok(result) => {
                if result.status.success() {
                    Ok(())
                } else {
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    // User cancelled the admin dialog - this is expected behavior
                    if stderr.contains("User canceled") || stderr.contains("(-128)") {
                        Err("Shutdown cancelled by user".to_string())
                    } else {
                        Err(format!("Shutdown failed: {}", stderr))
                    }
                }
            }
            Err(e) => Err(format!("Failed to execute shutdown command: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("Shutdown task panicked: {}", e))?
}

// ============================================================================
// Tray Commands
// ============================================================================

/// Sets whether the app should minimize to tray instead of quitting.
#[tauri::command]
fn set_minimize_to_tray(state: State<'_, Arc<AppState>>, enabled: bool) {
    state.tray_state.set_minimize_to_tray(enabled);
}

/// Updates the tray icon and tooltip based on sync status.
#[tauri::command]
fn update_tray_status(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    status: TrayStatus,
) {
    tray::update_tray_status(&app, &state.tray_state, status);
}

/// Shows the main window from tray.
#[tauri::command]
fn show_main_window(app: tauri::AppHandle, state: State<'_, Arc<AppState>>) {
    tray::show_window(&app, &state.tray_state);
}

/// Hides the main window to tray.
#[tauri::command]
fn hide_main_window(app: tauri::AppHandle, state: State<'_, Arc<AppState>>) {
    tray::hide_window(&app, &state.tray_state);
}

// ============================================================================
// Auto-Start Commands
// ============================================================================

/// Enables auto-start on login by creating a macOS Launch Agent.
#[tauri::command]
fn enable_auto_start() -> Result<(), String> {
    launch_agent::enable_auto_start().map_err(|e| e.to_string())
}

/// Disables auto-start on login by removing the Launch Agent.
#[tauri::command]
fn disable_auto_start() -> Result<(), String> {
    launch_agent::disable_auto_start().map_err(|e| e.to_string())
}

/// Checks if auto-start on login is currently enabled.
#[tauri::command]
fn is_auto_start_enabled() -> bool {
    launch_agent::is_auto_start_enabled()
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
            
            // Initialize sync engine and volume watcher
            if let Err(e) = app_state.init_sync_engine(handle.clone()) {
                eprintln!("[App] Warning: Failed to initialize sync engine: {}. Some features may be unavailable.", e);
                // Continue with limited functionality rather than crashing
            }
            
            // Start volume watcher for drive disconnect detection
            let app_state_clone = app_state.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = app_state_clone.start_volume_watcher().await {
                    eprintln!("[App] Warning: Failed to start volume watcher: {}. Drive disconnect detection will be unavailable.", e);
                } else {
                    eprintln!("[App] Volume watcher started successfully");
                }
            });
            
            // Initialize system tray
            let tray_state = Arc::clone(&app_state.tray_state);
            if let Err(e) = tray::init_tray(&handle, tray_state) {
                eprintln!("[App] Warning: Failed to initialize system tray: {}. Tray features will be unavailable.", e);
                // Continue without tray rather than crashing
            }
            
            // Set up window close handler for minimize to tray
            if let Some(window) = app.get_webview_window("main") {
                let tray_state = Arc::clone(&app_state.tray_state);
                let window_clone = window.clone();
                
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        // Check if minimize to tray is enabled
                        if tray_state.is_minimize_to_tray_enabled() {
                            // Prevent the window from closing, just hide it instead
                            api.prevent_close();
                            if let Err(e) = window_clone.hide() {
                                eprintln!("Failed to hide window: {}", e);
                            }
                            tray_state.set_window_visible(false);
                        }
                        // If minimize to tray is disabled, the window will close normally
                    }
                });
            }
            
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
            quick_scan_directory,
            scan_directory_stream,
            get_active_transfers,
            is_path_accessible,
            is_path_writable,
            path_exists,
            hash_file,
            prevent_sleep,
            allow_sleep,
            is_preventing_sleep,
            get_volume_info,
            get_mounted_volumes,
            is_on_removable_volume,
            get_path_volume_info,
            validate_sync_volumes,
            is_volume_accessible,
            resolve_conflict,
            initiate_shutdown,
            validate_glob_pattern,
            set_minimize_to_tray,
            update_tray_status,
            show_main_window,
            hide_main_window,
            enable_auto_start,
            disable_auto_start,
            is_auto_start_enabled,
            get_interrupted_transfers,
            resume_interrupted_transfer,
            discard_transfer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

