import { useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useScheduleStore } from '../stores/scheduleStore';
import { useProfilesStore } from '../stores/profilesStore';
import { useSyncStore } from '../stores/syncStore';
import type { ScheduledSync, SyncProfile, FileItem } from '../types';
import { logger, withTimeout, TIMEOUTS } from '../utils/logger';
import { showNotification } from '../utils/notifications';

/**
 * Minimum time between schedule checks in milliseconds.
 * Prevents rapid-fire execution on quick focus changes.
 */
const MIN_CHECK_INTERVAL_MS = 5000;

/**
 * Delay before initial schedule check on app mount.
 * Allows the app to fully initialize first.
 */
const INITIAL_CHECK_DELAY_MS = 2000;

/**
 * Delay between sequential sync executions.
 * Gives the sync time to initialize before checking state.
 */
const SYNC_START_DELAY_MS = 1000;

/**
 * Maximum wait time for a sync to complete (10 minutes).
 * Prevents infinite waiting on stuck syncs.
 */
const MAX_SYNC_WAIT_ATTEMPTS = 600;

/**
 * Interval between sync completion checks in milliseconds.
 */
const SYNC_CHECK_INTERVAL_MS = 1000;

/**
 * Result of attempting to execute a scheduled sync.
 */
interface ScheduleExecutionResult {
  scheduleId: string;
  profileId: string;
  success: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: 'profile_deleted' | 'sync_in_progress' | 'source_missing' | 'permission_denied';
}

/**
 * Loads files from a directory for sync.
 */
async function loadFilesFromDirectory(sourcePath: string): Promise<FileItem[] | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    const result = await withTimeout(
      invoke<{ files: Array<{ path: string; size: number; modified: string; is_dir: boolean }> }>(
        'get_directory_info',
        { path: sourcePath }
      ),
      TIMEOUTS.LONG,
      'Directory scan for scheduled sync'
    );

    return result.files.map((file) => ({
      id: `${sourcePath}/${file.path}`,
      name: file.path.split('/').pop() || file.path,
      path: `${sourcePath}/${file.path}`,
      size: file.size,
      isDirectory: file.is_dir,
      modifiedAt: new Date(file.modified),
      status: 'pending' as const,
    }));
  } catch (error) {
    logger.error('[ScheduleRunner] Failed to load directory:', error);
    return null;
  }
}

/**
 * Validates that a source path exists.
 */
async function validateSourcePath(sourcePath: string): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    return await withTimeout(
      invoke<boolean>('path_exists', { path: sourcePath }),
      TIMEOUTS.QUICK,
      'Source path validation'
    );
  } catch {
    return false;
  }
}

/**
 * Checks if the destination path is writable.
 */
async function validateDestinationPath(destPath: string): Promise<boolean> {
  if (!isTauri()) return false;

  try {
    return await withTimeout(
      invoke<boolean>('is_path_writable', { path: destPath }),
      TIMEOUTS.QUICK,
      'Destination path validation'
    );
  } catch {
    return false;
  }
}

/**
 * Executes a single scheduled sync.
 */
async function executeScheduledSync(
  schedule: ScheduledSync,
  profile: SyncProfile
): Promise<ScheduleExecutionResult> {
  const { markScheduleRun } = useScheduleStore.getState();
  const syncStore = useSyncStore.getState();
  const { markProfileUsed } = useProfilesStore.getState();

  logger.log(`[ScheduleRunner] Executing scheduled sync: ${schedule.id} for profile: ${profile.name}`);

  // Check if sync is already in progress
  if (['preparing', 'syncing', 'paused'].includes(syncStore.syncState)) {
    logger.warn('[ScheduleRunner] Sync already in progress, skipping schedule');
    return {
      scheduleId: schedule.id,
      profileId: profile.id,
      success: false,
      skipped: true,
      skipReason: 'sync_in_progress',
    };
  }

  // Validate source path exists
  const sourceExists = await validateSourcePath(profile.sourcePath);
  if (!sourceExists) {
    logger.error('[ScheduleRunner] Source path does not exist:', profile.sourcePath);
    markScheduleRun(schedule.id);
    return {
      scheduleId: schedule.id,
      profileId: profile.id,
      success: false,
      skipped: true,
      skipReason: 'source_missing',
      error: `Source folder not found: ${profile.sourcePath}`,
    };
  }

  // Validate destination is writable
  const destWritable = await validateDestinationPath(profile.destPath);
  if (!destWritable) {
    logger.error('[ScheduleRunner] Destination path not writable:', profile.destPath);
    markScheduleRun(schedule.id);
    return {
      scheduleId: schedule.id,
      profileId: profile.id,
      success: false,
      skipped: true,
      skipReason: 'permission_denied',
      error: `Cannot write to destination: ${profile.destPath}`,
    };
  }

  try {
    // Load files from source directory
    const files = await loadFilesFromDirectory(profile.sourcePath);
    if (!files || files.length === 0) {
      logger.warn('[ScheduleRunner] No files found in source directory');
      markScheduleRun(schedule.id);
      return {
        scheduleId: schedule.id,
        profileId: profile.id,
        success: true,
      };
    }

    // Show notification
    await showNotification({
      title: 'Scheduled Sync Starting',
      body: `Starting scheduled sync for profile "${profile.name}"`,
    });

    // Set up sync store with profile data
    syncStore.reset();
    syncStore.setSourcePath(profile.sourcePath);
    syncStore.setDestPath(profile.destPath);
    syncStore.setFiles(files);
    syncStore.updateSyncOptions(profile.options);

    // Start the sync
    syncStore.startSync();

    // Mark schedule as run and update profile
    markScheduleRun(schedule.id);
    markProfileUsed(profile.id);

    logger.log(`[ScheduleRunner] Successfully started scheduled sync for profile: ${profile.name}`);

    return {
      scheduleId: schedule.id,
      profileId: profile.id,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[ScheduleRunner] Failed to execute scheduled sync:', error);
    markScheduleRun(schedule.id);
    return {
      scheduleId: schedule.id,
      profileId: profile.id,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Checks for due schedules and executes them sequentially.
 */
async function checkAndExecuteDueSchedules(
  isProcessingRef: React.MutableRefObject<boolean>,
  lastCheckRef: React.MutableRefObject<number>
): Promise<void> {
  // Prevent concurrent execution
  if (isProcessingRef.current) {
    return;
  }

  // Rate limit checks
  const now = Date.now();
  if (now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) {
    return;
  }

  lastCheckRef.current = now;
  isProcessingRef.current = true;

  try {
    const { getDueSchedules } = useScheduleStore.getState();
    const { getProfile } = useProfilesStore.getState();
    
    const dueSchedules = getDueSchedules();
    
    if (dueSchedules.length === 0) {
      return;
    }

    logger.log(`[ScheduleRunner] Found ${dueSchedules.length} due schedule(s)`);

    // Process schedules sequentially
    for (const schedule of dueSchedules) {
      // Check if sync is in progress before each schedule
      const { syncState } = useSyncStore.getState();
      if (['preparing', 'syncing', 'paused'].includes(syncState)) {
        logger.log('[ScheduleRunner] Sync in progress, stopping schedule execution');
        break;
      }

      const profile = getProfile(schedule.profileId);
      
      if (!profile) {
        logger.warn(`[ScheduleRunner] Profile ${schedule.profileId} not found`);
        await showNotification({
          title: 'Schedule Configuration Issue',
          body: `The profile for a scheduled sync was deleted.`,
        });
        const { markScheduleRun } = useScheduleStore.getState();
        markScheduleRun(schedule.id);
        continue;
      }

      const result = await executeScheduledSync(schedule, profile);
      
      if (!result.success && result.error) {
        await showNotification({ title: 'Scheduled Sync Error', body: result.error });
      }

      // Wait for sync to complete before next schedule
      if (result.success && !result.skipped) {
        await new Promise((resolve) => setTimeout(resolve, SYNC_START_DELAY_MS));
        
        let waitAttempts = 0;
        while (waitAttempts < MAX_SYNC_WAIT_ATTEMPTS) {
          const { syncState } = useSyncStore.getState();
          if (['idle', 'completed', 'error', 'cancelled'].includes(syncState)) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, SYNC_CHECK_INTERVAL_MS));
          waitAttempts++;
        }
      }
    }
  } catch (error) {
    logger.error('[ScheduleRunner] Error checking/executing due schedules:', error);
  } finally {
    isProcessingRef.current = false;
  }
}

/**
 * Hook that monitors for due scheduled syncs and executes them.
 * 
 * Uses visibility and focus events to check for due schedules - NO POLLING.
 * When the app becomes visible or focused, it checks if any schedules are due
 * and executes them sequentially.
 */
export function useScheduleRunner(): void {
  const isProcessingRef = useRef(false);
  const lastCheckRef = useRef<number>(0);

  // Set up event listeners with stable callbacks
  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void checkAndExecuteDueSchedules(isProcessingRef, lastCheckRef);
      }
    };

    const handleWindowFocus = (): void => {
      void checkAndExecuteDueSchedules(isProcessingRef, lastCheckRef);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    // Initial check on mount with delay
    const initialCheckTimeout = setTimeout(() => {
      void checkAndExecuteDueSchedules(isProcessingRef, lastCheckRef);
    }, INITIAL_CHECK_DELAY_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      clearTimeout(initialCheckTimeout);
    };
  }, []);
}

export default useScheduleRunner;
