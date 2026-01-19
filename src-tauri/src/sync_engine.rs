//! Core sync engine for file synchronization.

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use walkdir::WalkDir;

use crate::errors::{SyncError, SyncResult};
use crate::file_ops::{
    copy_file_with_progress, copy_symlink, detect_delta_detailed, generate_conflict_name, 
    scan_directory_with_options, CopyOptions, DeltaStatus, DirectoryInfo, FileInfo,
};
use crate::transfer_state::{
    FileTransferState, TransferState, TransferStateManager, TransferStatus,
};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncMode {
    Copy,
    Move,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConflictResolution {
    Overwrite,
    Skip,
    Rename,
    Ask,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncOptions {
    pub source: PathBuf,
    pub destination: PathBuf,
    pub mode: SyncMode,
    pub conflict_resolution: ConflictResolution,
    pub verify_integrity: bool,
    pub preserve_metadata: bool,
    pub delete_orphans: bool,
    pub buffer_size: Option<usize>,
    #[serde(default)]
    pub dry_run: bool,
    #[serde(default)]
    pub follow_symlinks: bool,
    /// Maximum number of files to copy in parallel (1-8)
    #[serde(default = "default_max_concurrent_files")]
    pub max_concurrent_files: usize,
    /// Only copy if source is newer than destination
    #[serde(default)]
    pub overwrite_newer: bool,
    /// Only copy if source is older than destination
    #[serde(default)]
    pub overwrite_older: bool,
    /// Skip files that already exist at destination
    #[serde(default)]
    pub skip_existing: bool,
}

fn default_max_concurrent_files() -> usize {
    4
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult_ {
    pub files_total: usize,
    pub files_copied: usize,
    pub files_skipped: usize,
    pub files_failed: usize,
    pub bytes_total: u64,
    pub bytes_copied: u64,
    pub duration_ms: u64,
    pub errors: Vec<String>,
}

impl Default for SyncResult_ {
    fn default() -> Self {
        Self {
            files_total: 0,
            files_copied: 0,
            files_skipped: 0,
            files_failed: 0,
            bytes_total: 0,
            bytes_copied: 0,
            duration_ms: 0,
            errors: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub transfer_id: String,
    pub current_file: String,
    pub current_file_progress: f64,
    pub overall_progress: f64,
    pub bytes_copied: u64,
    pub bytes_total: u64,
    pub files_completed: usize,
    pub files_total: usize,
    pub speed_bytes_per_sec: f64,
    pub eta_seconds: Option<f64>,
}

pub struct TransferControl {
    pub paused: AtomicBool,
    pub cancelled: AtomicBool,
}

impl TransferControl {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
        }
    }

    pub fn is_paused(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

pub struct SyncEngine {
    app_handle: Option<AppHandle>,
    state_manager: Arc<TransferStateManager>,
    controls: RwLock<HashMap<String, Arc<TransferControl>>>,
}

impl SyncEngine {
    pub fn new(app_handle: Option<AppHandle>) -> SyncResult<Self> {
        Ok(Self {
            app_handle,
            state_manager: Arc::new(TransferStateManager::new()?),
            controls: RwLock::new(HashMap::new()),
        })
    }

    pub fn get_directory_info(&self, path: &Path) -> SyncResult<DirectoryInfo> {
        scan_directory_with_options(path, false)
    }

    pub fn get_active_transfers(&self) -> Vec<TransferState> {
        self.state_manager.get_active_transfers()
    }

    pub fn get_transfer_state(&self, transfer_id: &str) -> SyncResult<TransferState> {
        self.state_manager.get_state(transfer_id)
    }

    pub fn pause_transfer(&self, transfer_id: &str) -> SyncResult<()> {
        let control = self.get_control(transfer_id)?;
        control.pause();
        self.set_status(transfer_id, TransferStatus::Paused, None)?;
        Ok(())
    }

    pub fn resume_transfer(&self, transfer_id: &str) -> SyncResult<()> {
        let control = self.get_control(transfer_id)?;
        control.resume();
        self.set_status(transfer_id, TransferStatus::Running, None)?;
        Ok(())
    }

    pub fn cancel_transfer(&self, transfer_id: &str) -> SyncResult<()> {
        let control = self.get_control(transfer_id)?;
        control.cancel();
        self.set_status(
            transfer_id,
            TransferStatus::Cancelled,
            Some("Transfer cancelled by user".to_string()),
        )?;
        Ok(())
    }

    pub async fn sync_files(
        &self,
        source_path: PathBuf,
        dest_path: PathBuf,
        mut options: SyncOptions,
    ) -> SyncResult<SyncResult_> {
        options.source = source_path.clone();
        options.destination = dest_path.clone();

        let transfer_id = self
            .state_manager
            .create_transfer(source_path.clone(), dest_path.clone())?;
        let control = Arc::new(TransferControl::new());
        {
            let mut controls = self.controls.write();
            controls.entry(transfer_id.clone()).or_insert_with(|| control.clone());
        }

        let start = std::time::Instant::now();
        let mut result = SyncResult_::default();

        let source_info = scan_directory_with_options(&source_path, options.follow_symlinks)?;
        result.files_total = source_info.file_count;
        result.bytes_total = source_info.total_size;

        let state_arc = self.state_manager.get_transfer(&transfer_id)?;
        {
            let mut state = state_arc.write();
            state.status = TransferStatus::Running;
            state.total_bytes = source_info.total_size;
            state.total_files = source_info.file_count;
            state.current_file = None;
            for file in &source_info.files {
                if file.is_dir {
                    continue;
                }
                let src = source_path.join(&file.path);
                if !state.files.contains_key(&src) {
                    let dst = dest_path.join(&file.path);
                    let file_state = FileTransferState::new(src, dst, file.size, file.modified);
                    state.add_file(file_state);
                }
            }
            self.state_manager.save_state(&state)?;
        }

        self.emit_initial_progress(&transfer_id, &source_info);

        // Separate directories, symlinks, and regular files
        let mut dirs: Vec<&FileInfo> = Vec::new();
        let mut symlinks: Vec<&FileInfo> = Vec::new();
        let mut regular_files: Vec<&FileInfo> = Vec::new();

        for file in &source_info.files {
            if file.is_dir {
                dirs.push(file);
            } else if file.is_symlink && !options.follow_symlinks {
                symlinks.push(file);
            } else {
                regular_files.push(file);
            }
        }

        // Create directories first (must be sequential)
        for file in dirs {
            if control.is_cancelled() {
                self.set_status(
                    &transfer_id,
                    TransferStatus::Cancelled,
                    Some("Transfer cancelled by user".to_string()),
                )?;
                return Err(SyncError::TransferCancelled("Transfer cancelled by user".into()));
            }
            if !options.dry_run {
                self.create_directory(&dest_path, file)?;
            }
        }

        // Copy symlinks (sequential, fast operation)
        for file in symlinks {
            if control.is_cancelled() {
                self.set_status(
                    &transfer_id,
                    TransferStatus::Cancelled,
                    Some("Transfer cancelled by user".to_string()),
                )?;
                return Err(SyncError::TransferCancelled("Transfer cancelled by user".into()));
            }
            if !options.dry_run {
                let source_abs = source_path.join(&file.path);
                let dest_abs = dest_path.join(&file.path);
                match copy_symlink(&source_abs, &dest_abs, false) {
                    Ok(_) => {
                        result.files_copied += 1;
                    }
                    Err(e) => {
                        result.files_failed += 1;
                        result.errors.push(format!("{}: {}", file.path.display(), e));
                    }
                }
            } else {
                result.files_copied += 1;
            }
        }

        // Process regular files in parallel using semaphore
        let max_concurrent = options.max_concurrent_files.clamp(1, 8);
        let semaphore = Arc::new(Semaphore::new(max_concurrent));
        let files_copied = Arc::new(AtomicUsize::new(0));
        let files_failed = Arc::new(AtomicUsize::new(0));
        let bytes_copied_atomic = Arc::new(AtomicUsize::new(0));
        let errors = Arc::new(parking_lot::Mutex::new(Vec::<String>::new()));

        // Clone shared resources for tasks
        let state_manager = self.state_manager.clone();
        let app_handle = self.app_handle.clone();

        let mut handles = Vec::new();

        for file in regular_files {
            // Check for cancellation before spawning
            if control.is_cancelled() {
                break;
            }

            // Wait for pause
            while control.is_paused() {
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }

            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let transfer_id = transfer_id.clone();
            let source_path = source_path.clone();
            let dest_path = dest_path.clone();
            let file = file.clone();
            let options = options.clone();
            let control = control.clone();
            let files_copied = files_copied.clone();
            let files_failed = files_failed.clone();
            let bytes_copied_atomic = bytes_copied_atomic.clone();
            let errors = errors.clone();
            let state_manager = state_manager.clone();
            let app_handle = app_handle.clone();

            let handle = tokio::spawn(async move {
                let _permit = permit; // Hold permit until task completes

                match Self::sync_file_static(
                    &transfer_id,
                    &source_path,
                    &dest_path,
                    &file,
                    &options,
                    &control,
                    &state_manager,
                    app_handle.as_ref(),
                ).await
                {
                    Ok(bytes) => {
                        files_copied.fetch_add(1, Ordering::Relaxed);
                        bytes_copied_atomic.fetch_add(bytes as usize, Ordering::Relaxed);
                    }
                    Err(e) => {
                        files_failed.fetch_add(1, Ordering::Relaxed);
                        errors.lock().push(format!("{}: {}", file.path.display(), e));
                        let source_abs = source_path.join(&file.path);
                        if let Ok(state_arc) = state_manager.get_transfer(&transfer_id) {
                            let mut state = state_arc.write();
                            state.fail_file(&source_abs, e.to_string());
                            let _ = state_manager.save_state(&state);
                        }
                    }
                }
            });
            handles.push(handle);
        }

        // Wait for all file transfers to complete
        for handle in handles {
            let _ = handle.await;
        }

        // Check if cancelled while processing
        if control.is_cancelled() {
            self.set_status(
                &transfer_id,
                TransferStatus::Cancelled,
                Some("Transfer cancelled by user".to_string()),
            )?;
            return Err(SyncError::TransferCancelled("Transfer cancelled by user".into()));
        }

        // Collect results
        result.files_copied += files_copied.load(Ordering::Relaxed);
        result.files_failed += files_failed.load(Ordering::Relaxed);
        result.bytes_copied += bytes_copied_atomic.load(Ordering::Relaxed) as u64;
        result.errors.extend(errors.lock().drain(..));

        if options.delete_orphans && !options.dry_run {
            self.cleanup_orphans(&source_info, &dest_path)?;
        }

        self.set_status(&transfer_id, TransferStatus::Completed, None)?;
        result.duration_ms = start.elapsed().as_millis() as u64;
        Ok(result)
    }

    fn cleanup_orphans(&self, source_info: &DirectoryInfo, dest_root: &Path) -> SyncResult<()> {
        let mut source_paths: HashSet<String> = HashSet::new();
        for entry in &source_info.files {
            source_paths.insert(entry.path.to_string_lossy().to_string());
        }

        for entry in WalkDir::new(dest_root).contents_first(true).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path == dest_root {
                continue;
            }
            let relative = match path.strip_prefix(dest_root) {
                Ok(rel) => rel.to_string_lossy().to_string(),
                Err(_) => continue,
            };
            if source_paths.contains(&relative) {
                continue;
            }
            if entry.file_type().is_dir() {
                let _ = std::fs::remove_dir(path);
            } else {
                let _ = std::fs::remove_file(path);
            }
        }

        Ok(())
    }

    fn get_control(&self, transfer_id: &str) -> SyncResult<Arc<TransferControl>> {
        let controls = self.controls.read();
        controls
            .get(transfer_id)
            .cloned()
            .ok_or_else(|| SyncError::TransferNotFound(transfer_id.to_string()))
    }

    fn set_status(
        &self,
        transfer_id: &str,
        status: TransferStatus,
        error: Option<String>,
    ) -> SyncResult<()> {
        let state_arc = self.state_manager.get_transfer(transfer_id)?;
        let mut state = state_arc.write();
        state.status = status;
        state.error = error;
        self.state_manager.save_state(&state)
    }

    fn create_directory(&self, dest_root: &Path, file: &FileInfo) -> SyncResult<()> {
        let dest_path = dest_root.join(&file.path);
        std::fs::create_dir_all(&dest_path)?;
        Ok(())
    }

    /// Static version of sync_file for parallel processing
    async fn sync_file_static(
        transfer_id: &str,
        source_root: &Path,
        dest_root: &Path,
        file: &FileInfo,
        options: &SyncOptions,
        control: &Arc<TransferControl>,
        state_manager: &Arc<TransferStateManager>,
        app_handle: Option<&AppHandle>,
    ) -> SyncResult<u64> {
        let source_path = source_root.join(&file.path);
        let dest_path = dest_root.join(&file.path);

        let delta = detect_delta_detailed(file, dest_root)?;

        // Handle unchanged files - always skip
        if delta.status == DeltaStatus::Unchanged {
            let state_arc = state_manager.get_transfer(transfer_id)?;
            let mut state = state_arc.write();
            state.skip_file(&source_path);
            state_manager.save_state(&state)?;
            return Ok(0);
        }

        // Handle existing files based on overwrite options
        if delta.status == DeltaStatus::Modified {
            // If skip_existing is set, skip all existing files
            if options.skip_existing {
                let state_arc = state_manager.get_transfer(transfer_id)?;
                let mut state = state_arc.write();
                state.skip_file(&source_path);
                state_manager.save_state(&state)?;
                return Ok(0);
            }

            // Check overwrite conditions
            let should_overwrite = if options.overwrite_newer && options.overwrite_older {
                true
            } else if options.overwrite_newer {
                delta.source_newer || delta.size_differs
            } else if options.overwrite_older {
                delta.source_older
            } else {
                match options.conflict_resolution {
                    ConflictResolution::Skip | ConflictResolution::Ask => false,
                    ConflictResolution::Overwrite | ConflictResolution::Rename => true,
                }
            };

            if !should_overwrite {
                let state_arc = state_manager.get_transfer(transfer_id)?;
                let mut state = state_arc.write();
                state.skip_file(&source_path);
                state_manager.save_state(&state)?;
                return Ok(0);
            }
        }

        // Determine actual destination
        let actual_dest = if delta.status == DeltaStatus::Modified 
            && options.conflict_resolution == ConflictResolution::Rename 
            && !options.overwrite_newer 
            && !options.overwrite_older 
        {
            generate_conflict_name(&dest_path)
        } else {
            dest_path.clone()
        };

        // In dry-run mode, just report what would be copied
        if options.dry_run {
            let state_arc = state_manager.get_transfer(transfer_id)?;
            {
                let mut state = state_arc.write();
                state.complete_file(&source_path);
                state_manager.save_state(&state)?;
            }
            return Ok(file.size);
        }

        // Get resume offset
        let resume_offset = {
            if let Ok(state_arc) = state_manager.get_transfer(transfer_id) {
                let state = state_arc.read();
                state.files.get(&source_path).map(|f| f.get_resume_offset()).unwrap_or(0)
            } else {
                0
            }
        };

        let copy_options = CopyOptions {
            buffer_size: options.buffer_size.unwrap_or(8 * 1024 * 1024),
            preserve_metadata: options.preserve_metadata,
            verify_integrity: options.verify_integrity,
            resume_offset,
        };

        let bytes_total = file.size;
        let start_time = std::time::Instant::now();
        let transfer_id_string = transfer_id.to_string();
        let transfer_id_for_cb = transfer_id_string.clone();
        let current_file = file.path.display().to_string();
        let source_path_clone = source_path.clone();
        let source_path_for_task = source_path.clone();
        let actual_dest_for_task = actual_dest.clone();
        let state_manager_for_task = state_manager.clone();
        let control_clone = control.clone();

        let (progress_tx, mut progress_rx) = tokio::sync::mpsc::channel::<ProgressEvent>(64);
        let app_handle_owned = app_handle.cloned();
        
        let emit_task = tauri::async_runtime::spawn(async move {
            if let Some(handle) = app_handle_owned {
                while let Some(event) = progress_rx.recv().await {
                    let _ = handle.emit("sync-progress", event);
                }
            } else {
                while let Some(_) = progress_rx.recv().await {}
            }
        });

        // Run the blocking file copy in a separate thread
        let bytes_copied = tokio::task::spawn_blocking(move || {
            copy_file_with_progress(
                &source_path_for_task,
                &actual_dest_for_task,
                &copy_options,
                move |copied, hash| {
                    if control_clone.is_cancelled() {
                        return false;
                    }

                    while control_clone.is_paused() {
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }

                    let elapsed = start_time.elapsed().as_secs_f64();
                    let speed = if elapsed > 0.0 {
                        (copied.saturating_sub(resume_offset)) as f64 / elapsed
                    } else {
                        0.0
                    };

                    let remaining_bytes = bytes_total.saturating_sub(copied);
                    let eta = if speed > 0.0 {
                        Some(remaining_bytes as f64 / speed)
                    } else {
                        None
                    };

                    if let Ok(state_arc) = state_manager_for_task.get_transfer(&transfer_id_for_cb) {
                        let mut state = state_arc.write();
                        state.status = TransferStatus::Running;
                        state.current_file = Some(source_path_clone.clone());
                        state.update_file_progress(&source_path_clone, copied, hash);
                        state.speed_bytes_per_sec = speed;
                        let _ = state_manager_for_task.save_state(&state);

                        let overall_progress = if state.total_bytes > 0 {
                            state.bytes_transferred as f64 / state.total_bytes as f64
                        } else {
                            0.0
                        };
                        let event = ProgressEvent {
                            transfer_id: transfer_id_for_cb.clone(),
                            current_file: current_file.clone(),
                            current_file_progress: copied as f64 / bytes_total as f64,
                            overall_progress,
                            bytes_copied: state.bytes_transferred,
                            bytes_total: state.total_bytes,
                            files_completed: state.files_completed,
                            files_total: state.total_files,
                            speed_bytes_per_sec: speed,
                            eta_seconds: eta,
                        };

                        let _ = progress_tx.blocking_send(event);
                    }

                    true
                },
            )
        })
        .await
        .map_err(|e| SyncError::Internal(e.to_string()))??;

        let _ = emit_task.await;

        let state_arc = state_manager.get_transfer(&transfer_id_string)?;
        {
            let mut state = state_arc.write();
            state.complete_file(&source_path);
            state_manager.save_state(&state)?;
        }

        if options.mode == SyncMode::Move {
            std::fs::remove_file(&source_path)?;
        }

        Ok(bytes_copied.saturating_sub(resume_offset))
    }

    fn emit_initial_progress(&self, transfer_id: &str, source_info: &DirectoryInfo) {
        if let Some(handle) = self.app_handle.as_ref() {
            let event = ProgressEvent {
                transfer_id: transfer_id.to_string(),
                current_file: String::new(),
                current_file_progress: 0.0,
                overall_progress: 0.0,
                bytes_copied: 0,
                bytes_total: source_info.total_size,
                files_completed: 0,
                files_total: source_info.file_count,
                speed_bytes_per_sec: 0.0,
                eta_seconds: None,
            };

            let _ = handle.emit("sync-progress", &event);
        }
    }
}
