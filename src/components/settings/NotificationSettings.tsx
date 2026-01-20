import { motion } from 'framer-motion';
import { Bell, BellOff, Volume2, VolumeX, MonitorSmartphone, Check } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../stores/notificationStore';
import { Toggle } from '../ui/Toggle';
import type { NotificationCategory } from '../../types';

/**
 * Notification category configuration for the settings panel.
 */
interface CategoryConfig {
  category: NotificationCategory;
  titleKey: string;
  descKey: string;
  group: 'sync' | 'errors' | 'schedule' | 'other';
}

const CATEGORY_CONFIG: CategoryConfig[] = [
  // Sync events
  { category: 'sync_started', titleKey: 'notifications.categories.syncStarted', descKey: 'notifications.categories.syncStartedDesc', group: 'sync' },
  { category: 'sync_completed', titleKey: 'notifications.categories.syncCompleted', descKey: 'notifications.categories.syncCompletedDesc', group: 'sync' },
  { category: 'sync_failed', titleKey: 'notifications.categories.syncFailed', descKey: 'notifications.categories.syncFailedDesc', group: 'sync' },
  { category: 'sync_paused', titleKey: 'notifications.categories.syncPaused', descKey: 'notifications.categories.syncPausedDesc', group: 'sync' },
  { category: 'sync_resumed', titleKey: 'notifications.categories.syncResumed', descKey: 'notifications.categories.syncResumedDesc', group: 'sync' },
  
  // Errors and warnings
  { category: 'conflict_detected', titleKey: 'notifications.categories.conflictDetected', descKey: 'notifications.categories.conflictDetectedDesc', group: 'errors' },
  { category: 'verification_error', titleKey: 'notifications.categories.verificationError', descKey: 'notifications.categories.verificationErrorDesc', group: 'errors' },
  { category: 'disk_space_warning', titleKey: 'notifications.categories.diskSpaceWarning', descKey: 'notifications.categories.diskSpaceWarningDesc', group: 'errors' },
  { category: 'disk_space_critical', titleKey: 'notifications.categories.diskSpaceCritical', descKey: 'notifications.categories.diskSpaceCriticalDesc', group: 'errors' },
  { category: 'drive_disconnected', titleKey: 'notifications.categories.driveDisconnected', descKey: 'notifications.categories.driveDisconnectedDesc', group: 'errors' },
  { category: 'permission_error', titleKey: 'notifications.categories.permissionError', descKey: 'notifications.categories.permissionErrorDesc', group: 'errors' },
  { category: 'file_corruption', titleKey: 'notifications.categories.fileCorruption', descKey: 'notifications.categories.fileCorruptionDesc', group: 'errors' },
  { category: 'transfer_interrupted', titleKey: 'notifications.categories.transferInterrupted', descKey: 'notifications.categories.transferInterruptedDesc', group: 'errors' },
  
  // Schedule events
  { category: 'schedule_triggered', titleKey: 'notifications.categories.scheduleTriggered', descKey: 'notifications.categories.scheduleTriggeredDesc', group: 'schedule' },
  { category: 'schedule_completed', titleKey: 'notifications.categories.scheduleCompleted', descKey: 'notifications.categories.scheduleCompletedDesc', group: 'schedule' },
  { category: 'schedule_failed', titleKey: 'notifications.categories.scheduleFailed', descKey: 'notifications.categories.scheduleFailedDesc', group: 'schedule' },
  
  // Other
  { category: 'queue_item_completed', titleKey: 'notifications.categories.queueItemCompleted', descKey: 'notifications.categories.queueItemCompletedDesc', group: 'other' },
  { category: 'queue_item_failed', titleKey: 'notifications.categories.queueItemFailed', descKey: 'notifications.categories.queueItemFailedDesc', group: 'other' },
];

const GROUP_LABELS = {
  sync: { en: 'Sync Events', nl: 'Synchronisatie' },
  errors: { en: 'Errors & Warnings', nl: 'Fouten & Waarschuwingen' },
  schedule: { en: 'Scheduled Syncs', nl: 'Geplande Syncs' },
  other: { en: 'Other', nl: 'Overig' },
};

interface NotificationSettingsProps {
  language: 'en' | 'nl';
}

export function NotificationSettings({ language }: NotificationSettingsProps) {
  const { t } = useTranslation();
  const { preferences, updatePreferences, toggleCategory } = useNotificationStore();
  
  const groupedCategories = {
    sync: CATEGORY_CONFIG.filter(c => c.group === 'sync'),
    errors: CATEGORY_CONFIG.filter(c => c.group === 'errors'),
    schedule: CATEGORY_CONFIG.filter(c => c.group === 'schedule'),
    other: CATEGORY_CONFIG.filter(c => c.group === 'other'),
  };
  
  return (
    <div className="space-y-6">
      {/* Master toggles */}
      <div className="space-y-4">
        {/* Enable notifications */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              preferences.enabled ? 'bg-accent/10' : 'bg-bg-tertiary'
            )}>
              {preferences.enabled ? (
                <Bell className="w-5 h-5 text-accent" strokeWidth={1.75} />
              ) : (
                <BellOff className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
              )}
            </div>
            <div>
              <h4 className="font-medium text-text-primary">
                {t('notifications.settings.enabled', 'Enable Notifications')}
              </h4>
              <p className="text-sm text-text-tertiary">
                {t('notifications.settings.enabledDesc', 'Show notifications for sync events')}
              </p>
            </div>
          </div>
          <Toggle
            checked={preferences.enabled}
            onChange={(e) => updatePreferences({ enabled: e.target.checked })}
          />
        </div>
        
        {/* Show native notifications */}
        <motion.div
          animate={{ opacity: preferences.enabled ? 1 : 0.5 }}
          className="flex items-center justify-between py-3"
        >
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              preferences.showNativeNotifications && preferences.enabled ? 'bg-accent/10' : 'bg-bg-tertiary'
            )}>
              <MonitorSmartphone 
                className={clsx(
                  'w-5 h-5',
                  preferences.showNativeNotifications && preferences.enabled ? 'text-accent' : 'text-text-tertiary'
                )} 
                strokeWidth={1.75} 
              />
            </div>
            <div>
              <h4 className="font-medium text-text-primary">
                {t('notifications.settings.native', 'System Notifications')}
              </h4>
              <p className="text-sm text-text-tertiary">
                {t('notifications.settings.nativeDesc', 'Show notifications in your system tray')}
              </p>
            </div>
          </div>
          <Toggle
            checked={preferences.showNativeNotifications}
            onChange={(e) => updatePreferences({ showNativeNotifications: e.target.checked })}
            disabled={!preferences.enabled}
          />
        </motion.div>
        
        {/* Play sound */}
        <motion.div
          animate={{ opacity: preferences.enabled ? 1 : 0.5 }}
          className="flex items-center justify-between py-3"
        >
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              preferences.playSound && preferences.enabled ? 'bg-accent/10' : 'bg-bg-tertiary'
            )}>
              {preferences.playSound && preferences.enabled ? (
                <Volume2 className="w-5 h-5 text-accent" strokeWidth={1.75} />
              ) : (
                <VolumeX className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
              )}
            </div>
            <div>
              <h4 className="font-medium text-text-primary">
                {t('notifications.settings.sound', 'Play Sound')}
              </h4>
              <p className="text-sm text-text-tertiary">
                {t('notifications.settings.soundDesc', 'Play a sound with notifications')}
              </p>
            </div>
          </div>
          <Toggle
            checked={preferences.playSound}
            onChange={(e) => updatePreferences({ playSound: e.target.checked })}
            disabled={!preferences.enabled}
          />
        </motion.div>
      </div>
      
      {/* Category toggles */}
      <motion.div
        animate={{ opacity: preferences.enabled ? 1 : 0.5 }}
        className="pt-4 border-t border-border-subtle"
      >
        <h3 className="text-sm font-semibold text-text-primary mb-4">
          {t('notifications.settings.categories', 'Notification Types')}
        </h3>
        
        <div className="space-y-6">
          {Object.entries(groupedCategories).map(([group, categories]) => (
            <div key={group}>
              <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                {GROUP_LABELS[group as keyof typeof GROUP_LABELS][language]}
              </h4>
              <div className="space-y-2">
                {categories.map((config) => (
                  <div
                    key={config.category}
                    className={clsx(
                      'flex items-center justify-between py-2.5 px-3 rounded-lg transition-colors',
                      'hover:bg-bg-tertiary'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className={clsx(
                          'w-5 h-5 rounded flex items-center justify-center transition-colors',
                          preferences.categories[config.category] && preferences.enabled
                            ? 'bg-accent text-white'
                            : 'bg-bg-quaternary text-transparent'
                        )}
                      >
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm text-text-primary">
                        {t(config.titleKey, config.category.replace(/_/g, ' '))}
                      </span>
                    </div>
                    <Toggle
                      checked={preferences.categories[config.category]}
                      onChange={(e) => toggleCategory(config.category, e.target.checked)}
                      disabled={!preferences.enabled}
                      size="sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
