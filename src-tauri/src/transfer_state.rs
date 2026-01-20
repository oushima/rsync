//! Transfer state management for resumable file transfers.

use chrono::{DateTime, Utc};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use uuid::Uuid;

use crate::errors::{SyncError, SyncResult};
use crate::file_ops::sync_parent_directory;

/// Size of each block for partial file verification: 256 KiB.
/// Used when resuming interrupted transfers to verify file integrity
/// by sampling blocks rather than re-hashing entire files.
const VERIFICATION_BLOCK_SIZE: u64 = 256 * 1024;

/// Number of blocks to verify at end of partially transferred files.
/// Verifying 4 blocks (1 MiB total) provides good confidence of integrity
/// while keeping verification fast for large files.
const BLOCKS_TO_VERIFY: u64 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferStatus {
    Pending,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTransferState {
    pub source_path: PathBuf,
    pub dest_path: PathBuf,
    pub total_bytes: u64,
    pub bytes_transferred: u64,
    pub last_block_hash: Option<u64>,
    pub last_verified_offset: u64,
    pub source_mtime: DateTime<Utc>,
    pub status: TransferStatus,
    pub error: Option<String>,
}

impl FileTransferState {
    pub fn new(source_path: PathBuf, dest_path: PathBuf, total_bytes: u64, mtime: DateTime<Utc>) -> Self {
        Self {
            source_path,
            dest_path,
            total_bytes,
            bytes_transferred: 0,
            last_block_hash: None,
            last_verified_offset: 0,
            source_mtime: mtime,
            status: TransferStatus::Pending,
            error: None,
        }
    }

    pub fn is_complete(&self) -> bool {
        self.bytes_transferred >= self.total_bytes
    }

    pub fn get_resume_offset(&self) -> u64 {
        if self.last_verified_offset > VERIFICATION_BLOCK_SIZE * BLOCKS_TO_VERIFY {
            self.last_verified_offset - (VERIFICATION_BLOCK_SIZE * BLOCKS_TO_VERIFY)
        } else {
            0
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferState {
    pub id: String,
    pub source_path: PathBuf,
    pub dest_path: PathBuf,
    pub status: TransferStatus,
    pub total_bytes: u64,
    pub bytes_transferred: u64,
    pub total_files: usize,
    pub files_completed: usize,
    pub files_failed: usize,
    pub files_skipped: usize,
    pub files: HashMap<PathBuf, FileTransferState>,
    pub conflicts: Vec<PathBuf>,
    /// Number of conflicts that have been resolved during this transfer
    pub conflicts_resolved: usize,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    pub current_file: Option<PathBuf>,
    pub speed_bytes_per_sec: f64,
    pub error: Option<String>,
}

impl TransferState {
    pub fn new(source_path: PathBuf, dest_path: PathBuf) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            source_path,
            dest_path,
            status: TransferStatus::Pending,
            total_bytes: 0,
            bytes_transferred: 0,
            total_files: 0,
            files_completed: 0,
            files_failed: 0,
            files_skipped: 0,
            files: HashMap::new(),
            conflicts: Vec::new(),
            conflicts_resolved: 0,
            started_at: now,
            completed_at: None,
            updated_at: now,
            current_file: None,
            speed_bytes_per_sec: 0.0,
            error: None,
        }
    }

    pub fn add_file(&mut self, file_state: FileTransferState) {
        self.total_bytes += file_state.total_bytes;
        self.total_files += 1;
        self.files.insert(file_state.source_path.clone(), file_state);
    }

    pub fn update_file_progress(&mut self, source_path: &Path, bytes_transferred: u64, last_block_hash: Option<u64>) {
        if let Some(file_state) = self.files.get_mut(source_path) {
            let delta = bytes_transferred.saturating_sub(file_state.bytes_transferred);
            file_state.bytes_transferred = bytes_transferred;
            file_state.last_verified_offset = bytes_transferred;
            file_state.last_block_hash = last_block_hash;
            self.bytes_transferred += delta;
            self.updated_at = Utc::now();
        }
    }

    pub fn complete_file(&mut self, source_path: &Path) {
        if let Some(file_state) = self.files.get_mut(source_path) {
            let remaining = file_state.total_bytes.saturating_sub(file_state.bytes_transferred);
            self.bytes_transferred += remaining;
            file_state.bytes_transferred = file_state.total_bytes;
            file_state.status = TransferStatus::Completed;
            self.files_completed += 1;
            self.updated_at = Utc::now();
        }
    }

    pub fn fail_file(&mut self, source_path: &Path, error: String) {
        if let Some(file_state) = self.files.get_mut(source_path) {
            file_state.status = TransferStatus::Failed;
            file_state.error = Some(error);
            self.files_failed += 1;
            self.updated_at = Utc::now();
        }
    }

    pub fn skip_file(&mut self, source_path: &Path) {
        if let Some(file_state) = self.files.get_mut(source_path) {
            file_state.status = TransferStatus::Completed;
            self.files_skipped += 1;
            self.updated_at = Utc::now();
        }
    }

    pub fn is_finished(&self) -> bool {
        matches!(
            self.status,
            TransferStatus::Completed | TransferStatus::Failed | TransferStatus::Cancelled
        )
    }

    pub fn progress_percent(&self) -> f64 {
        if self.total_bytes == 0 {
            return 100.0;
        }
        (self.bytes_transferred as f64 / self.total_bytes as f64) * 100.0
    }
}

pub struct TransferStateManager {
    states: RwLock<HashMap<String, Arc<RwLock<TransferState>>>>,
    state_dir: PathBuf,
}

impl TransferStateManager {
    pub fn new() -> SyncResult<Self> {
        let state_dir = Self::get_state_directory()?;
        std::fs::create_dir_all(&state_dir)?;

        let manager = Self {
            states: RwLock::new(HashMap::new()),
            state_dir,
        };

        // Clean up old state files before loading
        manager.cleanup_old_states(7)?;
        manager.load_persisted_states()?;
        Ok(manager)
    }

    fn get_state_directory() -> SyncResult<PathBuf> {
        let data_dir = dirs::data_local_dir()
            .ok_or_else(|| SyncError::Internal("Could not determine app data directory".into()))?;
        Ok(data_dir.join("rsync-app").join(".rsync-state"))
    }

    fn load_persisted_states(&self) -> SyncResult<()> {
        if !self.state_dir.exists() {
            return Ok(());
        }

        for entry in std::fs::read_dir(&self.state_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(state) = self.load_state_file(&path) {
                    if !state.is_finished() {
                        let mut states = self.states.write();
                        states.insert(state.id.clone(), Arc::new(RwLock::new(state)));
                    }
                }
            }
        }
        Ok(())
    }

    /// Removes state files older than the specified number of days.
    /// This helps prevent accumulation of old transfer state files.
    pub fn cleanup_old_states(&self, max_age_days: u64) -> SyncResult<()> {
        if !self.state_dir.exists() {
            return Ok(());
        }

        let max_age = std::time::Duration::from_secs(max_age_days * 24 * 60 * 60);
        let now = std::time::SystemTime::now();

        for entry in std::fs::read_dir(&self.state_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if !path.extension().map_or(false, |ext| ext == "json") {
                continue;
            }

            // Check if file is old enough to be cleaned up
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(age) = now.duration_since(modified) {
                        if age > max_age {
                            // Only remove finished transfer state files
                            if let Ok(state) = self.load_state_file(&path) {
                                if state.is_finished() {
                                    let _ = std::fs::remove_file(&path);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn load_state_file(&self, path: &Path) -> SyncResult<TransferState> {
        let content = std::fs::read_to_string(path)?;
        let state: TransferState = serde_json::from_str(&content)?;
        Ok(state)
    }

    fn get_state_file_path(&self, transfer_id: &str) -> PathBuf {
        self.state_dir.join(format!("{}.json", transfer_id))
    }

    pub fn persist_state(&self, state: &TransferState) -> SyncResult<()> {
        let state_file = self.get_state_file_path(&state.id);
        let temp_file = self.state_dir.join(format!("{}.tmp", state.id));

        let content = serde_json::to_string_pretty(state)?;
        std::fs::write(&temp_file, content)?;
        std::fs::rename(&temp_file, &state_file)?;
        
        // Sync parent directory to ensure the state file rename is durable.
        // We log but don't fail on sync errors - the file is renamed, just not
        // guaranteed durable on immediate power loss.
        if let Err(e) = sync_parent_directory(&state_file) {
            log::warn!("Parent directory sync failed for state file: {:?}", e);
        }

        Ok(())
    }

    pub fn save_state(&self, state: &TransferState) -> SyncResult<()> {
        self.persist_state(state)?;
        // Note: We don't update the in-memory state here because the caller
        // already holds the write lock on the Arc<RwLock<TransferState>>.
        // The caller is modifying the state directly, so our in-memory copy
        // is already up to date.
        Ok(())
    }

    pub fn get_state(&self, transfer_id: &str) -> SyncResult<TransferState> {
        let states = self.states.read();
        states
            .get(transfer_id)
            .map(|s| s.read().clone())
            .ok_or_else(|| SyncError::TransferNotFound(transfer_id.to_string()))
    }

    pub fn create_transfer(&self, source_path: PathBuf, dest_path: PathBuf) -> SyncResult<String> {
        let state = TransferState::new(source_path, dest_path);
        let transfer_id = state.id.clone();

        self.persist_state(&state)?;

        let mut states = self.states.write();
        states.insert(transfer_id.clone(), Arc::new(RwLock::new(state)));

        Ok(transfer_id)
    }

    pub fn get_transfer(&self, transfer_id: &str) -> SyncResult<Arc<RwLock<TransferState>>> {
        let states = self.states.read();
        states
            .get(transfer_id)
            .cloned()
            .ok_or_else(|| SyncError::TransferNotFound(transfer_id.to_string()))
    }

    pub fn get_active_transfers(&self) -> Vec<TransferState> {
        let states = self.states.read();
        states
            .values()
            .filter_map(|state| {
                let s = state.read();
                if !s.is_finished() {
                    Some(s.clone())
                } else {
                    None
                }
            })
            .collect()
    }

    /// Gets all interrupted transfers that can be resumed.
    /// These are transfers with status Paused, Failed, or Running (interrupted by app crash).
    /// Excludes Pending transfers as those haven't started yet.
    pub fn get_interrupted_transfers(&self) -> Vec<TransferState> {
        let states = self.states.read();
        states
            .values()
            .filter_map(|state| {
                let s = state.read();
                // Include paused, failed, or running (interrupted) transfers
                // that have made some progress
                match s.status {
                    TransferStatus::Paused | TransferStatus::Failed => Some(s.clone()),
                    TransferStatus::Running => {
                        // Running status without active control means it was interrupted
                        // (e.g., app crashed during transfer)
                        Some(s.clone())
                    }
                    TransferStatus::Pending if s.bytes_transferred > 0 => {
                        // Pending with progress means it was interrupted during startup
                        Some(s.clone())
                    }
                    _ => None,
                }
            })
            .collect()
    }

    pub fn remove_transfer(&self, transfer_id: &str) -> SyncResult<()> {
        {
            let mut states = self.states.write();
            states.remove(transfer_id);
        }

        let state_file = self.get_state_file_path(transfer_id);
        if state_file.exists() {
            std::fs::remove_file(state_file)?;
        }

        Ok(())
    }

    pub fn update_and_persist(&self, transfer_id: &str) -> SyncResult<()> {
        let state_arc = self.get_transfer(transfer_id)?;
        let state = state_arc.read();
        self.persist_state(&state)?;
        Ok(())
    }
}

impl Default for TransferStateManager {
    fn default() -> Self {
        Self::new().expect("Failed to create TransferStateManager")
    }
}
