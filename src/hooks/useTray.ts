/**
 * System Tray Integration Hook
 * 
 * Provides React integration with the Tauri system tray.
 * Handles tray status updates, window visibility, and tray events.
 */

import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useSettingsStore } from '../stores/settingsStore';

/** Sync status for tray display */
export type TrayStatus = 'idle' | 'syncing' | 'paused' | 'error';

/**
 * Updates the system tray icon and tooltip based on sync status.
 * 
 * @param status - The current sync status to display
 */
export async function updateTrayStatus(status: TrayStatus): Promise<void> {
  try {
    await invoke('update_tray_status', { status });
  } catch (error) {
    console.error('Failed to update tray status:', error);
  }
}

/**
 * Sets whether the app should minimize to tray instead of quitting.
 * 
 * @param enabled - Whether minimize to tray should be enabled
 */
export async function setMinimizeToTray(enabled: boolean): Promise<void> {
  try {
    await invoke('set_minimize_to_tray', { enabled });
  } catch (error) {
    console.error('Failed to set minimize to tray:', error);
  }
}

/**
 * Shows the main window from tray.
 */
export async function showMainWindow(): Promise<void> {
  try {
    await invoke('show_main_window');
  } catch (error) {
    console.error('Failed to show main window:', error);
  }
}

/**
 * Hides the main window to tray.
 */
export async function hideMainWindow(): Promise<void> {
  try {
    await invoke('hide_main_window');
  } catch (error) {
    console.error('Failed to hide main window:', error);
  }
}

/** Callback type for tray menu events */
export type TrayMenuCallback = () => void;

/**
 * Hook to integrate with the system tray.
 * 
 * Sets up event listeners for tray menu actions and syncs
 * the minimize to tray setting with the backend.
 * 
 * @param options - Optional callbacks for tray menu actions
 * @returns Object with functions to update tray state
 */
export function useTray(options?: {
  onPauseSync?: TrayMenuCallback;
  onResumeSync?: TrayMenuCallback;
}): {
  updateStatus: (status: TrayStatus) => Promise<void>;
  showWindow: () => Promise<void>;
  hideWindow: () => Promise<void>;
} {
  const minimizeToTray = useSettingsStore((state) => state.minimizeToTray);

  // Sync minimize to tray setting with backend
  useEffect(() => {
    setMinimizeToTray(minimizeToTray);
  }, [minimizeToTray]);

  // Set up tray event listeners
  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];

    const setupListeners = async () => {
      // Listen for pause sync from tray menu
      if (options?.onPauseSync) {
        const unlisten = await listen('tray_pause_sync', () => {
          options.onPauseSync?.();
        });
        unlistenFns.push(unlisten);
      }

      // Listen for resume sync from tray menu
      if (options?.onResumeSync) {
        const unlisten = await listen('tray_resume_sync', () => {
          options.onResumeSync?.();
        });
        unlistenFns.push(unlisten);
      }
    };

    setupListeners();

    return () => {
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, [options?.onPauseSync, options?.onResumeSync]);

  return {
    updateStatus: updateTrayStatus,
    showWindow: showMainWindow,
    hideWindow: hideMainWindow,
  };
}

export default useTray;
