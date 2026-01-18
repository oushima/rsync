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
      title: 'File access',
      description: 'RSync needs your permission to read and copy files on your Mac. Without this, the app cannot see your files.',
      fullDiskAccess: 'Full Disk Access',
      granted: 'Allowed ✓',
      denied: 'Not allowed yet',
      unknown: "We couldn't check this",
      checking: 'Checking...',
      checkPermission: 'Check again',
      openSettings: 'Open Mac Settings',
      instructions: 'How to give RSync permission:',
      step1: '1. Click the blue \"Open Mac Settings\" button below',
      step2: '2. Look for \"RSync\" in the list of apps',
      step3: '3. Turn the switch ON (it should turn blue/green)',
      step4: '4. You may need to close and reopen RSync',
    },
    nl: {
      title: 'Toegang tot bestanden',
      description: 'RSync heeft je toestemming nodig om bestanden op je Mac te lezen en te kopi\u00ebren. Zonder dit kan de app je bestanden niet zien.',
      fullDiskAccess: 'Volledige schijftoegang',
      granted: 'Toegestaan ✓',
      denied: 'Nog niet toegestaan',
      unknown: 'We konden dit niet controleren',
      checking: 'Controleren...',
      checkPermission: 'Opnieuw controleren',
      openSettings: 'Open Mac Instellingen',
      instructions: 'Hoe geef je RSync toestemming:',
      step1: '1. Klik op de blauwe \"Open Mac Instellingen\" knop hieronder',
      step2: '2. Zoek \"RSync\" in de lijst met apps',
      step3: '3. Zet de schakelaar AAN (hij wordt blauw/groen)',
      step4: '4. Mogelijk moet je RSync sluiten en opnieuw openen',
    },
  };

  const t = texts[language];

  const checkFullDiskAccess = async () => {
    setIsChecking(true);
    setFdaStatus('checking');
    
    try {
      const hasAccess = await invoke<boolean>('check_fda');
      console.log('FDA check result:', hasAccess);
      setFdaStatus(hasAccess ? 'granted' : 'denied');
    } catch (error) {
      console.error('Failed to check FDA status:', error);
      // If we can't check, assume we need to show the setup instructions
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
            onClick={checkFullDiskAccess}
            disabled={isChecking}
            leftIcon={<RefreshCw className={clsx('w-4.5 h-4.5', isChecking && 'animate-spin')} />}
          >
            {t.checkPermission}
          </Button>
        </div>

        {/* Instructions if not granted */}
        {fdaStatus === 'denied' && (
          <div className="space-y-4">
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
