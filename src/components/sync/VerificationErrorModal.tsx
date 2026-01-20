import { useTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw, X, HelpCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { VerificationErrorDisplay, VerificationErrorReason } from '../../types';

interface VerificationErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: VerificationErrorDisplay[];
  onRetry: (filePath: string) => void;
  onRetryAll: () => void;
  onSkipAll: () => void;
}

export function VerificationErrorModal({
  isOpen,
  onClose,
  errors,
  onRetry,
  onRetryAll,
  onSkipAll,
}: VerificationErrorModalProps) {
  const { t } = useTranslation();

  const getReasonTexts = (reason: VerificationErrorReason) => {
    const reasonMap: Record<VerificationErrorReason, { simple: string; detail: string; action: string }> = {
      checksum_mismatch: {
        simple: t('verification.checksumMismatch.simple'),
        detail: t('verification.checksumMismatch.detail'),
        action: t('verification.checksumMismatch.action'),
      },
      file_missing: {
        simple: t('verification.fileMissing.simple'),
        detail: t('verification.fileMissing.detail'),
        action: t('verification.fileMissing.action'),
      },
      permission_denied: {
        simple: t('verification.permissionDenied.simple'),
        detail: t('verification.permissionDenied.detail'),
        action: t('verification.permissionDenied.action'),
      },
      disk_full: {
        simple: t('verification.diskFull.simple'),
        detail: t('verification.diskFull.detail'),
        action: t('verification.diskFull.action'),
      },
      source_modified: {
        simple: t('verification.sourceModified.simple', 'Source file changed during copy'),
        detail: t('verification.sourceModified.detail', 'The source file was modified while it was being copied. This can happen if another application is writing to the file.'),
        action: t('verification.sourceModified.action', 'Wait for the source file to stop being modified, then retry the transfer. If this is a log file or database, consider excluding it from sync.'),
      },
      unknown: {
        simple: t('verification.unknown.simple'),
        detail: t('verification.unknown.detail'),
        action: t('verification.unknown.action'),
      },
    };
    return reasonMap[reason];
  };

  if (errors.length === 0) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('verification.title')} size="lg">
      <div className="flex flex-col gap-6">
        {/* Friendly intro */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-warning/10 border border-warning/20">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" strokeWidth={1.75} />
          <p className="text-sm text-text-primary leading-relaxed">
            {t('verification.subtitle')}
          </p>
        </div>

        {/* Error list */}
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {errors.map((error, index) => {
            const reason = getReasonTexts(error.reason);
            return (
              <div
                key={`${error.filePath}-${index}`}
                className="p-4 rounded-2xl bg-bg-tertiary border border-border-subtle"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {error.fileName}
                    </p>
                    <p className="text-xs text-text-tertiary truncate mt-0.5">
                      {error.filePath}
                    </p>
                  </div>
                  {error.canRetry && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRetry(error.filePath)}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />}
                    >
                      {t('verification.retry')}
                    </Button>
                  )}
                </div>

                {/* Simple explanation */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
                    <span className="text-sm font-medium text-warning">{reason.simple}</span>
                  </div>
                  
                  <div className="pl-5 space-y-2">
                    <div>
                      <p className="text-xs font-medium text-text-secondary mb-0.5">{t('verification.whyTitle')}</p>
                      <p className="text-xs text-text-tertiary leading-relaxed">{reason.detail}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-secondary mb-0.5 flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" strokeWidth={1.75} />
                        {t('verification.whatCanIDo')}
                      </p>
                      <p className="text-xs text-text-tertiary leading-relaxed">{reason.action}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={onRetryAll}
            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
            className="flex-1"
          >
            {t('verification.retryAll')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onSkipAll}
            className="flex-1"
          >
            {t('verification.skipAll')}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            leftIcon={<X className="w-4 h-4" strokeWidth={1.75} />}
          >
            {t('verification.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
