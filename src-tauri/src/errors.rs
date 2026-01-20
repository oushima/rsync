//! Error types for the sync engine.
//! 
//! This module provides comprehensive error types for all sync operations,
//! with granular error categories for proper error handling and user-friendly
//! error messages.

use thiserror::Error;
use std::path::PathBuf;

/// Main error type for sync operations.
#[derive(Error, Debug)]
pub enum SyncError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Transfer not found: {0}")]
    TransferNotFound(String),

    #[error("Transfer already exists: {0}")]
    TransferAlreadyExists(String),

    #[error("Transfer cancelled: {0}")]
    TransferCancelled(String),

    #[error("Transfer paused: {0}")]
    TransferPaused(String),

    #[error("Source path does not exist: {0}")]
    SourceNotFound(String),

    #[error("Destination path is not writable: {0}")]
    DestinationNotWritable(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Hash verification failed for file: {0}")]
    HashMismatch(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Conflict detected: {0}")]
    Conflict(String),

    #[error("Operation timeout: {0}")]
    Timeout(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Incomplete scan: {0}")]
    IncompleteScan(String),

    // ========================================================================
    // NEW: Granular error types for disaster recovery and user messaging
    // ========================================================================

    /// Disk is full - not enough space to complete the operation
    #[error("Disk full: {path:?} (required: {required_bytes} bytes, available: {available_bytes} bytes)")]
    DiskFull {
        path: PathBuf,
        required_bytes: u64,
        available_bytes: u64,
    },

    /// External drive was disconnected during operation
    #[error("Drive disconnected: {path:?} (device was unexpectedly removed)")]
    DriveDisconnected {
        path: PathBuf,
        device_name: Option<String>,
    },

    /// File is locked by another process
    #[error("File locked: {path:?} (in use by another process, retry after: {retry_after_ms}ms)")]
    FileLocked {
        path: PathBuf,
        retry_after_ms: u64,
    },

    /// File was modified during the transfer
    #[error("File modified during transfer: {path:?} (source changed while copying)")]
    FileModifiedDuringTransfer {
        path: PathBuf,
        expected_mtime: u64,
        actual_mtime: u64,
    },

    /// Source file was modified during copy operation (race condition detected)
    /// This uses SystemTime for precise mtime comparison
    #[error("Source modified during copy: {path:?} (file changed while being copied - data integrity cannot be guaranteed)")]
    SourceModifiedDuringCopy {
        path: PathBuf,
        expected_mtime: std::time::SystemTime,
        actual_mtime: std::time::SystemTime,
    },

    /// Network operation timed out (for network drives)
    #[error("Network timeout: {path:?} (operation timed out after {timeout_secs}s)")]
    NetworkTimeout {
        path: PathBuf,
        timeout_secs: u64,
    },

    /// User quota exceeded on the destination
    #[error("Quota exceeded: {path:?} (user quota limit reached)")]
    QuotaExceeded {
        path: PathBuf,
    },

    /// Path is too long for the filesystem
    #[error("Path too long: {path:?} (exceeds filesystem limit of {max_length} characters)")]
    PathTooLong {
        path: PathBuf,
        max_length: usize,
    },

    /// Symbolic link loop detected
    #[error("Symlink loop detected: {path:?} (circular symbolic link reference)")]
    SymlinkLoop {
        path: PathBuf,
    },

    /// Transfer state file is corrupted
    #[error("Corrupted transfer state: {path:?} (state file is unreadable or invalid)")]
    CorruptedState {
        path: PathBuf,
    },

    /// File integrity check failed (generic)
    #[error("Integrity check failed: {path:?} (file may be corrupted: {reason})")]
    IntegrityCheckFailed {
        path: PathBuf,
        reason: String,
    },

    /// Partial file left behind from failed transfer
    #[error("Partial file detected: {path:?} (incomplete transfer from previous attempt)")]
    PartialFile {
        path: PathBuf,
        expected_size: u64,
        actual_size: u64,
    },

    /// Transfer was interrupted (power loss, crash, etc.)
    #[error("Transfer interrupted: {transfer_id} (can be resumed)")]
    TransferInterrupted {
        transfer_id: String,
        can_resume: bool,
        last_file: Option<String>,
    },
}

impl serde::Serialize for SyncError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Result type alias for sync operations.
pub type SyncResult<T> = Result<T, SyncError>;
