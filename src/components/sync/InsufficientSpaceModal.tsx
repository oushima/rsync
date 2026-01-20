import { useTranslation } from 'react-i18next';
import { HardDrive, AlertTriangle, ArrowRight, X, FolderOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';

interface InsufficientSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNewDestination?: () => void;
  requiredSpace: number;
  availableSpace: number;
  destinationPath?: string;
  destinationName: string;
}

function formatBytesShort(bytes: number): string {
  if (bytes === 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) {
    return `${(gb / 1024).toFixed(1)} TB`;
  }
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function InsufficientSpaceModal({
  isOpen,
  onClose,
  onSelectNewDestination,
  requiredSpace,
  availableSpace,
  destinationName,
}: InsufficientSpaceModalProps) {
  const { t } = useTranslation();
  
  const shortfall = requiredSpace - availableSpace;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full max-w-lg bg-bg-primary rounded-2xl shadow-xl overflow-hidden"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 h-10 w-10 p-0 rounded-full hover:bg-bg-tertiary flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors z-10"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>

            {/* Header with warning icon */}
            <div className="bg-gradient-to-br from-warning/10 to-error/10 px-6 py-8 text-center border-b border-border-subtle">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-warning/20 mb-4">
                <AlertTriangle className="w-8 h-8 text-warning" strokeWidth={1.75} />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">
                {t('insufficientSpace.title')}
              </h2>
              <p className="text-sm text-text-secondary max-w-sm mx-auto">
                {t('insufficientSpace.description')}
              </p>
            </div>

            {/* Space comparison */}
            <div className="px-6 py-6 space-y-4">
              {/* Required vs Available */}
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-bg-tertiary rounded-xl p-4">
                  <p className="text-xs text-text-tertiary mb-1">{t('insufficientSpace.filesNeed')}</p>
                  <p className="text-lg font-semibold text-text-primary tabular-nums">
                    {formatBytesShort(requiredSpace)}
                  </p>
                </div>
                
                <ArrowRight className="w-5 h-5 text-text-tertiary shrink-0" />
                
                <div className="flex-1 bg-error/10 border border-error/20 rounded-xl p-4">
                  <p className="text-xs text-text-tertiary mb-1">{t('insufficientSpace.availableOn')} "{destinationName}"</p>
                  <p className="text-lg font-semibold text-error tabular-nums">
                    {formatBytesShort(availableSpace)}
                  </p>
                </div>
              </div>

              {/* Shortfall callout */}
              <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-warning shrink-0" />
                <div>
                  <p className="text-xs text-text-tertiary">{t('insufficientSpace.shortfall')}</p>
                  <p className="text-base font-semibold text-warning tabular-nums">
                    +{formatBytesShort(shortfall)}
                  </p>
                </div>
              </div>

              {/* Suggestions */}
              <div className="pt-2">
                <p className="text-sm font-medium text-text-primary mb-3">{t('insufficientSpace.suggestions')}</p>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li className="flex items-start gap-2">
                    <span className="text-accent">1.</span>
                    {t('insufficientSpace.suggestion1')}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent">2.</span>
                    {t('insufficientSpace.suggestion2')}
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent">3.</span>
                    {t('insufficientSpace.suggestion3')}
                  </li>
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-bg-secondary/50 border-t border-border-subtle flex gap-3">
              {onSelectNewDestination && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    onSelectNewDestination();
                  }}
                  leftIcon={<FolderOpen className="w-4 h-4" />}
                  className="flex-1"
                >
                  {t('insufficientSpace.selectNew')}
                </Button>
              )}
              <Button
                variant="primary"
                onClick={onClose}
                className="flex-1"
              >
                {t('insufficientSpace.understood')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
