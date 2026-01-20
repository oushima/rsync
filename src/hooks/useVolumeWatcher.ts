/**
 * Hook for monitoring volume/drive state and detecting disconnections.
 * 
 * This hook provides:
 * - Real-time volume mount/unmount detection
 * - Automatic pause of sync operations when drives disconnect
 * - Integration with the Tauri backend volume watcher
 * 
 * @example
 * ```tsx
 * function SyncComponent() {
 *   const { 
 *     volumes, 
 *     disconnectedVolume, 
 *     isVolumeAvailable,
 *     clearDisconnection 
 *   } = useVolumeWatcher();
 * 
 *   // Check before starting sync
 *   const handleSync = async () => {
 *     if (!await isVolumeAvailable(sourcePath) || !await isVolumeAvailable(destPath)) {
 *       showError('Drive not available');
 *       return;
 *     }
 *     startSync();
 *   };
 * 
 *   // Show modal when volume disconnects during sync
 *   if (disconnectedVolume) {
 *     return <DriveDisconnectModal volume={disconnectedVolume} />;
 *   }
 * 
 *   return <SyncUI volumes={volumes} />;
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { VolumeEvent, WatchedVolumeInfo } from '../types';
import { 
  getMountedVolumes, 
  isVolumeAccessible,
  isTauriApp 
} from '../utils/tauriCommands';

/**
 * Information about a disconnected volume that was in use.
 */
export interface DisconnectedVolumeInfo {
  /** Mount point of the disconnected volume */
  mountPoint: string;
  /** Display name of the volume */
  name: string;
  /** Transfer IDs that were affected */
  affectedTransfers: string[];
  /** Error message if the volume became inaccessible */
  error?: string;
  /** Timestamp when disconnection was detected */
  detectedAt: Date;
}

/**
 * Return type for useVolumeWatcher hook.
 */
export interface UseVolumeWatcherReturn {
  /** List of currently mounted volumes */
  volumes: WatchedVolumeInfo[];
  /** Information about a recently disconnected volume (if any) */
  disconnectedVolume: DisconnectedVolumeInfo | null;
  /** Whether the hook is loading initial volume data */
  isLoading: boolean;
  /** Any error that occurred during initialization */
  error: Error | null;
  /** Check if a specific path's volume is accessible */
  isVolumeAvailable: (path: string) => Promise<boolean>;
  /** Clear the disconnected volume state (e.g., after user acknowledges) */
  clearDisconnection: () => void;
  /** Refresh the list of mounted volumes */
  refreshVolumes: () => Promise<void>;
  /** Find the volume that contains a given path */
  findVolumeForPath: (path: string) => WatchedVolumeInfo | undefined;
}

/**
 * Hook options.
 */
export interface UseVolumeWatcherOptions {
  /** Whether to automatically start listening for events (default: true) */
  autoStart?: boolean;
  /** Callback when a volume is mounted */
  onVolumeMounted?: (volume: WatchedVolumeInfo) => void;
  /** Callback when a volume is unmounted */
  onVolumeUnmounted?: (mountPoint: string, name: string, affectedTransfers: string[]) => void;
  /** Callback when a volume becomes inaccessible */
  onVolumeInaccessible?: (mountPoint: string, name: string, error: string) => void;
}

export function useVolumeWatcher(options: UseVolumeWatcherOptions = {}): UseVolumeWatcherReturn {
  const {
    autoStart = true,
    onVolumeMounted,
    onVolumeUnmounted,
    onVolumeInaccessible,
  } = options;

  const [volumes, setVolumes] = useState<WatchedVolumeInfo[]>([]);
  const [disconnectedVolume, setDisconnectedVolume] = useState<DisconnectedVolumeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Store callbacks in refs to avoid re-subscribing on callback changes
  const callbacksRef = useRef({ onVolumeMounted, onVolumeUnmounted, onVolumeInaccessible });
  callbacksRef.current = { onVolumeMounted, onVolumeUnmounted, onVolumeInaccessible };

  // Load initial volumes
  const refreshVolumes = useCallback(async () => {
    if (!isTauriApp()) {
      setIsLoading(false);
      return;
    }

    try {
      const mounted = await getMountedVolumes();
      setVolumes(mounted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if a path's volume is available
  const isVolumeAvailable = useCallback(async (path: string): Promise<boolean> => {
    if (!isTauriApp()) return true;
    return isVolumeAccessible(path);
  }, []);

  // Clear disconnection state
  const clearDisconnection = useCallback(() => {
    setDisconnectedVolume(null);
  }, []);

  // Find volume for a path
  const findVolumeForPath = useCallback((path: string): WatchedVolumeInfo | undefined => {
    // Find the volume with the longest matching mount point
    return volumes
      .filter(v => path.startsWith(v.mountPoint))
      .sort((a, b) => b.mountPoint.length - a.mountPoint.length)[0];
  }, [volumes]);

  // Set up event listener
  useEffect(() => {
    if (!autoStart || !isTauriApp()) {
      setIsLoading(false);
      return;
    }

    let unlistenFn: UnlistenFn | null = null;

    const setupListener = async () => {
      // Load initial volumes
      await refreshVolumes();

      // Listen for volume events from the backend
      unlistenFn = await listen<VolumeEvent>('volume-event', (event) => {
        const payload = event.payload;
        
        switch (payload.type) {
          case 'mounted':
            setVolumes(prev => {
              // Add if not already present
              const exists = prev.some(v => v.mountPoint === payload.volume.mountPoint);
              if (exists) return prev;
              return [...prev, payload.volume];
            });
            callbacksRef.current.onVolumeMounted?.(payload.volume);
            break;

          case 'unmounted':
            setVolumes(prev => 
              prev.filter(v => v.mountPoint !== payload.mountPoint)
            );
            
            // Set disconnected volume state if there were affected transfers
            if (payload.affectedTransfers.length > 0) {
              setDisconnectedVolume({
                mountPoint: payload.mountPoint,
                name: payload.name,
                affectedTransfers: payload.affectedTransfers,
                detectedAt: new Date(),
              });
            }
            
            callbacksRef.current.onVolumeUnmounted?.(
              payload.mountPoint, 
              payload.name, 
              payload.affectedTransfers
            );
            break;

          case 'inaccessible':
            setDisconnectedVolume({
              mountPoint: payload.mountPoint,
              name: payload.name,
              affectedTransfers: [], // Will be populated by backend if known
              error: payload.error,
              detectedAt: new Date(),
            });
            
            callbacksRef.current.onVolumeInaccessible?.(
              payload.mountPoint, 
              payload.name, 
              payload.error
            );
            break;

          case 'unmountPending':
            // Could show a warning to the user
            console.log(`[VolumeWatcher] Volume ${payload.name} is about to unmount`);
            break;
        }
      });
    };

    setupListener().catch(err => {
      console.error('[useVolumeWatcher] Failed to set up listener:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [autoStart, refreshVolumes]);

  return {
    volumes,
    disconnectedVolume,
    isLoading,
    error,
    isVolumeAvailable,
    clearDisconnection,
    refreshVolumes,
    findVolumeForPath,
  };
}

export default useVolumeWatcher;
