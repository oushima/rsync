import { create } from 'zustand';
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

interface SyncStore {
  // Navigation
  currentPage: NavigationPage;
  setCurrentPage: (page: NavigationPage) => void;

  // Drag state
  isDraggingFiles: boolean;
  dragOverZone: 'source' | 'destination' | null;
  setIsDraggingFiles: (dragging: boolean) => void;
  setDragOverZone: (zone: 'source' | 'destination' | null) => void;

  // Source and destination
  sourcePath: string | null;
  destPath: string | null;
  sourceVolumeInfo: VolumeInfo | null;
  destVolumeInfo: VolumeInfo | null;
  setSourcePath: (path: string | null) => void;
  setDestPath: (path: string | null) => void;
  setSourceVolumeInfo: (info: VolumeInfo | null) => void;
  setDestVolumeInfo: (info: VolumeInfo | null) => void;

  // Files
  files: FileItem[];
  selectedFiles: Set<string>;
  addFiles: (files: FileItem[]) => void;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  updateFileStatus: (id: string, status: FileItem['status'], progress?: number) => void;
  toggleFileSelection: (id: string) => void;
  selectAllFiles: () => void;
  deselectAllFiles: () => void;

  // Sync state
  syncState: SyncState;
  setSyncState: (state: SyncState) => void;
  transferId: string | null;
  setTransferId: (id: string | null) => void;

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
  resolveConflict: (id: string, resolution: ConflictResolution) => void;
  setCurrentConflict: (conflict: ConflictInfo | null) => void;

  // History
  history: TransferHistoryItem[];
  addHistoryItem: (item: TransferHistoryItem) => void;
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
};

const defaultSyncOptions: SyncOptions = {
  overwriteNewer: true,
  overwriteOlder: false,
  skipExisting: false,
  deleteOrphans: false,
  preservePermissions: true,
  followSymlinks: false,
  dryRun: false,
  verifyChecksum: 'off',
  autoRepair: true,
  shutdownAfterComplete: false,
  maxConcurrentFiles: 4, // Good default for SSDs and network drives
};

export const useSyncStore = create<SyncStore>((set, get) => ({
  // Navigation
  currentPage: 'sync',
  setCurrentPage: (page) => set({ currentPage: page }),

  // Drag state
  isDraggingFiles: false,
  dragOverZone: null,
  setIsDraggingFiles: (dragging) => set({ isDraggingFiles: dragging, dragOverZone: dragging ? get().dragOverZone : null }),
  setDragOverZone: (zone) => set({ dragOverZone: zone }),

  // Paths
  sourcePath: null,
  destPath: null,
  sourceVolumeInfo: null,
  destVolumeInfo: null,
  setSourcePath: (path) => set({ sourcePath: path, sourceVolumeInfo: path ? get().sourceVolumeInfo : null }),
  setDestPath: (path) => set({ destPath: path, destVolumeInfo: path ? get().destVolumeInfo : null }),
  setSourceVolumeInfo: (info) => set({ sourceVolumeInfo: info }),
  setDestVolumeInfo: (info) => set({ destVolumeInfo: info }),

  // Files
  files: [],
  selectedFiles: new Set(),

  addFiles: (newFiles) =>
    set((state) => {
      const existingPaths = new Set(state.files.map((f) => f.path));
      const uniqueFiles = newFiles.filter((f) => !existingPaths.has(f.path));
      return { files: [...state.files, ...uniqueFiles] };
    }),

  removeFile: (id) =>
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      selectedFiles: new Set([...state.selectedFiles].filter((fId) => fId !== id)),
    })),

  clearFiles: () => set({ files: [], selectedFiles: new Set() }),

  updateFileStatus: (id, status, progress) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status, progress: progress ?? f.progress } : f
      ),
    })),

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
      selectedFiles: new Set(state.files.map((f) => f.id)),
    })),

  deselectAllFiles: () => set({ selectedFiles: new Set() }),

  // Sync state
  syncState: 'idle',
  setSyncState: (state) => set({ syncState: state }),
  transferId: null,
  setTransferId: (id) => set({ transferId: id }),

  // Sync options
  syncOptions: defaultSyncOptions,
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
  resolveConflict: (id, _resolution) =>
    set((state) => ({
      conflicts: state.conflicts.filter((c) => c.id !== id),
      currentConflict: state.currentConflict?.id === id ? null : state.currentConflict,
    })),
  setCurrentConflict: (conflict) => set({ currentConflict: conflict }),

  // History
  history: [],
  addHistoryItem: (item) =>
    set((state) => ({
      history: [item, ...state.history].slice(0, 50), // Keep last 50 items
    })),
  clearHistory: () => set({ history: [] }),

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
    if (state.files.length === 0) return;

    set({
      syncState: 'preparing',
      transferStats: {
        ...defaultTransferStats,
        totalFiles: state.files.length,
        totalBytes: state.files.reduce((acc, f) => acc + f.size, 0),
        startTime: new Date(),
      },
    });

    // Mark all files as pending
    set((state) => ({
      files: state.files.map((f) => ({ ...f, status: 'pending' as const, progress: 0 })),
    }));

    // Transition to syncing
    setTimeout(() => set({ syncState: 'syncing' }), 500);
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
      files: [],
      selectedFiles: new Set(),
      syncState: 'idle',
      transferStats: defaultTransferStats,
      conflicts: [],
      currentConflict: null,
      sourcePath: null,
      destPath: null,
      transferId: null,
    }),
}));
