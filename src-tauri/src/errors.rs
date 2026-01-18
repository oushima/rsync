//! Error types for the sync engine.

use thiserror::Error;

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
