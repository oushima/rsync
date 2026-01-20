import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode, Settings, SyncOptions } from '../types';
import { DEFAULT_SYNC_OPTIONS } from '../types';

/** Maximum number of recent destinations to store */
const MAX_RECENT_DESTINATIONS = 10;

const defaultSettings: Settings = {
  theme: 'system',
  language: 'en',
  autoStart: false,
  minimizeToTray: true,
  notifications: true,
  confirmBeforeSync: true,
  preventSleepDuringTransfer: true,
  rememberLastDestination: true,
  lastDestinationPath: null,
  recentDestinations: [],
  defaultSyncOptions: DEFAULT_SYNC_OPTIONS,
};

interface SettingsState extends Settings {
  // Actions
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: 'en' | 'nl') => void;
  setAutoStart: (autoStart: boolean) => void;
  setMinimizeToTray: (minimize: boolean) => void;
  setNotifications: (notifications: boolean) => void;
  setConfirmBeforeSync: (confirm: boolean) => void;
  setPreventSleepDuringTransfer: (prevent: boolean) => void;
  setRememberLastDestination: (remember: boolean) => void;
  setLastDestinationPath: (path: string | null) => void;
  addRecentDestination: (path: string) => void;
  clearRecentDestinations: () => void;
  updateSyncOptions: (options: Partial<SyncOptions>) => void;
  resetToDefaults: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setTheme: (theme) => set({ theme }),

      setLanguage: (language) => set({ language }),

      setAutoStart: (autoStart) => set({ autoStart }),

      setMinimizeToTray: (minimizeToTray) => set({ minimizeToTray }),

      setNotifications: (notifications) => set({ notifications }),

      setConfirmBeforeSync: (confirmBeforeSync) => set({ confirmBeforeSync }),

      setPreventSleepDuringTransfer: (preventSleepDuringTransfer) => set({ preventSleepDuringTransfer }),

      setRememberLastDestination: (rememberLastDestination) => set({ rememberLastDestination }),

      setLastDestinationPath: (lastDestinationPath) => set({ lastDestinationPath }),

      addRecentDestination: (path) =>
        set((state) => {
          // Don't add empty paths
          if (!path || path.trim().length === 0) return state;
          
          // Remove duplicates, add to front, and limit to max entries
          const filtered = state.recentDestinations.filter((p) => p !== path);
          const newList = [path, ...filtered].slice(0, MAX_RECENT_DESTINATIONS);
          
          return {
            recentDestinations: newList,
            // Also update lastDestinationPath for backward compatibility
            lastDestinationPath: path,
          };
        }),

      clearRecentDestinations: () => set({ recentDestinations: [], lastDestinationPath: null }),

      updateSyncOptions: (options) =>
        set((state) => ({
          defaultSyncOptions: { ...state.defaultSyncOptions, ...options },
        })),

      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'rsync-settings',
    }
  )
);
