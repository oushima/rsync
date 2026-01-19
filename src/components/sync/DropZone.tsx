import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FolderOpen, File, X, HardDrive, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Button } from '../ui/Button';
import { useSync } from '../../hooks/useSync';
import { useSyncStore } from '../../stores/syncStore';
import { useSettingsStore } from '../../stores/settingsStore';
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
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isLoadingVolume, setIsLoadingVolume] = useState(false);
  const { addFiles, addFilesFromDialog, addFolderFromDialog } = useSync();
  const { 
    sourcePath, setSourcePath, clearFiles, sourceVolumeInfo, setSourceVolumeInfo,
    isDraggingFiles, dragOverZone, setIsDraggingFiles, setDragOverZone
  } = useSyncStore();
  const { language } = useSettingsStore();

  const isHoveredHere = isDraggingFiles && dragOverZone === 'source';
  const isHoveredElsewhere = isDraggingFiles && dragOverZone !== 'source';

  // Handle Tauri native drag-drop events
  useEffect(() => {
    if (!isTauri()) return;

    const appWindow = getCurrentWebviewWindow();
    let unlisten: (() => void) | null = null;

    const isOverThisZone = (position: { x: number; y: number }) => {
      if (!dropZoneRef.current) return false;
      const rect = dropZoneRef.current.getBoundingClientRect();
      return (
        position.x >= rect.left &&
        position.x <= rect.right &&
        position.y >= rect.top &&
        position.y <= rect.bottom
      );
    };

    appWindow.onDragDropEvent(async (event) => {
      if (event.payload.type === 'enter') {
        setIsDraggingFiles(true);
      } else if (event.payload.type === 'over') {
        setIsDraggingFiles(true);
        const position = event.payload.position;
        if (position && isOverThisZone(position)) {
          setDragOverZone('source');
        }
      } else if (event.payload.type === 'drop') {
        const position = event.payload.position;
        const wasOverHere = position && isOverThisZone(position);
        setIsDraggingFiles(false);
        
        // Only handle drop if it was over this zone
        if (!wasOverHere) return;
        
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          const firstPath = paths[0];
          // Check if it's a directory
          try {
            const info = await invoke<{ files: Array<{ path: string; size: number; modified: string; is_dir: boolean }> }>(
              'get_directory_info',
              { path: firstPath }
            );
            // It's a directory - set as source
            setSourcePath(firstPath);
            const mapped: FileItem[] = info.files.map((f) => ({
              id: crypto.randomUUID(),
              name: f.path.split('/').pop() || f.path,
              path: firstPath.endsWith('/') ? `${firstPath}${f.path}` : `${firstPath}/${f.path}`,
              size: f.size,
              isDirectory: f.is_dir,
              modifiedAt: new Date(f.modified),
              status: 'pending',
            }));
            clearFiles();
            addFiles(mapped);
          } catch {
            // Not a directory or error - treat as files
            const newFiles: FileItem[] = paths.map((p) => ({
              id: crypto.randomUUID(),
              name: p.split('/').pop() || p,
              path: p,
              size: 0,
              isDirectory: false,
              modifiedAt: new Date(),
              status: 'pending',
            }));
            if (paths.length > 0) {
              const parentPath = paths[0].substring(0, paths[0].lastIndexOf('/'));
              if (parentPath) setSourcePath(parentPath);
            }
            addFiles(newFiles);
          }
        }
      } else if (event.payload.type === 'leave') {
        setIsDraggingFiles(false);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [addFiles, clearFiles, setSourcePath, setIsDraggingFiles, setDragOverZone]);

  // Fetch volume info when source path changes (only if not cached)
  useEffect(() => {
    if (!sourcePath || !isTauri()) {
      setSourceVolumeInfo(null);
      return;
    }
    
    // Skip if we already have cached info for this path
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
  }, [sourcePath, sourceVolumeInfo?.mount_point, setSourceVolumeInfo]);

  const handleFilesClick = useCallback(() => {
    addFilesFromDialog();
  }, [addFilesFromDialog]);

  const handleFolderClick = useCallback(() => {
    addFolderFromDialog();
  }, [addFolderFromDialog]);

  const texts = {
    en: {
      label: 'Source',
      title: 'Drop your files or folders here',
      subtitle: 'or choose them with the buttons below',
      selectedTitle: 'Files will be copied from',
      files: 'Choose files',
      folder: 'Choose folder',
      change: 'Change',
      clear: 'Clear',
      dragging: 'Let go to add them',
    },
    nl: {
      label: 'Bron',
      title: 'Sleep je bestanden of mappen hierheen',
      subtitle: 'of kies ze met de knoppen hieronder',
      selectedTitle: 'Bestanden worden gekopieerd van',
      files: 'Kies bestanden',
      folder: 'Kies map',
      change: 'Wijzig',
      clear: 'Wissen',
      dragging: 'Laat los om toe te voegen',
    },
  };

  const t = texts[language];

  return (
    <div className="flex flex-col gap-2 h-full">
      <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide px-1">
        {t.label}
      </span>
      <div
        ref={dropZoneRef}
        className={clsx(
          'relative rounded-2xl lg:rounded-3xl border-2 border-dashed flex-1 min-h-50',
          'transition-all duration-200 ease-out',
          'flex flex-col items-center justify-center gap-4 lg:gap-6 py-6 lg:py-10 px-4 sm:px-6 lg:px-10',
          isHoveredHere
            ? 'border-accent bg-accent-subtle'
            : isHoveredElsewhere
              ? 'border-text-tertiary/50 bg-bg-tertiary/30'
              : 'border-border bg-bg-secondary/50 hover:border-text-tertiary hover:bg-bg-secondary/70'
        )}
      >
      <AnimatePresence mode="wait">
        {isHoveredHere ? (
          <motion.div
            key="dragging"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-3"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
              className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center"
            >
              <Upload className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </motion.div>
            <p className="text-sm font-semibold text-accent">
              {t.dragging}
            </p>
          </motion.div>
        ) : sourcePath ? (
          <motion.div
            key="selected"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-4 w-full"
          >
            <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
              <Upload className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </div>
            <div className="text-center space-y-1 w-full">
              <p className="text-xs text-text-tertiary">
                {t.selectedTitle}
              </p>
              <p className="text-sm font-semibold text-text-primary" title={sourcePath}>
                {sourcePath.split('/').pop() || sourcePath}
              </p>
              <p className="text-xs text-text-tertiary break-all px-2" title={sourcePath}>
                {sourcePath}
              </p>
              {isLoadingVolume ? (
                <p className="text-xs text-text-tertiary flex items-center justify-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading drive info...
                </p>
              ) : sourceVolumeInfo && (
                <div className="text-xs text-text-tertiary space-y-0.5">
                  <p className="flex items-center justify-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {sourceVolumeInfo.manufacturer && `${sourceVolumeInfo.manufacturer} `}
                    {sourceVolumeInfo.is_external 
                      ? (sourceVolumeInfo.drive_type !== 'Unknown' ? `External ${sourceVolumeInfo.drive_type}` : 'External Drive')
                      : (sourceVolumeInfo.drive_type !== 'Unknown' ? sourceVolumeInfo.drive_type : 'Internal Drive')
                    }
                  </p>
                  {sourceVolumeInfo.total_space > 0 && (
                    <p>
                      {formatBytes(sourceVolumeInfo.total_space - sourceVolumeInfo.available_space)} used · {formatBytes(sourceVolumeInfo.available_space)} free
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={() => { setSourcePath(null); clearFiles(); setSourceVolumeInfo(null); }}
                leftIcon={<X className="w-4 h-4" strokeWidth={1.75} />}
                className="px-4 sm:px-5"
              >
                {t.clear}
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleFolderClick}
                leftIcon={<FolderOpen className="w-4 h-4" strokeWidth={1.75} />}
                className="px-4 sm:px-6"
              >
                {t.change}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-bg-tertiary flex items-center justify-center">
              <Upload className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-text-primary">
                {t.title}
              </p>
              <p className="text-xs text-text-tertiary">
                {t.subtitle}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={handleFilesClick}
                leftIcon={<File className="w-4 h-4" strokeWidth={1.75} />}
                className="px-4 sm:px-6"
              >
                {t.files}
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleFolderClick}
                leftIcon={<FolderOpen className="w-4 h-4" strokeWidth={1.75} />}
                className="px-4 sm:px-6"
              >
                {t.folder}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
