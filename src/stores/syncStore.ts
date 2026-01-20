import { create } from 'zustand';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type {
  FileItem,
  SyncOptions,
  SyncState,
  TransferStats,
  ConflictInfo,
  ConflictResolution,
  TransferHistoryItem,
  NavigationPage,
  TransferQueueItem,
  VolumeInfo,
} from '../types';
import { useHistoryStore } from './historyStore';

/**
 * Represents a verification error that occurred during checksum validation.
 * This happens when the computed checksum of a copied file doesn't match the source.
 */
export interface VerificationError {
  /** Unique identifier for this error */
  id: string;
  /** Relative path of the file that failed verification */
  filePath: string;
  /** Full source path of the file */
  sourcePath: string;
  /** Full destination path of the file */
  destPath: string;
  /** Checksum computed from source file */
  sourceChecksum: string;
  /** Checksum computed from destination file */
  destChecksum: string;
  /** Timestamp when the error was detected */
  detectedAt: Date;
  /** Whether auto-repair was attempted */
  repairAttempted: boolean;
  /** Whether auto-repair was successful */
  repairSuccessful: boolean;
}
import { DEFAULT_SYNC_OPTIONS } from '../types';
import { logger } from '../utils/logger';

/**
 * Maps frontend conflict resolution types to backend kebab-case format.
 * This ensures type safety between the TypeScript frontend and Rust backend.
 */
function mapResolutionToBackend(resolution: ConflictResolution): string {
  const mapping: Record<ConflictResolution, string> = {
    'keep-source': 'keep-source',
    'keep-dest': 'keep-dest',
    'keep-both': 'keep-both',
    'skip': 'skip',
  };
  return mapping[resolution];
}

/**
 * Invokes the resolve_conflict Tauri command with proper error handling.
 * @param conflictId - Unique identifier for the conflict
 * @param resolution - The resolution chosen by the user
 * @param transferId - Optional transfer ID if associated with an active transfer
 */
async function invokeResolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
  transferId?: string | null
): Promise<void> {
  if (!isTauri()) {
    logger.debug('Not in Tauri environment, skipping backend conflict resolution');
    return;
  }

  try {
    logger.debug('Resolving conflict via backend:', {
      conflictId,
      resolution,
      transferId,
    });

    await invoke('resolve_conflict', {
      conflictId,
      resolution: mapResolutionToBackend(resolution),
      transferId: transferId ?? null,
    });

    logger.debug('Conflict resolved successfully:', conflictId);
  } catch (error) {
    // Log the error but don't throw - UI state has already been updated
    // This follows the pattern of graceful degradation
    logger.error('Failed to notify backend of conflict resolution:', error);
    
    // Re-throw if we want the caller to handle it
    throw new Error(
      `Failed to resolve conflict: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Normalized file state for O(1) operations on large datasets
interface NormalizedFiles {
  byId: Record<string, FileItem>;  // O(1) lookup by ID
  ids: string[];                    // Ordered list of IDs
}

// Maximum number of files to load to prevent memory issues
const MAX_LOADED_FILES = 50000;

interface SyncStore {
  // File count limit tracking
  fileCountLimitReached: boolean;
  // Navigation
  currentPage: NavigationPage;
  setCurrentPage: (page: NavigationPage) => void;

  // Drag state
  isDraggingFiles: boolean;
  dragOverZone: 'source' | 'destination' | null;
  dragPosition: { x: number; y: number } | null;
  setIsDraggingFiles: (dragging: boolean) => void;
  setDragOverZone: (zone: 'source' | 'destination' | null) => void;
  setDragPosition: (position: { x: number; y: number } | null) => void;

  // Source and destination
  sourcePath: string | null;
  destPath: string | null;
  sourceVolumeInfo: VolumeInfo | null;
  destVolumeInfo: VolumeInfo | null;
  setSourcePath: (path: string | null) => void;
  setDestPath: (path: string | null) => void;
  setSourceVolumeInfo: (info: VolumeInfo | null) => void;
  setDestVolumeInfo: (info: VolumeInfo | null) => void;

  // Files - Normalized for performance
  normalizedFiles: NormalizedFiles;
  selectedFiles: Set<string>;
  
  // Scan state
  isScanning: boolean;
  scanProgress: { count: number; totalSize: number } | null;
  setIsScanning: (scanning: boolean) => void;
  setScanProgress: (progress: { count: number; totalSize: number } | null) => void;
  
  // File operations - optimized for large datasets
  setFiles: (files: FileItem[]) => void;
  appendFiles: (files: FileItem[]) => void;  // Append without full replace
  removeFile: (id: string) => void;
  clearFiles: () => void;
  updateFileStatus: (id: string, status: FileItem['status'], progress?: number) => void;
  updateMultipleFileStatuses: (updates: Array<{ id: string; status: FileItem['status']; progress?: number }>) => void;
  toggleFileSelection: (id: string) => void;
  selectAllFiles: () => void;
  deselectAllFiles: () => void;
  
  // Computed selectors (use these instead of accessing normalizedFiles directly)
  getFiles: () => FileItem[];
  getFileById: (id: string) => FileItem | undefined;
  getFileCount: () => number;
  getTotalSize: () => number;

  // Insufficient space modal
  insufficientSpaceError: {
    isOpen: boolean;
    requiredSpace: number;
    availableSpace: number;
    destinationPath: string;
    destinationName: string;
  } | null;
  showInsufficientSpaceError: (info: {
    requiredSpace: number;
    availableSpace: number;
    destinationPath: string;
    destinationName: string;
  }) => void;
  hideInsufficientSpaceError: () => void;
  checkSpaceAvailable: () => boolean; // Returns true if enough space, false if not (and shows modal)

  // Sync state
  syncState: SyncState;
  setSyncState: (state: SyncState) => void;
  transferId: string | null;
  setTransferId: (id: string | null) => void;
  
  // Error state
  lastError: string | null;
  setLastError: (error: string | null) => void;
  clearError: () => void;

  // Verification errors
  verificationErrors: VerificationError[];
  showVerificationErrors: boolean;
  isVerifying: boolean;
  verificationProgress: { completed: number; total: number } | null;
  addVerificationError: (error: Omit<VerificationError, 'id' | 'detectedAt'>) => void;
  addVerificationErrors: (errors: Array<Omit<VerificationError, 'id' | 'detectedAt'>>) => void;
  clearVerificationErrors: () => void;
  setShowVerificationErrors: (show: boolean) => void;
  setIsVerifying: (verifying: boolean) => void;
  setVerificationProgress: (progress: { completed: number; total: number } | null) => void;
  markVerificationErrorRepaired: (id: string, success: boolean) => void;
  /** Removes a single verification error by file path */
  removeVerificationError: (filePath: string) => void;
  /** Removes multiple verification errors by file paths */
  removeVerificationErrors: (filePaths: string[]) => void;
  /** Gets verification errors that can be retried */
  getRetryableVerificationErrors: () => VerificationError[];

  // Sync options
  syncOptions: SyncOptions;
  updateSyncOptions: (options: Partial<SyncOptions>) => void;

  // Transfer stats
  transferStats: TransferStats;
  updateTransferStats: (stats: Partial<TransferStats>) => void;
  resetTransferStats: () => void;

  // Conflicts
  conflicts: ConflictInfo[];
  currentConflict: ConflictInfo | null;
  addConflict: (conflict: ConflictInfo) => void;
  /**
   * Resolves a conflict by notifying the backend and updating local state.
   * This is an async operation that communicates with the Rust backend.
   * @param id - The unique identifier of the conflict to resolve
   * @param resolution - The user's chosen resolution action
   * @throws Error if backend communication fails (but local state is still updated)
   */
  resolveConflict: (id: string, resolution: ConflictResolution) => Promise<void>;
  setCurrentConflict: (conflict: ConflictInfo | null) => void;

  // History - delegated to persisted historyStore for persistence across app restarts
  /**
   * @deprecated Access history directly via useHistoryStore().history for reactivity.
   * This getter is provided for backward compatibility only.
   */
  history: TransferHistoryItem[];
  /**
   * Adds a history item. Delegates to the persisted historyStore.
   * Limit of 100 items is enforced by historyStore.
   */
  addHistoryItem: (item: TransferHistoryItem) => void;
  /** Clears all history. Delegates to the persisted historyStore. */
  clearHistory: () => void;

  // Transfer Queue
  transferQueue: TransferQueueItem[];
  addToQueue: (sourcePath: string, destPath: string) => string;
  removeFromQueue: (id: string) => void;
  updateQueueItem: (id: string, updates: Partial<TransferQueueItem>) => void;
  startNextTransfer: () => TransferQueueItem | null;
  markTransferComplete: (id: string) => void;
  markTransferError: (id: string, error: string) => void;
  clearCompletedFromQueue: () => void;
  getNextPendingTransfer: () => TransferQueueItem | null;

  // Actions
  startSync: () => void;
  pauseSync: () => void;
  resumeSync: () => void;
  cancelSync: () => void;
  reset: () => void;
}

const defaultTransferStats: TransferStats = {
  totalFiles: 0,
  completedFiles: 0,
  totalBytes: 0,
  transferredBytes: 0,
  currentSpeed: 0,
  averageSpeed: 0,
  startTime: null,
  estimatedTimeRemaining: null,
  currentFile: null,
  currentFiles: [],
  activeTransfers: [],
};

export const useSyncStore = create<SyncStore>((set, get) => ({
  // File count limit tracking
  fileCountLimitReached: false,

  // Navigation
  currentPage: 'sync',
  setCurrentPage: (page) => set({ currentPage: page }),

  // Drag state
  isDraggingFiles: false,
  dragOverZone: null,
  dragPosition: null,
  setIsDraggingFiles: (dragging) => set({ isDraggingFiles: dragging, dragOverZone: dragging ? get().dragOverZone : null, dragPosition: dragging ? get().dragPosition : null }),
  setDragOverZone: (zone) => set({ dragOverZone: zone }),
  setDragPosition: (position) => set({ dragPosition: position }),

  // Paths
  sourcePath: null,
  destPath: null,
  sourceVolumeInfo: null,
  destVolumeInfo: null,
  setSourcePath: (path) => set({ sourcePath: path, sourceVolumeInfo: path ? get().sourceVolumeInfo : null }),
  setDestPath: (path) => set({ destPath: path, destVolumeInfo: path ? get().destVolumeInfo : null }),
  setSourceVolumeInfo: (info) => set({ sourceVolumeInfo: info }),
  setDestVolumeInfo: (info) => set({ destVolumeInfo: info }),

  // Files - Normalized structure for O(1) operations
  normalizedFiles: { byId: {}, ids: [] },
  selectedFiles: new Set(),
  
  // Scan state
  isScanning: false,
  scanProgress: null,
  setIsScanning: (scanning) => set({ isScanning: scanning }),
  setScanProgress: (progress) => set({ scanProgress: progress }),

  // Replace all files (optimized for large datasets)
  setFiles: (files) => {
    const byId: Record<string, FileItem> = {};
    const ids: string[] = [];
    
    for (const file of files) {
      byId[file.id] = file;
      ids.push(file.id);
    }
    
    set({ 
      normalizedFiles: { byId, ids },
      selectedFiles: new Set(),
    });
  },

  // Append files without replacing (for streaming)
  appendFiles: (newFiles) => {
    set((state) => {
      const currentCount = state.normalizedFiles.ids.length;
      
      // Check if we've already hit the limit
      if (state.fileCountLimitReached) {
        return state;
      }
      
      // Check if adding new files would exceed the limit
      if (currentCount >= MAX_LOADED_FILES) {
        logger.warn(`File count limit reached (${MAX_LOADED_FILES}). Stopping file loading to prevent memory issues.`);
        return { fileCountLimitReached: true };
      }
      
      const byId = { ...state.normalizedFiles.byId };
      const existingIds = new Set(state.normalizedFiles.ids);
      const newIds: string[] = [];
      const remainingCapacity = MAX_LOADED_FILES - currentCount;
      
      for (const file of newFiles) {
        if (newIds.length >= remainingCapacity) {
          logger.warn(`File count limit reached (${MAX_LOADED_FILES}). Stopping file loading to prevent memory issues.`);
          break;
        }
        if (!existingIds.has(file.id)) {
          byId[file.id] = file;
          newIds.push(file.id);
        }
      }
      
      const limitReached = currentCount + newIds.length >= MAX_LOADED_FILES;
      
      return {
        normalizedFiles: {
          byId,
          ids: [...state.normalizedFiles.ids, ...newIds],
        },
        fileCountLimitReached: limitReached,
      };
    });
  },

  removeFile: (id) =>
    set((state) => {
      const { [id]: removed, ...byId } = state.normalizedFiles.byId;
      const ids = state.normalizedFiles.ids.filter((i) => i !== id);
      const newSelection = new Set([...state.selectedFiles].filter((fId) => fId !== id));
      return { 
        normalizedFiles: { byId, ids },
        selectedFiles: newSelection,
      };
    }),

  clearFiles: () => set({ 
    normalizedFiles: { byId: {}, ids: [] }, 
    selectedFiles: new Set(),
    scanProgress: null,
    fileCountLimitReached: false,
  }),

  // O(1) status update - only updates the single file
  updateFileStatus: (id, status, progress) =>
    set((state) => {
      const file = state.normalizedFiles.byId[id];
      if (!file) return state;
      
      return {
        normalizedFiles: {
          ...state.normalizedFiles,
          byId: {
            ...state.normalizedFiles.byId,
            [id]: { ...file, status, progress: progress ?? file.progress },
          },
        },
      };
    }),
    
  // Batch update multiple files at once (for parallel transfers)
  updateMultipleFileStatuses: (updates) =>
    set((state) => {
      const byId = { ...state.normalizedFiles.byId };
      
      for (const { id, status, progress } of updates) {
        const file = byId[id];
        if (file) {
          byId[id] = { ...file, status, progress: progress ?? file.progress };
        }
      }
      
      return {
        normalizedFiles: { ...state.normalizedFiles, byId },
      };
    }),

  toggleFileSelection: (id) =>
    set((state) => {
      const newSelection = new Set(state.selectedFiles);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return { selectedFiles: newSelection };
    }),

  selectAllFiles: () =>
    set((state) => ({
      selectedFiles: new Set(state.normalizedFiles.ids),
    })),

  deselectAllFiles: () => set({ selectedFiles: new Set() }),
  
  // Computed selectors - use these for reading files
  getFiles: () => {
    const state = get();
    return state.normalizedFiles.ids.map((id) => state.normalizedFiles.byId[id]);
  },
  
  getFileById: (id) => {
    return get().normalizedFiles.byId[id];
  },
  
  getFileCount: () => {
    return get().normalizedFiles.ids.length;
  },
  
  getTotalSize: () => {
    const state = get();
    let total = 0;
    for (const id of state.normalizedFiles.ids) {
      total += state.normalizedFiles.byId[id].size;
    }
    return total;
  },

  // Insufficient space error
  insufficientSpaceError: null,
  
  showInsufficientSpaceError: (info) => set({
    insufficientSpaceError: { isOpen: true, ...info },
  }),
  
  hideInsufficientSpaceError: () => set({ insufficientSpaceError: null }),
  
  checkSpaceAvailable: () => {
    const state = get();
    const { destVolumeInfo } = state;
    
    // If no volume info, we can't check - allow transfer
    if (!destVolumeInfo || destVolumeInfo.available_space === 0) {
      return true;
    }
    
    const totalSize = state.getTotalSize();
    
    // Add 5% buffer for safety
    const requiredSpace = Math.ceil(totalSize * 1.05);
    
    if (requiredSpace > destVolumeInfo.available_space) {
      state.showInsufficientSpaceError({
        requiredSpace: totalSize,
        availableSpace: destVolumeInfo.available_space,
        destinationPath: state.destPath || '',
        destinationName: destVolumeInfo.name || state.destPath?.split('/').pop() || 'Destination',
      });
      return false;
    }
    
    return true;
  },

  // Sync state
  syncState: 'idle',
  setSyncState: (state) => set({ syncState: state }),
  transferId: null,
  setTransferId: (id) => set({ transferId: id }),
  
  // Error state
  lastError: null,
  setLastError: (error) => set({ lastError: error }),
  clearError: () => set({ lastError: null }),

  // Verification errors
  verificationErrors: [],
  showVerificationErrors: false,
  isVerifying: false,
  verificationProgress: null,
  
  addVerificationError: (error) =>
    set((state) => ({
      verificationErrors: [
        ...state.verificationErrors,
        {
          ...error,
          id: crypto.randomUUID(),
          detectedAt: new Date(),
        },
      ],
    })),
  
  addVerificationErrors: (errors) =>
    set((state) => ({
      verificationErrors: [
        ...state.verificationErrors,
        ...errors.map((error) => ({
          ...error,
          id: crypto.randomUUID(),
          detectedAt: new Date(),
        })),
      ],
    })),
  
  clearVerificationErrors: () => set({ verificationErrors: [], showVerificationErrors: false }),
  
  setShowVerificationErrors: (show) => set({ showVerificationErrors: show }),
  
  setIsVerifying: (verifying) => set({ isVerifying: verifying }),
  
  setVerificationProgress: (progress) => set({ verificationProgress: progress }),
  
  markVerificationErrorRepaired: (id, success) =>
    set((state) => ({
      verificationErrors: state.verificationErrors.map((err) =>
        err.id === id
          ? { ...err, repairAttempted: true, repairSuccessful: success }
          : err
      ),
    })),
  
  removeVerificationError: (filePath) =>
    set((state) => ({
      verificationErrors: state.verificationErrors.filter((err) => err.filePath !== filePath),
      // Auto-hide modal if no errors remain
      showVerificationErrors: state.verificationErrors.filter((err) => err.filePath !== filePath).length > 0
        ? state.showVerificationErrors
        : false,
    })),
  
  removeVerificationErrors: (filePaths) => {
    const pathSet = new Set(filePaths);
    set((state) => {
      const remaining = state.verificationErrors.filter((err) => !pathSet.has(err.filePath));
      return {
        verificationErrors: remaining,
        // Auto-hide modal if no errors remain
        showVerificationErrors: remaining.length > 0 ? state.showVerificationErrors : false,
      };
    });
  },
  
  getRetryableVerificationErrors: () => {
    const state = get();
    return state.verificationErrors.filter(
      (err) => !err.repairAttempted || !err.repairSuccessful
    );
  },

  // Sync options
  syncOptions: DEFAULT_SYNC_OPTIONS,
  updateSyncOptions: (options) =>
    set((state) => ({
      syncOptions: { ...state.syncOptions, ...options },
    })),

  // Transfer stats
  transferStats: defaultTransferStats,
  updateTransferStats: (stats) =>
    set((state) => ({
      transferStats: { ...state.transferStats, ...stats },
    })),
  resetTransferStats: () => set({ transferStats: defaultTransferStats }),

  // Conflicts
  conflicts: [],
  currentConflict: null,
  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [...state.conflicts, conflict],
    })),
  resolveConflict: async (id, resolution) => {
    const state = get();
    const transferId = state.transferId;

    // Update local state immediately for responsive UI
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== id),
      currentConflict: state.currentConflict?.id === id ? null : state.currentConflict,
    }));

    // Notify backend of the resolution (fire-and-forget with error logging)
    try {
      await invokeResolveConflict(id, resolution, transferId);
    } catch (error) {
      // Error is already logged by invokeResolveConflict
      // We could optionally update an error state here if needed
      // but we don't revert the local state change since the user's
      // intent was clear and the file operation may have succeeded
      logger.warn('Backend conflict resolution notification failed, but UI state updated');
    }
  },
  setCurrentConflict: (conflict) => set({ currentConflict: conflict }),

  // History - delegated to persisted historyStore
  // Using a getter that reads from historyStore for backward compatibility
  get history() {
    return useHistoryStore.getState().history;
  },
  addHistoryItem: (item) => {
    // Delegate to the persisted history store
    useHistoryStore.getState().addHistoryItem(item);
  },
  clearHistory: () => {
    // Delegate to the persisted history store
    useHistoryStore.getState().clearHistory();
  },

  // Transfer Queue
  transferQueue: [],
  
  addToQueue: (sourcePath, destPath) => {
    const id = crypto.randomUUID();
    const newItem: TransferQueueItem = {
      id,
      sourcePath,
      destPath,
      status: 'pending',
      addedAt: new Date(),
    };
    set((state) => ({
      transferQueue: [...state.transferQueue, newItem],
    }));
    return id;
  },

  removeFromQueue: (id) =>
    set((state) => ({
      transferQueue: state.transferQueue.filter((item) => item.id !== id),
    })),

  updateQueueItem: (id, updates) =>
    set((state) => ({
      transferQueue: state.transferQueue.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),

  startNextTransfer: () => {
    const state = get();
    const nextPending = state.transferQueue.find((item) => item.status === 'pending');
    if (nextPending) {
      set((state) => ({
        transferQueue: state.transferQueue.map((item) =>
          item.id === nextPending.id
            ? { ...item, status: 'running' as const, startedAt: new Date() }
            : item
        ),
      }));
      return nextPending;
    }
    return null;
  },

  markTransferComplete: (id) =>
    set((state) => ({
      transferQueue: state.transferQueue.map((item) =>
        item.id === id
          ? { ...item, status: 'completed' as const, completedAt: new Date() }
          : item
      ),
    })),

  markTransferError: (id, error) =>
    set((state) => ({
      transferQueue: state.transferQueue.map((item) =>
        item.id === id
          ? { ...item, status: 'error' as const, error, completedAt: new Date() }
          : item
      ),
    })),

  clearCompletedFromQueue: () =>
    set((state) => ({
      transferQueue: state.transferQueue.filter(
        (item) => item.status === 'pending' || item.status === 'running'
      ),
    })),

  getNextPendingTransfer: () => {
    const state = get();
    return state.transferQueue.find((item) => item.status === 'pending') || null;
  },

  // Actions
  startSync: () => {
    const state = get();
    const fileCount = state.normalizedFiles.ids.length;
    if (fileCount === 0) return;

    // Calculate total size
    let totalBytes = 0;
    for (const id of state.normalizedFiles.ids) {
      totalBytes += state.normalizedFiles.byId[id].size;
    }

    set({
      syncState: 'preparing',
      transferStats: {
        ...defaultTransferStats,
        totalFiles: fileCount,
        totalBytes,
        startTime: new Date(),
      },
    });

    // Mark all files as pending (O(n) but unavoidable)
    set((state) => {
      const byId: Record<string, FileItem> = {};
      for (const id of state.normalizedFiles.ids) {
        byId[id] = { ...state.normalizedFiles.byId[id], status: 'pending', progress: 0 };
      }
      return {
        normalizedFiles: { ...state.normalizedFiles, byId },
      };
    });

    // Transition to syncing
    set({ syncState: 'syncing' });
  },

  pauseSync: () => set({ syncState: 'paused' }),

  resumeSync: () => set({ syncState: 'syncing' }),

  cancelSync: () => {
    const state = get();
    if (state.syncState !== 'idle' && state.transferStats.startTime) {
      const duration = (Date.now() - state.transferStats.startTime.getTime()) / 1000;
      state.addHistoryItem({
        id: crypto.randomUUID(),
        sourcePath: state.sourcePath || '',
        destPath: state.destPath || '',
        filesCount: state.transferStats.completedFiles,
        totalSize: state.transferStats.transferredBytes,
        duration,
        status: 'cancelled',
        timestamp: new Date(),
      });
    }
    set({ syncState: 'cancelled' });
  },

  reset: () =>
    set({
      normalizedFiles: { byId: {}, ids: [] },
      selectedFiles: new Set(),
      syncState: 'idle',
      transferStats: defaultTransferStats,
      conflicts: [],
      currentConflict: null,
      sourcePath: null,
      destPath: null,
      transferId: null,
      isScanning: false,
      scanProgress: null,
      lastError: null,
      verificationErrors: [],
      isVerifying: false,
      verificationProgress: null,
    }),
}));
