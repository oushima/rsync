//! File operations for the sync engine.

use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use xxhash_rust::xxh3::xxh3_64;

use crate::errors::{SyncError, SyncResult};

pub const COPY_BUFFER_SIZE: usize = 8 * 1024 * 1024;
pub const HASH_BUFFER_SIZE: usize = 1024 * 1024;

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

#[derive(Debug, Clone, PartialEq)]
pub enum DeltaStatus {
    New,
    Modified,
    Unchanged,
    Orphan,
}

#[derive(Debug, Clone)]
pub struct CopyOptions {
    pub buffer_size: usize,
    pub preserve_metadata: bool,
    pub verify_integrity: bool,
    pub resume_offset: u64,
}

impl Default for CopyOptions {
    fn default() -> Self {
        Self {
            buffer_size: COPY_BUFFER_SIZE,
            preserve_metadata: true,
            verify_integrity: false,
            resume_offset: 0,
        }
    }
}

pub fn compute_file_hash(path: &Path) -> SyncResult<u64> {
    let file = File::open(path)?;
    let mut reader = BufReader::with_capacity(HASH_BUFFER_SIZE, file);
    let mut buffer = vec![0u8; HASH_BUFFER_SIZE];
    let mut all_data = Vec::new();

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        all_data.extend_from_slice(&buffer[..bytes_read]);
    }

    Ok(xxh3_64(&all_data))
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

pub fn detect_delta(source: &FileInfo, dest_path: &Path) -> SyncResult<DeltaStatus> {
    let dest_file = dest_path.join(&source.path);

    if !dest_file.exists() {
        return Ok(DeltaStatus::New);
    }

    let dest_metadata = fs::metadata(&dest_file)?;
    let dest_modified = metadata_to_datetime(&dest_metadata)?;
    let dest_size = dest_metadata.len();

    if source.size != dest_size || source.modified > dest_modified {
        return Ok(DeltaStatus::Modified);
    }

    Ok(DeltaStatus::Unchanged)
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

    loop {
        let bytes_read = reader.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }

        writer.write_all(&buffer[..bytes_read])?;
        bytes_copied += bytes_read as u64;

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
        let src_hash = compute_file_hash(source)?;
        let dest_hash = compute_file_hash(dest)?;
        if src_hash != dest_hash {
            return Err(SyncError::HashMismatch(dest.display().to_string()));
        }
    }

    Ok(bytes_copied)
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
