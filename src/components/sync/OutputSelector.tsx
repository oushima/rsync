import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FolderOpen, X, HardDrive, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import type { VolumeInfo } from '../../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(1)} TB`;
  }
  return `${gb.toFixed(1)} GB`;
}

export function OutputSelector() {
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isLoadingVolume, setIsLoadingVolume] = useState(false);
  const { 
    destPath, setDestPath, destVolumeInfo, setDestVolumeInfo,
    isDraggingFiles, dragOverZone, setIsDraggingFiles, setDragOverZone
  } = useSyncStore();
  const { selectDestFolder } = useSync();
  const { language, rememberLastDestination, lastDestinationPath, setLastDestinationPath } = useSettingsStore();

  const isHoveredHere = isDraggingFiles && dragOverZone === 'destination';
  const isHoveredElsewhere = isDraggingFiles && dragOverZone !== 'destination';

  // Restore last destination on mount if setting is enabled
  useEffect(() => {
    if (rememberLastDestination && lastDestinationPath && !destPath && isTauri()) {
      // Verify the path still exists
      invoke('get_directory_info', { path: lastDestinationPath })
        .then(() => {
          setDestPath(lastDestinationPath);
        })
        .catch(() => {
          // Path no longer exists, clear it
          setLastDestinationPath(null);
        });
    }
  }, []); // Only run once on mount

  // Save destination path when it changes
  useEffect(() => {
    if (rememberLastDestination && destPath) {
      setLastDestinationPath(destPath);
    }
  }, [destPath, rememberLastDestination, setLastDestinationPath]);

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
          setDragOverZone('destination');
        }
      } else if (event.payload.type === 'drop') {
        const position = event.payload.position;
        const wasOverHere = position && isOverThisZone(position);
        setIsDraggingFiles(false);
        
        // Only handle drop if it was over this zone
        if (!wasOverHere) return;
        
        const paths = event.payload.paths;
        if (paths && paths.length > 0) {
          // For destination, we only want directories
          // Try to check if it's a directory by calling get_directory_info
          const firstPath = paths[0];
          try {
            await invoke('get_directory_info', { path: firstPath });
            // If it succeeds, it's a directory
            setDestPath(firstPath);
          } catch {
            // Not a directory - ignore for destination
            console.warn('Dropped item is not a folder');
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
  }, [setDestPath, setIsDraggingFiles, setDragOverZone]);

  // Fetch volume info when dest path changes (only if not cached)
  useEffect(() => {
    if (!destPath || !isTauri()) {
      setDestVolumeInfo(null);
      return;
    }
    
    // Skip if we already have cached info for this path
    if (destVolumeInfo?.mount_point && destPath.startsWith(destVolumeInfo.mount_point)) {
      return;
    }
    
    setIsLoadingVolume(true);
    invoke<VolumeInfo>('get_volume_info', { path: destPath })
      .then(setDestVolumeInfo)
      .catch((err) => {
        console.warn('Failed to get volume info:', err);
        setDestVolumeInfo(null);
      })
      .finally(() => setIsLoadingVolume(false));
  }, [destPath, destVolumeInfo?.mount_point, setDestVolumeInfo]);

  const handleFolderClick = useCallback(() => {
    selectDestFolder();
  }, [selectDestFolder]);

  const texts = {
    en: {
      label: 'Destination',
      title: 'Drop a folder here',
      subtitle: 'or choose one with the button below',
      selectedTitle: 'Files will be copied to',
      choose: 'Choose folder',
      change: 'Change',
      dragging: 'Let go to set destination',
    },
    nl: {
      label: 'Bestemming',
      title: 'Sleep een map hierheen',
      subtitle: 'of kies er een met de knop hieronder',
      selectedTitle: 'Bestanden worden gekopieerd naar',
      choose: 'Kies map',
      change: 'Wijzig',
      dragging: 'Laat los om bestemming in te stellen',
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
                <Download className="w-5 h-5 text-accent" strokeWidth={1.75} />
              </motion.div>
              <p className="text-sm font-semibold text-accent">
                {t.dragging}
              </p>
            </motion.div>
          ) : destPath ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-4 w-full"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                <Download className="w-5 h-5 text-accent" strokeWidth={1.75} />
              </div>
              <div className="text-center space-y-1 w-full">
                <p className="text-xs text-text-tertiary">
                  {t.selectedTitle}
                </p>
                <p className="text-sm font-semibold text-text-primary" title={destPath}>
                  {destPath.split('/').pop() || destPath}
                </p>
                <p className="text-xs text-text-tertiary break-all px-2" title={destPath}>
                  {destPath}
                </p>
                {isLoadingVolume ? (
                  <p className="text-xs text-text-tertiary flex items-center justify-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading drive info...
                  </p>
                ) : destVolumeInfo && (
                  <div className="text-xs text-text-tertiary space-y-0.5">
                    <p className="flex items-center justify-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {destVolumeInfo.manufacturer && `${destVolumeInfo.manufacturer} `}
                      {destVolumeInfo.is_external 
                        ? (destVolumeInfo.drive_type !== 'Unknown' ? `External ${destVolumeInfo.drive_type}` : 'External Drive')
                        : (destVolumeInfo.drive_type !== 'Unknown' ? destVolumeInfo.drive_type : 'Internal Drive')
                      }
                    </p>
                    {destVolumeInfo.total_space > 0 && (
                      <p>
                        {formatBytes(destVolumeInfo.total_space - destVolumeInfo.available_space)} used · {formatBytes(destVolumeInfo.available_space)} free
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => { setDestPath(null); setDestVolumeInfo(null); }}
                  leftIcon={<X className="w-4 h-4" strokeWidth={1.75} />}
                  className="px-5"
                >
                  Clear
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleFolderClick}
                  leftIcon={<FolderOpen className="w-4 h-4" strokeWidth={1.75} />}
                  className="px-6"
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
                <Download className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-text-primary">
                  {t.title}
                </p>
                <p className="text-xs text-text-tertiary">
                  {t.subtitle}
                </p>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={handleFolderClick}
                leftIcon={<FolderOpen className="w-4 h-4" strokeWidth={1.75} />}
                className="px-4 sm:px-6"
              >
                {t.choose}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
