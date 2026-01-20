//! File operations for the sync engine.
//! 
//! This module provides safe, atomic file operations with proper error handling
//! for all edge cases including disk full, drive disconnection, and corruption.

use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, ErrorKind, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use xxhash_rust::xxh3::xxh3_64;

use crate::errors::{SyncError, SyncResult};

/// Buffer size for file copy operations: 8 MiB.
/// This size is optimized for modern SSD performance and minimizes syscall overhead
/// while keeping memory usage reasonable for parallel transfers.
pub const COPY_BUFFER_SIZE: usize = 8 * 1024 * 1024;

/// Buffer size for hash computation: 1 MiB.
/// Smaller than copy buffer to reduce memory pressure during verification
/// while still providing good hashing throughput.
pub const HASH_BUFFER_SIZE: usize = 1024 * 1024;

/// Time window for bandwidth throttling measurement in milliseconds.
/// Using 100ms provides responsive throttling while avoiding excessive sleep calls.
const THROTTLE_WINDOW_MS: u64 = 100;

/// Minimum sleep duration in microseconds to avoid busy-waiting overhead.
/// Sleeps shorter than this are counterproductive due to OS scheduling granularity.
const MIN_SLEEP_MICROS: u64 = 1000;

/// Value indicating unlimited bandwidth (no throttling).
pub const BANDWIDTH_UNLIMITED: u64 = 0;

/// Extension for temporary files during atomic copy operations.
const TEMP_FILE_EXTENSION: &str = ".rsync-tmp";

/// Extension for partial files that failed mid-transfer.
const PARTIAL_FILE_EXTENSION: &str = ".rsync-partial";

// ============================================================================
// Helper functions for atomic operations and error classification
// ============================================================================

/// Generate a temporary file path for atomic copy operations.
/// The temp file is in the same directory as the destination to ensure
/// atomic rename works (same filesystem).
pub fn get_temp_path(dest: &Path) -> PathBuf {
    let mut temp_name = dest.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    temp_name.push_str(TEMP_FILE_EXTENSION);
    dest.with_file_name(temp_name)
}

/// Generate a partial file path for marking incomplete transfers.
pub fn get_partial_path(dest: &Path) -> PathBuf {
    let mut partial_name = dest.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    partial_name.push_str(PARTIAL_FILE_EXTENSION);
    dest.with_file_name(partial_name)
}

/// Clean up temporary and partial files for a destination path.
/// Call this on failure to ensure no corrupt files are left behind.
pub fn cleanup_temp_files(dest: &Path) {
    let temp_path = get_temp_path(dest);
    let partial_path = get_partial_path(dest);
    
    if temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }
    if partial_path.exists() {
        let _ = fs::remove_file(&partial_path);
    }
}

/// Check available disk space at a path.
/// Returns (available_bytes, total_bytes).
#[cfg(unix)]
pub fn get_disk_space(path: &Path) -> SyncResult<(u64, u64)> {
    use std::ffi::CString;
    
    // Find the mount point by traversing up
    let mut check_path = path.to_path_buf();
    while !check_path.exists() {
        if let Some(parent) = check_path.parent() {
            check_path = parent.to_path_buf();
        } else {
            break;
        }
    }
    
    let c_path = CString::new(check_path.to_string_lossy().as_bytes())
        .map_err(|_| SyncError::InvalidPath(path.display().to_string()))?;
    
    unsafe {
        let mut stat: libc::statvfs = std::mem::zeroed();
        if libc::statvfs(c_path.as_ptr(), &mut stat) == 0 {
            let available = stat.f_bavail as u64 * stat.f_frsize as u64;
            let total = stat.f_blocks as u64 * stat.f_frsize as u64;
            Ok((available, total))
        } else {
            Err(SyncError::Io(std::io::Error::last_os_error()))
        }
    }
}

#[cfg(not(unix))]
pub fn get_disk_space(path: &Path) -> SyncResult<(u64, u64)> {
    // Windows implementation would go here
    // For now, return a placeholder that won't trigger disk full errors
    Ok((u64::MAX, u64::MAX))
}

/// Check if a path is on a removable/external drive.
#[cfg(target_os = "macos")]
pub fn is_external_drive(path: &Path) -> bool {
    // Check if the path is under /Volumes (external drives on macOS)
    path.starts_with("/Volumes")
}

#[cfg(not(target_os = "macos"))]
pub fn is_external_drive(_path: &Path) -> bool {
    false
}

/// Sync the parent directory to ensure durability after atomic rename.
/// This is critical for data integrity - the rename is only durable once
/// the parent directory's metadata is flushed to disk.
#[cfg(unix)]
pub fn sync_parent_directory(path: &Path) -> SyncResult<()> {
    use std::os::unix::io::AsRawFd;
    
    let parent = path.parent().ok_or_else(|| {
        SyncError::InvalidPath(format!("No parent directory for: {}", path.display()))
    })?;
    
    // Open the directory for reading (we just need the fd for fsync)
    let dir = fs::File::open(parent).map_err(|e| classify_io_error(e, parent))?;
    
    // fsync the directory to ensure the rename is durable
    dir.sync_all().map_err(|e| {
        // Log the error but don't fail the operation - the file is already renamed,
        // we just can't guarantee durability in case of immediate power loss
        log::warn!(
            "Failed to sync parent directory '{}': {}. File may not be durable on power loss.",
            parent.display(),
            e
        );
        classify_io_error(e, parent)
    })?;
    
    Ok(())
}

/// Sync the parent directory to ensure durability after atomic rename.
/// Windows implementation using FlushFileBuffers.
#[cfg(windows)]
pub fn sync_parent_directory(path: &Path) -> SyncResult<()> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::FlushFileBuffers;
    
    let parent = path.parent().ok_or_else(|| {
        SyncError::InvalidPath(format!("No parent directory for: {}", path.display()))
    })?;
    
    // Open the directory with FILE_FLAG_BACKUP_SEMANTICS to allow opening directories
    let dir = fs::OpenOptions::new()
        .read(true)
        .custom_flags(0x02000000) // FILE_FLAG_BACKUP_SEMANTICS
        .open(parent)
        .map_err(|e| classify_io_error(e, parent))?;
    
    // Flush the directory metadata
    let handle = dir.as_raw_handle();
    let result = unsafe { FlushFileBuffers(handle as isize) };
    
    if result == 0 {
        let err = std::io::Error::last_os_error();
        log::warn!(
            "Failed to sync parent directory '{}': {}. File may not be durable on power loss.",
            parent.display(),
            err
        );
        return Err(classify_io_error(err, parent));
    }
    
    Ok(())
}

/// Classify an IO error into a more specific SyncError for better user messaging.
pub fn classify_io_error(error: std::io::Error, path: &Path) -> SyncError {
    match error.kind() {
        ErrorKind::PermissionDenied => {
            SyncError::PermissionDenied(path.display().to_string())
        }
        ErrorKind::NotFound => {
            if is_external_drive(path) {
                SyncError::DriveDisconnected {
                    path: path.to_path_buf(),
                    device_name: path.iter().nth(2).map(|s| s.to_string_lossy().to_string()),
                }
            } else {
                SyncError::SourceNotFound(path.display().to_string())
            }
        }
        // Note: StorageFull was stabilized in Rust 1.79
        // For older Rust, we check the raw OS error
        _ => {
            // Check for disk full (ENOSPC on Unix, ERROR_DISK_FULL on Windows)
            if let Some(raw_error) = error.raw_os_error() {
                #[cfg(unix)]
                {
                    if raw_error == libc::ENOSPC {
                        if let Ok((available, _)) = get_disk_space(path) {
                            return SyncError::DiskFull {
                                path: path.to_path_buf(),
                                required_bytes: 0, // Unknown at this point
                                available_bytes: available,
                            };
                        }
                    }
                    if raw_error == libc::EBUSY {
                        return SyncError::FileLocked {
                            path: path.to_path_buf(),
                            retry_after_ms: 1000,
                        };
                    }
                    if raw_error == libc::EIO || raw_error == libc::ENODEV {
                        return SyncError::DriveDisconnected {
                            path: path.to_path_buf(),
                            device_name: None,
                        };
                    }
                    if raw_error == libc::ENAMETOOLONG {
                        return SyncError::PathTooLong {
                            path: path.to_path_buf(),
                            max_length: 255, // Common limit
                        };
                    }
                    if raw_error == libc::ELOOP {
                        return SyncError::SymlinkLoop {
                            path: path.to_path_buf(),
                        };
                    }
                    if raw_error == libc::EDQUOT {
                        return SyncError::QuotaExceeded {
                            path: path.to_path_buf(),
                        };
                    }
                }
            }
            SyncError::Io(error)
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: PathBuf,
    pub size: u64,
    pub modified: DateTime<Utc>,
    pub is_dir: bool,
    pub is_symlink: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryInfo {
    pub path: PathBuf,
    pub total_size: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub files: Vec<FileInfo>,
}

/// Summary of a directory without the file list (for fast initial response)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectorySummary {
    pub path: PathBuf,
    pub total_size: u64,
    pub file_count: usize,
    pub dir_count: usize,
    pub scan_id: String,
}

/// A chunk of files from a streaming directory scan
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChunk {
    pub scan_id: String,
    pub files: Vec<FileInfo>,
    pub chunk_index: usize,
    pub is_final: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DeltaStatus {
    New,
    Modified,
    Unchanged,
    Orphan,
}

/// Extended delta info with timestamp comparison
#[derive(Debug, Clone)]
pub struct DeltaInfo {
    pub status: DeltaStatus,
    pub source_newer: bool,
    pub source_older: bool,
    pub size_differs: bool,
}

#[derive(Debug, Clone)]
pub struct CopyOptions {
    pub buffer_size: usize,
    pub preserve_metadata: bool,
    pub verify_integrity: bool,
    pub resume_offset: u64,
    /// Bandwidth limit in bytes per second. 0 = unlimited.
    pub bandwidth_limit: u64,
    /// Pre-computed source hash for end-to-end verification.
    /// If provided, this hash is used instead of re-hashing the source after copy.
    /// This prevents race conditions where source changes during/after copy.
    pub pre_copy_source_hash: Option<u64>,
    /// Source modification time captured before copy started.
    /// Used to detect if source was modified during copy.
    pub source_mtime_before_copy: Option<std::time::SystemTime>,
}

impl Default for CopyOptions {
    fn default() -> Self {
        Self {
            buffer_size: COPY_BUFFER_SIZE,
            preserve_metadata: true,
            verify_integrity: false,
            resume_offset: 0,
            bandwidth_limit: BANDWIDTH_UNLIMITED,
            pre_copy_source_hash: None,
            source_mtime_before_copy: None,
        }
    }
}

pub fn compute_file_hash(path: &Path) -> SyncResult<u64> {
    // Use streaming hash computation to avoid loading entire file into memory
    // This is critical for large files to prevent memory exhaustion
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(HASH_BUFFER_SIZE, file);
    let mut buffer = vec![0u8; HASH_BUFFER_SIZE];
    let mut hasher = xxhash_rust::xxh3::Xxh3::new();

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hasher.digest())
}

pub fn compute_hash(data: &[u8]) -> u64 {
    xxh3_64(data)
}

pub fn get_file_info(path: &Path, base_path: &Path) -> SyncResult<FileInfo> {
    let metadata = fs::symlink_metadata(path)?;
    let relative_path = path
        .strip_prefix(base_path)
        .map_err(|_| SyncError::InvalidPath(format!("Cannot strip prefix from {:?}", path)))?
        .to_path_buf();

    let modified = metadata_to_datetime(&metadata)?;

    Ok(FileInfo {
        path: relative_path,
        size: metadata.len(),
        modified,
        is_dir: metadata.is_dir(),
        is_symlink: metadata.is_symlink(),
    })
}

pub fn metadata_to_datetime(metadata: &std::fs::Metadata) -> SyncResult<DateTime<Utc>> {
    let modified = metadata.modified()?;
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| SyncError::Internal(format!("Time error: {}", e)))?;

    Utc.timestamp_opt(duration.as_secs() as i64, duration.subsec_nanos())
        .single()
        .ok_or_else(|| SyncError::Internal("Invalid timestamp".into()))
}

pub fn scan_directory(path: &Path) -> SyncResult<DirectoryInfo> {
    scan_directory_with_options(path, false)
}

pub fn scan_directory_with_options(path: &Path, follow_symlinks: bool) -> SyncResult<DirectoryInfo> {
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

    for entry in walkdir::WalkDir::new(path)
        .follow_links(follow_symlinks)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let entry_path = entry.path();
        if entry_path == path {
            continue;
        }

        if let Ok(info) = get_file_info(entry_path, path) {
            if info.is_dir {
                dir_count += 1;
            } else {
                file_count += 1;
                total_size += info.size;
            }
            files.push(info);
        }
    }

    Ok(DirectoryInfo {
        path: path.to_path_buf(),
        total_size,
        file_count,
        dir_count,
        files,
    })
}

/// Streaming directory scan - returns an iterator over file chunks
/// This allows processing files as they're discovered without loading all into memory
pub struct DirectoryScanner {
    walker: walkdir::IntoIter,
    base_path: PathBuf,
    chunk_size: usize,
}

impl DirectoryScanner {
    pub fn new(path: &Path, follow_symlinks: bool, chunk_size: usize) -> SyncResult<Self> {
        if !path.exists() {
            return Err(SyncError::SourceNotFound(path.display().to_string()));
        }

        if !path.is_dir() {
            return Err(SyncError::InvalidPath(format!(
                "{} is not a directory",
                path.display()
            )));
        }

        let base_path = path.to_path_buf();
        let walker = walkdir::WalkDir::new(path)
            .follow_links(follow_symlinks)
            .into_iter();

        Ok(Self {
            walker,
            base_path,
            chunk_size,
        })
    }

    /// Get the next chunk of files
    pub fn next_chunk(&mut self) -> Option<Vec<FileInfo>> {
        let mut files = Vec::with_capacity(self.chunk_size);
        
        while let Some(entry_result) = self.walker.next() {
            if let Ok(entry) = entry_result {
                // Skip the root directory itself
                if entry.path() == self.base_path {
                    continue;
                }
                
                if let Ok(info) = get_file_info(entry.path(), &self.base_path) {
                    files.push(info);
                    if files.len() >= self.chunk_size {
                        break;
                    }
                }
            }
        }

        if files.is_empty() {
            None
        } else {
            Some(files)
        }
    }
}

/// Quick scan that only returns summary (file count, total size) without file list
/// This is extremely fast even for multi-TB directories
pub fn quick_scan_directory(path: &Path) -> SyncResult<DirectorySummary> {
    quick_scan_directory_with_options(path, false, None)
}

pub fn quick_scan_directory_with_options(
    path: &Path, 
    follow_symlinks: bool,
    scan_id: Option<String>,
) -> SyncResult<DirectorySummary> {
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

    for entry in walkdir::WalkDir::new(path)
        .follow_links(follow_symlinks)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let entry_path = entry.path();
        if entry_path == path {
            continue;
        }

        if let Ok(metadata) = fs::symlink_metadata(entry_path) {
            if metadata.is_dir() {
                dir_count += 1;
            } else {
                file_count += 1;
                total_size += metadata.len();
            }
        }
    }

    Ok(DirectorySummary {
        path: path.to_path_buf(),
        total_size,
        file_count,
        dir_count,
        scan_id: scan_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
    })
}

pub fn detect_delta(source: &FileInfo, dest_path: &Path) -> SyncResult<DeltaStatus> {
    let info = detect_delta_detailed(source, dest_path)?;
    Ok(info.status)
}

/// Detect delta with detailed timestamp comparison info
pub fn detect_delta_detailed(source: &FileInfo, dest_path: &Path) -> SyncResult<DeltaInfo> {
    let dest_file = dest_path.join(&source.path);

    if !dest_file.exists() {
        return Ok(DeltaInfo {
            status: DeltaStatus::New,
            source_newer: true,
            source_older: false,
            size_differs: false,
        });
    }

    let dest_metadata = fs::metadata(&dest_file)?;
    let dest_modified = metadata_to_datetime(&dest_metadata)?;
    let dest_size = dest_metadata.len();

    let source_newer = source.modified > dest_modified;
    let source_older = source.modified < dest_modified;
    let size_differs = source.size != dest_size;

    if size_differs || source_newer {
        return Ok(DeltaInfo {
            status: DeltaStatus::Modified,
            source_newer,
            source_older,
            size_differs,
        });
    }

    Ok(DeltaInfo {
        status: DeltaStatus::Unchanged,
        source_newer,
        source_older,
        size_differs,
    })
}

pub fn copy_file_with_progress<F>(
    source: &Path,
    dest: &Path,
    options: &CopyOptions,
    progress_callback: F,
) -> SyncResult<u64>
where
    F: Fn(u64, Option<u64>) -> bool,
{
    let src_file = File::open(source)?;
    let src_metadata = src_file.metadata()?;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut dest_file = if options.resume_offset > 0 {
        fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(false)
            .open(dest)?
    } else {
        File::create(dest)?
    };

    let mut reader = BufReader::with_capacity(options.buffer_size, src_file);
    let mut writer = BufWriter::with_capacity(options.buffer_size, &mut dest_file);

    if options.resume_offset > 0 {
        reader.seek(SeekFrom::Start(options.resume_offset))?;
        writer.seek(SeekFrom::Start(options.resume_offset))?;
    }

    let mut buffer = vec![0u8; options.buffer_size];
    let mut bytes_copied = options.resume_offset;

    // Bandwidth throttling state
    let throttle_enabled = options.bandwidth_limit > BANDWIDTH_UNLIMITED;
    let mut window_start = Instant::now();
    let mut window_bytes: u64 = 0;
    let throttle_window = Duration::from_millis(THROTTLE_WINDOW_MS);
    
    // Calculate bytes allowed per throttle window
    let bytes_per_window = if throttle_enabled {
        (options.bandwidth_limit as f64 * (THROTTLE_WINDOW_MS as f64 / 1000.0)) as u64
    } else {
        0 // Not used when throttling is disabled
    };

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }

        writer.write_all(&buffer[..bytes_read])?;
        bytes_copied += bytes_read as u64;
        
        // Apply bandwidth throttling if enabled
        if throttle_enabled {
            window_bytes += bytes_read as u64;
            
            // Check if we've exceeded the rate limit for this window
            if window_bytes >= bytes_per_window {
                let elapsed = window_start.elapsed();
                
                if elapsed < throttle_window {
                    // Calculate how long to sleep to maintain the target rate
                    let sleep_duration = throttle_window.saturating_sub(elapsed);
                    
                    // Only sleep if it's worth it (avoid micro-sleeps)
                    if sleep_duration.as_micros() >= MIN_SLEEP_MICROS as u128 {
                        std::thread::sleep(sleep_duration);
                    }
                }
                
                // Reset the window
                window_start = Instant::now();
                window_bytes = 0;
            }
        }

        let should_continue = progress_callback(bytes_copied, Some(compute_hash(&buffer[..bytes_read])));
        if !should_continue {
            return Err(SyncError::TransferCancelled("Transfer cancelled by user".into()));
        }
    }

    writer.flush()?;
    drop(writer);

    dest_file.sync_all()?;

    if options.preserve_metadata {
        let permissions = src_metadata.permissions();
        let _ = fs::set_permissions(dest, permissions);
        let _ = filetime::set_file_mtime(
            dest,
            filetime::FileTime::from_system_time(src_metadata.modified()?),
        );
    }

    if options.verify_integrity {
        // RACE CONDITION CHECK: Verify source wasn't modified during copy
        // by comparing current mtime with mtime captured before copy started
        if let Some(expected_mtime) = options.source_mtime_before_copy {
            let current_mtime = fs::metadata(source)?.modified()?;
            if current_mtime != expected_mtime {
                return Err(SyncError::SourceModifiedDuringCopy {
                    path: source.to_path_buf(),
                    expected_mtime,
                    actual_mtime: current_mtime,
                });
            }
        }

        // END-TO-END VERIFICATION: Use pre-computed source hash if available
        // This prevents the race condition where source changes after copy but before hash
        let src_hash = match options.pre_copy_source_hash {
            Some(hash) => hash,
            None => {
                // Fallback: compute source hash now (less safe, but backwards compatible)
                compute_file_hash(source)?
            }
        };
        
        let dest_hash = compute_file_hash(dest)?;
        if src_hash != dest_hash {
            return Err(SyncError::HashMismatch(dest.display().to_string()));
        }
    }

    Ok(bytes_copied)
}

/// Atomically copy a file using a temporary file and rename.
/// 
/// This ensures that the destination file is either:
/// 1. Complete and valid, or
/// 2. Does not exist at all
/// 
/// No partial/corrupt files will be left behind.
/// 
/// # Arguments
/// * `source` - Source file path
/// * `dest` - Destination file path  
/// * `options` - Copy options
/// * `progress_callback` - Callback for progress updates
/// 
/// # Returns
/// Number of bytes copied on success
pub fn copy_file_atomic<F>(
    source: &Path,
    dest: &Path,
    options: &CopyOptions,
    progress_callback: F,
) -> SyncResult<u64>
where
    F: Fn(u64, Option<u64>) -> bool,
{
    // For resume operations, we can't use atomic copy (need to append to existing file)
    if options.resume_offset > 0 {
        return copy_file_with_progress(source, dest, options, progress_callback);
    }
    
    // Pre-check: verify we have enough disk space
    let src_metadata = fs::metadata(source)
        .map_err(|e| classify_io_error(e, source))?;
    let file_size = src_metadata.len();
    
    if let Some(parent) = dest.parent() {
        if let Ok((available, _)) = get_disk_space(parent) {
            // Need file size plus some buffer for metadata
            let required = file_size + 4096;
            if available < required {
                return Err(SyncError::DiskFull {
                    path: dest.to_path_buf(),
                    required_bytes: required,
                    available_bytes: available,
                });
            }
        }
    }
    
    // Use a temp file in the same directory (for atomic rename)
    let temp_path = get_temp_path(dest);
    
    // Clean up any leftover temp files from previous failed attempts
    cleanup_temp_files(dest);
    
    // Create parent directory if needed
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| classify_io_error(e, parent))?;
    }
    
    // Copy to temp file
    let result = copy_file_with_progress(source, &temp_path, options, progress_callback);
    
    match result {
        Ok(bytes_copied) => {
            // Atomic rename: temp -> final destination
            // This is atomic on POSIX systems when on the same filesystem
            match fs::rename(&temp_path, dest) {
                Ok(_) => {
                    // Sync parent directory to ensure rename is durable on disk.
                    // We log but don't fail on sync errors - the file is already renamed,
                    // just not guaranteed durable on immediate power loss.
                    if let Err(e) = sync_parent_directory(dest) {
                        log::warn!("Parent directory sync failed after rename: {:?}", e);
                    }
                    Ok(bytes_copied)
                }
                Err(e) => {
                    // Clean up temp file on rename failure
                    let _ = fs::remove_file(&temp_path);
                    Err(classify_io_error(e, dest))
                }
            }
        }
        Err(e) => {
            // Clean up temp file on copy failure
            let _ = fs::remove_file(&temp_path);
            
            // Re-classify the error if it's a generic IO error
            match e {
                SyncError::Io(io_err) => Err(classify_io_error(io_err, dest)),
                other => Err(other),
            }
        }
    }
}

/// Check and clean up any partial files from previous failed transfers.
/// Call this before starting a new sync to ensure clean state.
pub fn cleanup_partial_files(directory: &Path) -> SyncResult<usize> {
    let mut cleaned = 0;
    
    if !directory.exists() {
        return Ok(0);
    }
    
    for entry in fs::read_dir(directory).map_err(|e| classify_io_error(e, directory))? {
        let entry = entry.map_err(|e| classify_io_error(e, directory))?;
        let path = entry.path();
        
        if path.is_dir() {
            // Recursively clean subdirectories
            cleaned += cleanup_partial_files(&path)?;
        } else if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            // Remove temp and partial files
            if name.ends_with(TEMP_FILE_EXTENSION) || name.ends_with(PARTIAL_FILE_EXTENSION) {
                if fs::remove_file(&path).is_ok() {
                    cleaned += 1;
                }
            }
        }
    }
    
    Ok(cleaned)
}

pub fn generate_conflict_name(path: &Path) -> PathBuf {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = path.extension().and_then(|s| s.to_str());
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");

    let new_name = match ext {
        Some(e) => format!("{}_{}.{}", stem, timestamp, e),
        None => format!("{}_{}", stem, timestamp),
    };

    path.with_file_name(new_name)
}

/// Copy a symlink to the destination, preserving it as a symlink.
/// If follow_symlinks is true, copies the target file instead.
pub fn copy_symlink(source: &Path, dest: &Path, follow_symlinks: bool) -> SyncResult<u64> {
    if follow_symlinks {
        // If following symlinks, copy the target file instead
        let target = fs::read_link(source)?;
        let resolved = if target.is_absolute() {
            target
        } else {
            source.parent().unwrap_or(Path::new(".")).join(&target)
        };
        
        if resolved.exists() {
            let options = CopyOptions::default();
            return copy_file_with_progress(&resolved, dest, &options, |_, _| true);
        } else {
            return Err(SyncError::SourceNotFound(format!(
                "Symlink target not found: {}",
                resolved.display()
            )));
        }
    }

    // Preserve the symlink
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }

    // Read the symlink target
    let target = fs::read_link(source)?;

    // Remove existing destination if it exists
    if dest.exists() || dest.symlink_metadata().is_ok() {
        let _ = fs::remove_file(dest);
    }

    // Create the symlink
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&target, dest)?;
    }
    #[cfg(windows)]
    {
        if target.is_dir() {
            std::os::windows::fs::symlink_dir(&target, dest)?;
        } else {
            std::os::windows::fs::symlink_file(&target, dest)?;
        }
    }

    Ok(0)
}

/// Information about a volume/drive
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: String,
    pub is_external: bool,
    pub is_removable: bool,
    pub drive_type: String,         // "SSD", "HDD", "Network", "Unknown"
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub total_space: u64,
    pub available_space: u64,
}

/// Get volume info for a given path
#[cfg(target_os = "macos")]
pub fn get_volume_info(path: &Path) -> SyncResult<VolumeInfo> {
    use std::process::Command;
    
    // Find the mount point for this path
    let mount_point = find_mount_point(path)?;
    let mount_str = mount_point.to_string_lossy().to_string();
    
    // Get volume name
    let name = mount_point
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| mount_str.clone());
    
    // Use diskutil to get info about the volume
    let output = Command::new("diskutil")
        .args(["info", &mount_str])
        .output();
    
    let mut is_external = false;
    let mut is_removable = false;
    let mut drive_type = "Unknown".to_string();
    let mut model: Option<String> = None;
    
    if let Ok(output) = output {
        let info = String::from_utf8_lossy(&output.stdout);
        
        for line in info.lines() {
            let line = line.trim();
            if line.starts_with("Removable Media:") {
                is_removable = line.contains("Removable");
            } else if line.starts_with("Protocol:") {
                if line.contains("USB") || line.contains("Thunderbolt") {
                    is_external = true;
                }
            } else if line.starts_with("Device Location:") {
                if line.contains("External") {
                    is_external = true;
                }
            } else if line.starts_with("Solid State:") {
                if line.contains("Yes") {
                    drive_type = "SSD".to_string();
                } else if line.contains("No") {
                    drive_type = "HDD".to_string();
                }
            } else if line.starts_with("Device / Media Name:") {
                model = line.split(':').nth(1).map(|s| s.trim().to_string());
            } else if line.starts_with("Media Type:") {
                // Alternative detection method
                let media = line.to_lowercase();
                if media.contains("ssd") || media.contains("solid") {
                    drive_type = "SSD".to_string();
                } else if media.contains("hdd") || media.contains("rotational") {
                    drive_type = "HDD".to_string();
                }
            }
        }
        
        // If drive_type is still Unknown, try to infer from model name
        if drive_type == "Unknown" {
            if let Some(ref m) = model {
                let model_lower = m.to_lowercase();
                if model_lower.contains("ssd") || model_lower.contains("solid") {
                    drive_type = "SSD".to_string();
                } else if model_lower.contains("hdd") || model_lower.contains("hard") {
                    drive_type = "HDD".to_string();
                }
            }
        }
    }
    
    // Try to get manufacturer from system_profiler for more detail
    let manufacturer = get_disk_manufacturer(&mount_str);
    
    // Get space info
    let (total_space, available_space) = get_volume_space(&mount_point)?;
    
    // Check if it's a network drive
    if mount_str.starts_with("/Volumes/") {
        // Check mount output for network filesystems
        if let Ok(output) = Command::new("mount").output() {
            let mounts = String::from_utf8_lossy(&output.stdout);
            for line in mounts.lines() {
                if line.contains(&mount_str) {
                    if line.contains("smbfs") || line.contains("nfs") || line.contains("afpfs") {
                        drive_type = "Network".to_string();
                        is_external = true;
                    }
                    break;
                }
            }
        }
    }
    
    Ok(VolumeInfo {
        name,
        mount_point: mount_str,
        is_external,
        is_removable,
        drive_type,
        manufacturer,
        model,
        total_space,
        available_space,
    })
}

#[cfg(target_os = "macos")]
fn find_mount_point(path: &Path) -> SyncResult<PathBuf> {
    use std::process::Command;
    
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    
    // Use df to find mount point
    let output = Command::new("df")
        .arg(&canonical)
        .output()
        .map_err(|e| SyncError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    // Parse df output - mount point is the last column
    if let Some(line) = output_str.lines().nth(1) {
        // Find the mount point (last field that starts with /)
        let parts: Vec<&str> = line.split_whitespace().collect();
        for part in parts.iter().rev() {
            if part.starts_with('/') {
                return Ok(PathBuf::from(part));
            }
        }
    }
    
    // Fallback: walk up the path to find /Volumes/X or /
    let mut current = canonical.as_path();
    while let Some(parent) = current.parent() {
        if parent == Path::new("/Volumes") || parent == Path::new("/") {
            return Ok(current.to_path_buf());
        }
        current = parent;
    }
    
    Ok(PathBuf::from("/"))
}

#[cfg(target_os = "macos")]
fn get_disk_manufacturer(mount_point: &str) -> Option<String> {
    use std::process::Command;
    
    // First, try to get info from diskutil
    let output = Command::new("diskutil")
        .args(["info", mount_point])
        .output()
        .ok()?;
    
    let info = String::from_utf8_lossy(&output.stdout);
    
    // Look for manufacturer patterns in diskutil output
    let manufacturers = [
        ("LaCie", "LaCie"),
        ("Seagate", "Seagate"),
        ("Western Digital", "WD"),
        ("WD", "WD"),
        ("Samsung", "Samsung"),
        ("SanDisk", "SanDisk"),
        ("Toshiba", "Toshiba"),
        ("Kingston", "Kingston"),
        ("Crucial", "Crucial"),
        ("G-Technology", "G-Tech"),
        ("HGST", "HGST"),
        ("Hitachi", "Hitachi"),
        ("Maxtor", "Maxtor"),
        ("PNY", "PNY"),
        ("ADATA", "ADATA"),
        ("Transcend", "Transcend"),
        ("OWC", "OWC"),
    ];
    
    // Check Device / Media Name and other fields
    for line in info.lines() {
        let line_upper = line.to_uppercase();
        for (pattern, display_name) in &manufacturers {
            if line_upper.contains(&pattern.to_uppercase()) {
                return Some(display_name.to_string());
            }
        }
    }
    
    // Try system_profiler for USB devices as fallback
    if let Ok(output) = Command::new("system_profiler")
        .args(["SPUSBDataType"])
        .output()
    {
        let usb_info = String::from_utf8_lossy(&output.stdout);
        for (pattern, display_name) in &manufacturers {
            if usb_info.contains(pattern) {
                return Some(display_name.to_string());
            }
        }
    }
    
    // Try Thunderbolt devices
    if let Ok(output) = Command::new("system_profiler")
        .args(["SPThunderboltDataType"])
        .output()
    {
        let tb_info = String::from_utf8_lossy(&output.stdout);
        for (pattern, display_name) in &manufacturers {
            if tb_info.contains(pattern) {
                return Some(display_name.to_string());
            }
        }
    }
    
    None
}

#[cfg(target_os = "macos")]
fn get_volume_space(mount_point: &Path) -> SyncResult<(u64, u64)> {
    use std::process::Command;
    
    // Use df command to get space info
    let output = Command::new("df")
        .args(["-k", &mount_point.to_string_lossy()])
        .output()
        .map_err(|e| SyncError::Io(e))?;
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    if let Some(line) = output_str.lines().nth(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        // df -k output: Filesystem 1K-blocks Used Available Capacity ...
        if parts.len() >= 4 {
            let total = parts[1].parse::<u64>().unwrap_or(0) * 1024;
            let available = parts[3].parse::<u64>().unwrap_or(0) * 1024;
            return Ok((total, available));
        }
    }
    
    Ok((0, 0))
}

#[cfg(not(target_os = "macos"))]
pub fn get_volume_info(path: &Path) -> SyncResult<VolumeInfo> {
    // Fallback for non-macOS platforms
    let mount_point = path.to_string_lossy().to_string();
    Ok(VolumeInfo {
        name: path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| mount_point.clone()),
        mount_point,
        is_external: false,
        is_removable: false,
        drive_type: "Unknown".to_string(),
        manufacturer: None,
        model: None,
        total_space: 0,
        available_space: 0,
    })
}
