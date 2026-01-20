// File and Sync Types

/**
 * Represents a file item in the sync queue.
 * 
 * IMPORTANT: Date Handling
 * - The backend sends dates as ISO 8601 strings (e.g., "2024-01-19T12:00:00Z")
 * - Always parse with `new Date(isoString)` when receiving from backend
 * - See useSync.ts `loadDirectoryStreaming` and `loadDirectoryInfo` for examples
 */
export interface FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  /** Parsed from ISO string received from backend. Always use `new Date(isoString)` when mapping. */
  modifiedAt: Date;
  status: FileStatus;
  progress?: number;
  error?: string;
}

/**
 * Helper to parse ISO date strings from backend to Date objects.
 * Use this when mapping backend responses to ensure consistent date handling.
 * @param isoString - ISO 8601 date string from backend
 * @returns Parsed Date object
 */
export function parseBackendDate(isoString: string): Date {
  return new Date(isoString);
}

export type FileStatus = 
  | 'pending'
  | 'syncing'
  | 'completed'
  | 'error'
  | 'skipped'
  | 'conflict';

export type FileExistsAction = 
  | 'replace-all'      // Always replace
  | 'replace-older'    // Only replace if destination is older
  | 'replace-different' // Replace if size OR date is different (catches incomplete files!)
  | 'skip'             // Never replace, skip existing
  | 'ask';             // Ask for each conflict

export interface SyncOptions {
  fileExistsAction: FileExistsAction;
  deleteOrphans: boolean;
  preservePermissions: boolean;
  followSymlinks: boolean;
  dryRun: boolean;
  /**
   * Checksum verification mode for data integrity:
   * - 'off': No verification (fastest, least safe)
   * - 'during': Verify each file immediately after copy (uses pre-copy source hash for race-condition safety)
   * - 'after': Verify all files after sync completes (good balance of speed and safety)
   * - 'both': Verify during AND after (most thorough, slowest)
   * 
   * Note: 'during' and 'both' modes now capture source hash BEFORE copy begins
   * to detect if source files are modified during the copy operation.
   */
  verifyChecksum: 'off' | 'during' | 'after' | 'both';
  autoRepair: boolean;
  shutdownAfterComplete: boolean;
  maxConcurrentFiles: number; // 1-8, for parallel file transfers
  excludePatterns: string[]; // Glob patterns for files to exclude (e.g., '.DS_Store', 'node_modules', '*.tmp')
  /** Bandwidth limit in bytes per second. 0 = unlimited */
  bandwidthLimit: number;
}

/** Preset bandwidth limits in bytes per second */
export const BANDWIDTH_PRESETS = {
  unlimited: 0,
  '1mbps': 125_000,      // 1 Mbps
  '5mbps': 625_000,      // 5 Mbps
  '10mbps': 1_250_000,   // 10 Mbps
  '50mbps': 6_250_000,   // 50 Mbps
  '100mbps': 12_500_000, // 100 Mbps
} as const;

export const DEFAULT_SYNC_OPTIONS: SyncOptions = {
  fileExistsAction: 'replace-different',  // Safest default: replace if size OR date differs (catches incomplete files)
  deleteOrphans: false,
  preservePermissions: true,
  followSymlinks: false,
  dryRun: false,
  verifyChecksum: 'off',
  autoRepair: true,
  shutdownAfterComplete: false,
  maxConcurrentFiles: 4, // Good default for SSDs and network drives
  excludePatterns: ['.DS_Store', 'Thumbs.db', '.git', 'node_modules'], // Common files/folders to exclude
  bandwidthLimit: 0, // No limit by default
};

/**
 * Preset exclusion patterns for common use cases.
 */
export const EXCLUDE_PATTERN_PRESETS = {
  system: ['.DS_Store', 'Thumbs.db', 'desktop.ini', '.Spotlight-V100', '.Trashes', 'ehthumbs.db'],
  development: ['node_modules', '.git', '.svn', '.hg', '__pycache__', '.venv', 'venv', 'target', 'build', 'dist'],
  temporary: ['*.tmp', '*.temp', '*.swp', '*.bak', '*~', '*.log'],
  ide: ['.idea', '.vscode', '*.sublime-*', '.project', '.classpath'],
} as const;

/**
 * Validates a glob pattern for syntax errors.
 * Returns null if valid, or an error message if invalid.
 * 
 * This is a frontend-only validation for quick feedback.
 * The backend also validates patterns before use.
 */
export function validateGlobPattern(pattern: string): string | null {
  if (!pattern || pattern.trim().length === 0) {
    return 'Pattern cannot be empty';
  }
  // Check for unbalanced brackets
  const openBrackets = (pattern.match(/\[/g) || []).length;
  const closeBrackets = (pattern.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    return 'Unbalanced brackets in pattern';
  }
  // Check for unbalanced braces
  const openBraces = (pattern.match(/\{/g) || []).length;
  const closeBraces = (pattern.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    return 'Unbalanced braces in pattern';
  }
  // Check for path traversal attempts
  if (pattern.includes('..')) {
    return 'Pattern cannot contain path traversal (..)';
  }
  // Check for absolute paths (security)
  if (pattern.startsWith('/')) {
    return 'Pattern cannot be an absolute path';
  }
  return null;
}

export interface ActiveFileTransfer {
  id: string;
  fileName: string;
  filePath: string;
  size: number;
  transferredBytes: number;
  progress: number; // 0-100
  speed: number; // bytes per second
}

export interface TransferStats {
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  currentSpeed: number; // bytes per second
  averageSpeed: number;
  startTime: Date | null;
  estimatedTimeRemaining: number | null; // seconds
  currentFile: string | null;
  currentFiles: string[]; // For parallel transfers - multiple files being copied
  activeTransfers: ActiveFileTransfer[]; // Individual file progress for parallel transfers
}

export interface ConflictInfo {
  id: string;
  file: FileItem;
  sourceModified: Date;
  destModified: Date;
  sourceSize: number;
  destSize: number;
}

export type ConflictResolution = 
  | 'keep-source'
  | 'keep-dest'
  | 'keep-both'
  | 'skip';

export interface TransferHistoryItem {
  id: string;
  sourcePath: string;
  destPath: string;
  filesCount: number;
  totalSize: number;
  duration: number; // seconds
  status: 'completed' | 'cancelled' | 'error';
  timestamp: Date;
  errorMessage?: string; // Optional error message when status is 'error'
}

// Theme Types
export type ThemeMode = 'light' | 'dark' | 'oled' | 'system';

// Settings Types
export interface Settings {
  theme: ThemeMode;
  language: 'en' | 'nl';
  autoStart: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
  confirmBeforeSync: boolean;
  preventSleepDuringTransfer: boolean;
  rememberLastDestination: boolean;
  lastDestinationPath: string | null;
  /** Recent destination paths, ordered newest first (max 10) */
  recentDestinations: string[];
  defaultSyncOptions: SyncOptions;
}

// Sync State
export type SyncState = 
  | 'idle'
  | 'preparing'
  | 'syncing'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

// Tray Status - for system tray icon/tooltip
export type TrayStatus = 'idle' | 'syncing' | 'paused' | 'error';

// Transfer Queue
export type TransferQueueStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

export interface TransferQueueItem {
  id: string;
  sourcePath: string;
  destPath: string;
  status: TransferQueueStatus;
  error?: string;
  addedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// Sync Profiles
export interface SyncProfile {
  id: string;
  name: string;
  sourcePath: string;
  destPath: string;
  options: SyncOptions;
  createdAt: Date;
  lastUsed: Date | null;
}

/** Maximum number of sync profiles allowed */
export const MAX_SYNC_PROFILES = 20;

/**
 * Scheduled sync configuration.
 * Supports one-time and recurring schedules.
 */
export interface ScheduledSync {
  id: string;
  profileId: string; // Links to a SyncProfile
  enabled: boolean;
  /** Schedule type */
  type: 'once' | 'daily' | 'weekly' | 'monthly';
  /** Time of day to run (HH:MM in 24h format) */
  time: string;
  /** For 'weekly': 0=Sunday, 1=Monday, etc. */
  dayOfWeek?: number;
  /** For 'monthly': 1-31 */
  dayOfMonth?: number;
  /** For 'once': specific date */
  date?: string; // ISO date string
  /** Last run timestamp */
  lastRun: Date | null;
  /** Next scheduled run */
  nextRun: Date | null;
  createdAt: Date;
}

/** Maximum number of scheduled syncs allowed */
export const MAX_SCHEDULED_SYNCS = 10;

// Volume/Drive Info
export interface VolumeInfo {
  name: string;
  mount_point: string;
  is_external: boolean;
  is_removable: boolean;
  drive_type: 'SSD' | 'HDD' | 'Network' | 'Unknown';
  manufacturer: string | null;
  model: string | null;
  total_space: number;
  available_space: number;
}

// Volume Watcher Types (for drive disconnect detection)

/**
 * Detailed volume information from the volume watcher.
 * This provides real-time volume status for sync operations.
 */
export interface WatchedVolumeInfo {
  /** Mount point path (e.g., "/Volumes/MyDrive" or "D:\") */
  mountPoint: string;
  /** Display name of the volume */
  name: string;
  /** Total capacity in bytes */
  totalBytes: number;
  /** Available space in bytes */
  availableBytes: number;
  /** Whether this is a removable/external drive */
  isRemovable: boolean;
  /** Filesystem type (e.g., "apfs", "ntfs", "ext4") */
  fsType: string | null;
  /** Whether the volume is currently mounted and accessible */
  isMounted: boolean;
}

/**
 * Volume event types emitted by the backend volume watcher.
 * Subscribe to these via Tauri's event listener.
 */
export type VolumeEventType = 'mounted' | 'unmounted' | 'unmountPending' | 'inaccessible';

/**
 * Volume mounted event payload.
 */
export interface VolumeEventMounted {
  type: 'mounted';
  volume: WatchedVolumeInfo;
}

/**
 * Volume unmounted event payload.
 */
export interface VolumeEventUnmounted {
  type: 'unmounted';
  mountPoint: string;
  name: string;
  /** Transfer IDs affected by this disconnection */
  affectedTransfers: string[];
}

/**
 * Volume about to unmount event payload.
 */
export interface VolumeEventUnmountPending {
  type: 'unmountPending';
  mountPoint: string;
  name: string;
}

/**
 * Volume became inaccessible event payload.
 */
export interface VolumeEventInaccessible {
  type: 'inaccessible';
  mountPoint: string;
  name: string;
  error: string;
}

/**
 * Union type for all volume events.
 */
export type VolumeEvent = 
  | VolumeEventMounted 
  | VolumeEventUnmounted 
  | VolumeEventUnmountPending 
  | VolumeEventInaccessible;

// Navigation
export type NavigationPage = 'sync' | 'history' | 'settings';

// Verification Error Types

/**
 * Reason codes for verification errors.
 * Used for displaying user-friendly error information in the UI.
 */
export type VerificationErrorReason = 
  | 'checksum_mismatch'       // Hash of destination doesn't match source
  | 'file_missing'            // Destination file doesn't exist after copy
  | 'permission_denied'       // Can't read source or destination for verification
  | 'disk_full'               // Disk ran out of space during copy
  | 'source_modified'         // Source file was modified during copy (race condition)
  | 'unknown';                // Unclassified error

/**
 * Verification error display type for the VerificationErrorModal.
 * This is a simplified view of verification errors optimized for UI display.
 */
export interface VerificationErrorDisplay {
  /** File name without path */
  fileName: string;
  /** Full file path */
  filePath: string;
  /** Categorized reason for the error */
  reason: VerificationErrorReason;
  /** Whether this error can be retried */
  canRetry: boolean;
}

// ============================================================================
// Backend Transfer State Types
// These types mirror the Rust transfer_state.rs structures
// ============================================================================

/**
 * Status of a transfer or individual file transfer.
 * Maps to Rust's TransferStatus enum.
 */
export type TransferStatus = 
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * State of an individual file within a transfer.
 * Maps to Rust's FileTransferState struct.
 */
export interface FileTransferState {
  source_path: string;
  dest_path: string;
  total_bytes: number;
  bytes_transferred: number;
  last_block_hash: number | null;
  last_verified_offset: number;
  source_mtime: Date;
  status: TransferStatus;
  error: string | null;
}

/**
 * Complete state of a transfer operation.
 * Maps to Rust's TransferState struct.
 * 
 * Used for:
 * - Monitoring individual transfer progress
 * - Tracking parallel file transfers
 * - Resumable transfer state persistence
 */
export interface TransferState {
  id: string;
  source_path: string;
  dest_path: string;
  status: TransferStatus;
  total_bytes: number;
  bytes_transferred: number;
  total_files: number;
  files_completed: number;
  files_failed: number;
  files_skipped: number;
  files: Record<string, FileTransferState>;
  conflicts: string[];
  conflicts_resolved: number;
  started_at: Date;
  completed_at: Date | null;
  updated_at: Date;
  current_file: string | null;
  speed_bytes_per_sec: number;
  error: string | null;
}

// ============================================================================
// Backend Directory Types
// These types mirror the Rust file_ops.rs structures
// ============================================================================

/**
 * Information about a single file.
 * Maps to Rust's FileInfo struct.
 */
export interface FileInfo {
  path: string;
  size: number;
  modified: Date;
  is_dir: boolean;
  is_symlink: boolean;
}

/**
 * Complete directory information with file list.
 * Maps to Rust's DirectoryInfo struct.
 * 
 * Used for:
 * - Getting total size estimates before sync
 * - Displaying directory contents
 */
export interface DirectoryInfo {
  path: string;
  total_size: number;
  file_count: number;
  dir_count: number;
  files: FileInfo[];
}

/**
 * Quick summary of a directory without file list.
 * Maps to Rust's DirectorySummary struct.
 * Used for fast UI feedback before full scan completes.
 */
export interface DirectorySummary {
  path: string;
  total_size: number;
  file_count: number;
  dir_count: number;
  scan_id: string;
}

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Type of notification for categorization and filtering.
 */
export type NotificationType = 
  | 'success'
  | 'error'
  | 'warning'
  | 'info';

/**
 * Category of notification for granular settings control.
 */
export type NotificationCategory = 
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'sync_paused'
  | 'sync_resumed'
  | 'conflict_detected'
  | 'verification_error'
  | 'disk_space_warning'
  | 'disk_space_critical'
  | 'drive_disconnected'
  | 'permission_error'
  | 'file_corruption'
  | 'schedule_triggered'
  | 'schedule_completed'
  | 'schedule_failed'
  | 'queue_item_completed'
  | 'queue_item_failed'
  | 'transfer_interrupted';

/**
 * In-app notification item with full details.
 * Stored in notification center for history.
 */
export interface AppNotification {
  /** Unique identifier */
  id: string;
  /** Notification type for styling */
  type: NotificationType;
  /** Category for filtering and settings */
  category: NotificationCategory;
  /** Short title (granny-friendly) */
  title: string;
  /** Detailed message explaining what happened */
  message: string;
  /** Technical details for power users (optional) */
  technicalDetails?: string;
  /** What the user can do to resolve (for errors/warnings) */
  actionHint?: string;
  /** How to prevent this in the future */
  preventionTip?: string;
  /** Related file path(s) if applicable */
  relatedPaths?: string[];
  /** When the notification was created */
  timestamp: Date;
  /** Whether the user has seen this notification */
  read: boolean;
  /** Whether to show as native OS notification too */
  showNative: boolean;
  /** Optional action button */
  action?: {
    label: string;
    /** Action identifier for handling */
    actionId: string;
  };
}

/**
 * Granular notification preferences.
 * Users can toggle each notification type independently.
 */
export interface NotificationPreferences {
  /** Master toggle for all notifications */
  enabled: boolean;
  /** Show native OS notifications */
  showNativeNotifications: boolean;
  /** Play sound with notifications */
  playSound: boolean;
  /** Per-category toggles */
  categories: {
    sync_started: boolean;
    sync_completed: boolean;
    sync_failed: boolean;
    sync_paused: boolean;
    sync_resumed: boolean;
    conflict_detected: boolean;
    verification_error: boolean;
    disk_space_warning: boolean;
    disk_space_critical: boolean;
    drive_disconnected: boolean;
    permission_error: boolean;
    file_corruption: boolean;
    schedule_triggered: boolean;
    schedule_completed: boolean;
    schedule_failed: boolean;
    queue_item_completed: boolean;
    queue_item_failed: boolean;
    transfer_interrupted: boolean;
  };
}

/**
 * Default notification preferences.
 * All important categories enabled by default.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  showNativeNotifications: true,
  playSound: true,
  categories: {
    sync_started: true,
    sync_completed: true,
    sync_failed: true,
    sync_paused: false,
    sync_resumed: false,
    conflict_detected: true,
    verification_error: true,
    disk_space_warning: true,
    disk_space_critical: true,
    drive_disconnected: true,
    permission_error: true,
    file_corruption: true,
    schedule_triggered: true,
    schedule_completed: true,
    schedule_failed: true,
    queue_item_completed: false,
    queue_item_failed: true,
    transfer_interrupted: true,
  },
};

/** Maximum number of notifications to keep in history */
export const MAX_NOTIFICATION_HISTORY = 100;
