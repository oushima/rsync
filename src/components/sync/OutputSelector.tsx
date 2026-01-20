import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FolderOpen, X, HardDrive, Loader2, Clock, ChevronDown, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useDropZone } from '../../hooks/useDragDrop';
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
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingVolume, setIsLoadingVolume] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const recentDropdownRef = useRef<HTMLDivElement>(null);
  const { 
    destPath, setDestPath, destVolumeInfo, setDestVolumeInfo
  } = useSyncStore();
  const { selectDestFolder } = useSync();
  const { 
    rememberLastDestination, 
    lastDestinationPath, 
    setLastDestinationPath,
    recentDestinations,
    addRecentDestination,
    clearRecentDestinations
  } = useSettingsStore();

  // Handle drop for this zone
  const handleDrop = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    
    const firstPath = paths[0];
    setIsLoading(true);
    setDestPath(firstPath);
    
    try {
      await invoke('get_directory_info', { path: firstPath });
      // Success - it's a directory, path already set
    } catch {
      // Not a directory - clear it
      setDestPath(null);
      console.warn('Dropped item is not a folder');
    } finally {
      setIsLoading(false);
    }
  }, [setDestPath]);

  // Register this zone with the global drop handler
  const { ref, isHovered, isDraggingFiles } = useDropZone('destination', handleDrop);

  // Restore last destination on mount if setting is enabled
  useEffect(() => {
    if (rememberLastDestination && lastDestinationPath && !destPath && isTauri()) {
      invoke<boolean>('is_path_accessible', { path: lastDestinationPath })
        .then((isAccessible) => {
          if (isAccessible) {
            setDestPath(lastDestinationPath);
          } else {
            setLastDestinationPath(null);
          }
        })
        .catch(() => {
          setLastDestinationPath(null);
        });
    }
  }, []);

  // Save destination path when it changes
  useEffect(() => {
    if (rememberLastDestination && destPath) {
      addRecentDestination(destPath);
    }
  }, [destPath, rememberLastDestination, addRecentDestination]);

  // Close recent dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recentDropdownRef.current && !recentDropdownRef.current.contains(event.target as Node)) {
        setShowRecent(false);
      }
    };
    if (showRecent) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showRecent]);

  const handleSelectRecent = useCallback((path: string) => {
    setDestPath(path);
    setShowRecent(false);
  }, [setDestPath]);

  // Fetch volume info when dest path changes
  const prevDestPath = useRef<string | null>(null);
  useEffect(() => {
    if (!destPath || !isTauri()) {
      if (destVolumeInfo) setDestVolumeInfo(null);
      return;
    }
    
    // Only fetch if path actually changed
    if (destPath === prevDestPath.current) return;
    prevDestPath.current = destPath;
    
    // Skip if we already have info for this volume
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
  }, [destPath]);

  const handleFolderClick = useCallback(() => {
    selectDestFolder();
  }, [selectDestFolder]);

  // Handle keyboard activation for the drop zone
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!destPath) {
        handleFolderClick();
      }
    }
  }, [destPath, handleFolderClick]);

  return (
    <div className="flex flex-col gap-2 h-full">
      <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide px-1">
        {t('output.label')}
      </span>
      <div
        ref={ref}
        data-dropzone="destination"
        role="button"
        tabIndex={0}
        aria-label={destPath ? `${t('output.selectedTitle')}: ${destPath}` : t('output.title')}
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
                <Download className="w-5 h-5 text-accent" strokeWidth={1.75} />
              </div>
              <p className="text-sm font-semibold text-accent">
                {t('output.dragging')}
              </p>
            </motion.div>
          ) : isLoading ? (
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
                {t('common.loading')}
              </p>
            </motion.div>
          ) : destPath ? (
            <motion.div
              key="selected"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-3 w-full"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center">
                <Download className="w-5 h-5 text-accent" strokeWidth={1.75} />
              </div>
              <div className="text-center space-y-0.5 w-full">
                <p className="text-xs text-text-tertiary">
                  {t('output.selectedTitle')}
                </p>
                <p className="text-sm font-semibold text-text-primary" title={destPath}>
                  {destPath.split('/').pop() || destPath}
                </p>
                <p className="text-xs text-text-tertiary break-all px-2 line-clamp-1" title={destPath}>
                  {destPath}
                </p>
                {isLoadingVolume ? (
                  <p className="text-xs text-text-tertiary flex items-center justify-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </p>
                ) : destVolumeInfo && (
                  <div className="text-xs text-text-tertiary">
                    <p className="flex items-center justify-center gap-1">
                      <HardDrive className="w-3 h-3" />
                      {destVolumeInfo.is_external ? t('common.external') : t('common.internal')}
                      {destVolumeInfo.total_space > 0 && (
                        <span> · {formatBytes(destVolumeInfo.available_space)} {t('common.free')}</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setDestPath(null); setDestVolumeInfo(null); }}
                  leftIcon={<X className="w-3.5 h-3.5" strokeWidth={2} />}
                >
                  {t('output.clear')}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFolderClick}
                  leftIcon={<FolderOpen className="w-3.5 h-3.5" strokeWidth={2} />}
                >
                  {t('output.change')}
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
                <Download className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
              </div>
              <div className="text-center space-y-0.5">
                <p className="text-sm font-semibold text-text-primary">
                  {t('output.title')}
                </p>
                <p className="text-xs text-text-tertiary">
                  {t('output.subtitle')}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleFolderClick}
                  leftIcon={<FolderOpen className="w-3.5 h-3.5" strokeWidth={2} />}
                >
                  {t('output.choose')}
                </Button>
                {recentDestinations.length > 0 && (
                  <div className="relative" ref={recentDropdownRef}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowRecent(!showRecent)}
                      leftIcon={<Clock className="w-3.5 h-3.5" strokeWidth={2} />}
                      rightIcon={<ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', showRecent && 'rotate-180')} />}
                    >
                      {t('output.recentDestinations')}
                    </Button>
                    <AnimatePresence>
                      {showRecent && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute top-full left-0 mt-2 w-72 max-h-64 overflow-y-auto bg-bg-primary border border-border rounded-xl shadow-lg z-50"
                        >
                          <div className="p-2">
                            {recentDestinations.map((path, index) => (
                              <button
                                key={`${path}-${index}`}
                                onClick={() => handleSelectRecent(path)}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-bg-secondary transition-colors"
                              >
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {path.split('/').pop() || path}
                                </p>
                                <p className="text-xs text-text-tertiary truncate">
                                  {path}
                                </p>
                              </button>
                            ))}
                          </div>
                          <div className="border-t border-border p-2">
                            <button
                              onClick={() => { clearRecentDestinations(); setShowRecent(false); }}
                              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-error hover:bg-error/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              {t('output.clearRecent')}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
