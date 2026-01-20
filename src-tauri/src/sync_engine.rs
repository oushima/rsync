//! Core sync engine for file synchronization.

use globset::{Glob, GlobSet, GlobSetBuilder};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Notify, Semaphore};
use walkdir::WalkDir;

use crate::errors::{SyncError, SyncResult};
use crate::file_ops::{
    copy_file_atomic, copy_file_with_progress, copy_symlink, cleanup_partial_files,
    detect_delta_detailed, generate_conflict_name, scan_directory_with_options, 
    CopyOptions, DeltaStatus, DirectoryInfo, FileInfo,
};
use crate::transfer_state::{
    FileTransferState, TransferState, TransferStateManager, TransferStatus,
};

/// Result of a directory scan operation, tracking any errors encountered
#[derive(Debug)]
pub struct ScanResult {
    pub info: DirectoryInfo,
    pub scan_complete: bool,
    pub scan_errors: Vec<String>,
}

impl ScanResult {
    pub fn new(info: DirectoryInfo) -> Self {
        Self {
            info,
            scan_complete: true,
            scan_errors: Vec::new(),
        }
    }

    pub fn with_errors(info: DirectoryInfo, errors: Vec<String>) -> Self {
        Self {
            info,
            scan_complete: errors.is_empty(),
            scan_errors: errors,
        }
    }

    pub fn is_complete(&self) -> bool {
        self.scan_complete && self.scan_errors.is_empty()
    }
}

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
    /// Glob patterns for files/directories to exclude
    #[serde(default)]
    pub exclude_patterns: Vec<String>,
    /// Bandwidth limit in bytes per second (0 = unlimited)
    #[serde(default)]
    pub bandwidth_limit: u64,
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
    /// Notifies waiting tasks when resume is called
    pub resume_notify: Notify,
}

impl TransferControl {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
            resume_notify: Notify::new(),
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
        self.resume_notify.notify_waiters();
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        // Also notify in case we're paused and waiting
        self.resume_notify.notify_waiters();
    }

    /// Wait efficiently for resume signal, with timeout fallback
    pub async fn wait_for_resume(&self) {
        while self.is_paused() && !self.is_cancelled() {
            // Use timeout to handle edge cases where notify might be missed
            tokio::time::timeout(
                std::time::Duration::from_millis(500),
                self.resume_notify.notified(),
            )
            .await
            .ok();
        }
    }
}

/// Resolved conflict information stored by the engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedConflict {
    pub conflict_id: String,
    pub resolution: ConflictResolutionAction,
    pub resolved_at: std::time::SystemTime,
}

/// The action taken to resolve a conflict, mapped from frontend resolution types.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConflictResolutionAction {
    KeepSource,
    KeepDest,
    KeepBoth,
    Skip,
}

pub struct SyncEngine {
    app_handle: Option<AppHandle>,
    state_manager: Arc<TransferStateManager>,
    controls: RwLock<HashMap<String, Arc<TransferControl>>>,
    /// Tracks resolved conflicts for the current session
    resolved_conflicts: RwLock<HashMap<String, ResolvedConflict>>,
}

impl SyncEngine {
    pub fn new(app_handle: Option<AppHandle>) -> SyncResult<Self> {
        Ok(Self {
            app_handle,
            state_manager: Arc::new(TransferStateManager::new()?),
            controls: RwLock::new(HashMap::new()),
            resolved_conflicts: RwLock::new(HashMap::new()),
        })
    }

    pub fn get_directory_info(&self, path: &Path) -> SyncResult<DirectoryInfo> {
        scan_directory_with_options(path, false)
    }

    pub fn get_active_transfers(&self) -> Vec<TransferState> {
        self.state_manager.get_active_transfers()
    }

    /// Gets all interrupted transfers that can be resumed.
    /// These are transfers with status Paused, Failed, or Running (interrupted).
    pub fn get_interrupted_transfers(&self) -> Vec<TransferState> {
        self.state_manager.get_interrupted_transfers()
    }

    /// Resumes an interrupted transfer from where it left off.
    /// This reloads the persisted state and continues the sync operation.
    pub async fn resume_interrupted_transfer(&self, transfer_id: &str) -> SyncResult<()> {
        // Get the persisted transfer state
        let state = self.state_manager.get_state(transfer_id)?;
        
        // Create default sync options from the persisted state
        let options = SyncOptions {
            source: state.source_path.clone(),
            destination: state.dest_path.clone(),
            mode: SyncMode::Copy,
            conflict_resolution: ConflictResolution::Skip, // Skip existing to resume
            verify_integrity: false,
            preserve_metadata: true,
            delete_orphans: false,
            buffer_size: None,
            dry_run: false,
            follow_symlinks: false,
            max_concurrent_files: 4,
            overwrite_newer: false,
            overwrite_older: false,
            skip_existing: false, // We use the persisted file state to determine what to skip
            exclude_patterns: Vec::new(),
            bandwidth_limit: 0,
        };
        
        // Resume the sync using the existing transfer ID
        self.resume_sync_with_state(transfer_id, options).await
    }

    /// Discards an interrupted transfer, removing its state from disk.
    pub fn discard_transfer(&self, transfer_id: &str) -> SyncResult<()> {
        // Remove from controls if it exists
        {
            let mut controls = self.controls.write();
            controls.remove(transfer_id);
        }
        
        // Remove the persisted state
        self.state_manager.remove_transfer(transfer_id)
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

    /// Resolves a file conflict with the user's chosen action.
    /// 
    /// This method is called from the frontend when a user makes a decision
    /// in the conflict resolution dialog. It records the resolution and
    /// optionally emits an event to notify other parts of the system.
    /// 
    /// # Arguments
    /// * `conflict_id` - Unique identifier for the conflict (typically a file path hash)
    /// * `resolution` - The resolution action chosen by the user
    /// * `transfer_id` - Optional transfer ID if the conflict is associated with an active transfer
    /// 
    /// # Returns
    /// * `Ok(())` if the conflict was successfully resolved
    /// * `Err(SyncError)` if there was an error recording the resolution
    pub async fn resolve_conflict(
        &self,
        conflict_id: &str,
        resolution: crate::FrontendConflictResolution,
        transfer_id: Option<&str>,
    ) -> SyncResult<()> {
        // Convert frontend resolution type to internal action type
        let action = match resolution {
            crate::FrontendConflictResolution::KeepSource => ConflictResolutionAction::KeepSource,
            crate::FrontendConflictResolution::KeepDest => ConflictResolutionAction::KeepDest,
            crate::FrontendConflictResolution::KeepBoth => ConflictResolutionAction::KeepBoth,
            crate::FrontendConflictResolution::Skip => ConflictResolutionAction::Skip,
        };

        // Record the resolution
        let resolved_conflict = ResolvedConflict {
            conflict_id: conflict_id.to_string(),
            resolution: action,
            resolved_at: std::time::SystemTime::now(),
        };

        {
            let mut resolved = self.resolved_conflicts.write();
            resolved.insert(conflict_id.to_string(), resolved_conflict.clone());
        }

        // Emit conflict resolution event for any listeners
        if let Some(handle) = self.app_handle.as_ref() {
            let event_payload = serde_json::json!({
                "conflictId": conflict_id,
                "resolution": action,
                "transferId": transfer_id,
            });
            
            if let Err(e) = handle.emit("conflict-resolved", &event_payload) {
                // Log but don't fail - the resolution was still recorded
                eprintln!("Warning: Failed to emit conflict-resolved event: {}", e);
            }
        }

        // If this is associated with an active transfer, we could update the transfer state
        // This allows the sync engine to continue processing if it was waiting for resolution
        if let Some(tid) = transfer_id {
            if let Ok(state_arc) = self.state_manager.get_transfer(tid) {
                let mut state = state_arc.write();
                // Mark that a conflict was resolved - this could be used to track resolution count
                state.conflicts_resolved = state.conflicts_resolved.saturating_add(1);
                let _ = self.state_manager.save_state(&state);
            }
        }

        Ok(())
    }

    /// Gets a resolved conflict by ID, if one exists.
    pub fn get_resolved_conflict(&self, conflict_id: &str) -> Option<ResolvedConflict> {
        let resolved = self.resolved_conflicts.read();
        resolved.get(conflict_id).cloned()
    }

    /// Clears all resolved conflicts (typically called when starting a new sync).
    pub fn clear_resolved_conflicts(&self) {
        let mut resolved = self.resolved_conflicts.write();
        resolved.clear();
    }

    /// Builds a compiled GlobSet from exclusion patterns for efficient matching.
    /// Returns None if there are no patterns or all patterns are invalid.
    fn build_exclude_matcher(patterns: &[String]) -> Option<GlobSet> {
        if patterns.is_empty() {
            return None;
        }

        let mut builder = GlobSetBuilder::new();
        let mut valid_count = 0;

        for pattern in patterns {
            // Build glob with case-insensitive matching for macOS/Windows compatibility
            let glob_result = Glob::new(pattern)
                .or_else(|_| {
                    // Try with **/ prefix for directory matching
                    Glob::new(&format!("**/{}", pattern))
                });

            if let Ok(glob) = glob_result {
                builder.add(glob);
                valid_count += 1;
            } else {
                eprintln!("Warning: Invalid glob pattern ignored: {}", pattern);
            }
        }

        if valid_count == 0 {
            return None;
        }

        builder.build().ok()
    }

    /// Checks if a file path should be excluded based on the compiled pattern set.
    fn should_exclude(path: &Path, matcher: Option<&GlobSet>) -> bool {
        let matcher = match matcher {
            Some(m) => m,
            None => return false,
        };

        // Check the full path
        if matcher.is_match(path) {
            return true;
        }

        // Also check just the file/folder name for patterns like ".DS_Store"
        if let Some(file_name) = path.file_name() {
            if matcher.is_match(file_name) {
                return true;
            }
        }

        // Check each path component for directory patterns like "node_modules"
        for component in path.components() {
            if let std::path::Component::Normal(name) = component {
                if matcher.is_match(name) {
                    return true;
                }
            }
        }

        false
    }

    pub async fn sync_files(
        &self,
        source_path: PathBuf,
        dest_path: PathBuf,
        mut options: SyncOptions,
    ) -> SyncResult<SyncResult_> {
        options.source = source_path.clone();
        options.destination = dest_path.clone();

        // Clean up any stale temp/partial files from previous failed syncs
        // This ensures we don't have leftover corrupt files and start clean
        if !options.dry_run && dest_path.exists() {
            if let Err(e) = cleanup_partial_files(&dest_path) {
                eprintln!("[Cleanup] Warning: Failed to clean partial files: {}", e);
                // Non-fatal - continue with sync
            }
        }

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

        // Perform scan with error tracking for safe orphan deletion
        let scan_result = self.scan_directory_with_error_tracking(&source_path, options.follow_symlinks)?;
        // Check completeness before moving info out
        let scan_complete = scan_result.is_complete();
        let scan_errors = scan_result.scan_errors;
        let source_info = scan_result.info;
        
        result.files_total = source_info.file_count;
        result.bytes_total = source_info.total_size;

        // Build exclusion pattern matcher (compiled once for efficiency)
        let exclude_matcher = Self::build_exclude_matcher(&options.exclude_patterns);

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
                // Skip excluded files from state tracking
                if Self::should_exclude(&file.path, exclude_matcher.as_ref()) {
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

        // Separate directories, symlinks, and regular files (applying exclusion filters)
        let mut dirs: Vec<&FileInfo> = Vec::new();
        let mut symlinks: Vec<&FileInfo> = Vec::new();
        let mut regular_files: Vec<&FileInfo> = Vec::new();
        let mut excluded_count: usize = 0;
        let mut excluded_bytes: u64 = 0;

        for file in &source_info.files {
            // Check if file should be excluded
            if Self::should_exclude(&file.path, exclude_matcher.as_ref()) {
                excluded_count += 1;
                if !file.is_dir {
                    excluded_bytes += file.size;
                }
                result.files_skipped += 1;
                continue;
            }

            if file.is_dir {
                dirs.push(file);
            } else if file.is_symlink && !options.follow_symlinks {
                symlinks.push(file);
            } else {
                regular_files.push(file);
            }
        }

        // Log exclusion stats if any files were excluded
        if excluded_count > 0 {
            eprintln!(
                "Excluded {} files/directories ({} bytes) based on patterns",
                excluded_count, excluded_bytes
            );
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

            // Wait efficiently for resume using Notify
            control.wait_for_resume().await;

            // Acquire semaphore permit for parallel file limiting
            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => {
                    // Semaphore was closed, likely during shutdown
                    eprintln!("[Sync] Semaphore closed, stopping sync");
                    break;
                }
            };
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
            match self.cleanup_orphans(&source_info, &dest_path, scan_complete, &scan_errors) {
                Ok(_) => {}
                Err(e) => {
                    // Don't fail the whole sync, but add to errors
                    result.errors.push(format!("Orphan cleanup skipped: {}", e));
                }
            }
        }

        self.set_status(&transfer_id, TransferStatus::Completed, None)?;
        result.duration_ms = start.elapsed().as_millis() as u64;
        Ok(result)
    }

    /// Resume an interrupted sync from its persisted state.
    /// This reuses the existing transfer ID and continues from where it left off.
    async fn resume_sync_with_state(
        &self,
        transfer_id: &str,
        mut options: SyncOptions,
    ) -> SyncResult<()> {
        let state_arc = self.state_manager.get_transfer(transfer_id)?;
        let (source_path, dest_path) = {
            let state = state_arc.read();
            (state.source_path.clone(), state.dest_path.clone())
        };

        options.source = source_path.clone();
        options.destination = dest_path.clone();

        // Validate paths still exist
        if !source_path.exists() {
            return Err(SyncError::SourceNotFound(source_path.display().to_string()));
        }

        // Create control for the resumed transfer
        let control = Arc::new(TransferControl::new());
        {
            let mut controls = self.controls.write();
            controls.insert(transfer_id.to_string(), control.clone());
        }

        // Update state to running
        {
            let mut state = state_arc.write();
            state.status = TransferStatus::Running;
            state.error = None;
            self.state_manager.save_state(&state)?;
        }

        // Re-scan source to get current file list
        let scan_result = self.scan_directory_with_error_tracking(&source_path, options.follow_symlinks)?;
        let source_info = scan_result.info;

        // Build exclusion pattern matcher
        let exclude_matcher = Self::build_exclude_matcher(&options.exclude_patterns);

        // Identify files that need to be transferred
        let files_to_transfer: Vec<&FileInfo> = source_info
            .files
            .iter()
            .filter(|file| {
                if file.is_dir {
                    return false;
                }
                if Self::should_exclude(&file.path, exclude_matcher.as_ref()) {
                    return false;
                }
                
                // Check if file was already completed in previous run
                let src = source_path.join(&file.path);
                let state = state_arc.read();
                if let Some(file_state) = state.files.get(&src) {
                    // Skip if already completed
                    if file_state.status == TransferStatus::Completed {
                        return false;
                    }
                }
                true
            })
            .collect();

        if files_to_transfer.is_empty() {
            // All files already transferred
            let mut state = state_arc.write();
            state.status = TransferStatus::Completed;
            self.state_manager.save_state(&state)?;
            return Ok(());
        }

        // Set up parallel processing
        let max_concurrent = options.max_concurrent_files.clamp(1, 8);
        let semaphore = Arc::new(Semaphore::new(max_concurrent));

        let files_copied = Arc::new(AtomicUsize::new(0));
        let files_failed = Arc::new(AtomicUsize::new(0));
        let bytes_copied_atomic = Arc::new(AtomicUsize::new(0));

        let mut handles = Vec::new();

        for file in files_to_transfer {
            if control.is_cancelled() {
                break;
            }

            let permit = semaphore.clone().acquire_owned().await.unwrap();
            let src_path = source_path.join(&file.path);
            let dst_path = dest_path.join(&file.path);
            let control_clone = control.clone();
            let state_arc_clone = state_arc.clone();
            let state_manager = self.state_manager.clone();
            let files_copied = files_copied.clone();
            let files_failed = files_failed.clone();
            let bytes_copied = bytes_copied_atomic.clone();
            let app_handle = self.app_handle.clone();
            let transfer_id_owned = transfer_id.to_string();
            let bandwidth_limit = options.bandwidth_limit;

            let handle = tokio::spawn(async move {
                let _permit = permit;

                // Handle pause
                while control_clone.is_paused() && !control_clone.is_cancelled() {
                    control_clone.wait_for_resume().await;
                }

                if control_clone.is_cancelled() {
                    return;
                }

                // Create parent directory if needed
                if let Some(parent) = dst_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }

                // Get resume offset from state
                let resume_offset = {
                    let state = state_arc_clone.read();
                    state.files.get(&src_path).map(|f| f.get_resume_offset()).unwrap_or(0)
                };

                let copy_options = CopyOptions {
                    preserve_metadata: true,
                    buffer_size: 256 * 1024,
                    verify_integrity: false, // Resume uses block-level verification
                    resume_offset,
                    bandwidth_limit,
                    pre_copy_source_hash: None,
                    source_mtime_before_copy: None,
                };

                match copy_file_with_progress(&src_path, &dst_path, &copy_options, |copied, _total| {
                    if let Some(handle) = &app_handle {
                        let _ = handle.emit("transfer_progress", serde_json::json!({
                            "transfer_id": &transfer_id_owned,
                            "file": src_path.display().to_string(),
                            "bytes_copied": copied,
                        }));
                    }
                    true // Continue the transfer
                }) {
                    Ok(bytes) => {
                        files_copied.fetch_add(1, Ordering::Relaxed);
                        bytes_copied.fetch_add(bytes as usize, Ordering::Relaxed);
                        
                        let mut state = state_arc_clone.write();
                        state.complete_file(&src_path);
                        let _ = state_manager.save_state(&state);
                    }
                    Err(e) => {
                        files_failed.fetch_add(1, Ordering::Relaxed);
                        
                        let mut state = state_arc_clone.write();
                        state.fail_file(&src_path, e.to_string());
                        let _ = state_manager.save_state(&state);
                    }
                }
            });

            handles.push(handle);
        }

        // Wait for all file transfers to complete
        for handle in handles {
            let _ = handle.await;
        }

        // Update final state
        {
            let mut state = state_arc.write();
            if control.is_cancelled() {
                state.status = TransferStatus::Cancelled;
                state.error = Some("Transfer cancelled by user".to_string());
            } else if state.files_failed > 0 {
                state.status = TransferStatus::Failed;
                state.error = Some(format!("{} files failed to transfer", state.files_failed));
            } else {
                state.status = TransferStatus::Completed;
            }
            self.state_manager.save_state(&state)?;
        }

        // Clean up controls
        {
            let mut controls = self.controls.write();
            controls.remove(transfer_id);
        }

        Ok(())
    }

    /// Scan a directory while tracking any errors encountered.
    /// This allows us to determine if the scan was complete for safe orphan deletion.
    fn scan_directory_with_error_tracking(
        &self,
        path: &Path,
        follow_symlinks: bool,
    ) -> SyncResult<ScanResult> {
        if !path.exists() {
            return Err(SyncError::SourceNotFound(path.display().to_string()));
        }

        if !path.is_dir() {
            return Err(SyncError::InvalidPath(format!(
                "{} is not a directory",
                path.display()
            )));
        }

        let mut total_size: u64 = 0;
        let mut file_count: usize = 0;
        let mut dir_count: usize = 0;
        let mut files = Vec::new();
        let mut scan_errors = Vec::new();

        for entry in WalkDir::new(path)
            .follow_links(follow_symlinks)
            .into_iter()
        {
            match entry {
                Ok(e) => {
                    let entry_path = e.path();
                    if entry_path == path {
                        continue;
                    }

                    match crate::file_ops::get_file_info(entry_path, path) {
                        Ok(info) => {
                            if info.is_dir {
                                dir_count += 1;
                            } else {
                                file_count += 1;
                                total_size += info.size;
                            }
                            files.push(info);
                        }
                        Err(e) => {
                            scan_errors.push(format!(
                                "Failed to get info for '{}': {}",
                                entry_path.display(),
                                e
                            ));
                        }
                    }
                }
                Err(e) => {
                    scan_errors.push(format!("Scan error: {}", e));
                }
            }
        }

        let info = DirectoryInfo {
            path: path.to_path_buf(),
            total_size,
            file_count,
            dir_count,
            files,
        };

        Ok(ScanResult::with_errors(info, scan_errors))
    }

    /// Clean up orphaned files in the destination that don't exist in the source.
    /// SAFETY: This will refuse to delete files if the source scan was incomplete
    /// to prevent accidental data loss.
    fn cleanup_orphans(
        &self,
        source_info: &DirectoryInfo,
        dest_root: &Path,
        scan_complete: bool,
        scan_errors: &[String],
    ) -> SyncResult<()> {
        // CRITICAL SAFETY CHECK: Do not delete orphans if the scan was incomplete
        // This prevents data loss if we couldn't fully scan the source
        if !scan_complete {
            let error_count = scan_errors.len();
            let error_preview: String = scan_errors
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("; ");
            
            return Err(SyncError::IncompleteScan(format!(
                "Orphan deletion skipped: source scan was incomplete ({} errors). \
                 First errors: {}. \
                 Re-run sync after resolving scan issues to safely delete orphans.",
                error_count,
                error_preview
            )));
        }

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

        // BULLETPROOF VERIFICATION: Capture source state BEFORE copy begins
        // This prevents race conditions where source changes during/after copy
        let (pre_copy_source_hash, source_mtime_before_copy) = if options.verify_integrity && resume_offset == 0 {
            // Only compute pre-copy hash for fresh copies (not resumes)
            // For resumes, we rely on block-level verification instead
            let mtime = std::fs::metadata(&source_path)
                .ok()
                .and_then(|m| m.modified().ok());
            let hash = crate::file_ops::compute_file_hash(&source_path).ok();
            (hash, mtime)
        } else {
            (None, None)
        };

        let copy_options = CopyOptions {
            buffer_size: options.buffer_size.unwrap_or(8 * 1024 * 1024),
            preserve_metadata: options.preserve_metadata,
            verify_integrity: options.verify_integrity,
            resume_offset,
            bandwidth_limit: options.bandwidth_limit,
            pre_copy_source_hash,
            source_mtime_before_copy,
        };

        // Log throttling configuration if enabled
        if options.bandwidth_limit > 0 {
            eprintln!(
                "[Throttle] Bandwidth limit active: {} bytes/sec for file: {}",
                options.bandwidth_limit,
                file.path.display()
            );
        }

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
        // Use atomic copy for new files (no resume), regular copy for resumes
        let use_atomic = resume_offset == 0;
        
        // Clone values needed by the progress callback
        let source_path_for_cb = source_path_clone.clone();
        let current_file_for_cb = current_file.clone();
        let transfer_id_for_cb2 = transfer_id_for_cb.clone();
        let state_manager_for_cb = state_manager_for_task.clone();
        
        // Progress callback that works for both atomic and resume modes
        let make_progress_callback = move || {
            let control = control_clone.clone();
            let source_path = source_path_for_cb.clone();
            let current_file = current_file_for_cb.clone();
            let transfer_id = transfer_id_for_cb2.clone();
            let state_manager = state_manager_for_cb.clone();
            let progress_tx = progress_tx.clone();
            
            move |copied: u64, hash: Option<u64>| {
                if control.is_cancelled() {
                    return false;
                }

                while control.is_paused() {
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

                if let Ok(state_arc) = state_manager.get_transfer(&transfer_id) {
                    let mut state = state_arc.write();
                    state.status = TransferStatus::Running;
                    state.current_file = Some(source_path.clone());
                    state.update_file_progress(&source_path, copied, hash);
                    state.speed_bytes_per_sec = speed;
                    let _ = state_manager.save_state(&state);

                    let overall_progress = if state.total_bytes > 0 {
                        state.bytes_transferred as f64 / state.total_bytes as f64
                    } else {
                        0.0
                    };
                    let event = ProgressEvent {
                        transfer_id: transfer_id.clone(),
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
            }
        };
        
        let bytes_copied = tokio::task::spawn_blocking(move || {
            // Choose atomic or regular copy based on whether we're resuming
            let callback = make_progress_callback();
            if use_atomic {
                copy_file_atomic(
                    &source_path_for_task,
                    &actual_dest_for_task,
                    &copy_options,
                    callback,
                )
            } else {
                // Resume mode - use regular copy with same progress callback
                let resume_callback = make_progress_callback();
                copy_file_with_progress(
                    &source_path_for_task,
                    &actual_dest_for_task,
                    &copy_options,
                    resume_callback,
                )
            }
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
