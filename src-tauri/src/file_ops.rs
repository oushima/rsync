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
