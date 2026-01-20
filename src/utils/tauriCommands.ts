/**
 * Type-safe Tauri command wrappers.
 * 
 * This module provides enterprise-level type safety for Tauri IPC calls,
 * with proper error handling and fallbacks for non-Tauri environments.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { logger, withTimeout, TIMEOUTS } from './logger';
import type { 
  TransferState, 
  DirectoryInfo,
  FileInfo 
} from '../types';

// ============================================================================
// Type Guards & Helpers
// ============================================================================

/**
 * Checks if we're running in a Tauri environment.
 * Returns false in browser/web-only mode.
 */
export function isTauriApp(): boolean {
  return isTauri();
}

/**
 * Safely invokes a Tauri command with timeout and error handling.
 * Returns null if the command fails or we're not in Tauri.
 */
async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
  timeout: number = TIMEOUTS.STANDARD
): Promise<T | null> {
  if (!isTauriApp()) {
    logger.debug(`[TauriCommands] Skipping ${command} - not in Tauri environment`);
    return null;
  }

  try {
    if (timeout > 0) {
      return await withTimeout(
        invoke<T>(command, args),
        timeout,
        `Tauri command: ${command}`
      );
    }
    return await invoke<T>(command, args);
  } catch (error) {
    logger.error(`[TauriCommands] ${command} failed:`, error);
    return null;
  }
}

// ============================================================================
// Transfer State Commands
// ============================================================================

/**
 * Gets the state of a specific transfer by ID.
 * 
 * @param transferId - The unique identifier of the transfer
 * @returns The transfer state, or null if not found/error
 * 
 * @example
 * ```typescript
 * const state = await getTransferState('abc-123');
 * if (state) {
 *   console.log(`Progress: ${state.bytes_transferred}/${state.total_bytes}`);
 * }
 * ```
 */
export async function getTransferState(transferId: string): Promise<TransferState | null> {
  const result = await safeInvoke<TransferState>('get_transfer_state', { transferId });
  return result ? parseTransferState(result) : null;
}

/**
 * Gets all active (non-completed) transfers.
 * Useful for monitoring parallel transfers in the UI.
 * 
 * @returns Array of active transfer states, or empty array on error
 * 
 * @example
 * ```typescript
 * const transfers = await getActiveTransfers();
 * console.log(`${transfers.length} transfers in progress`);
 * ```
 */
export async function getActiveTransfers(): Promise<TransferState[]> {
  const result = await safeInvoke<TransferState[]>('get_active_transfers');
  if (!result) return [];
  return result.map(parseTransferState);
}

// ============================================================================
// Interrupted/Resumable Transfer Commands
// ============================================================================

/**
 * Gets all interrupted transfers that can be resumed.
 * These are transfers that were started but not completed (paused, failed, or interrupted).
 * 
 * @returns Array of interrupted transfer states, or empty array on error
 * 
 * @example
 * ```typescript
 * const interrupted = await getInterruptedTransfers();
 * if (interrupted.length > 0) {
 *   showResumeDialog(interrupted);
 * }
 * ```
 */
export async function getInterruptedTransfers(): Promise<TransferState[]> {
  const result = await safeInvoke<TransferState[]>('get_interrupted_transfers');
  if (!result) return [];
  return result.map(parseTransferState);
}

/**
 * Resumes an interrupted transfer from where it left off.
 * The transfer will continue from the last verified offset.
 * 
 * @param transferId - The unique identifier of the transfer to resume
 * @returns true if resume was successful, false otherwise
 * 
 * @example
 * ```typescript
 * const success = await resumeInterruptedTransfer('abc-123');
 * if (success) {
 *   console.log('Transfer resumed');
 * }
 * ```
 */
export async function resumeInterruptedTransfer(transferId: string): Promise<boolean> {
  const result = await safeInvoke<boolean>(
    'resume_interrupted_transfer',
    { transferId },
    TIMEOUTS.LONG
  );
  return result ?? false;
}

/**
 * Discards an interrupted transfer, removing its state from disk.
 * Use this when the user decides not to resume a transfer.
 * 
 * @param transferId - The unique identifier of the transfer to discard
 * @returns true if discard was successful, false otherwise
 * 
 * @example
 * ```typescript
 * await discardTransfer('abc-123');
 * console.log('Transfer discarded');
 * ```
 */
export async function discardTransfer(transferId: string): Promise<boolean> {
  const result = await safeInvoke<boolean>('discard_transfer', { transferId });
  return result ?? false;
}

/**
 * Gets details about a specific interrupted transfer.
 * 
 * @param transferId - The unique identifier of the transfer
 * @returns The transfer state if found, null otherwise
 */
export async function getInterruptedTransferDetails(transferId: string): Promise<TransferState | null> {
  const result = await safeInvoke<TransferState>('get_transfer_state', { transferId });
  return result ? parseTransferState(result) : null;
}

/**
 * Parses raw transfer state from backend, converting date strings to Date objects.
 */
function parseTransferState(raw: TransferState): TransferState {
  return {
    ...raw,
    started_at: new Date(raw.started_at as unknown as string),
    completed_at: raw.completed_at ? new Date(raw.completed_at as unknown as string) : null,
    updated_at: new Date(raw.updated_at as unknown as string),
    // Convert file states map
    files: Object.fromEntries(
      Object.entries(raw.files).map(([key, value]) => [
        key,
        {
          ...value,
          source_mtime: new Date(value.source_mtime as unknown as string),
        },
      ])
    ),
  };
}

// ============================================================================
// Directory Info Commands
// ============================================================================

/**
 * Gets comprehensive directory information including file list.
 * Use for detailed directory analysis.
 * 
 * @param path - Absolute path to the directory
 * @returns Directory info with file list, or null on error
 * 
 * @example
 * ```typescript
 * const info = await getDirectoryInfo('/Users/me/Documents');
 * if (info) {
 *   console.log(`${info.file_count} files, ${info.total_size} bytes`);
 * }
 * ```
 */
export async function getDirectoryInfo(path: string): Promise<DirectoryInfo | null> {
  const result = await safeInvoke<DirectoryInfo>(
    'get_directory_info',
    { path },
    TIMEOUTS.LONG // Directory scanning can take a while
  );
  return result ? parseDirectoryInfo(result) : null;
}

/**
 * Parses raw directory info from backend.
 */
function parseDirectoryInfo(raw: DirectoryInfo): DirectoryInfo {
  return {
    ...raw,
    files: raw.files.map(parseFileInfo),
  };
}

/**
 * Parses a single file info object.
 */
function parseFileInfo(raw: FileInfo): FileInfo {
  return {
    ...raw,
    modified: new Date(raw.modified as unknown as string),
  };
}

// ============================================================================
// Power Management Commands
// ============================================================================

/**
 * Checks if sleep prevention is currently active.
 * Used to show indicator in UI when system is being kept awake.
 * 
 * @returns true if sleep is being prevented, false otherwise
 * 
 * @example
 * ```typescript
 * const isActive = await isPreventingSleep();
 * if (isActive) {
 *   showSleepPreventionIndicator();
 * }
 * ```
 */
export async function isPreventingSleep(): Promise<boolean> {
  const result = await safeInvoke<boolean>('is_preventing_sleep', undefined, TIMEOUTS.QUICK);
  return result ?? false;
}

/**
 * Prevents the system from sleeping.
 * 
 * @param reason - Human-readable reason for preventing sleep
 * @returns true if assertion was created successfully
 */
export async function preventSleep(reason: string): Promise<boolean> {
  const result = await safeInvoke<boolean>('prevent_sleep', { reason }, TIMEOUTS.QUICK);
  return result ?? false;
}

/**
 * Allows the system to sleep again.
 * 
 * @returns true if assertion was released successfully
 */
export async function allowSleep(): Promise<boolean> {
  const result = await safeInvoke<boolean>('allow_sleep', undefined, TIMEOUTS.QUICK);
  return result ?? false;
}

// ============================================================================
// Volume Watcher Commands
// ============================================================================

import type { WatchedVolumeInfo } from '../types';

/**
 * Gets all currently mounted volumes.
 * Useful for displaying available destinations and checking drive status.
 * 
 * @returns Array of mounted volumes with details
 * 
 * @example
 * ```typescript
 * const volumes = await getMountedVolumes();
 * const externals = volumes.filter(v => v.isRemovable);
 * ```
 */
export async function getMountedVolumes(): Promise<WatchedVolumeInfo[]> {
  const result = await safeInvoke<WatchedVolumeInfo[]>('get_mounted_volumes', undefined, TIMEOUTS.STANDARD);
  return result ?? [];
}

/**
 * Checks if a path is on a removable/external volume.
 * Use this to warn users before sync operations to external drives.
 * 
 * @param path - The path to check
 * @returns true if path is on a removable volume
 * 
 * @example
 * ```typescript
 * if (isOnRemovableVolume(destPath)) {
 *   showWarning('Destination is on an external drive');
 * }
 * ```
 */
export async function isOnRemovableVolume(path: string): Promise<boolean> {
  const result = await safeInvoke<boolean>('is_on_removable_volume', { path }, TIMEOUTS.QUICK);
  return result ?? false;
}

/**
 * Gets volume information for a specific path.
 * Returns details about the volume the path resides on.
 * 
 * @param path - The path to get volume info for
 * @returns Volume info if found, null otherwise
 * 
 * @example
 * ```typescript
 * const volume = await getPathVolumeInfo('/Volumes/Backup');
 * if (volume) {
 *   console.log(`${volume.name}: ${volume.availableBytes} bytes free`);
 * }
 * ```
 */
export async function getPathVolumeInfo(path: string): Promise<WatchedVolumeInfo | null> {
  return safeInvoke<WatchedVolumeInfo | null>('get_path_volume_info', { path }, TIMEOUTS.QUICK);
}

/**
 * Validates that source and destination volumes are accessible before starting sync.
 * Returns specific error messages for drive disconnection vs other issues.
 * 
 * @param source - Source path for the sync
 * @param destination - Destination path for the sync
 * @throws Error with descriptive message if validation fails
 * 
 * @example
 * ```typescript
 * try {
 *   await validateSyncVolumes(sourcePath, destPath);
 *   startSync();
 * } catch (error) {
 *   showError(error.message);
 * }
 * ```
 */
export async function validateSyncVolumes(source: string, destination: string): Promise<void> {
  if (!isTauriApp()) return;
  
  try {
    await invoke<void>('validate_sync_volumes', { source, destination });
  } catch (error) {
    throw new Error(String(error));
  }
}

/**
 * Checks if the volume for a given path is still accessible.
 * Use this during sync operations to detect disconnection.
 * 
 * @param path - The path to check
 * @returns true if volume is accessible, false if disconnected
 * 
 * @example
 * ```typescript
 * const isAccessible = await isVolumeAccessible(sourcePath);
 * if (!isAccessible) {
 *   pauseSync();
 *   showDisconnectWarning();
 * }
 * ```
 */
export async function isVolumeAccessible(path: string): Promise<boolean> {
  const result = await safeInvoke<boolean>('is_volume_accessible', { path }, TIMEOUTS.QUICK);
  return result ?? false;
}

// ============================================================================
// Polling Utilities
// ============================================================================

/**
 * Options for polling transfer states.
 */
export interface TransferPollingOptions {
  /** Polling interval in milliseconds (default: 1000) */
  intervalMs?: number;
  /** Callback when active transfers are updated */
  onUpdate: (transfers: TransferState[]) => void;
  /** Callback when polling encounters an error */
  onError?: (error: Error) => void;
}

/**
 * Creates a polling mechanism for monitoring active transfers.
 * Returns a cleanup function to stop polling.
 * 
 * @example
 * ```typescript
 * const stop = pollActiveTransfers({
 *   intervalMs: 500,
 *   onUpdate: (transfers) => setTransfers(transfers),
 *   onError: (err) => console.error(err),
 * });
 * 
 * // Later, when done:
 * stop();
 * ```
 */
export function pollActiveTransfers(options: TransferPollingOptions): () => void {
  const { intervalMs = 1000, onUpdate, onError } = options;
  let isRunning = true;

  const poll = async () => {
    while (isRunning) {
      try {
        const transfers = await getActiveTransfers();
        if (isRunning) {
          onUpdate(transfers);
        }
      } catch (error) {
        if (isRunning && onError) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      
      // Wait for next interval
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  // Start polling
  poll();

  // Return cleanup function
  return () => {
    isRunning = false;
  };
}

/**
 * Options for polling sleep prevention status.
 */
export interface SleepPollingOptions {
  /** Polling interval in milliseconds (default: 2000) */
  intervalMs?: number;
  /** Callback when status changes */
  onStatusChange: (isPreventing: boolean) => void;
}

/**
 * Creates a polling mechanism for monitoring sleep prevention status.
 * Returns a cleanup function to stop polling.
 */
export function pollSleepStatus(options: SleepPollingOptions): () => void {
  const { intervalMs = 2000, onStatusChange } = options;
  let isRunning = true;
  let lastStatus: boolean | null = null;

  const poll = async () => {
    while (isRunning) {
      const currentStatus = await isPreventingSleep();
      
      // Only notify on actual change
      if (isRunning && currentStatus !== lastStatus) {
        lastStatus = currentStatus;
        onStatusChange(currentStatus);
      }
      
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  };

  // Start polling
  poll();

  return () => {
    isRunning = false;
  };
}
