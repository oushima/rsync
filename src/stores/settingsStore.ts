import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode, Settings, SyncOptions } from '../types';

const defaultSyncOptions: SyncOptions = {
  overwriteNewer: true,
  overwriteOlder: false,
  skipExisting: false,
  deleteOrphans: false,
  preservePermissions: true,
  followSymlinks: false,
  dryRun: false,
};

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
  defaultSyncOptions,
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
