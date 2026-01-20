import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSyncStore } from '../stores/syncStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { FileItem, TransferQueueItem } from '../types';
import { logger, withTimeout, TIMEOUTS } from '../utils/logger';
import { showSyncCompletionNotification, showSyncErrorNotification } from '../utils/notifications';

interface BackendProgressEvent {
  transferId: string;
  currentFile: string;
  currentFileProgress: number;
  overallProgress: number;
  bytesCopied: number;
  bytesTotal: number;
  filesCompleted: number;
  filesTotal: number;
  speedBytesPerSec: number;
  etaSeconds: number | null;
}

/**
 * State for the shutdown countdown modal.
 */
interface ShutdownState {
  isOpen: boolean;
  isInitiating: boolean;
  error: string | null;
  isCancelled: boolean;
}

/**
 * Initial shutdown state - modal closed, no errors.
 */
const INITIAL_SHUTDOWN_STATE: ShutdownState = {
  isOpen: false,
  isInitiating: false,
  error: null,
  isCancelled: false,
};

const isTauriApp = () => isTauri();

/**
 * Batch size for parallel checksum verification.
 * This balances between I/O concurrency and not overwhelming the system.
 */
const VERIFICATION_BATCH_SIZE = 8;

/**
 * Timeout for individual file hash computation (30 seconds per file).
 * Large files may take longer, but this prevents indefinite hangs.
 */
const HASH_TIMEOUT_MS = 30000;

/**
 * Result of a single file verification
 */
interface FileVerificationResult {
  filePath: string;
  sourcePath: string;
  destPath: string;
  sourceChecksum: string;
  destChecksum: string;
  matches: boolean;
  error?: string;
}

/**
 * Computes a file hash with timeout protection.
 * Returns null if the operation fails or times out.
 */
async function computeFileHashSafe(path: string): Promise<string | null> {
  try {
    const result = await withTimeout(
      invoke<string>('hash_file', { path }),
      HASH_TIMEOUT_MS,
      `Hash computation for ${path}`
    );
    return result;
  } catch (error) {
    logger.error(`Failed to compute hash for ${path}:`, error);
    return null;
  }
}

/**
 * Verifies a batch of files by computing checksums for both source and destination.
 * Uses parallel processing for efficiency.
 * 
 * @param files - Array of file paths (relative to source/dest roots)
 * @param sourceRoot - Absolute path to source directory
 * @param destRoot - Absolute path to destination directory
 * @returns Array of verification results
 */
async function verifyFileBatch(
  files: Array<{ relativePath: string; size: number }>,
  sourceRoot: string,
  destRoot: string
): Promise<FileVerificationResult[]> {
  const results: FileVerificationResult[] = [];
  
  // Process files in parallel within the batch
  const verificationPromises = files.map(async ({ relativePath }) => {
    const sourcePath = `${sourceRoot}/${relativePath}`;
    const destPath = `${destRoot}/${relativePath}`;
    
    // Compute both checksums in parallel
    const [sourceChecksum, destChecksum] = await Promise.all([
      computeFileHashSafe(sourcePath),
      computeFileHashSafe(destPath),
    ]);
    
    // Handle hash computation failures
    if (sourceChecksum === null || destChecksum === null) {
      return {
        filePath: relativePath,
        sourcePath,
        destPath,
        sourceChecksum: sourceChecksum ?? 'COMPUTATION_FAILED',
        destChecksum: destChecksum ?? 'COMPUTATION_FAILED',
        matches: false,
        error: sourceChecksum === null 
          ? 'Failed to compute source checksum' 
          : 'Failed to compute destination checksum',
      };
    }
    
    return {
      filePath: relativePath,
      sourcePath,
      destPath,
      sourceChecksum,
      destChecksum,
      matches: sourceChecksum === destChecksum,
    };
  });
  
  const batchResults = await Promise.all(verificationPromises);
  results.push(...batchResults);
  
  return results;
}

export function useSync() {
  const {
    normalizedFiles,
    sourcePath,
    destPath,
    syncState,
    syncOptions,
    transferStats,
    transferId,
    transferQueue,
    setSourcePath,
    setDestPath,
    setFiles,
    appendFiles,
    removeFile,
    clearFiles,
    updateFileStatus,
    setSyncState,
    updateSyncOptions,
    updateTransferStats,
    setTransferId,
    startSync,
    pauseSync,
    resumeSync,
    cancelSync,
    reset,
    addHistoryItem,
    addToQueue,
    removeFromQueue,
    updateQueueItem,
    startNextTransfer,
    markTransferComplete,
    markTransferError,
    clearCompletedFromQueue,
    getNextPendingTransfer,
    getFiles,
    setIsScanning,
    setScanProgress,
    // Verification state
    addVerificationErrors,
    clearVerificationErrors,
    setIsVerifying,
    setVerificationProgress,
    verificationErrors,
    isVerifying,
    removeVerificationError,
    removeVerificationErrors,
    getRetryableVerificationErrors,
  } = useSyncStore();

  const { t } = useTranslation();

  // Derived values from normalized files
  const fileCount = normalizedFiles.ids.length;
  const files = getFiles(); // Get files array when needed

  // State for source missing error modal
  const [sourceMissingError, setSourceMissingError] = useState<{
    isOpen: boolean;
    queueItem: TransferQueueItem | null;
  }>({ isOpen: false, queueItem: null });

  // State for shutdown countdown modal
  const [shutdownState, setShutdownState] = useState<ShutdownState>(INITIAL_SHUTDOWN_STATE);

  const activeTransferRef = useRef<string | null>(transferId);
  const dialogDefaultPathRef = useRef<string | undefined>(undefined);
  const isProcessingQueueRef = useRef(false);
  useEffect(() => {
    activeTransferRef.current = transferId;
  }, [transferId]);

  // Create a pathToIdMap for O(1) lookup of file IDs by path
  const pathToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const id of normalizedFiles.ids) {
      const file = normalizedFiles.byId[id];
      if (file) {
        map.set(file.path, id);
      }
    }
    return map;
  }, [normalizedFiles]);

  // Keep a ref to the pathToIdMap for use in the event handler
  const pathToIdMapRef = useRef(pathToIdMap);
  useEffect(() => {
    pathToIdMapRef.current = pathToIdMap;
  }, [pathToIdMap]);

  useEffect(() => {
    if (!isTauriApp()) return;

    let isMounted = true;
    let unlisten: UnlistenFn | null = null;

    listen<BackendProgressEvent>('sync-progress', (event) => {
      // Guard: don't update state if unmounted
      if (!isMounted) return;

      const payload = event.payload;
      if (!payload) return;

      if (!activeTransferRef.current) {
        setTransferId(payload.transferId);
      }

      updateTransferStats({
        totalBytes: payload.bytesTotal,
        transferredBytes: payload.bytesCopied,
        completedFiles: payload.filesCompleted,
        totalFiles: payload.filesTotal,
        currentSpeed: payload.speedBytesPerSec,
        averageSpeed: payload.speedBytesPerSec,
        estimatedTimeRemaining: payload.etaSeconds,
        currentFile: payload.currentFile || null,
      });

      if (payload.currentFile) {
        // O(1) lookup using pathToIdMap
        let matchId = pathToIdMapRef.current.get(payload.currentFile);
        
        // Fallback: check if currentFile ends with any path (for relative paths)
        if (!matchId) {
          for (const [path, id] of pathToIdMapRef.current) {
            if (payload.currentFile.endsWith(path)) {
              matchId = id;
              break;
            }
          }
        }
        
        if (matchId) {
          updateFileStatus(matchId, 'syncing', Math.round(payload.currentFileProgress * 100));
        }
      }

      if (useSyncStore.getState().syncState === 'preparing') {
        setSyncState('syncing');
      }
    })
      .then((fn) => {
        // If component unmounted before promise resolved, immediately unlisten
        if (!isMounted) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error) => {
        console.error('Failed to listen for progress events:', error);
      });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [setSyncState, setTransferId, updateFileStatus, updateTransferStats]);

  /**
   * Event payload for conflict-resolved events from the backend.
   * Emitted when a file conflict is resolved via the sync engine.
   */
  interface ConflictResolvedEvent {
    /** Unique identifier for the conflict (typically the file path or hash) */
    conflictId: string;
    /** The resolution action that was applied */
    resolution: 'keep-source' | 'keep-dest' | 'keep-both' | 'skip';
    /** Optional transfer ID if associated with an active transfer */
    transferId: string | null;
  }

  // Listen for conflict-resolved events from the backend
  useEffect(() => {
    if (!isTauriApp()) return;

    let isMounted = true;
    let unlisten: UnlistenFn | null = null;

    listen<ConflictResolvedEvent>('conflict-resolved', (event) => {
      // Guard: don't update state if unmounted
      if (!isMounted) return;

      const payload = event.payload;
      if (!payload) {
        logger.warn('[ConflictResolved] Received event with no payload');
        return;
      }

      logger.debug('[ConflictResolved] Conflict resolved:', {
        conflictId: payload.conflictId,
        resolution: payload.resolution,
        transferId: payload.transferId,
      });

      // Find the file by conflict ID (which is typically the file path or path-based ID)
      // The conflictId may be a hash or the actual path, so we check both
      let matchId = pathToIdMapRef.current.get(payload.conflictId);

      // Fallback: check if conflictId ends with any known path
      if (!matchId) {
        for (const [path, id] of pathToIdMapRef.current) {
          if (payload.conflictId.endsWith(path) || path.endsWith(payload.conflictId)) {
            matchId = id;
            break;
          }
        }
      }

      if (matchId) {
        // Determine the new status based on resolution action
        let newStatus: FileItem['status'];
        switch (payload.resolution) {
          case 'keep-source':
          case 'keep-dest':
          case 'keep-both':
            // File was resolved and will be/was synced
            newStatus = 'completed';
            break;
          case 'skip':
            // File was skipped
            newStatus = 'skipped';
            break;
          default:
            // Fallback for unknown resolution types
            logger.warn(`[ConflictResolved] Unknown resolution type: ${payload.resolution}`);
            newStatus = 'completed';
        }

        updateFileStatus(matchId, newStatus);
        logger.debug(`[ConflictResolved] Updated file ${matchId} status to ${newStatus}`);
      } else {
        logger.warn(`[ConflictResolved] Could not find file for conflictId: ${payload.conflictId}`);
      }
    })
      .then((fn) => {
        // If component unmounted before promise resolved, immediately unlisten
        if (!isMounted) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error) => {
        logger.error('[ConflictResolved] Failed to listen for conflict-resolved events:', error);
      });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [updateFileStatus]);

  const joinPath = useCallback((base: string, rel: string) => {
    const normalized = rel.replace(/^[/\\]+/, '');
    return base.endsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
  }, []);

  /**
   * Performs post-transfer checksum verification on copied files.
   * Processes files in batches to avoid overwhelming the system.
   * 
   * @param copiedFiles - Array of files that were successfully copied
   * @param sourceRoot - Source directory path
   * @param destRoot - Destination directory path
   * @returns Object containing verification results and any errors found
   */
  const performVerification = useCallback(async (
    copiedFiles: Array<{ relativePath: string; size: number }>,
    sourceRoot: string,
    destRoot: string
  ): Promise<{
    totalVerified: number;
    totalErrors: number;
    errors: Array<{
      filePath: string;
      sourcePath: string;
      destPath: string;
      sourceChecksum: string;
      destChecksum: string;
      repairAttempted: boolean;
      repairSuccessful: boolean;
    }>;
  }> => {
    if (copiedFiles.length === 0) {
      return { totalVerified: 0, totalErrors: 0, errors: [] };
    }

    logger.log(`[Verification] Starting verification of ${copiedFiles.length} files`);
    
    // Clear previous verification errors and set verifying state
    clearVerificationErrors();
    setIsVerifying(true);
    setVerificationProgress({ completed: 0, total: copiedFiles.length });

    const allErrors: Array<{
      filePath: string;
      sourcePath: string;
      destPath: string;
      sourceChecksum: string;
      destChecksum: string;
      repairAttempted: boolean;
      repairSuccessful: boolean;
    }> = [];
    
    let verified = 0;

    try {
      // Process files in batches for efficient parallel verification
      for (let i = 0; i < copiedFiles.length; i += VERIFICATION_BATCH_SIZE) {
        // Check if sync was cancelled
        if (useSyncStore.getState().syncState === 'cancelled') {
          logger.log('[Verification] Cancelled by user');
          break;
        }

        const batch = copiedFiles.slice(i, i + VERIFICATION_BATCH_SIZE);
        const batchResults = await verifyFileBatch(batch, sourceRoot, destRoot);

        // Process results
        for (const result of batchResults) {
          verified++;
          
          if (!result.matches) {
            logger.warn(`[Verification] Checksum mismatch: ${result.filePath}`);
            logger.debug(`  Source: ${result.sourceChecksum}`);
            logger.debug(`  Dest:   ${result.destChecksum}`);
            
            let repairAttempted = false;
            let repairSuccessful = false;

            // Attempt auto-repair if enabled
            if (syncOptions.autoRepair) {
              repairAttempted = true;
              logger.log(`[Verification] Attempting auto-repair for ${result.filePath}`);
              
              try {
                // Re-copy the file by invoking the backend
                // We use a minimal sync with just this file
                await invoke('sync_files', {
                  source: result.sourcePath,
                  destination: result.destPath,
                  options: {
                    source: result.sourcePath,
                    destination: result.destPath,
                    mode: 'copy',
                    conflict_resolution: 'overwrite',
                    verify_integrity: false, // Don't verify during repair to avoid loops
                    preserve_metadata: true,
                    delete_orphans: false,
                    buffer_size: null,
                    dry_run: false,
                    follow_symlinks: false,
                    max_concurrent_files: 1,
                    overwrite_all: true,
                    update_only: false,
                    skip_existing: false,
                  },
                });

                // Re-verify after repair
                const [newSourceHash, newDestHash] = await Promise.all([
                  computeFileHashSafe(result.sourcePath),
                  computeFileHashSafe(result.destPath),
                ]);

                if (newSourceHash && newDestHash && newSourceHash === newDestHash) {
                  repairSuccessful = true;
                  logger.log(`[Verification] Auto-repair successful for ${result.filePath}`);
                } else {
                  logger.error(`[Verification] Auto-repair failed for ${result.filePath}`);
                }
              } catch (repairError) {
                logger.error(`[Verification] Auto-repair error for ${result.filePath}:`, repairError);
              }
            }

            // Only add to errors if repair wasn't successful
            if (!repairSuccessful) {
              allErrors.push({
                filePath: result.filePath,
                sourcePath: result.sourcePath,
                destPath: result.destPath,
                sourceChecksum: result.sourceChecksum,
                destChecksum: result.destChecksum,
                repairAttempted,
                repairSuccessful,
              });
            }
          }
        }

        // Update progress
        setVerificationProgress({ completed: verified, total: copiedFiles.length });
      }

      // Add all errors to the store
      if (allErrors.length > 0) {
        addVerificationErrors(allErrors);
      }

      logger.log(`[Verification] Complete: ${verified} files verified, ${allErrors.length} errors`);
      
      return {
        totalVerified: verified,
        totalErrors: allErrors.length,
        errors: allErrors,
      };
    } catch (error) {
      logger.error('[Verification] Unexpected error during verification:', error);
      throw error;
    } finally {
      setIsVerifying(false);
      setVerificationProgress(null);
    }
  }, [syncOptions.autoRepair, clearVerificationErrors, setIsVerifying, setVerificationProgress, addVerificationErrors]);

  // Streaming directory scan - loads files progressively without blocking
  const loadDirectoryStreaming = useCallback(async (path: string) => {
    if (!isTauriApp()) return;
    
    const scanId = crypto.randomUUID();
    let totalSize = 0;
    let fileCountProgress = 0;
    
    // Clear existing files and start scanning
    clearFiles();
    setIsScanning(true);
    setScanProgress({ count: 0, totalSize: 0 });
    
    // Set up event listener for file chunks
    const unlisten = await listen<{
      scan_id: string;
      files: Array<{ path: string; size: number; modified: string; is_dir: boolean }>;
      chunk_index: number;
      is_final: boolean;
    }>('file_chunk', (event) => {
      const chunk = event.payload;
      if (chunk.scan_id !== scanId) return;
      
      if (chunk.is_final) {
        setIsScanning(false);
        setScanProgress(null);
        unlisten();
        return;
      }
      
      // Map and append files
      const mapped: FileItem[] = chunk.files.map((file) => {
        totalSize += file.size;
        fileCountProgress++;
        return {
          id: joinPath(path, file.path), // Use path as stable ID
          name: file.path.split('/').pop() || file.path,
          path: joinPath(path, file.path),
          size: file.size,
          isDirectory: file.is_dir,
          modifiedAt: new Date(file.modified),
          status: 'pending' as const,
        };
      });
      
      appendFiles(mapped);
      setScanProgress({ count: fileCountProgress, totalSize });
    });
    
    // Start the streaming scan
    try {
      await invoke('scan_directory_stream', { path, scanId });
    } catch (error) {
      console.error('Failed to start directory scan:', error);
      setIsScanning(false);
      setScanProgress(null);
      unlisten();
    }
  }, [appendFiles, clearFiles, joinPath, setIsScanning, setScanProgress]);

  // Legacy non-streaming load (fallback)
  const loadDirectoryInfo = useCallback(async (path: string) => {
    // Use streaming for Tauri apps
    if (isTauriApp()) {
      return loadDirectoryStreaming(path);
    }
    
    // Fallback for web
    try {
      const info = await invoke<{ files: Array<{ path: string; size: number; modified: string; is_dir: boolean }> }>(
        'get_directory_info',
        { path }
      );
      const mapped: FileItem[] = info.files.map((file) => ({
        id: joinPath(path, file.path),
        name: file.path.split('/').pop() || file.path,
        path: joinPath(path, file.path),
        size: file.size,
        isDirectory: file.is_dir,
        modifiedAt: new Date(file.modified),
        status: 'pending',
      }));
      setFiles(mapped);
    } catch (error) {
      console.error('Failed to load directory info:', error);
    }
  }, [joinPath, loadDirectoryStreaming, setFiles]);

  useEffect(() => {
    if (!isTauriApp()) return;
    let isMounted = true;
    homeDir()
      .then((path) => {
        if (isMounted) {
          dialogDefaultPathRef.current = path;
        }
      })
      .catch((error) => {
        console.warn('Failed to resolve home directory for dialog:', error);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const getDialogDefaultPath = useCallback(() => dialogDefaultPathRef.current, []);

  const selectSourceFolder = useCallback(() => {
    if (!isTauriApp()) {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        const root = files[0].webkitRelativePath.split('/')[0];
        setSourcePath(root);
        const mapped: FileItem[] = files.map((file) => ({
          id: file.webkitRelativePath || file.name,
          name: file.name,
          path: file.webkitRelativePath || file.name,
          size: file.size,
          isDirectory: false,
          modifiedAt: new Date(file.lastModified),
          status: 'pending',
        }));
        setFiles(mapped);
      };
      input.click();
      return;
    }

    const defaultPath = getDialogDefaultPath();
    open({
      directory: true,
      multiple: false,
      title: 'Select Source Folder',
      defaultPath,
    })
      .then((selected) => {
        if (!selected) return;
        const path = selected as string;
        setSourcePath(path);
        void loadDirectoryInfo(path);
      })
      .catch((error) => {
        console.error('Failed to select source folder:', error);
      });
  }, [setFiles, loadDirectoryInfo, setSourcePath]);

  const selectDestFolder = useCallback(() => {
    if (!isTauriApp()) {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        const root = files[0].webkitRelativePath.split('/')[0];
        setDestPath(root);
      };
      input.click();
      return;
    }

    const defaultPath = getDialogDefaultPath();
    open({
      directory: true,
      multiple: false,
      title: 'Select Destination Folder',
      defaultPath,
    })
      .then((selected) => {
        if (!selected) return;
        setDestPath(selected as string);
      })
      .catch((error) => {
        console.error('Failed to select destination folder:', error);
      });
  }, [setDestPath]);

  const addFilesFromDialog = useCallback(() => {
    if (!isTauriApp()) {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        const mapped: FileItem[] = files.map((file) => ({
          id: file.name,
          name: file.name,
          path: file.name,
          size: file.size,
          isDirectory: false,
          modifiedAt: new Date(file.lastModified),
          status: 'pending',
        }));
        appendFiles(mapped);
      };
      input.click();
      return;
    }

    const defaultPath = getDialogDefaultPath();
    open({
      directory: false,
      multiple: true,
      title: 'Select Files to Sync',
      defaultPath,
    })
      .then((selected) => {
        if (!selected || !Array.isArray(selected)) return;
        const newFiles: FileItem[] = selected.map((path) => ({
          id: path,
          name: path.split('/').pop() || path,
          path: path,
          size: 0,
          isDirectory: false,
          modifiedAt: new Date(),
          status: 'pending',
        }));
        appendFiles(newFiles);
      })
      .catch((error) => {
        console.error('Failed to select files:', error);
      });
  }, [appendFiles]);

  const addFolderFromDialog = useCallback(() => {
    if (!isTauriApp()) {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        if (files.length === 0) return;
        const root = files[0].webkitRelativePath.split('/')[0];
        setSourcePath(root);
        const mapped: FileItem[] = files.map((file) => ({
          id: file.webkitRelativePath || file.name,
          name: file.name,
          path: file.webkitRelativePath || file.name,
          size: file.size,
          isDirectory: false,
          modifiedAt: new Date(file.lastModified),
          status: 'pending',
        }));
        setFiles(mapped);
      };
      input.click();
      return;
    }

    const defaultPath = getDialogDefaultPath();
    open({
      directory: true,
      multiple: false,
      title: 'Select Folder to Sync',
      defaultPath,
    })
      .then((selected) => {
        if (!selected) return;
        const path = selected as string;
        setSourcePath(path);
        void loadDirectoryInfo(path);
      })
      .catch((error) => {
        console.error('Failed to select folder:', error);
      });
  }, [setFiles, loadDirectoryInfo, setSourcePath]);

  const mapBackendOptions = useCallback(() => {
    // Map the new fileExistsAction to backend conflict resolution
    let conflictResolution: 'skip' | 'overwrite' | 'rename' | 'ask';
    let overwriteAll = false;
    let updateOnly = false;
    let skipExisting = false;

    switch (syncOptions.fileExistsAction) {
      case 'replace-all':
        conflictResolution = 'overwrite';
        overwriteAll = true;
        break;
      case 'replace-older':
        conflictResolution = 'overwrite';
        updateOnly = true; // Only replace if source is newer
        break;
      case 'skip':
        conflictResolution = 'skip';
        skipExisting = true;
        break;
      case 'ask':
        conflictResolution = 'ask';
        break;
      default:
        conflictResolution = 'skip';
    }

    return {
      source: sourcePath || '',
      destination: destPath || '',
      mode: 'copy',
      conflict_resolution: conflictResolution,
      verify_integrity: syncOptions.verifyChecksum !== 'off',
      preserve_metadata: syncOptions.preservePermissions,
      delete_orphans: syncOptions.deleteOrphans,
      buffer_size: null,
      dry_run: syncOptions.dryRun,
      follow_symlinks: syncOptions.followSymlinks,
      max_concurrent_files: syncOptions.maxConcurrentFiles,
      // File exists behavior flags
      overwrite_all: overwriteAll,
      update_only: updateOnly,
      skip_existing: skipExisting,
      // Exclusion patterns
      exclude_patterns: syncOptions.excludePatterns,
      // Bandwidth throttling (0 = unlimited, otherwise bytes per second)
      bandwidth_limit: syncOptions.bandwidthLimit,
    };
  }, [
    destPath,
    sourcePath,
    syncOptions.deleteOrphans,
    syncOptions.dryRun,
    syncOptions.followSymlinks,
    syncOptions.maxConcurrentFiles,
    syncOptions.fileExistsAction,
    syncOptions.preservePermissions,
    syncOptions.verifyChecksum,
    syncOptions.excludePatterns,
    syncOptions.bandwidthLimit,
  ]);

  const handleStartSync = useCallback(async () => {
    if (!destPath || fileCount === 0) return;

    // Check if destination path is writable before proceeding
    if (isTauriApp()) {
      try {
        const isWritable = await withTimeout(
          invoke<boolean>('is_path_writable', { path: destPath }),
          TIMEOUTS.QUICK,
          'Write permission check'
        );
        
        if (!isWritable) {
          const { setLastError, setSyncState } = useSyncStore.getState();
          setLastError(t('errors.destinationNotWritable', { path: destPath }));
          setSyncState('error');
          logger.warn(`[Sync] Destination path is not writable: ${destPath}`);
          return;
        }
      } catch (error) {
        const { setLastError, setSyncState } = useSyncStore.getState();
        const errorMessage = error instanceof Error ? error.message : String(error);
        setLastError(t('errors.permissionCheckFailed', { error: errorMessage }));
        setSyncState('error');
        logger.error('[Sync] Failed to check write permission:', error);
        return;
      }
    }

    // Check if there's enough space on the destination
    const { checkSpaceAvailable } = useSyncStore.getState();
    if (!checkSpaceAvailable()) {
      // Modal will be shown by the store
      return;
    }

    startSync();
    
    // Prevent system sleep if setting is enabled
    const { preventSleepDuringTransfer } = useSettingsStore.getState();
    if (preventSleepDuringTransfer && isTauriApp()) {
      try {
        await withTimeout(
          invoke('prevent_sleep', { reason: 'File transfer in progress' }),
          TIMEOUTS.QUICK,
          'Prevent sleep'
        );
      } catch (error) {
        console.warn('Failed to prevent sleep:', error);
      }
    }

    if (!isTauriApp()) {
      let completedFiles = 0;
      let transferredBytes = 0;
      const currentFiles = getFiles();
      const totalBytes = currentFiles.reduce((acc, f) => acc + f.size, 0);
      const startTime = Date.now();
      const maxConcurrent = syncOptions.maxConcurrentFiles || 4;

      // Simulate parallel transfers
      const simulateParallelTransfers = async () => {
        const fileQueue = [...currentFiles];
        const activeTransfers = new Map<string, { file: typeof currentFiles[0]; progress: number; speed: number }>();

        const updateActiveTransfersDisplay = () => {
          const transfers = Array.from(activeTransfers.entries()).map(([id, data]) => ({
            id,
            fileName: data.file.name,
            filePath: data.file.path,
            size: data.file.size,
            transferredBytes: data.file.size * (data.progress / 100),
            progress: data.progress,
            speed: data.speed,
          }));
          updateTransferStats({ activeTransfers: transfers });
        };

        const processFile = async (file: typeof currentFiles[0]) => {
          if (useSyncStore.getState().syncState === 'cancelled') return false;

          activeTransfers.set(file.id, { file, progress: 0, speed: 0 });
          updateFileStatus(file.id, 'syncing', 0);

          for (let progress = 0; progress <= 100; progress += 5) {
            if (useSyncStore.getState().syncState === 'cancelled') {
              activeTransfers.delete(file.id);
              return false;
            }

            while (useSyncStore.getState().syncState === 'paused') {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }

            if (useSyncStore.getState().syncState === 'cancelled') {
              activeTransfers.delete(file.id);
              return false;
            }

            // Simulate variable speed per file
            const baseDelay = 30 + Math.random() * 40;
            await new Promise((resolve) => setTimeout(resolve, baseDelay));
            
            const speed = (file.size * 0.05) / (baseDelay / 1000);
            activeTransfers.set(file.id, { file, progress, speed });
            updateFileStatus(file.id, 'syncing', progress);
            updateActiveTransfersDisplay();

            // Update overall stats
            const allProgress = Array.from(activeTransfers.values());
            const currentBytesInProgress = allProgress.reduce(
              (acc, t) => acc + t.file.size * (t.progress / 100), 
              0
            );
            const elapsed = (Date.now() - startTime) / 1000;
            const totalTransferred = transferredBytes + currentBytesInProgress;
            const currentSpeed = totalTransferred / Math.max(elapsed, 0.1);

            updateTransferStats({
              transferredBytes: totalTransferred,
              currentSpeed,
              averageSpeed: currentSpeed,
              currentFile: file.name,
              estimatedTimeRemaining: ((totalBytes - totalTransferred) / Math.max(currentSpeed, 1)),
            });
          }

          // Complete this file
          activeTransfers.delete(file.id);
          updateFileStatus(file.id, 'completed', 100);
          completedFiles++;
          transferredBytes += file.size;
          updateTransferStats({ completedFiles, transferredBytes });
          updateActiveTransfersDisplay();
          return true;
        };

        // Process files with concurrency limit
        const runConcurrent = async () => {
          const running: Promise<boolean>[] = [];

          while (fileQueue.length > 0 || running.length > 0) {
            if (useSyncStore.getState().syncState === 'cancelled') break;

            // Start new transfers up to the limit
            while (running.length < maxConcurrent && fileQueue.length > 0) {
              const file = fileQueue.shift()!;
              const promise = processFile(file).then((result) => {
                const index = running.indexOf(promise);
                if (index > -1) running.splice(index, 1);
                return result;
              });
              running.push(promise);
            }

            // Wait for at least one to complete
            if (running.length > 0) {
              await Promise.race(running);
            }
          }
        };

        await runConcurrent();
      };

      await simulateParallelTransfers();

      const finalState = useSyncStore.getState().syncState;
      if (finalState !== 'cancelled') {
        setSyncState('completed');
        updateTransferStats({ activeTransfers: [] });

        addHistoryItem({
          id: crypto.randomUUID(),
          sourcePath: sourcePath || '',
          destPath: destPath,
          filesCount: completedFiles,
          totalSize: transferredBytes,
          duration: (Date.now() - startTime) / 1000,
          status: 'completed',
          timestamp: new Date(),
        });
      }
      return;
    }

    try {
      const currentFiles = getFiles();
      const resolvedSource = sourcePath || currentFiles.find((f) => f.isDirectory)?.path;
      if (!resolvedSource) {
        throw new Error('Source folder not set.');
      }

      const options = mapBackendOptions();
      options.source = resolvedSource;
      options.destination = destPath;

      const result = await invoke<{
        files_total: number;
        files_copied: number;
        files_skipped: number;
        files_failed: number;
        bytes_total: number;
        bytes_copied: number;
        duration_ms: number;
        errors: string[];
      }>('sync_files', {
        source: resolvedSource,
        destination: destPath,
        options,
      });

      logger.log('[Sync] Result:', result);

      // Perform post-transfer verification if enabled
      let verificationResult = { totalVerified: 0, totalErrors: 0, errors: [] as Array<unknown> };
      const shouldVerifyAfter = syncOptions.verifyChecksum === 'after' || syncOptions.verifyChecksum === 'both';
      
      if (shouldVerifyAfter && result.files_copied > 0) {
        logger.log('[Sync] Starting post-transfer verification...');
        
        // Get list of files that were actually copied (non-directories)
        const filesToVerify = currentFiles
          .filter((f) => !f.isDirectory && f.status !== 'skipped' && f.status !== 'error')
          .map((f) => ({
            relativePath: f.path.replace(resolvedSource + '/', '').replace(resolvedSource, ''),
            size: f.size,
          }));
        
        try {
          verificationResult = await performVerification(
            filesToVerify,
            resolvedSource,
            destPath
          );
          
          if (verificationResult.totalErrors > 0) {
            logger.warn(`[Sync] Verification found ${verificationResult.totalErrors} errors`);
          } else {
            logger.log('[Sync] Verification successful - all checksums match');
          }
        } catch (verifyError) {
          logger.error('[Sync] Verification failed:', verifyError);
          // Don't fail the entire sync if verification fails
          // The files were still copied, just verification had issues
        }
      }

      // Determine final status based on both sync and verification results
      const hasVerificationErrors = verificationResult.totalErrors > 0;
      const hasSyncErrors = result.files_failed > 0;
      const finalStatus = hasSyncErrors || hasVerificationErrors ? 'error' : 'completed';

      setSyncState('completed');
      updateTransferStats({
        completedFiles: result.files_copied,
        totalFiles: result.files_total,
        totalBytes: result.bytes_total,
        transferredBytes: result.bytes_copied,
        currentSpeed: 0,
        averageSpeed: result.bytes_copied / Math.max(result.duration_ms / 1000, 1),
        estimatedTimeRemaining: 0,
        currentFile: null,
      });

      addHistoryItem({
        id: crypto.randomUUID(),
        sourcePath: resolvedSource,
        destPath: destPath,
        filesCount: result.files_copied,
        totalSize: result.bytes_copied,
        duration: result.duration_ms / 1000,
        status: finalStatus,
        timestamp: new Date(),
        errorMessage: hasVerificationErrors 
          ? `Verification failed for ${verificationResult.totalErrors} file(s)` 
          : hasSyncErrors 
            ? `${result.files_failed} file(s) failed to copy`
            : undefined,
      });

      // Send native notification if enabled
      const { notifications } = useSettingsStore.getState();
      if (notifications) {
        const hasErrors = hasSyncErrors || hasVerificationErrors;
        await showSyncCompletionNotification(result.files_copied, hasErrors);
      }
    } catch (error) {
      console.error('Sync failed:', error);
      
      // Extract error message from the error object
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : 'An unknown error occurred during sync';
      
      // Store error in the syncStore for UI display
      useSyncStore.getState().setLastError(errorMessage);
      
      setSyncState('error');
      addHistoryItem({
        id: crypto.randomUUID(),
        sourcePath: sourcePath || '',
        destPath: destPath,
        filesCount: transferStats.completedFiles,
        totalSize: transferStats.transferredBytes,
        duration: transferStats.startTime ? (Date.now() - transferStats.startTime.getTime()) / 1000 : 0,
        status: 'error',
        timestamp: new Date(),
        errorMessage,
      });

      // Send native notification for error if enabled
      const { notifications } = useSettingsStore.getState();
      if (notifications) {
        await showSyncErrorNotification(errorMessage);
      }
    } finally {
      // Allow system to sleep again when transfer completes
      if (isTauriApp()) {
        try {
          await invoke('allow_sleep');
        } catch (error) {
          console.warn('Failed to allow sleep:', error);
        }
      }
    }
  }, [
    destPath,
    files,
    sourcePath,
    startSync,
    updateFileStatus,
    updateTransferStats,
    setSyncState,
    addHistoryItem,
    mapBackendOptions,
    transferStats.completedFiles,
    transferStats.startTime,
    transferStats.transferredBytes,
    performVerification,
    syncOptions.verifyChecksum,
    getFiles,
  ]);

  const handlePauseSync = useCallback(async () => {
    pauseSync();
    if (isTauriApp() && transferId) {
      try {
        await withTimeout(
          invoke('pause_transfer', { transferId }),
          TIMEOUTS.QUICK,
          'Pause transfer'
        );
      } catch (error) {
        logger.error('Failed to pause transfer:', error);
      }
    }
  }, [pauseSync, transferId]);

  const handleResumeSync = useCallback(async () => {
    resumeSync();
    if (isTauriApp() && transferId) {
      try {
        await withTimeout(
          invoke('resume_transfer', { transferId }),
          TIMEOUTS.QUICK,
          'Resume transfer'
        );
      } catch (error) {
        logger.error('Failed to resume transfer:', error);
      }
    }
  }, [resumeSync, transferId]);

  const handleCancelSync = useCallback(async () => {
    cancelSync();
    if (isTauriApp()) {
      if (transferId) {
        try {
          await withTimeout(
            invoke('cancel_transfer', { transferId }),
            TIMEOUTS.STANDARD,
            'Cancel transfer'
          );
        } catch (error) {
          logger.error('Failed to cancel transfer:', error);
        }
      }
      // Allow system to sleep again when transfer is cancelled
      try {
        await withTimeout(
          invoke('allow_sleep'),
          TIMEOUTS.QUICK,
          'Allow sleep'
        );
      } catch (error) {
        logger.warn('Failed to allow sleep:', error);
      }
    }
  }, [cancelSync, transferId]);

  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }, []);

  // Check if source path exists
  const checkSourceExists = useCallback(async (path: string): Promise<boolean> => {
    if (!isTauriApp()) return true;
    try {
      await invoke<{ files: unknown[] }>('get_directory_info', { path });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Queue a transfer for later execution
  const queueTransfer = useCallback((source: string, dest: string): string => {
    return addToQueue(source, dest);
  }, [addToQueue]);

  // Process the next item in the queue
  const processNextInQueue = useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    
    const nextItem = getNextPendingTransfer();
    if (!nextItem) {
      isProcessingQueueRef.current = false;
      return;
    }

    isProcessingQueueRef.current = true;

    // Validate source path exists
    const sourceExists = await checkSourceExists(nextItem.sourcePath);
    if (!sourceExists) {
      // Show error modal for missing source
      setSourceMissingError({ isOpen: true, queueItem: nextItem });
      isProcessingQueueRef.current = false;
      return;
    }

    // Start the transfer
    const started = startNextTransfer();
    if (!started) {
      isProcessingQueueRef.current = false;
      return;
    }

    // Set up the paths and start sync
    setSourcePath(started.sourcePath);
    setDestPath(started.destPath);
    
    // Load directory info and start
    try {
      await loadDirectoryInfo(started.sourcePath);
      // The actual sync will be triggered after files are loaded
    } catch (error) {
      console.error('Failed to load directory for queued transfer:', error);
      markTransferError(started.id, 'Failed to load source directory');
      isProcessingQueueRef.current = false;
      // Try next item
      setTimeout(() => processNextInQueue(), 100);
    }
  }, [
    getNextPendingTransfer,
    checkSourceExists,
    startNextTransfer,
    setSourcePath,
    setDestPath,
    loadDirectoryInfo,
    markTransferError,
  ]);

  // Handle removing errored item from queue and continue
  const handleRemoveErroredFromQueue = useCallback(() => {
    if (sourceMissingError.queueItem) {
      markTransferError(sourceMissingError.queueItem.id, 'Source folder not found');
    }
    setSourceMissingError({ isOpen: false, queueItem: null });
    // Continue with next item
    setTimeout(() => processNextInQueue(), 100);
  }, [sourceMissingError.queueItem, markTransferError, processNextInQueue]);

  // Handle retry later - keep in queue but skip for now
  const handleRetryLater = useCallback(() => {
    // Just close the modal, item stays in queue as pending
    setSourceMissingError({ isOpen: false, queueItem: null });
  }, []);

  // =========================================================================
  // Verification Retry Logic
  // =========================================================================

  /**
   * Retries a single file that failed verification.
   * Re-copies the file from source to destination and verifies the result.
   * 
   * @param filePath - The relative file path that failed verification
   * @returns Promise that resolves when the retry is complete
   */
  const retryVerificationError = useCallback(async (filePath: string): Promise<void> => {
    if (!isTauriApp()) {
      logger.warn('[Retry] Cannot retry verification - not in Tauri environment');
      return;
    }

    // Find the verification error for this file path
    const error = verificationErrors.find((e) => e.filePath === filePath);
    if (!error) {
      logger.warn(`[Retry] No verification error found for file: ${filePath}`);
      return;
    }

    logger.log(`[Retry] Retrying verification for: ${filePath}`);
    
    // Set verifying state for UI feedback
    setIsVerifying(true);
    setVerificationProgress({ completed: 0, total: 1 });

    try {
      // Re-copy the file using the existing sync infrastructure
      // We use the full source and dest paths from the error
      const retryOptions = {
        source: error.sourcePath,
        destination: error.destPath,
        mode: 'copy',
        conflict_resolution: 'overwrite',
        verify_integrity: false, // We'll verify manually after
        preserve_metadata: syncOptions.preservePermissions,
        delete_orphans: false,
        buffer_size: null,
        dry_run: false,
        follow_symlinks: syncOptions.followSymlinks,
        max_concurrent_files: 1,
        overwrite_all: true,
        update_only: false,
        skip_existing: false,
      };

      await invoke('sync_files', {
        source: error.sourcePath,
        destination: error.destPath,
        options: retryOptions,
      });

      logger.log(`[Retry] File re-copied: ${filePath}`);

      // Verify the file after re-copying
      const [sourceHash, destHash] = await Promise.all([
        computeFileHashSafe(error.sourcePath),
        computeFileHashSafe(error.destPath),
      ]);

      setVerificationProgress({ completed: 1, total: 1 });

      if (sourceHash && destHash && sourceHash === destHash) {
        // Success - remove from verification errors
        logger.log(`[Retry] Verification successful for: ${filePath}`);
        removeVerificationError(filePath);
      } else {
        // Still failing - update the error with new attempt info
        logger.warn(`[Retry] Verification still failing for: ${filePath}`);
        logger.debug(`  Source hash: ${sourceHash ?? 'FAILED'}`);
        logger.debug(`  Dest hash:   ${destHash ?? 'FAILED'}`);
        
        // Mark as repair attempted but failed
        const errorEntry = verificationErrors.find((e) => e.filePath === filePath);
        if (errorEntry) {
          useSyncStore.getState().markVerificationErrorRepaired(errorEntry.id, false);
        }
      }
    } catch (error) {
      logger.error(`[Retry] Failed to retry file: ${filePath}`, error);
      throw error;
    } finally {
      setIsVerifying(false);
      setVerificationProgress(null);
    }
  }, [
    verificationErrors,
    syncOptions.preservePermissions,
    syncOptions.followSymlinks,
    setIsVerifying,
    setVerificationProgress,
    removeVerificationError,
  ]);

  /**
   * Retries all files that failed verification.
   * Processes files sequentially to avoid overwhelming the system.
   * Successfully retried files are removed from the errors list.
   * 
   * @returns Promise that resolves when all retries are complete
   */
  const retryAllVerificationErrors = useCallback(async (): Promise<void> => {
    if (!isTauriApp()) {
      logger.warn('[Retry] Cannot retry verification - not in Tauri environment');
      return;
    }

    const retryableErrors = getRetryableVerificationErrors();
    if (retryableErrors.length === 0) {
      logger.log('[Retry] No retryable verification errors');
      return;
    }

    logger.log(`[Retry] Retrying ${retryableErrors.length} files with verification errors`);

    // Set up progress tracking
    setIsVerifying(true);
    setVerificationProgress({ completed: 0, total: retryableErrors.length });

    const succeededPaths: string[] = [];
    let completed = 0;

    try {
      // Process each file sequentially
      for (const error of retryableErrors) {
        try {
          logger.log(`[Retry] Processing ${completed + 1}/${retryableErrors.length}: ${error.filePath}`);

          // Re-copy the file
          const retryOptions = {
            source: error.sourcePath,
            destination: error.destPath,
            mode: 'copy',
            conflict_resolution: 'overwrite',
            verify_integrity: false,
            preserve_metadata: syncOptions.preservePermissions,
            delete_orphans: false,
            buffer_size: null,
            dry_run: false,
            follow_symlinks: syncOptions.followSymlinks,
            max_concurrent_files: 1,
            overwrite_all: true,
            update_only: false,
            skip_existing: false,
          };

          await invoke('sync_files', {
            source: error.sourcePath,
            destination: error.destPath,
            options: retryOptions,
          });

          // Verify the re-copied file
          const [sourceHash, destHash] = await Promise.all([
            computeFileHashSafe(error.sourcePath),
            computeFileHashSafe(error.destPath),
          ]);

          if (sourceHash && destHash && sourceHash === destHash) {
            logger.log(`[Retry] Successfully verified: ${error.filePath}`);
            succeededPaths.push(error.filePath);
          } else {
            logger.warn(`[Retry] Verification still failing for: ${error.filePath}`);
            useSyncStore.getState().markVerificationErrorRepaired(error.id, false);
          }
        } catch (fileError) {
          logger.error(`[Retry] Failed to retry file: ${error.filePath}`, fileError);
          useSyncStore.getState().markVerificationErrorRepaired(error.id, false);
        }

        completed++;
        setVerificationProgress({ completed, total: retryableErrors.length });
      }

      // Remove all successfully retried files from the errors list
      if (succeededPaths.length > 0) {
        logger.log(`[Retry] Removing ${succeededPaths.length} successfully retried files from errors`);
        removeVerificationErrors(succeededPaths);
      }

      logger.log(`[Retry] Complete: ${succeededPaths.length}/${retryableErrors.length} files fixed`);
    } finally {
      setIsVerifying(false);
      setVerificationProgress(null);
    }
  }, [
    getRetryableVerificationErrors,
    syncOptions.preservePermissions,
    syncOptions.followSymlinks,
    setIsVerifying,
    setVerificationProgress,
    removeVerificationErrors,
  ]);

  // Start processing the queue
  const startQueue = useCallback(async () => {
    if (syncState !== 'idle' || isProcessingQueueRef.current) return;
    await processNextInQueue();
  }, [syncState, processNextInQueue]);

  // =========================================================================
  // Shutdown After Complete Logic
  // =========================================================================

  /**
   * Triggers the shutdown countdown modal when sync completes successfully
   * and shutdownAfterComplete is enabled.
   */
  const triggerShutdownCountdown = useCallback(() => {
    setShutdownState({
      isOpen: true,
      isInitiating: false,
      error: null,
      isCancelled: false,
    });
  }, []);

  /**
   * Cancels the shutdown countdown and closes the modal.
   */
  const cancelShutdown = useCallback(() => {
    setShutdownState({
      isOpen: false,
      isInitiating: false,
      error: null,
      isCancelled: true,
    });
    logger.log('[Shutdown] Countdown cancelled by user');
  }, []);

  /**
   * Initiates the actual shutdown after countdown completes.
   * Calls the Rust backend to execute the shutdown command.
   */
  const executeShutdown = useCallback(async () => {
    if (!isTauriApp()) {
      logger.warn('[Shutdown] Cannot shut down - not in Tauri environment');
      setShutdownState(INITIAL_SHUTDOWN_STATE);
      return;
    }

    setShutdownState((prev) => ({
      ...prev,
      isInitiating: true,
    }));

    try {
      await invoke('initiate_shutdown');
      logger.log('[Shutdown] Shutdown initiated successfully');
      // The system will shut down, so we don't need to update state
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[Shutdown] Failed to initiate shutdown:', error);
      
      setShutdownState({
        isOpen: true,
        isInitiating: false,
        error: errorMessage,
        isCancelled: false,
      });
    }
  }, []);

  /**
   * Resets shutdown state and closes the modal.
   */
  const dismissShutdownError = useCallback(() => {
    setShutdownState(INITIAL_SHUTDOWN_STATE);
  }, []);

  // Effect to auto-start next queued transfer when current completes
  useEffect(() => {
    if (syncState === 'completed' || syncState === 'error' || syncState === 'cancelled') {
      // Mark current queue item as complete/error if there's a running one
      const runningItem = transferQueue.find((item) => item.status === 'running');
      if (runningItem) {
        if (syncState === 'completed') {
          markTransferComplete(runningItem.id);
        } else if (syncState === 'error') {
          markTransferError(runningItem.id, 'Transfer failed');
        } else if (syncState === 'cancelled') {
          updateQueueItem(runningItem.id, { status: 'cancelled', completedAt: new Date() });
        }
      }

      isProcessingQueueRef.current = false;

      // Check for more items in queue
      const hasMorePending = transferQueue.some((item) => item.status === 'pending');
      if (hasMorePending && syncState !== 'cancelled') {
        // Reset state for next transfer
        setTimeout(() => {
          reset();
          processNextInQueue();
        }, 1000);
      } else if (syncState === 'completed' && !hasMorePending) {
        // All transfers complete - check if we should trigger shutdown
        if (syncOptions.shutdownAfterComplete && !shutdownState.isCancelled) {
          logger.log('[Shutdown] Sync completed with shutdownAfterComplete enabled, triggering countdown');
          triggerShutdownCountdown();
        }
      }
    }
  }, [syncState, transferQueue, markTransferComplete, markTransferError, updateQueueItem, reset, processNextInQueue, syncOptions.shutdownAfterComplete, shutdownState.isCancelled, triggerShutdownCountdown]);

  return {
    // State
    files,
    sourcePath,
    destPath,
    syncState,
    syncOptions,
    transferStats,
    transferQueue,
    sourceMissingError,
    
    // Verification state
    verificationErrors,
    isVerifying,
    
    // Shutdown state
    shutdownState,
    
    // Actions
    selectSourceFolder,
    selectDestFolder,
    addFilesFromDialog,
    addFolderFromDialog,
    appendFiles,
    removeFile,
    clearFiles,
    updateSyncOptions,
    startSync: handleStartSync,
    pauseSync: handlePauseSync,
    resumeSync: handleResumeSync,
    cancelSync: handleCancelSync,
    reset,
    
    // Verification actions
    clearVerificationErrors,
    retryVerificationError,
    retryAllVerificationErrors,
    
    // Queue actions
    queueTransfer,
    removeFromQueue,
    startQueue,
    clearCompletedFromQueue,
    handleRemoveErroredFromQueue,
    handleRetryLater,
    
    // Shutdown actions
    cancelShutdown,
    executeShutdown,
    dismissShutdownError,
    
    // Utils
    formatBytes,
    formatTime,
    
    // Computed
    canSync: destPath !== null && fileCount > 0 && syncState === 'idle',
    isRunning: ['preparing', 'syncing'].includes(syncState),
    isPaused: syncState === 'paused',
    isComplete: syncState === 'completed',
    hasQueuedTransfers: transferQueue.some((item) => item.status === 'pending'),
    hasVerificationErrors: verificationErrors.length > 0,
  };
}
