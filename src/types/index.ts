// File and Sync Types
export interface FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: Date;
  status: FileStatus;
  progress?: number;
  error?: string;
}

export type FileStatus = 
  | 'pending'
  | 'syncing'
  | 'completed'
  | 'error'
  | 'skipped'
  | 'conflict';

export interface SyncOptions {
  overwriteNewer: boolean;
  overwriteOlder: boolean;
  skipExisting: boolean;
  deleteOrphans: boolean;
  preservePermissions: boolean;
  followSymlinks: boolean;
  dryRun: boolean;
  verifyChecksum: 'off' | 'during' | 'after' | 'both';
  autoRepair: boolean;
  shutdownAfterComplete: boolean;
  maxConcurrentFiles: number; // 1-8, for parallel file transfers
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

// Navigation
export type NavigationPage = 'sync' | 'history' | 'settings';
