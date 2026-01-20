//! Volume/Drive disconnect detection module.
//!
//! This module monitors mounted volumes and detects when drives are disconnected
//! during sync operations. It provides cross-platform support with optimized
//! implementations for each OS.
//!
//! # macOS
//! Monitors `/Volumes` directory for changes using FSEvents (via notify crate).
//!
//! # Linux  
//! Monitors `/media`, `/mnt`, and `/run/media/$USER` directories.
//!
//! # Windows
//! Monitors drive letters and uses the sysinfo crate for disk enumeration.

use notify::{
    Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Result as NotifyResult, Watcher,
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::Disks;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::errors::{SyncError, SyncResult};

// ============================================================================
// Volume Information Types
// ============================================================================

/// Information about a mounted volume.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    /// The mount point path (e.g., "/Volumes/MyDrive" or "D:\")
    pub mount_point: PathBuf,
    /// Display name of the volume
    pub name: String,
    /// Total capacity in bytes
    pub total_bytes: u64,
    /// Available space in bytes
    pub available_bytes: u64,
    /// Whether this is a removable/external drive
    pub is_removable: bool,
    /// Filesystem type (e.g., "apfs", "ntfs", "ext4")
    pub fs_type: Option<String>,
    /// Whether the volume is currently mounted and accessible
    pub is_mounted: bool,
}

/// Event emitted when a volume state changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
pub enum VolumeEvent {
    /// A new volume was mounted
    Mounted { volume: VolumeInfo },
    /// A volume was unmounted/disconnected
    Unmounted {
        mount_point: PathBuf,
        name: String,
        /// Transfer IDs affected by this disconnection
        affected_transfers: Vec<String>,
    },
    /// A volume is about to be unmounted (if we can detect it)
    UnmountPending { mount_point: PathBuf, name: String },
    /// Volume became inaccessible (I/O error, but still technically mounted)
    Inaccessible {
        mount_point: PathBuf,
        name: String,
        error: String,
    },
}

// ============================================================================
// Volume Watcher Configuration
// ============================================================================

/// Configuration for the volume watcher.
#[derive(Debug, Clone)]
pub struct VolumeWatcherConfig {
    /// How often to poll for volume changes (fallback when events fail)
    pub poll_interval: Duration,
    /// Directories to watch for mount changes
    pub watch_paths: Vec<PathBuf>,
    /// Whether to emit events for internal/system volumes
    pub include_system_volumes: bool,
    /// Debounce duration for rapid mount/unmount events
    pub debounce_duration: Duration,
}

impl Default for VolumeWatcherConfig {
    fn default() -> Self {
        Self {
            poll_interval: Duration::from_secs(2),
            watch_paths: Self::default_watch_paths(),
            include_system_volumes: false,
            debounce_duration: Duration::from_millis(500),
        }
    }
}

impl VolumeWatcherConfig {
    /// Returns the default paths to watch based on the current OS.
    fn default_watch_paths() -> Vec<PathBuf> {
        #[cfg(target_os = "macos")]
        {
            vec![PathBuf::from("/Volumes")]
        }

        #[cfg(target_os = "linux")]
        {
            let mut paths = vec![
                PathBuf::from("/media"),
                PathBuf::from("/mnt"),
            ];
            // Add user-specific mount point
            if let Ok(user) = std::env::var("USER") {
                paths.push(PathBuf::from(format!("/run/media/{}", user)));
            }
            paths
        }

        #[cfg(target_os = "windows")]
        {
            // On Windows, we monitor drive letters via sysinfo
            vec![]
        }

        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
        {
            vec![]
        }
    }
}

// ============================================================================
// Active Transfer Tracking
// ============================================================================

/// Tracks which transfers are using which volumes.
#[derive(Debug, Default)]
struct TransferVolumeMap {
    /// Maps transfer ID to the volumes it's using (source and/or destination)
    transfer_to_volumes: HashMap<String, HashSet<PathBuf>>,
    /// Maps volume mount point to transfer IDs using it
    volume_to_transfers: HashMap<PathBuf, HashSet<String>>,
}

impl TransferVolumeMap {
    fn new() -> Self {
        Self::default()
    }

    /// Registers a transfer as using specific paths.
    /// Automatically determines which volumes the paths are on.
    fn register_transfer(&mut self, transfer_id: &str, paths: &[PathBuf], known_volumes: &[VolumeInfo]) {
        let mut volumes_used = HashSet::new();

        for path in paths {
            if let Some(volume) = Self::find_volume_for_path(path, known_volumes) {
                volumes_used.insert(volume.mount_point.clone());
                self.volume_to_transfers
                    .entry(volume.mount_point.clone())
                    .or_default()
                    .insert(transfer_id.to_string());
            }
        }

        self.transfer_to_volumes
            .insert(transfer_id.to_string(), volumes_used);
    }

    /// Unregisters a transfer (e.g., when completed or cancelled).
    fn unregister_transfer(&mut self, transfer_id: &str) {
        if let Some(volumes) = self.transfer_to_volumes.remove(transfer_id) {
            for volume in volumes {
                if let Some(transfers) = self.volume_to_transfers.get_mut(&volume) {
                    transfers.remove(transfer_id);
                    if transfers.is_empty() {
                        self.volume_to_transfers.remove(&volume);
                    }
                }
            }
        }
    }

    /// Gets all transfer IDs affected by a volume disconnection.
    fn get_affected_transfers(&self, mount_point: &Path) -> Vec<String> {
        self.volume_to_transfers
            .get(mount_point)
            .map(|set| set.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Finds which volume a path belongs to.
    fn find_volume_for_path<'a>(path: &Path, volumes: &'a [VolumeInfo]) -> Option<&'a VolumeInfo> {
        // Find the volume with the longest matching mount point prefix
        volumes
            .iter()
            .filter(|v| path.starts_with(&v.mount_point))
            .max_by_key(|v| v.mount_point.as_os_str().len())
    }
}

// ============================================================================
// Volume Watcher Implementation
// ============================================================================

/// Watches for volume mount/unmount events and notifies the sync engine.
pub struct VolumeWatcher {
    config: VolumeWatcherConfig,
    app_handle: Option<AppHandle>,
    /// Currently known mounted volumes
    known_volumes: Arc<RwLock<Vec<VolumeInfo>>>,
    /// Maps transfers to volumes they're using
    transfer_map: Arc<RwLock<TransferVolumeMap>>,
    /// Whether the watcher is running
    is_running: Arc<AtomicBool>,
    /// Channel to send stop signal
    stop_tx: Option<mpsc::Sender<()>>,
}

impl VolumeWatcher {
    /// Creates a new volume watcher with default configuration.
    pub fn new(app_handle: Option<AppHandle>) -> Self {
        Self::with_config(app_handle, VolumeWatcherConfig::default())
    }

    /// Creates a new volume watcher with custom configuration.
    pub fn with_config(app_handle: Option<AppHandle>, config: VolumeWatcherConfig) -> Self {
        Self {
            config,
            app_handle,
            known_volumes: Arc::new(RwLock::new(Vec::new())),
            transfer_map: Arc::new(RwLock::new(TransferVolumeMap::new())),
            is_running: Arc::new(AtomicBool::new(false)),
            stop_tx: None,
        }
    }

    /// Starts the volume watcher.
    /// Returns immediately; watching happens in background tasks.
    pub async fn start(&mut self) -> SyncResult<()> {
        if self.is_running.load(Ordering::SeqCst) {
            return Ok(());
        }

        // Initial volume scan
        let initial_volumes = Self::scan_volumes();
        *self.known_volumes.write() = initial_volumes.clone();

        self.is_running.store(true, Ordering::SeqCst);

        let (stop_tx, stop_rx) = mpsc::channel::<()>(1);
        self.stop_tx = Some(stop_tx);

        // Start the watching task
        let known_volumes = self.known_volumes.clone();
        let transfer_map = self.transfer_map.clone();
        let is_running = self.is_running.clone();
        let app_handle = self.app_handle.clone();
        let config = self.config.clone();

        tokio::spawn(async move {
            Self::watch_loop(
                config,
                known_volumes,
                transfer_map,
                is_running,
                app_handle,
                stop_rx,
            )
            .await;
        });

        Ok(())
    }

    /// Stops the volume watcher.
    pub async fn stop(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(()).await;
        }
    }

    /// Registers a transfer with the volume watcher.
    /// Call this when starting a sync operation.
    pub fn register_transfer(&self, transfer_id: &str, source: &Path, destination: &Path) {
        let volumes = self.known_volumes.read().clone();
        let mut map = self.transfer_map.write();
        map.register_transfer(
            transfer_id,
            &[source.to_path_buf(), destination.to_path_buf()],
            &volumes,
        );
    }

    /// Unregisters a transfer from the volume watcher.
    /// Call this when a sync operation completes, fails, or is cancelled.
    pub fn unregister_transfer(&self, transfer_id: &str) {
        let mut map = self.transfer_map.write();
        map.unregister_transfer(transfer_id);
    }

    /// Gets the current list of mounted volumes.
    pub fn get_volumes(&self) -> Vec<VolumeInfo> {
        self.known_volumes.read().clone()
    }

    /// Checks if a specific path's volume is still mounted and accessible.
    pub fn is_volume_accessible(&self, path: &Path) -> bool {
        let volumes = self.known_volumes.read();
        if let Some(volume) = TransferVolumeMap::find_volume_for_path(path, &volumes) {
            // Also verify the mount point is actually accessible
            volume.mount_point.exists() && Self::can_access_volume(&volume.mount_point)
        } else {
            // Path might be on root filesystem or unknown volume
            path.exists()
        }
    }

    /// Checks if a volume can be accessed (quick I/O check).
    fn can_access_volume(mount_point: &Path) -> bool {
        // Try to read the directory - this will fail quickly if disconnected
        match std::fs::read_dir(mount_point) {
            Ok(_) => true,
            Err(e) => {
                // EIO (5) or ENODEV (19) indicate device issues
                if let Some(errno) = e.raw_os_error() {
                    #[cfg(unix)]
                    {
                        if errno == libc::EIO || errno == libc::ENODEV {
                            return false;
                        }
                    }
                }
                // Permission denied is not a disconnect
                e.kind() != std::io::ErrorKind::PermissionDenied
            }
        }
    }

    /// Scans the system for currently mounted volumes.
    fn scan_volumes() -> Vec<VolumeInfo> {
        let disks = Disks::new_with_refreshed_list();
        
        disks
            .iter()
            .map(|disk| {
                let mount_point = disk.mount_point().to_path_buf();
                let name = disk.name().to_string_lossy().to_string();
                
                VolumeInfo {
                    mount_point: mount_point.clone(),
                    name: if name.is_empty() {
                        mount_point.file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_else(|| mount_point.display().to_string())
                    } else {
                        name
                    },
                    total_bytes: disk.total_space(),
                    available_bytes: disk.available_space(),
                    is_removable: disk.is_removable(),
                    fs_type: Some(disk.file_system().to_string_lossy().to_string()),
                    is_mounted: mount_point.exists(),
                }
            })
            .collect()
    }

    /// Main watching loop - combines filesystem events with polling.
    async fn watch_loop(
        config: VolumeWatcherConfig,
        known_volumes: Arc<RwLock<Vec<VolumeInfo>>>,
        transfer_map: Arc<RwLock<TransferVolumeMap>>,
        is_running: Arc<AtomicBool>,
        app_handle: Option<AppHandle>,
        mut stop_rx: mpsc::Receiver<()>,
    ) {
        // Set up filesystem watcher for immediate detection
        let (fs_tx, mut fs_rx) = mpsc::channel::<Event>(100);
        
        let _watcher = Self::setup_fs_watcher(&config, fs_tx);

        let mut poll_interval = tokio::time::interval(config.poll_interval);
        let mut last_event_time = Instant::now();

        while is_running.load(Ordering::SeqCst) {
            tokio::select! {
                // Stop signal received
                _ = stop_rx.recv() => {
                    break;
                }
                
                // Filesystem event received (fast path)
                Some(event) = fs_rx.recv() => {
                    // Debounce rapid events
                    if last_event_time.elapsed() < config.debounce_duration {
                        continue;
                    }
                    last_event_time = Instant::now();
                    
                    Self::handle_fs_event(
                        event,
                        &known_volumes,
                        &transfer_map,
                        app_handle.as_ref(),
                    ).await;
                }
                
                // Periodic poll (fallback, catches events we might miss)
                _ = poll_interval.tick() => {
                    Self::poll_volumes(
                        &known_volumes,
                        &transfer_map,
                        app_handle.as_ref(),
                    ).await;
                }
            }
        }
    }

    /// Sets up the filesystem watcher for the configured paths.
    fn setup_fs_watcher(
        config: &VolumeWatcherConfig,
        tx: mpsc::Sender<Event>,
    ) -> Option<RecommendedWatcher> {
        let watcher_config = Config::default()
            .with_poll_interval(Duration::from_secs(1))
            .with_compare_contents(false);

        let event_tx = tx.clone();
        let mut watcher = match notify::recommended_watcher(move |res: NotifyResult<Event>| {
            if let Ok(event) = res {
                let _ = event_tx.blocking_send(event);
            }
        }) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[VolumeWatcher] Failed to create watcher: {}", e);
                return None;
            }
        };

        if let Err(e) = watcher.configure(watcher_config) {
            eprintln!("[VolumeWatcher] Failed to configure watcher: {}", e);
        }

        for path in &config.watch_paths {
            if path.exists() {
                if let Err(e) = watcher.watch(path, RecursiveMode::NonRecursive) {
                    eprintln!("[VolumeWatcher] Failed to watch {:?}: {}", path, e);
                }
            }
        }

        Some(watcher)
    }

    /// Handles a filesystem event (creation/deletion in watch directories).
    async fn handle_fs_event(
        event: Event,
        known_volumes: &Arc<RwLock<Vec<VolumeInfo>>>,
        transfer_map: &Arc<RwLock<TransferVolumeMap>>,
        app_handle: Option<&AppHandle>,
    ) {
        match event.kind {
            EventKind::Create(_) => {
                // A new mount point appeared - rescan
                Self::poll_volumes(known_volumes, transfer_map, app_handle).await;
            }
            EventKind::Remove(_) => {
                // A mount point was removed - check what's gone
                for path in &event.paths {
                    Self::handle_potential_unmount(
                        path,
                        known_volumes,
                        transfer_map,
                        app_handle,
                    ).await;
                }
            }
            _ => {}
        }
    }

    /// Handles a potential volume unmount.
    async fn handle_potential_unmount(
        path: &Path,
        known_volumes: &Arc<RwLock<Vec<VolumeInfo>>>,
        transfer_map: &Arc<RwLock<TransferVolumeMap>>,
        app_handle: Option<&AppHandle>,
    ) {
        let (removed_volume, affected_transfers) = {
            let volumes = known_volumes.read();
            let map = transfer_map.read();

            // Find if this path matches a known volume
            if let Some(volume) = volumes.iter().find(|v| v.mount_point == path) {
                let affected = map.get_affected_transfers(&volume.mount_point);
                (Some(volume.clone()), affected)
            } else {
                (None, Vec::new())
            }
        };

        if let Some(volume) = removed_volume {
            // Update known volumes
            {
                let mut volumes = known_volumes.write();
                volumes.retain(|v| v.mount_point != volume.mount_point);
            }

            // Emit event
            let event = VolumeEvent::Unmounted {
                mount_point: volume.mount_point.clone(),
                name: volume.name.clone(),
                affected_transfers: affected_transfers.clone(),
            };

            Self::emit_event(app_handle, &event);

            // Log for debugging
            if !affected_transfers.is_empty() {
                eprintln!(
                    "[VolumeWatcher] Volume '{}' disconnected. Affected transfers: {:?}",
                    volume.name, affected_transfers
                );
            }
        }
    }

    /// Periodic poll to detect volume changes.
    async fn poll_volumes(
        known_volumes: &Arc<RwLock<Vec<VolumeInfo>>>,
        transfer_map: &Arc<RwLock<TransferVolumeMap>>,
        app_handle: Option<&AppHandle>,
    ) {
        let current_volumes = Self::scan_volumes();
        
        let (new_volumes, removed_volumes) = {
            let known = known_volumes.read();
            
            let known_mounts: HashSet<_> = known.iter().map(|v| &v.mount_point).collect();
            let current_mounts: HashSet<_> = current_volumes.iter().map(|v| &v.mount_point).collect();
            
            let new: Vec<_> = current_volumes
                .iter()
                .filter(|v| !known_mounts.contains(&v.mount_point))
                .cloned()
                .collect();
                
            let removed: Vec<_> = known
                .iter()
                .filter(|v| !current_mounts.contains(&v.mount_point))
                .cloned()
                .collect();
                
            (new, removed)
        };

        // Update known volumes
        *known_volumes.write() = current_volumes;

        // Emit events for new volumes
        for volume in new_volumes {
            let event = VolumeEvent::Mounted { volume };
            Self::emit_event(app_handle, &event);
        }

        // Emit events for removed volumes
        for volume in removed_volumes {
            let affected_transfers = {
                let map = transfer_map.read();
                map.get_affected_transfers(&volume.mount_point)
            };

            let event = VolumeEvent::Unmounted {
                mount_point: volume.mount_point,
                name: volume.name.clone(),
                affected_transfers: affected_transfers.clone(),
            };
            Self::emit_event(app_handle, &event);

            if !affected_transfers.is_empty() {
                eprintln!(
                    "[VolumeWatcher] Volume '{}' disconnected. Affected transfers: {:?}",
                    volume.name, affected_transfers
                );
            }
        }

        // Also check if existing volumes became inaccessible
        Self::check_volume_accessibility(known_volumes, transfer_map, app_handle).await;
    }

    /// Checks if known volumes are still accessible (catches I/O errors).
    async fn check_volume_accessibility(
        known_volumes: &Arc<RwLock<Vec<VolumeInfo>>>,
        transfer_map: &Arc<RwLock<TransferVolumeMap>>,
        app_handle: Option<&AppHandle>,
    ) {
        let volumes_to_check = {
            let volumes = known_volumes.read();
            let map = transfer_map.read();
            
            // Only check volumes that have active transfers
            volumes
                .iter()
                .filter(|v| !map.get_affected_transfers(&v.mount_point).is_empty())
                .cloned()
                .collect::<Vec<_>>()
        };

        for volume in volumes_to_check {
            if !Self::can_access_volume(&volume.mount_point) {
                let affected_transfers = {
                    let map = transfer_map.read();
                    map.get_affected_transfers(&volume.mount_point)
                };

                let event = VolumeEvent::Inaccessible {
                    mount_point: volume.mount_point.clone(),
                    name: volume.name.clone(),
                    error: "Volume is not accessible (possible disconnection or I/O error)".to_string(),
                };
                Self::emit_event(app_handle, &event);

                eprintln!(
                    "[VolumeWatcher] Volume '{}' became inaccessible. Affected transfers: {:?}",
                    volume.name, affected_transfers
                );
            }
        }
    }

    /// Emits a volume event to the frontend.
    fn emit_event(app_handle: Option<&AppHandle>, event: &VolumeEvent) {
        if let Some(handle) = app_handle {
            if let Err(e) = handle.emit("volume-event", event) {
                eprintln!("[VolumeWatcher] Failed to emit event: {}", e);
            }
        }
    }
}

// ============================================================================
// Helper Functions for Sync Integration
// ============================================================================

/// Checks if a path is on a removable/external volume.
/// Use this to warn users before starting sync to external drives.
pub fn is_on_removable_volume(path: &Path) -> bool {
    let disks = Disks::new_with_refreshed_list();
    
    for disk in disks.iter() {
        if path.starts_with(disk.mount_point()) {
            return disk.is_removable();
        }
    }
    
    // macOS-specific: anything under /Volumes is likely external
    #[cfg(target_os = "macos")]
    {
        if path.starts_with("/Volumes") {
            return true;
        }
    }
    
    false
}

/// Gets volume information for a specific path.
pub fn get_volume_for_path(path: &Path) -> Option<VolumeInfo> {
    let disks = Disks::new_with_refreshed_list();
    
    // Find the volume with the longest matching mount point
    disks
        .iter()
        .filter(|disk| path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| {
            let mount_point = disk.mount_point().to_path_buf();
            let name = disk.name().to_string_lossy().to_string();
            
            VolumeInfo {
                mount_point: mount_point.clone(),
                name: if name.is_empty() {
                    mount_point.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| mount_point.display().to_string())
                } else {
                    name
                },
                total_bytes: disk.total_space(),
                available_bytes: disk.available_space(),
                is_removable: disk.is_removable(),
                fs_type: Some(disk.file_system().to_string_lossy().to_string()),
                is_mounted: mount_point.exists(),
            }
        })
}

/// Validates that both source and destination volumes are accessible before sync.
/// Returns Ok(()) if both are accessible, or an appropriate SyncError.
pub fn validate_volumes_for_sync(source: &Path, destination: &Path) -> SyncResult<()> {
    // Check source
    if !source.exists() {
        if is_on_removable_volume(source) {
            return Err(SyncError::DriveDisconnected {
                path: source.to_path_buf(),
                device_name: get_volume_for_path(source).map(|v| v.name),
            });
        }
        return Err(SyncError::SourceNotFound(source.display().to_string()));
    }

    // Check destination parent (destination might not exist yet)
    let dest_check = if destination.exists() {
        destination.to_path_buf()
    } else {
        destination.parent().map(|p| p.to_path_buf()).unwrap_or_default()
    };

    if !dest_check.exists() {
        if is_on_removable_volume(&dest_check) {
            return Err(SyncError::DriveDisconnected {
                path: destination.to_path_buf(),
                device_name: get_volume_for_path(destination).map(|v| v.name),
            });
        }
        return Err(SyncError::DestinationNotWritable(destination.display().to_string()));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_volume_scan() {
        let volumes = VolumeWatcher::scan_volumes();
        // Should have at least one volume (root filesystem)
        assert!(!volumes.is_empty());
        
        // Root should be present
        #[cfg(unix)]
        {
            assert!(volumes.iter().any(|v| v.mount_point == PathBuf::from("/")));
        }
    }

    #[test]
    fn test_transfer_volume_map() {
        let mut map = TransferVolumeMap::new();
        let volumes = vec![
            VolumeInfo {
                mount_point: PathBuf::from("/Volumes/External"),
                name: "External".to_string(),
                total_bytes: 1000,
                available_bytes: 500,
                is_removable: true,
                fs_type: Some("apfs".to_string()),
                is_mounted: true,
            },
        ];

        map.register_transfer(
            "transfer-1",
            &[PathBuf::from("/Volumes/External/source")],
            &volumes,
        );

        let affected = map.get_affected_transfers(&PathBuf::from("/Volumes/External"));
        assert_eq!(affected, vec!["transfer-1"]);

        map.unregister_transfer("transfer-1");
        let affected = map.get_affected_transfers(&PathBuf::from("/Volumes/External"));
        assert!(affected.is_empty());
    }
}
