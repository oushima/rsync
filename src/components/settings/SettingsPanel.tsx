import { useState } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { Card } from '../ui/Card';
import { Toggle } from '../ui/Toggle';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ThemeSelector } from './ThemeSelector';
import { PermissionsPanel } from './PermissionsPanel';

const languageOptions = [
  { code: 'en' as const, label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  { code: 'nl' as const, label: 'Dutch', nativeLabel: 'Nederlands', flag: '🇳🇱' },
];

function LanguageSelector() {
  const { language, setLanguage } = useSettingsStore();
  return (
    <div>
      <h3 className="text-[15px] font-medium text-text-primary mb-3">
        {language === 'nl' ? 'Kies je taal' : 'Choose your language'}
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
  const [showResetModal, setShowResetModal] = useState(false);
  
  const {
    language,
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

  const { syncOptions } = useSyncStore();
  const { updateSyncOptions } = useSync();

  const handleReset = () => {
    resetToDefaults();
    setShowResetModal(false);
  };

  const texts = {
    en: {
      appearance: 'How it looks',
      behavior: 'App behavior',
      notifications: 'Tell me when copying is done',
      notificationsDesc: 'Show a message when your files are finished copying',
      confirmSync: 'Ask me before starting',
      confirmSyncDesc: 'Show a "Are you sure?" message before copying begins',
      minimizeTray: 'Keep running when I close the window',
      minimizeTrayDesc: 'The app stays open in the background (you can find it in your menu bar)',
      preventSleep: 'Keep my Mac awake during transfers',
      preventSleepDesc: 'Prevent your Mac from sleeping while files are being copied',
      rememberDestination: 'Remember last destination',
      rememberDestinationDesc: 'Automatically use the last destination folder when you start the app',
      syncOptions: 'Copying options',
      overwriteNewer: 'Replace newer files',
      overwriteNewerDesc: 'Copy over files even if the destination has a newer version',
      overwriteOlder: 'Replace older files',
      overwriteOlderDesc: 'Only copy over files if the destination has an older version',
      skipExisting: 'Skip files that already exist',
      skipExistingDesc: 'Don\'t copy files if they\'re already at the destination',
      deleteOrphans: 'Delete extra files at destination',
      deleteOrphansDesc: 'Remove files from destination that aren\'t in the source folder',
      preservePermissions: 'Keep file settings the same',
      preservePermissionsDesc: 'Copied files will have the same read/write settings as originals',
      followSymlinks: 'Follow shortcuts',
      followSymlinksDesc: 'When copying a shortcut, copy the actual file it points to',
      dryRun: 'Preview only (don\'t actually copy)',
      dryRunDesc: 'See what would happen without actually copying any files',
      performance: 'Performance',
      concurrentFiles: 'Parallel file transfers',
      concurrentFilesDesc: 'Copy multiple files at once (best for SSDs and network drives)',
      permissions: 'App permissions',
      reset: 'Start fresh',
      resetDesc: 'Put all settings back to how they were when you first installed the app',
      resetConfirmTitle: 'Start fresh?',
      resetConfirmMessage: 'This will put all your settings back to how they were when you first installed the app. Your files won\'t be affected.',
      resetConfirmButton: 'Yes, reset everything',
      cancel: 'No, keep my settings',
    },
    nl: {
      appearance: 'Hoe het eruitziet',
      behavior: 'App gedrag',
      notifications: 'Laat me weten wanneer kopiëren klaar is',
      notificationsDesc: 'Toon een bericht wanneer je bestanden klaar zijn met kopiëren',
      confirmSync: 'Vraag me voordat je begint',
      confirmSyncDesc: 'Toon een "Weet je het zeker?" bericht voordat het kopiëren begint',
      minimizeTray: 'Blijf draaien als ik het venster sluit',
      minimizeTrayDesc: 'De app blijft open op de achtergrond (je vindt hem in je menubalk)',
      preventSleep: 'Houd mijn Mac wakker tijdens transfers',
      preventSleepDesc: 'Voorkom dat je Mac in slaapstand gaat terwijl bestanden worden gekopieerd',
      rememberDestination: 'Onthoud laatste bestemming',
      rememberDestinationDesc: 'Gebruik automatisch de laatste bestemmingsmap wanneer je de app start',
      syncOptions: 'Kopieeropties',
      overwriteNewer: 'Nieuwere bestanden vervangen',
      overwriteNewerDesc: 'Kopieer over bestanden zelfs als de bestemming een nieuwere versie heeft',
      overwriteOlder: 'Oudere bestanden vervangen',
      overwriteOlderDesc: 'Kopieer alleen over bestanden als de bestemming een oudere versie heeft',
      skipExisting: 'Sla bestanden over die al bestaan',
      skipExistingDesc: 'Kopieer geen bestanden als ze al op de bestemming staan',
      deleteOrphans: 'Verwijder extra bestanden op bestemming',
      deleteOrphansDesc: 'Verwijder bestanden van de bestemming die niet in de bronmap staan',
      preservePermissions: 'Houd bestandsinstellingen hetzelfde',
      preservePermissionsDesc: 'Gekopieerde bestanden hebben dezelfde lees/schrijf instellingen als originelen',
      followSymlinks: 'Volg snelkoppelingen',
      followSymlinksDesc: 'Bij het kopiëren van een snelkoppeling, kopieer het echte bestand waar het naar wijst',
      dryRun: 'Alleen bekijken (niet echt kopiëren)',
      dryRunDesc: 'Zie wat er zou gebeuren zonder daadwerkelijk bestanden te kopiëren',
      performance: 'Prestaties',
      concurrentFiles: 'Parallelle bestandsoverdracht',
      concurrentFilesDesc: 'Kopieer meerdere bestanden tegelijk (beste voor SSDs en netwerk schijven)',
      permissions: 'App-rechten',
      reset: 'Opnieuw beginnen',
      resetDesc: 'Zet alle instellingen terug naar hoe ze waren toen je de app installeerde',
      resetConfirmTitle: 'Opnieuw beginnen?',
      resetConfirmMessage: 'Dit zet al je instellingen terug naar hoe ze waren toen je de app installeerde. Je bestanden worden niet aangeraakt.',
      resetConfirmButton: 'Ja, reset alles',
      cancel: 'Annuleer',
    },
  };

  const t = texts[language];

  const syncOptionsConfig = [
    { key: 'overwriteNewer' as const, label: t.overwriteNewer, desc: t.overwriteNewerDesc },
    { key: 'overwriteOlder' as const, label: t.overwriteOlder, desc: t.overwriteOlderDesc },
    { key: 'skipExisting' as const, label: t.skipExisting, desc: t.skipExistingDesc },
    { key: 'deleteOrphans' as const, label: t.deleteOrphans, desc: t.deleteOrphansDesc },
    { key: 'preservePermissions' as const, label: t.preservePermissions, desc: t.preservePermissionsDesc },
    { key: 'followSymlinks' as const, label: t.followSymlinks, desc: t.followSymlinksDesc },
    { key: 'dryRun' as const, label: t.dryRun, desc: t.dryRunDesc },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full">
      {/* Appearance Section */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold text-text-primary">
            {t.appearance}
          </h2>
          <ThemeSelector />
          <LanguageSelector />
        </div>
      </Card>

      {/* Sync Options Section */}
      <Card variant="default" padding="lg">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {t.syncOptions}
          </h2>
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
            {t.performance}
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-medium text-text-primary">
                  {t.concurrentFiles}
                </p>
                <p className="text-[13px] text-text-secondary">
                  {t.concurrentFilesDesc}
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
            {t.behavior}
          </h2>
          <Toggle
            label={t.notifications}
            description={t.notificationsDesc}
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
          />
          <Toggle
            label={t.confirmSync}
            description={t.confirmSyncDesc}
            checked={confirmBeforeSync}
            onChange={(e) => setConfirmBeforeSync(e.target.checked)}
          />
          <Toggle
            label={t.minimizeTray}
            description={t.minimizeTrayDesc}
            checked={minimizeToTray}
            onChange={(e) => setMinimizeToTray(e.target.checked)}
          />
          <Toggle
            label={t.preventSleep}
            description={t.preventSleepDesc}
            checked={preventSleepDuringTransfer}
            onChange={(e) => setPreventSleepDuringTransfer(e.target.checked)}
          />
          <Toggle
            label={t.rememberDestination}
            description={t.rememberDestinationDesc}
            checked={rememberLastDestination}
            onChange={(e) => setRememberLastDestination(e.target.checked)}
          />
        </div>
      </Card>

      {/* Permissions Section */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          {t.permissions}
        </h2>
        <PermissionsPanel />
      </div>

      {/* Reset Section */}
      <Card variant="outlined" padding="lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-medium text-text-primary">
              {t.reset}
            </p>
            <p className="text-[13px] text-text-secondary">
              {t.resetDesc}
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => setShowResetModal(true)}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            {t.reset}
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
              {t.resetConfirmTitle}
            </h3>
            <p className="text-[14px] text-text-secondary leading-relaxed">
              {t.resetConfirmMessage}
            </p>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <Button
              variant="secondary"
              className="flex-1 py-4 px-6"
              onClick={() => setShowResetModal(false)}
            >
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              className="flex-1 py-4 px-6"
              onClick={handleReset}
            >
              {t.resetConfirmButton}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
