import { useCallback, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useSyncStore } from '../stores/syncStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { FileItem } from '../types';

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

const isTauriApp = () => isTauri();

export function useSync() {
  const {
    files,
    sourcePath,
    destPath,
    syncState,
    syncOptions,
    transferStats,
    transferId,
    setSourcePath,
    setDestPath,
    addFiles,
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
  } = useSyncStore();

  const activeTransferRef = useRef<string | null>(transferId);
  useEffect(() => {
    activeTransferRef.current = transferId;
  }, [transferId]);

  useEffect(() => {
    if (!isTauriApp()) return;

    let unlisten: UnlistenFn | null = null;
    listen<BackendProgressEvent>('sync-progress', (event) => {
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
        const state = useSyncStore.getState();
        const match = state.files.find((f) => f.path === payload.currentFile || payload.currentFile.endsWith(f.path));
        if (match) {
          updateFileStatus(match.id, 'syncing', Math.round(payload.currentFileProgress * 100));
        }
      }

      if (useSyncStore.getState().syncState === 'preparing') {
        setSyncState('syncing');
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((error) => {
        console.error('Failed to listen for progress events:', error);
      });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [setSyncState, setTransferId, updateFileStatus, updateTransferStats]);

  const joinPath = useCallback((base: string, rel: string) => {
    const normalized = rel.replace(/^[/\\]+/, '');
    return base.endsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
  }, []);

  const loadDirectoryInfo = useCallback(async (path: string) => {
    try {
      const info = await invoke<{ files: Array<{ path: string; size: number; modified: string; is_dir: boolean }> }>(
        'get_directory_info',
        { path }
      );
      const mapped: FileItem[] = info.files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.path.split('/').pop() || file.path,
        path: joinPath(path, file.path),
        size: file.size,
        isDirectory: file.is_dir,
        modifiedAt: new Date(file.modified),
        status: 'pending',
      }));
      clearFiles();
      addFiles(mapped);
    } catch (error) {
      console.error('Failed to load directory info:', error);
    }
  }, [addFiles, clearFiles, joinPath]);

  const selectSourceFolder = useCallback(async () => {
    try {
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
            id: crypto.randomUUID(),
            name: file.name,
            path: file.webkitRelativePath || file.name,
            size: file.size,
            isDirectory: false,
            modifiedAt: new Date(file.lastModified),
            status: 'pending',
          }));
          clearFiles();
          addFiles(mapped);
        };
        input.click();
        return;
      }

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Source Folder',
      });

      if (selected) {
        const path = selected as string;
        setSourcePath(path);
        await loadDirectoryInfo(path);
      }
    } catch (error) {
      console.error('Failed to select source folder:', error);
    }
  }, [addFiles, clearFiles, loadDirectoryInfo, setSourcePath]);

  const selectDestFolder = useCallback(async () => {
    try {
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

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Destination Folder',
      });

      if (selected) {
        setDestPath(selected as string);
      }
    } catch (error) {
      console.error('Failed to select destination folder:', error);
    }
  }, [setDestPath]);

  const addFilesFromDialog = useCallback(async () => {
    try {
      if (!isTauriApp()) {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = () => {
          const files = Array.from(input.files ?? []);
          const mapped: FileItem[] = files.map((file) => ({
            id: crypto.randomUUID(),
            name: file.name,
            path: file.name,
            size: file.size,
            isDirectory: false,
            modifiedAt: new Date(file.lastModified),
            status: 'pending',
          }));
          addFiles(mapped);
        };
        input.click();
        return;
      }

      const selected = await open({
        directory: false,
        multiple: true,
        title: 'Select Files to Sync',
      });

      if (selected && Array.isArray(selected)) {
        const newFiles: FileItem[] = selected.map((path) => ({
          id: crypto.randomUUID(),
          name: path.split('/').pop() || path,
          path: path,
          size: 0,
          isDirectory: false,
          modifiedAt: new Date(),
          status: 'pending',
        }));
        addFiles(newFiles);
      }
    } catch (error) {
      console.error('Failed to select files:', error);
    }
  }, [addFiles]);

  const addFolderFromDialog = useCallback(async () => {
    try {
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
            id: crypto.randomUUID(),
            name: file.name,
            path: file.webkitRelativePath || file.name,
            size: file.size,
            isDirectory: false,
            modifiedAt: new Date(file.lastModified),
            status: 'pending',
          }));
          clearFiles();
          addFiles(mapped);
        };
        input.click();
        return;
      }

      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Folder to Sync',
      });

      if (selected) {
        const path = selected as string;
        setSourcePath(path);
        await loadDirectoryInfo(path);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  }, [addFiles, clearFiles, loadDirectoryInfo, setSourcePath]);

  const mapBackendOptions = useCallback(() => {
    const conflictResolution = syncOptions.skipExisting ? 'skip' : 'overwrite';
    return {
      source: sourcePath || '',
      destination: destPath || '',
      mode: 'copy',
      conflict_resolution: conflictResolution,
      verify_integrity: true,
      preserve_metadata: syncOptions.preservePermissions,
      delete_orphans: syncOptions.deleteOrphans,
      buffer_size: null,
      dry_run: syncOptions.dryRun,
      follow_symlinks: syncOptions.followSymlinks,
    };
  }, [destPath, sourcePath, syncOptions.deleteOrphans, syncOptions.dryRun, syncOptions.followSymlinks, syncOptions.preservePermissions, syncOptions.skipExisting]);

  const handleStartSync = useCallback(async () => {
    if (!destPath || files.length === 0) return;

    startSync();
    
    // Prevent system sleep if setting is enabled
    const { preventSleepDuringTransfer } = useSettingsStore.getState();
    if (preventSleepDuringTransfer && isTauriApp()) {
      try {
        await invoke('prevent_sleep', { reason: 'File transfer in progress' });
      } catch (error) {
        console.warn('Failed to prevent sleep:', error);
      }
    }

    if (!isTauriApp()) {
      let completedFiles = 0;
      let transferredBytes = 0;
      const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
      const startTime = Date.now();

      for (const file of files) {
        if (useSyncStore.getState().syncState === 'cancelled') break;

        while (useSyncStore.getState().syncState === 'paused') {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (useSyncStore.getState().syncState === 'cancelled') break;

        updateFileStatus(file.id, 'syncing', 0);

        for (let progress = 0; progress <= 100; progress += 10) {
          if (useSyncStore.getState().syncState === 'cancelled') break;

          await new Promise((resolve) => setTimeout(resolve, 50));
          updateFileStatus(file.id, 'syncing', progress);

          const bytesProgress = file.size * (progress / 100);
          const elapsed = (Date.now() - startTime) / 1000;
          const currentSpeed = bytesProgress / Math.max(elapsed, 0.1);

          updateTransferStats({
            transferredBytes: transferredBytes + bytesProgress,
            currentSpeed,
            averageSpeed: (transferredBytes + bytesProgress) / Math.max(elapsed, 0.1),
            currentFile: file.name,
            estimatedTimeRemaining: ((totalBytes - transferredBytes - bytesProgress) / Math.max(currentSpeed, 1)),
          });
        }

        if (useSyncStore.getState().syncState !== 'cancelled') {
          updateFileStatus(file.id, 'completed', 100);
          completedFiles++;
          transferredBytes += file.size;
          updateTransferStats({ completedFiles, transferredBytes });
        }
      }

      const finalState = useSyncStore.getState().syncState;
      if (finalState !== 'cancelled') {
        setSyncState('completed');

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
      const resolvedSource = sourcePath || files.find((f) => f.isDirectory)?.path;
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

      console.log('[Sync] Result:', result);

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
        status: result.files_failed > 0 ? 'error' : 'completed',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error('Sync failed:', error);
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
      });
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
  ]);

  const handlePauseSync = useCallback(async () => {
    pauseSync();
    if (isTauriApp() && transferId) {
      try {
        await invoke('pause_transfer', { transferId });
      } catch (error) {
        console.error('Failed to pause transfer:', error);
      }
    }
  }, [pauseSync, transferId]);

  const handleResumeSync = useCallback(async () => {
    resumeSync();
    if (isTauriApp() && transferId) {
      try {
        await invoke('resume_transfer', { transferId });
      } catch (error) {
        console.error('Failed to resume transfer:', error);
      }
    }
  }, [resumeSync, transferId]);

  const handleCancelSync = useCallback(async () => {
    cancelSync();
    if (isTauriApp()) {
      if (transferId) {
        try {
          await invoke('cancel_transfer', { transferId });
        } catch (error) {
          console.error('Failed to cancel transfer:', error);
        }
      }
      // Allow system to sleep again when transfer is cancelled
      try {
        await invoke('allow_sleep');
      } catch (error) {
        console.warn('Failed to allow sleep:', error);
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

  return {
    // State
    files,
    sourcePath,
    destPath,
    syncState,
    syncOptions,
    transferStats,
    
    // Actions
    selectSourceFolder,
    selectDestFolder,
    addFilesFromDialog,
    addFolderFromDialog,
    addFiles,
    removeFile,
    clearFiles,
    updateSyncOptions,
    startSync: handleStartSync,
    pauseSync: handlePauseSync,
    resumeSync: handleResumeSync,
    cancelSync: handleCancelSync,
    reset,
    
    // Utils
    formatBytes,
    formatTime,
    
    // Computed
    canSync: destPath !== null && files.length > 0 && syncState === 'idle',
    isRunning: ['preparing', 'syncing'].includes(syncState),
    isPaused: syncState === 'paused',
    isComplete: syncState === 'completed',
  };
}
