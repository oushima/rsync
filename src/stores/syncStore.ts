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
} from '../types';

interface SyncStore {
  // Navigation
  currentPage: NavigationPage;
  setCurrentPage: (page: NavigationPage) => void;

  // Source and destination
  sourcePath: string | null;
  destPath: string | null;
  setSourcePath: (path: string | null) => void;
  setDestPath: (path: string | null) => void;

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
};

export const useSyncStore = create<SyncStore>((set, get) => ({
  // Navigation
  currentPage: 'sync',
  setCurrentPage: (page) => set({ currentPage: page }),

  // Paths
  sourcePath: null,
  destPath: null,
  setSourcePath: (path) => set({ sourcePath: path }),
  setDestPath: (path) => set({ destPath: path }),

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
