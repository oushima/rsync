import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { RotateCcw, AlertTriangle, Clock, RefreshCw, Ban, HelpCircle, Scale, Bell } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { Card } from '../ui/Card';
import { Toggle } from '../ui/Toggle';
import { Dropdown } from '../ui/Dropdown';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ThemeSelector } from './ThemeSelector';
import { PermissionsPanel } from './PermissionsPanel';
import { ScheduleManager } from './ScheduleManager';
import { NotificationSettings } from './NotificationSettings';
import type { FileExistsAction } from '../../types';

const languageOptions = [
  { code: 'en' as const, label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  { code: 'nl' as const, label: 'Dutch', nativeLabel: 'Nederlands', flag: '🇳🇱' },
];

function LanguageSelector() {
  const { t } = useTranslation();
  const { language, setLanguage } = useSettingsStore();
  return (
    <div>
      <h3 className="text-[15px] font-medium text-text-primary mb-3">
        {t('settings.chooseLanguage')}
      </h3>
      <div className="flex flex-col sm:flex-row gap-3">
        {languageOptions.map((option) => {
          const isSelected = language === option.code;
          return (
            <motion.button
              key={option.code}
              onClick={() => setLanguage(option.code)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={clsx(
                'relative flex-1 p-5 rounded-xl',
                'flex items-center gap-3',
                'border transition-all duration-150 ease-out',
                isSelected
                  ? 'border-accent bg-accent-subtle'
                  : 'border-border bg-bg-secondary hover:border-accent/50'
              )}
            >
              <div className="text-2xl">{option.flag}</div>
              <div className="text-left">
                <p className={clsx('text-[15px] font-medium', isSelected ? 'text-accent' : 'text-text-primary')}>
                  {option.nativeLabel}
                </p>
                <p className="text-[13px] text-text-tertiary">{option.label}</p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPanel() {
  const { t } = useTranslation();
  const [showResetModal, setShowResetModal] = useState(false);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [autoStartLoading, setAutoStartLoading] = useState(false);
  
  const {
    notifications,
    confirmBeforeSync,
    minimizeToTray,
    preventSleepDuringTransfer,
    rememberLastDestination,
    setNotifications,
    setConfirmBeforeSync,
    setMinimizeToTray,
    setPreventSleepDuringTransfer,
    setRememberLastDestination,
    resetToDefaults,
  } = useSettingsStore();

  // Check auto-start status on mount
  useEffect(() => {
    if (!isTauri()) return;
    
    invoke<boolean>('is_auto_start_enabled')
      .then(setAutoStartEnabled)
      .catch((e) => console.error('Failed to check auto-start status:', e));
  }, []);

  // Handle auto-start toggle
  const handleAutoStartChange = useCallback(async (enabled: boolean) => {
    if (!isTauri()) return;
    
    setAutoStartLoading(true);
    try {
      if (enabled) {
        await invoke('enable_auto_start');
      } else {
        await invoke('disable_auto_start');
      }
      setAutoStartEnabled(enabled);
    } catch (e) {
      console.error('Failed to change auto-start setting:', e);
    } finally {
      setAutoStartLoading(false);
    }
  }, []);

  const { syncOptions } = useSyncStore();
  const { updateSyncOptions } = useSync();

  const handleReset = () => {
    resetToDefaults();
    setShowResetModal(false);
  };

  const fileExistsOptions = [
    { 
      value: 'replace-different' as FileExistsAction, 
      label: t('options.replaceDifferentLabel'),
      description: t('options.replaceDifferentDesc'),
      icon: <Scale className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'replace-older' as FileExistsAction, 
      label: t('options.replaceSmartLabel'),
      description: t('options.replaceSmartDesc'),
      icon: <Clock className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'replace-all' as FileExistsAction, 
      label: t('options.replaceAllLabel'),
      description: t('options.replaceAllDesc'),
      icon: <RefreshCw className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'skip' as FileExistsAction, 
      label: t('options.skipLabel'),
      description: t('options.skipDesc'),
      icon: <Ban className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'ask' as FileExistsAction, 
      label: t('options.askLabel'),
      description: t('options.askDesc'),
      icon: <HelpCircle className="w-4 h-4" strokeWidth={1.75} />,
    },
  ];

  const syncOptionsConfig = [
    { key: 'deleteOrphans' as const, label: t('settings.deleteOrphans'), desc: t('settings.deleteOrphansDesc') },
    { key: 'preservePermissions' as const, label: t('settings.preservePermissions'), desc: t('settings.preservePermissionsDesc') },
    { key: 'followSymlinks' as const, label: t('settings.followSymlinks'), desc: t('settings.followSymlinksDesc') },
    { key: 'dryRun' as const, label: t('settings.dryRun'), desc: t('settings.dryRunDesc') },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full">
      {/* Appearance Section */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('settings.appearance')}
          </h2>
          <ThemeSelector />
          <LanguageSelector />
        </div>
      </Card>

      {/* Sync Options Section */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col gap-5">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('settings.syncOptions')}
          </h2>
          
          {/* File Exists Dropdown */}
          <Dropdown
            label={t('settings.fileExists')}
            value={syncOptions.fileExistsAction}
            onChange={(value) => updateSyncOptions({ fileExistsAction: value as FileExistsAction })}
            options={fileExistsOptions}
          />

          {/* Divider */}
          <div className="border-t border-border-subtle" />

          {/* Toggle Options */}
          {syncOptionsConfig.map((option) => (
            <Toggle
              key={option.key}
              label={option.label}
              description={option.desc}
              checked={syncOptions[option.key]}
              onChange={(e) => updateSyncOptions({ [option.key]: e.target.checked })}
            />
          ))}
        </div>
      </Card>

      {/* Performance Section */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('settings.performance')}
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-medium text-text-primary">
                  {t('settings.concurrentFiles')}
                </p>
                <p className="text-[13px] text-text-secondary">
                  {t('settings.concurrentFilesDesc')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={syncOptions.maxConcurrentFiles}
                  onChange={(e) => updateSyncOptions({ maxConcurrentFiles: parseInt(e.target.value) })}
                  className="w-24 h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="text-[15px] font-medium text-text-primary w-6 text-center">
                  {syncOptions.maxConcurrentFiles}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Behavior Section */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('settings.behavior')}
          </h2>
          <Toggle
            label={t('settings.notifications')}
            description={t('settings.notificationsDesc')}
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
          />
          <Toggle
            label={t('settings.confirmSync')}
            description={t('settings.confirmSyncDesc')}
            checked={confirmBeforeSync}
            onChange={(e) => setConfirmBeforeSync(e.target.checked)}
          />
          <Toggle
            label={t('settings.autoStart')}
            description={t('settings.autoStartDesc')}
            checked={autoStartEnabled}
            disabled={autoStartLoading}
            onChange={(e) => handleAutoStartChange(e.target.checked)}
          />
          <Toggle
            label={t('settings.minimizeTray')}
            description={t('settings.minimizeTrayDesc')}
            checked={minimizeToTray}
            onChange={(e) => {
              setMinimizeToTray(e.target.checked);
              if (isTauri()) {
                invoke('set_minimize_to_tray', { enabled: e.target.checked }).catch(console.error);
              }
            }}
          />
          <Toggle
            label={t('settings.preventSleep')}
            description={t('settings.preventSleepDesc')}
            checked={preventSleepDuringTransfer}
            onChange={(e) => setPreventSleepDuringTransfer(e.target.checked)}
          />
          <Toggle
            label={t('settings.rememberDestination')}
            description={t('settings.rememberDestinationDesc')}
            checked={rememberLastDestination}
            onChange={(e) => setRememberLastDestination(e.target.checked)}
          />
        </div>
      </Card>

      {/* Scheduled Syncs Section */}
      <ScheduleManager />

      {/* Notifications Section */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">
              {t('notifications.settings.title', 'Notifications')}
            </h2>
          </div>
          <p className="text-sm text-text-secondary">
            {t('notifications.settings.description', 'Control which notifications you receive and how they appear.')}
          </p>
          <NotificationSettings language={useSettingsStore.getState().language} />
        </div>
      </Card>

      {/* Permissions Section */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          {t('settings.permissions')}
        </h2>
        <PermissionsPanel />
      </div>

      {/* Reset Section */}
      <Card variant="outlined" padding="lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-medium text-text-primary">
              {t('settings.reset')}
            </p>
            <p className="text-[13px] text-text-secondary">
              {t('settings.resetDesc')}
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => setShowResetModal(true)}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            {t('settings.reset')}
          </Button>
        </div>
      </Card>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        size="sm"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-error" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              {t('settings.resetConfirmTitle')}
            </h3>
            <p className="text-[14px] text-text-secondary leading-relaxed">
              {t('settings.resetConfirmMessage')}
            </p>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <Button
              variant="secondary"
              className="flex-1 py-4 px-6"
              onClick={() => setShowResetModal(false)}
            >
              {t('settings.cancelReset')}
            </Button>
            <Button
              variant="danger"
              className="flex-1 py-4 px-6"
              onClick={handleReset}
            >
              {t('settings.resetConfirmButton')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
