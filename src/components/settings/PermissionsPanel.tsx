import { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, ExternalLink, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'checking';

export function PermissionsPanel() {
  const [fdaStatus, setFdaStatus] = useState<PermissionStatus>('unknown');
  const [isChecking, setIsChecking] = useState(false);
  const { language } = useSettingsStore();

  const texts = {
    en: {
      title: 'Full Disk Access',
      description: 'Only needed if you want to sync system-protected folders like Mail, Messages, or Safari data. For regular folders, you can skip this.',
      fullDiskAccess: 'Full Disk Access',
      granted: 'Allowed ✓',
      denied: 'Not enabled',
      unknown: "We couldn't check this",
      checking: 'Checking...',
      checkPermission: 'Check again',
      openSettings: 'Open Mac Settings',
      instructions: 'To enable Full Disk Access:',
      step1: '1. Click "Open Mac Settings" below',
      step2: '2. Find "RSync" in the list',
      step3: '3. Turn the switch ON',
      step4: '4. Restart RSync if needed',
      protectedFolders: 'Protected folders include: Mail, Messages, Safari, Time Machine backups',
    },
    nl: {
      title: 'Volledige schijftoegang',
      description: 'Alleen nodig als je systeembeveiligde mappen wilt synchroniseren zoals Mail, Berichten of Safari-gegevens. Voor normale mappen kun je dit overslaan.',
      fullDiskAccess: 'Volledige schijftoegang',
      granted: 'Toegestaan ✓',
      denied: 'Niet ingeschakeld',
      unknown: 'We konden dit niet controleren',
      checking: 'Controleren...',
      checkPermission: 'Opnieuw controleren',
      openSettings: 'Open Mac Instellingen',
      instructions: 'Om Volledige schijftoegang in te schakelen:',
      step1: '1. Klik op "Open Mac Instellingen" hieronder',
      step2: '2. Zoek "RSync" in de lijst',
      step3: '3. Zet de schakelaar AAN',
      step4: '4. Herstart RSync indien nodig',
      protectedFolders: 'Beveiligde mappen zijn: Mail, Berichten, Safari, Time Machine-backups',
    },
  };

  const t = texts[language];

  const checkFullDiskAccess = async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    setFdaStatus('checking');
    
    // Small delay to show the checking state visually
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
      const hasAccess = await invoke<boolean>('check_fda');
      console.log('FDA check result:', hasAccess);
      setFdaStatus(hasAccess ? 'granted' : 'denied');
    } catch (error) {
      console.error('Failed to check FDA status:', error);
      setFdaStatus('denied');
    } finally {
      setIsChecking(false);
    }
  };

  const openSystemPreferences = async () => {
    try {
      await invoke('open_fda_settings');
    } catch (error) {
      console.error('Failed to open preferences via invoke:', error);
      // Fallback: try opening via URL
      try {
        const { open } = await import('@tauri-apps/plugin-opener');
        await open('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
      } catch {
        // Final fallback - try shell opener
        console.error('All methods to open settings failed');
      }
    }
  };

  useEffect(() => {
    checkFullDiskAccess();
  }, []);

  const statusConfig = {
    granted: {
      icon: ShieldCheck,
      color: 'text-success',
      bg: 'bg-success/10',
      label: t.granted,
    },
    denied: {
      icon: ShieldAlert,
      color: 'text-error',
      bg: 'bg-error/10',
      label: t.denied,
    },
    unknown: {
      icon: ShieldAlert,
      color: 'text-warning',
      bg: 'bg-warning/10',
      label: t.unknown,
    },
    checking: {
      icon: RefreshCw,
      color: 'text-text-tertiary',
      bg: 'bg-bg-tertiary',
      label: t.checking,
    },
  };

  const status = statusConfig[fdaStatus];
  const StatusIcon = status.icon;

  return (
    <Card variant="default" padding="lg">
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-[18px] font-semibold text-text-primary">
            {t.title}
          </h3>
          <p className="text-[14px] text-text-secondary mt-1">
            {t.description}
          </p>
        </div>

        {/* Status Card */}
        <div
          className={clsx(
            'flex items-center gap-4 p-5 rounded-xl',
            status.bg
          )}
        >
          <div
            className={clsx(
              'w-12 h-12 rounded-full flex items-center justify-center',
              'bg-bg-primary'
            )}
          >
            <StatusIcon
              className={clsx(
                'w-6 h-6',
                status.color,
                fdaStatus === 'checking' && 'animate-spin'
              )}
            />
          </div>
          <div className="flex-1">
            <p className="text-[15px] font-medium text-text-primary">
              {t.fullDiskAccess}
            </p>
            <p className={clsx('text-[14px] font-medium', status.color)}>
              {status.label}
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={fdaStatus === 'granted' ? openSystemPreferences : checkFullDiskAccess}
            disabled={isChecking}
            leftIcon={<RefreshCw className={clsx('w-4.5 h-4.5', isChecking && 'animate-spin')} />}
          >
            {fdaStatus === 'granted' ? t.revokePermission : t.checkPermission}
          </Button>
        </div>

        {/* Instructions if not granted - keep visible during checking to prevent layout shift */}
        {(fdaStatus === 'denied' || fdaStatus === 'checking') && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-tertiary italic">
              {t.protectedFolders}
            </p>
            <p className="text-[15px] font-medium text-text-primary">
              {t.instructions}
            </p>
            <ol className="space-y-2 text-[14px] text-text-secondary">
              <li>{t.step1}</li>
              <li>{t.step2}</li>
              <li>{t.step3}</li>
              <li>{t.step4}</li>
            </ol>
            <Button
              variant="primary"
              onClick={openSystemPreferences}
              disabled={isChecking}
              leftIcon={<ExternalLink className="w-4.5 h-4.5" />}
            >
              {t.openSettings}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
