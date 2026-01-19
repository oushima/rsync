import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FolderSync, 
  Trash2, 
  Play, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  ChevronRight,
  Inbox,
  Sparkles
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useSync } from '../../hooks/useSync';
import type { TransferQueueItem } from '../../types';

function QueueItemCard({ 
  item, 
  onRemove, 
  isRemovable 
}: { 
  item: TransferQueueItem; 
  onRemove: () => void; 
  isRemovable: boolean;
}) {
  const { t } = useTranslation();

  const statusConfig = useMemo(() => {
    switch (item.status) {
      case 'pending':
        return {
          icon: Clock,
          label: t('queue.pending'),
          className: 'text-text-tertiary',
          bgClassName: 'bg-bg-tertiary',
        };
      case 'running':
        return {
          icon: Loader2,
          label: t('queue.running'),
          className: 'text-accent',
          bgClassName: 'bg-accent/10',
          iconClassName: 'animate-spin',
        };
      case 'completed':
        return {
          icon: CheckCircle2,
          label: t('queue.completed'),
          className: 'text-success',
          bgClassName: 'bg-success/10',
        };
      case 'error':
        return {
          icon: XCircle,
          label: t('queue.failed'),
          className: 'text-error',
          bgClassName: 'bg-error/10',
        };
      case 'cancelled':
        return {
          icon: XCircle,
          label: t('queue.cancelled'),
          className: 'text-warning',
          bgClassName: 'bg-warning/10',
        };
      default:
        return {
          icon: Clock,
          label: 'Unknown',
          className: 'text-text-tertiary',
          bgClassName: 'bg-bg-tertiary',
        };
    }
  }, [item.status, t]);

  const StatusIcon = statusConfig.icon;
  const sourceName = item.sourcePath.split('/').pop() || item.sourcePath;
  const destName = item.destPath.split('/').pop() || item.destPath;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className={`
        group relative flex items-center gap-4 p-4 rounded-xl
        border border-border bg-bg-primary
        transition-all duration-150
        ${item.status === 'running' ? 'ring-2 ring-accent/30' : ''}
      `}
    >
      {/* Status indicator */}
      <div className={`
        flex items-center justify-center w-10 h-10 rounded-xl
        ${statusConfig.bgClassName}
      `}>
        <StatusIcon className={`w-5 h-5 ${statusConfig.className} ${statusConfig.iconClassName || ''}`} />
      </div>

      {/* Transfer info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary truncate">
          <span className="truncate">{sourceName}</span>
          <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
          <span className="truncate">{destName}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs font-medium ${statusConfig.className}`}>
            {statusConfig.label}
          </span>
          {item.error && (
            <span className="text-xs text-error truncate">
              {item.error}
            </span>
          )}
        </div>
      </div>

      {/* Remove button */}
      {isRemovable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="
            opacity-0 group-hover:opacity-100
            transition-opacity duration-150
            text-text-tertiary hover:text-error
            h-8 w-8 p-0
          "
          aria-label={t('queue.remove')}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </motion.div>
  );
}

function EmptyQueueState() {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-bg-tertiary mb-4">
        <Inbox className="w-8 h-8 text-text-tertiary" />
      </div>
      <p className="text-text-secondary font-medium">{t('queue.empty')}</p>
      <p className="text-text-tertiary text-sm mt-1">{t('queue.emptySubtitle')}</p>
    </motion.div>
  );
}

export function TransferQueue() {
  const { t } = useTranslation();
  const { 
    transferQueue, 
    removeFromQueue, 
    startQueue, 
    clearCompletedFromQueue,
    isRunning,
    hasQueuedTransfers,
  } = useSync();

  const { pending, running, completed } = useMemo(() => {
    return {
      pending: transferQueue.filter((item) => item.status === 'pending'),
      running: transferQueue.find((item) => item.status === 'running'),
      completed: transferQueue.filter((item) => 
        item.status === 'completed' || item.status === 'error' || item.status === 'cancelled'
      ),
    };
  }, [transferQueue]);

  const hasCompleted = completed.length > 0;
  const hasItems = transferQueue.length > 0;

  return (
    <Card variant="default" padding="lg" className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-accent/10">
            <FolderSync className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              {t('queue.title')}
            </h3>
            {hasItems && (
              <p className="text-sm text-text-tertiary">
                {t('queue.transfersInQueue', { count: pending.length + (running ? 1 : 0) })}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasCompleted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCompletedFromQueue}
              className="text-text-secondary"
            >
              {t('queue.clearCompleted')}
            </Button>
          )}
          {hasQueuedTransfers && !isRunning && (
            <Button
              variant="primary"
              size="sm"
              onClick={startQueue}
              leftIcon={<Play className="w-4 h-4" />}
            >
              {t('queue.startQueue')}
            </Button>
          )}
        </div>
      </div>

      {/* Queue content */}
      {!hasItems ? (
        <EmptyQueueState />
      ) : (
        <div className="space-y-6">
          {/* Currently running */}
          {running && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-text-secondary">
                  {t('queue.currentTransfer')}
                </span>
              </div>
              <QueueItemCard
                item={running}
                onRemove={() => {}}
                isRemovable={false}
              />
            </div>
          )}

          {/* Pending transfers */}
          {pending.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-medium text-text-secondary">
                  {t('queue.upNext')}
                </span>
              </div>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {pending.map((item) => (
                    <QueueItemCard
                      key={item.id}
                      item={item}
                      onRemove={() => removeFromQueue(item.id)}
                      isRemovable={true}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Completed/failed transfers */}
          {completed.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-medium text-text-secondary">
                  {t('queue.completedTransfers')}
                </span>
              </div>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {completed.map((item) => (
                    <QueueItemCard
                      key={item.id}
                      item={item}
                      onRemove={() => removeFromQueue(item.id)}
                      isRemovable={true}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* No more pending message */}
          {pending.length === 0 && !running && completed.length > 0 && (
            <div className="text-center py-4 text-text-tertiary text-sm">
              {t('queue.noMorePending')}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
