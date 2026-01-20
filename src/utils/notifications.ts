/**
 * Native notification utility for macOS.
 * 
 * Uses Tauri's notification plugin to show system notifications.
 * Falls back to console logging in non-Tauri environments.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { logger } from './logger';

/**
 * Notification options for customizing the notification display.
 */
export interface NotificationOptions {
  /** The notification title */
  title: string;
  /** The notification body text */
  body: string;
  /** Optional sound name (macOS system sounds) */
  sound?: string;
}

/**
 * Shows a native system notification.
 * 
 * On macOS, this uses the Tauri notification plugin.
 * Falls back to console.log in development or when the plugin is unavailable.
 * 
 * @param options - The notification options
 * @returns Promise that resolves when the notification is shown
 */
export async function showNotification(options: NotificationOptions): Promise<void> {
  const { title, body } = options;

  if (!isTauri()) {
    logger.debug(`[Notification] ${title}: ${body}`);
    return;
  }

  try {
    await invoke('plugin:notification|notify', {
      title,
      body,
    });
    logger.debug(`[Notification] Sent: ${title}`);
  } catch (error) {
    // Notification plugin may not be available or permission denied
    logger.warn('[Notification] Failed to show notification:', error);
    console.log(`[Notification] ${title}: ${body}`);
  }
}

/**
 * Requests notification permissions from the system.
 * 
 * @returns Promise that resolves to true if permission is granted
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    return true; // Assume granted in development
  }

  try {
    const result = await invoke<boolean>('plugin:notification|is_permission_granted');
    return result;
  } catch {
    return false;
  }
}

/**
 * Shows a sync completion notification.
 * 
 * @param filesCount - Number of files synced
 * @param hasErrors - Whether there were any errors during sync
 */
export async function showSyncCompletionNotification(
  filesCount: number,
  hasErrors: boolean
): Promise<void> {
  if (hasErrors) {
    await showNotification({
      title: 'Sync Completed with Errors',
      body: `${filesCount} files synced. Some files had errors.`,
    });
  } else {
    await showNotification({
      title: 'Sync Complete',
      body: `Successfully synced ${filesCount} files.`,
    });
  }
}

/**
 * Shows a sync error notification.
 * 
 * @param errorMessage - The error message to display
 */
export async function showSyncErrorNotification(errorMessage: string): Promise<void> {
  await showNotification({
    title: 'Sync Failed',
    body: errorMessage,
  });
}

/**
 * Shows a scheduled sync notification.
 * 
 * @param profileName - Name of the sync profile
 * @param status - Whether the sync is starting or completed
 */
export async function showScheduledSyncNotification(
  profileName: string,
  status: 'starting' | 'completed' | 'error',
  errorMessage?: string
): Promise<void> {
  switch (status) {
    case 'starting':
      await showNotification({
        title: 'Scheduled Sync Starting',
        body: `Starting scheduled sync for "${profileName}"`,
      });
      break;
    case 'completed':
      await showNotification({
        title: 'Scheduled Sync Complete',
        body: `Successfully completed sync for "${profileName}"`,
      });
      break;
    case 'error':
      await showNotification({
        title: 'Scheduled Sync Failed',
        body: errorMessage || `Sync failed for "${profileName}"`,
      });
      break;
  }
}
