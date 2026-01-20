import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  AppNotification, 
  NotificationCategory,
  NotificationPreferences 
} from '../types';
import { 
  DEFAULT_NOTIFICATION_PREFERENCES,
  MAX_NOTIFICATION_HISTORY 
} from '../types';
import { showNotification as showNativeNotification } from '../utils/notifications';

/**
 * Notification store for managing in-app notifications.
 * 
 * Features:
 * - In-app notification history
 * - Granular notification preferences
 * - Native OS notification integration
 * - Read/unread tracking
 */
interface NotificationState {
  /** All notifications (newest first) */
  notifications: AppNotification[];
  /** Notification preferences */
  preferences: NotificationPreferences;
  /** Whether the notification panel is open */
  isPanelOpen: boolean;
  
  // Actions
  /** Add a new notification */
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  /** Mark a notification as read */
  markAsRead: (id: string) => void;
  /** Mark all notifications as read */
  markAllAsRead: () => void;
  /** Remove a notification */
  removeNotification: (id: string) => void;
  /** Clear all notifications */
  clearAllNotifications: () => void;
  /** Clear read notifications only */
  clearReadNotifications: () => void;
  /** Toggle notification panel */
  togglePanel: () => void;
  /** Set panel open state */
  setPanelOpen: (open: boolean) => void;
  /** Update notification preferences */
  updatePreferences: (preferences: Partial<NotificationPreferences>) => void;
  /** Toggle a specific category */
  toggleCategory: (category: NotificationCategory, enabled: boolean) => void;
  /** Get unread count */
  getUnreadCount: () => number;
  /** Check if a category is enabled */
  isCategoryEnabled: (category: NotificationCategory) => boolean;
}

/**
 * Generate a unique notification ID.
 */
function generateNotificationId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      isPanelOpen: false,

      addNotification: (notification) => {
        const { preferences } = get();
        
        // Check if notifications are enabled globally
        if (!preferences.enabled) return;
        
        // Check if this category is enabled
        if (!preferences.categories[notification.category]) return;
        
        const newNotification: AppNotification = {
          ...notification,
          id: generateNotificationId(),
          timestamp: new Date(),
          read: false,
        };
        
        set((state) => ({
          notifications: [
            newNotification,
            ...state.notifications,
          ].slice(0, MAX_NOTIFICATION_HISTORY),
        }));
        
        // Show native notification if enabled
        if (preferences.showNativeNotifications && notification.showNative) {
          showNativeNotification({
            title: notification.title,
            body: notification.message,
          }).catch(() => {
            // Ignore native notification errors - the in-app notification still shows
          });
        }
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      },

      clearAllNotifications: () => {
        set({ notifications: [] });
      },

      clearReadNotifications: () => {
        set((state) => ({
          notifications: state.notifications.filter((n) => !n.read),
        }));
      },

      togglePanel: () => {
        set((state) => ({ isPanelOpen: !state.isPanelOpen }));
      },

      setPanelOpen: (open) => {
        set({ isPanelOpen: open });
      },

      updatePreferences: (newPreferences) => {
        set((state) => ({
          preferences: { ...state.preferences, ...newPreferences },
        }));
      },

      toggleCategory: (category, enabled) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            categories: {
              ...state.preferences.categories,
              [category]: enabled,
            },
          },
        }));
      },

      getUnreadCount: () => {
        return get().notifications.filter((n) => !n.read).length;
      },

      isCategoryEnabled: (category) => {
        const { preferences } = get();
        return preferences.enabled && preferences.categories[category];
      },
    }),
    {
      name: 'rsync-notifications',
      // Only persist preferences, not the notifications themselves
      partialize: (state) => ({
        preferences: state.preferences,
        notifications: state.notifications.slice(0, 50), // Keep last 50 on disk
      }),
    }
  )
);

// ============================================================================
// Helper Functions for Creating Notifications
// ============================================================================

/**
 * Creates and shows a notification for sync completion.
 */
export function notifySyncCompleted(filesCount: number, hasErrors: boolean): void {
  const store = useNotificationStore.getState();
  
  if (hasErrors) {
    store.addNotification({
      type: 'warning',
      category: 'sync_completed',
      title: 'Sync Completed with Issues',
      message: `${filesCount} files were synced, but some files had problems. Check the history for details.`,
      technicalDetails: 'One or more files failed to copy or verify correctly.',
      actionHint: 'Review the sync history to see which files had issues and why.',
      preventionTip: 'Enable checksum verification in settings to catch file issues early.',
      showNative: true,
    });
  } else {
    store.addNotification({
      type: 'success',
      category: 'sync_completed',
      title: 'Sync Complete! 🎉',
      message: `Successfully synced ${filesCount} file${filesCount !== 1 ? 's' : ''}. Your folders are now in sync.`,
      showNative: true,
    });
  }
}

/**
 * Creates and shows a notification for sync failure.
 */
export function notifySyncFailed(errorMessage: string, technicalError?: string): void {
  const store = useNotificationStore.getState();
  
  store.addNotification({
    type: 'error',
    category: 'sync_failed',
    title: 'Sync Failed',
    message: 'The sync could not be completed. Your original files are safe and unchanged.',
    technicalDetails: technicalError || errorMessage,
    actionHint: 'Check that both source and destination are accessible, then try again.',
    preventionTip: 'Make sure you have enough disk space and the right permissions before syncing.',
    showNative: true,
  });
}

/**
 * Creates and shows a notification for low disk space.
 */
export function notifyDiskSpaceWarning(
  driveName: string, 
  availableGB: number, 
  requiredGB: number
): void {
  const store = useNotificationStore.getState();
  const isСritical = availableGB < 1 || (requiredGB > 0 && availableGB < requiredGB);
  
  store.addNotification({
    type: isСritical ? 'error' : 'warning',
    category: isСritical ? 'disk_space_critical' : 'disk_space_warning',
    title: isСritical ? 'Not Enough Disk Space' : 'Disk Space Running Low',
    message: isСritical 
      ? `"${driveName}" only has ${availableGB.toFixed(1)} GB free, but you need ${requiredGB.toFixed(1)} GB.`
      : `"${driveName}" is running low on space (${availableGB.toFixed(1)} GB remaining).`,
    technicalDetails: `Available: ${(availableGB * 1024 * 1024 * 1024).toLocaleString()} bytes`,
    actionHint: 'Free up space by deleting files you no longer need, or choose a different destination.',
    preventionTip: 'Keep at least 10% of your drive free for system operations.',
    showNative: true,
  });
}

/**
 * Creates and shows a notification for drive disconnection.
 */
export function notifyDriveDisconnected(drivePath: string, driveName?: string): void {
  const store = useNotificationStore.getState();
  
  store.addNotification({
    type: 'error',
    category: 'drive_disconnected',
    title: 'Drive Disconnected!',
    message: `The ${driveName ? `drive "${driveName}"` : 'destination drive'} was disconnected during the transfer. The sync has been paused.`,
    technicalDetails: `Path: ${drivePath}. Device was unexpectedly unmounted.`,
    actionHint: 'Reconnect the drive and click Resume to continue from where you left off.',
    preventionTip: 'Always use "Eject" before unplugging external drives. Avoid bumping USB cables during transfers.',
    relatedPaths: [drivePath],
    showNative: true,
  });
}

/**
 * Creates and shows a notification for permission errors.
 */
export function notifyPermissionError(path: string, operation: 'read' | 'write'): void {
  const store = useNotificationStore.getState();
  
  store.addNotification({
    type: 'error',
    category: 'permission_error',
    title: 'Permission Denied',
    message: `RSync doesn't have permission to ${operation} files in this location. Your Mac is protecting this folder.`,
    technicalDetails: `Path: ${path}. Error: EACCES - Permission denied for ${operation} operation.`,
    actionHint: 'Go to Settings → Permissions and enable Full Disk Access for RSync.',
    preventionTip: 'Grant Full Disk Access before syncing to system-protected folders.',
    relatedPaths: [path],
    showNative: true,
    action: {
      label: 'Open Permissions Settings',
      actionId: 'open_permissions',
    },
  });
}

/**
 * Creates and shows a notification for file corruption.
 */
export function notifyFileCorruption(filePath: string, reason: string): void {
  const store = useNotificationStore.getState();
  const fileName = filePath.split('/').pop() || filePath;
  
  store.addNotification({
    type: 'error',
    category: 'file_corruption',
    title: 'File Integrity Issue Detected',
    message: `The file "${fileName}" may be corrupted. The copy doesn't match the original.`,
    technicalDetails: `Path: ${filePath}. Verification failed: ${reason}`,
    actionHint: 'Click "Retry" to copy this file again. If it keeps failing, check your drive for errors.',
    preventionTip: 'Run disk utility to check for drive errors. Avoid interrupting transfers.',
    relatedPaths: [filePath],
    showNative: true,
    action: {
      label: 'View Details',
      actionId: 'view_verification_errors',
    },
  });
}

/**
 * Creates and shows a notification for transfer interruption.
 */
export function notifyTransferInterrupted(reason: string, canResume: boolean): void {
  const store = useNotificationStore.getState();
  
  store.addNotification({
    type: 'warning',
    category: 'transfer_interrupted',
    title: 'Transfer Interrupted',
    message: canResume 
      ? `The sync was interrupted: ${reason}. Don't worry, you can resume from where you left off.`
      : `The sync was interrupted: ${reason}. Some files may need to be re-copied.`,
    technicalDetails: `Interruption cause: ${reason}. Resumable: ${canResume}`,
    actionHint: canResume 
      ? 'Click Resume to continue the transfer.'
      : 'Start a new sync to ensure all files are copied correctly.',
    preventionTip: 'Keep your Mac plugged in and avoid disconnecting drives during transfers.',
    showNative: true,
  });
}

/**
 * Creates and shows a notification for scheduled sync events.
 */
export function notifyScheduleEvent(
  profileName: string, 
  event: 'starting' | 'completed' | 'failed',
  errorMessage?: string
): void {
  const store = useNotificationStore.getState();
  
  switch (event) {
    case 'starting':
      store.addNotification({
        type: 'info',
        category: 'schedule_triggered',
        title: 'Scheduled Sync Starting',
        message: `Starting the scheduled sync for "${profileName}".`,
        showNative: true,
      });
      break;
    case 'completed':
      store.addNotification({
        type: 'success',
        category: 'schedule_completed',
        title: 'Scheduled Sync Complete',
        message: `The scheduled sync for "${profileName}" finished successfully.`,
        showNative: true,
      });
      break;
    case 'failed':
      store.addNotification({
        type: 'error',
        category: 'schedule_failed',
        title: 'Scheduled Sync Failed',
        message: `The scheduled sync for "${profileName}" could not be completed.`,
        technicalDetails: errorMessage,
        actionHint: 'Check the sync history for details and try running the sync manually.',
        showNative: true,
      });
      break;
  }
}

/**
 * Creates and shows a notification for sync pause/resume.
 */
export function notifySyncPaused(): void {
  const store = useNotificationStore.getState();
  
  store.addNotification({
    type: 'info',
    category: 'sync_paused',
    title: 'Sync Paused',
    message: 'The sync has been paused. Your progress is saved and you can resume anytime.',
    showNative: false,
  });
}

export function notifySyncResumed(): void {
  const store = useNotificationStore.getState();
  
  store.addNotification({
    type: 'info',
    category: 'sync_resumed',
    title: 'Sync Resumed',
    message: 'The sync is continuing from where it left off.',
    showNative: false,
  });
}

/**
 * Creates and shows a notification for conflict detection.
 */
export function notifyConflictDetected(fileName: string, conflictCount: number): void {
  const store = useNotificationStore.getState();
  
  store.addNotification({
    type: 'warning',
    category: 'conflict_detected',
    title: 'File Conflict Needs Your Attention',
    message: conflictCount > 1
      ? `${conflictCount} files have conflicts and need your decision.`
      : `"${fileName}" exists in both locations with different content.`,
    actionHint: 'Review each conflict and decide whether to keep the source, destination, or both versions.',
    showNative: true,
    action: {
      label: 'Resolve Conflicts',
      actionId: 'resolve_conflicts',
    },
  });
}
