import { useState, useCallback, useEffect, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FolderOpen, File, X, HardDrive, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Button } from '../ui/Button';
import { useSync } from '../../hooks/useSync';
import { useDropZone } from '../../hooks/useDragDrop';
import { useSyncStore } from '../../stores/syncStore';
import type { FileItem, VolumeInfo } from '../../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(1)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
}

export function DropZone() {
  const { t } = useTranslation();
  const [isLoadingVolume, setIsLoadingVolume] = useState(false);
  const { addFilesFromDialog, addFolderFromDialog } = useSync();
  const { 
    sourcePath, setSourcePath, clearFiles, appendFiles, setFiles,
    sourceVolumeInfo, setSourceVolumeInfo, isScanning, setIsScanning, setScanProgress
  } = useSyncStore();

  // Handle drop for this zone - uses streaming for large directories
  const handleDrop = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    
    const firstPath = paths[0];
    
    // Set path immediately
    setSourcePath(firstPath);
    
    // Use streaming API for Tauri apps
    if (isTauri()) {
      const scanId = crypto.randomUUID();
      let totalSize = 0;
      let fileCountProgress = 0;
      
      clearFiles();
      setIsScanning(true);
      setScanProgress({ count: 0, totalSize: 0 });
      
      // Listen for file chunks
      let unlisten: UnlistenFn | null = null;
      
      try {
        unlisten = await listen<{
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
            if (unlisten) unlisten();
            return;
          }
          
          // Map and append files
          const mapped: FileItem[] = chunk.files.map((file) => {
            totalSize += file.size;
            fileCountProgress++;
            const fullPath = firstPath.endsWith('/') 
              ? `${firstPath}${file.path}` 
              : `${firstPath}/${file.path}`;
            return {
              id: fullPath, // Use path as stable ID
              name: file.path.split('/').pop() || file.path,
              path: fullPath,
              size: file.size,
              isDirectory: file.is_dir,
              modifiedAt: new Date(file.modified),
              status: 'pending' as const,
            };
          });
          
          appendFiles(mapped);
          setScanProgress({ count: fileCountProgress, totalSize });
        });
        
        // Start streaming scan
        await invoke('scan_directory_stream', { path: firstPath, scanId });
      } catch (error) {
        console.error('Failed to scan directory:', error);
        setIsScanning(false);
        setScanProgress(null);
        if (unlisten) unlisten();
        
        // Fallback: just add the dropped path as a single item
        const newFiles: FileItem[] = paths.map((p) => ({
          id: p,
          name: p.split('/').pop() || p,
          path: p,
          size: 0,
          isDirectory: true,
          modifiedAt: new Date(),
          status: 'pending' as const,
        }));
        setFiles(newFiles);
      }
      return;
    }
    
    // Fallback for non-Tauri (web)
    const newFiles: FileItem[] = paths.map((p) => ({
      id: p,
      name: p.split('/').pop() || p,
      path: p,
      size: 0,
      isDirectory: false,
      modifiedAt: new Date(),
      status: 'pending' as const,
    }));
    setFiles(newFiles);
  }, [appendFiles, clearFiles, setFiles, setIsScanning, setSourcePath, setScanProgress]);

  // Register this zone with the global drop handler
  const { ref, isHovered, isDraggingFiles } = useDropZone('source', handleDrop);

  // Fetch volume info when source path changes
  const prevSourcePath = useRef<string | null>(null);
  useEffect(() => {
    if (!sourcePath || !isTauri()) {
      if (sourceVolumeInfo) setSourceVolumeInfo(null);
      return;
    }
    
    // Only fetch if path actually changed
    if (sourcePath === prevSourcePath.current) return;
    prevSourcePath.current = sourcePath;
    
    // Skip if we already have info for this volume
    if (sourceVolumeInfo?.mount_point && sourcePath.startsWith(sourceVolumeInfo.mount_point)) {
      return;
    }
    
    setIsLoadingVolume(true);
    invoke<VolumeInfo>('get_volume_info', { path: sourcePath })
      .then(setSourceVolumeInfo)
      .catch((err) => {
        console.warn('Failed to get volume info:', err);
        setSourceVolumeInfo(null);
      })
      .finally(() => setIsLoadingVolume(false));
  }, [sourcePath]);

  const handleFilesClick = useCallback(() => {
    addFilesFromDialog();
  }, [addFilesFromDialog]);

  const handleFolderClick = useCallback(() => {
    addFolderFromDialog();
  }, [addFolderFromDialog]);

  const descriptionId = useId();

  // Handle keyboard activation for the drop zone
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!sourcePath) {
        handleFolderClick();
      }
    }
  }, [sourcePath, handleFolderClick]);

  return (
    <div className="flex flex-col gap-2 h-full">
      <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide px-1">
        {t('dropzone.label')}
      </span>
      <div
        ref={ref}
        data-dropzone="source"
        role="button"
        tabIndex={0}
        aria-label={sourcePath ? `${t('dropzone.selectedTitle')}: ${sourcePath}` : t('dropzone.title')}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className={clsx(
          'relative rounded-2xl lg:rounded-3xl border-2 border-dashed h-[220px]',
          'transition-colors duration-150',
          'flex flex-col items-center justify-center px-4 sm:px-6 lg:px-10',
          'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
          isHovered
            ? 'border-accent bg-accent/10'
            : isDraggingFiles
              ? 'border-text-tertiary/50 bg-bg-tertiary/30'
              : 'border-border bg-bg-secondary/50 hover:border-text-tertiary hover:bg-bg-secondary/70'
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isDraggingFiles ? (
            <motion.div
              key="dragging"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                <Upload className="w-5 h-5 text-accent" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-semibold text-accent">
                {t('dropzone.dragging')}
              </p>
            </motion.div>
          ) : isScanning ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-accent animate-spin" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-medium text-text-secondary">
                {t('dropzone.scanning')}
              </p>
            </motion.div>
          ) : sourcePath ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-3 w-full"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                <Upload className="w-5 h-5 text-accent" strokeWidth={1.75} />
              </div>
              <div className="text-center space-y-0.5 w-full">
                <p className="text-xs text-text-tertiary">
                  {t('dropzone.selectedTitle')}
                </p>
                <p className="text-sm font-semibold text-text-primary" title={sourcePath}>
                  {sourcePath.split('/').pop() || sourcePath}
                </p>
                <p className="text-xs text-text-tertiary break-all px-2 line-clamp-1" title={sourcePath}>
                  {sourcePath}
                </p>
                {isLoadingVolume ? (
                  <p className="text-xs text-text-tertiary flex items-center justify-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </p>
                ) : sourceVolumeInfo && (
                  <div className="text-xs text-text-tertiary">
                    <p className="flex items-center justify-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {sourceVolumeInfo.is_external ? t('common.external') : t('common.internal')}
                      {sourceVolumeInfo.total_space > 0 && (
                        <span> · {formatBytes(sourceVolumeInfo.available_space)} {t('common.free')}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setSourcePath(null); clearFiles(); setSourceVolumeInfo(null); }}
                  leftIcon={<X className="w-3.5 h-3.5" strokeWidth={2} />}
                >
                  {t('dropzone.clear')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFolderClick}
                  leftIcon={<FolderOpen className="w-3.5 h-3.5" strokeWidth={2} />}
                >
                  {t('dropzone.change')}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="w-12 h-12 rounded-xl bg-bg-tertiary flex items-center justify-center">
                <Upload className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-sm font-semibold text-text-primary">
                  {t('dropzone.title')}
                </p>
                <p id={descriptionId} className="text-xs text-text-tertiary">
                  {t('dropzone.subtitle')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleFilesClick}
                  leftIcon={<File className="w-3.5 h-3.5" strokeWidth={2} />}
                >
                  {t('dropzone.files')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFolderClick}
                  leftIcon={<FolderOpen className="w-3.5 h-3.5" strokeWidth={2} />}
                >
                  {t('dropzone.folder')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
