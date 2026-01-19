import { useTranslation } from 'react-i18next';
import { AlertTriangle, FolderX, ArrowRight, Trash2, Clock } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { TransferQueueItem } from '../../types';

interface SourceMissingModalProps {
  isOpen: boolean;
  queueItem: TransferQueueItem | null;
  onRemove: () => void;
  onRetryLater: () => void;
}

export function SourceMissingModal({
  isOpen,
  queueItem,
  onRemove,
  onRetryLater,
}: SourceMissingModalProps) {
  const { t } = useTranslation();

  if (!queueItem) return null;

  const sourceName = queueItem.sourcePath.split('/').pop() || queueItem.sourcePath;
  const destName = queueItem.destPath.split('/').pop() || queueItem.destPath;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onRetryLater}
      size="md"
      closeOnOverlayClick={false}
      closeOnEscape={true}
      showCloseButton={false}
    >
      <div className="flex flex-col items-center text-center">
        {/* Warning icon */}
        <div className="relative mb-6">
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-warning/10">
            <FolderX className="w-10 h-10 text-warning" />
          </div>
          <div className="absolute -bottom-1 -right-1 flex items-center justify-center w-8 h-8 rounded-full bg-bg-primary border-2 border-warning/20">
            <AlertTriangle className="w-4 h-4 text-warning" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-text-primary mb-2">
          {t('sourceMissing.title')}
        </h2>

        {/* Message */}
        <p className="text-text-secondary text-sm max-w-xs mb-6">
          {t('sourceMissing.message')}
        </p>

        {/* Path details */}
        <div className="w-full bg-bg-secondary rounded-xl p-4 mb-6">
          <div className="flex items-center justify-center gap-3 text-sm">
            <div className="flex flex-col items-end">
              <span className="text-xs text-text-tertiary uppercase tracking-wide mb-1">
                {t('sourceMissing.path')}
              </span>
              <span className="text-text-primary font-medium truncate max-w-35" title={queueItem.sourcePath}>
                {sourceName}
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-text-tertiary shrink-0" />
            <div className="flex flex-col items-start">
              <span className="text-xs text-text-tertiary uppercase tracking-wide mb-1">
                {t('sourceMissing.destination')}
              </span>
              <span className="text-text-primary font-medium truncate max-w-35" title={queueItem.destPath}>
                {destName}
              </span>
            </div>
          </div>
          
          {/* Full path */}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-text-tertiary break-all font-mono">
              {queueItem.sourcePath}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 w-full">
          <Button
            variant="secondary"
            size="md"
            onClick={onRetryLater}
            leftIcon={<Clock className="w-4 h-4" />}
            className="flex-1"
          >
            {t('sourceMissing.retryLater')}
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={onRemove}
            leftIcon={<Trash2 className="w-4 h-4" />}
            className="flex-1"
          >
            {t('sourceMissing.removeFromQueue')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
