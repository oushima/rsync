import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, ExternalLink, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { logger, withTimeout, TIMEOUTS } from '../../utils/logger';

type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'checking';

export function PermissionsPanel() {
  const { t } = useTranslation();
  const [fdaStatus, setFdaStatus] = useState<PermissionStatus>('unknown');
  const [isChecking, setIsChecking] = useState(false);

  const checkFullDiskAccess = async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    setFdaStatus('checking');
    
    // Small delay to show the checking state visually
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
      const hasAccess = await withTimeout(
        invoke<boolean>('check_fda'),
        TIMEOUTS.QUICK,
        'Check Full Disk Access'
      );
      logger.debug('FDA check result:', hasAccess);
      setFdaStatus(hasAccess ? 'granted' : 'denied');
    } catch (error) {
      logger.error('Failed to check FDA status:', error);
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
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
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
      label: t('permissions.granted'),
    },
    denied: {
      icon: ShieldAlert,
      color: 'text-error',
      bg: 'bg-error/10',
      label: t('permissions.denied'),
    },
    unknown: {
      icon: ShieldAlert,
      color: 'text-warning',
      bg: 'bg-warning/10',
      label: t('permissions.unknown'),
    },
    checking: {
      icon: RefreshCw,
      color: 'text-text-tertiary',
      bg: 'bg-bg-tertiary',
      label: t('permissions.checking'),
    },
  };

  const status = statusConfig[fdaStatus];
  const StatusIcon = status.icon;

  return (
    <Card variant="default" padding="lg">
      <div className="flex flex-col gap-6">
        <div>
          <h3 className="text-[18px] font-semibold text-text-primary">
            {t('permissions.title')}
          </h3>
          <p className="text-[14px] text-text-secondary mt-1">
            {t('permissions.description')}
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
              {t('permissions.fullDiskAccess')}
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
            {fdaStatus === 'granted' ? t('permissions.revokePermission') : t('permissions.checkPermission')}
          </Button>
        </div>

        {/* Instructions if not granted - keep visible during checking to prevent layout shift */}
        {(fdaStatus === 'denied' || fdaStatus === 'checking') && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-tertiary italic">
              {t('permissions.protectedFolders')}
            </p>
            <p className="text-[15px] font-medium text-text-primary">
              {t('permissions.instructions')}
            </p>
            <ol className="space-y-2 text-[14px] text-text-secondary">
              <li>{t('permissions.step1')}</li>
              <li>{t('permissions.step2')}</li>
              <li>{t('permissions.step3')}</li>
              <li>{t('permissions.step4')}</li>
            </ol>
            <Button
              variant="primary"
              onClick={openSystemPreferences}
              disabled={isChecking}
              leftIcon={<ExternalLink className="w-4.5 h-4.5" />}
            >
              {t('permissions.openSettings')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
