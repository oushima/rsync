import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Play,
  Trash2,
  AlertCircle,
  HardDrive,
  FileStack,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ProgressBar } from '../ui/ProgressBar';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { getInterruptedTransfers, discardTransfer, resumeInterruptedTransfer } from '../../utils/tauriCommands';
import { logger } from '../../utils/logger';
import type { TransferState } from '../../types';

interface InterruptedTransferRowProps {
  transfer: TransferState;
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  isResuming: boolean;
  isDiscarding: boolean;
}

function InterruptedTransferRow({
  transfer,
  onResume,
  onDiscard,
  isResuming,
  isDiscarding,
}: InterruptedTransferRowProps) {
  const { t, i18n } = useTranslation();
  const { formatBytes } = useSync();
  const [isExpanded, setIsExpanded] = useState(false);

  const progress = transfer.total_bytes > 0
    ? (transfer.bytes_transferred / transfer.total_bytes) * 100
    : 0;

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  // Get source folder name for display
  const sourceName = transfer.source_path.split('/').pop() || transfer.source_path;
  const destName = transfer.dest_path.split('/').pop() || transfer.dest_path;

  // Status badge color
  const statusColor = transfer.status === 'failed' 
    ? 'text-error bg-error/10' 
    : transfer.status === 'paused'
    ? 'text-warning bg-warning/10'
    : 'text-accent bg-accent/10';

  const statusLabel = transfer.status === 'failed'
    ? t('resumeTransfer.statusFailed')
    : transfer.status === 'paused'
    ? t('resumeTransfer.statusPaused')
    : t('resumeTransfer.statusInterrupted');

  const isProcessing = isResuming || isDiscarding;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={clsx(
        'rounded-2xl',
        'bg-bg-secondary',
        'border border-border-subtle',
        'shadow-xs',
        'overflow-hidden',
        isProcessing && 'opacity-60 pointer-events-none'
      )}
    >
      {/* Main row */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div
            className={clsx(
              'w-12 h-12 rounded-full flex items-center justify-center shrink-0',
              'bg-bg-tertiary'
            )}
          >
            <RefreshCw className="w-6 h-6 text-accent" />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            {/* Header with status */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={clsx('text-[13px] font-medium px-2 py-0.5 rounded-full', statusColor)}>
                {statusLabel}
              </span>
              <span className="text-[13px] text-text-tertiary">
                {formatDate(transfer.updated_at)}
              </span>
            </div>

            {/* Paths */}
            <p className="text-[15px] text-text-primary truncate mb-1" title={transfer.source_path}>
              {sourceName} → {destName}
            </p>

            {/* Progress bar */}
            <div className="mb-3">
              <ProgressBar 
                value={progress} 
                size="sm" 
                variant={transfer.status === 'failed' ? 'error' : 'default'}
              />
              <div className="flex justify-between mt-1 text-[12px] text-text-tertiary">
                <span>{progress.toFixed(1)}% {t('resumeTransfer.complete')}</span>
                <span>
                  {formatBytes(transfer.bytes_transferred)} / {formatBytes(transfer.total_bytes)}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-[13px] text-text-secondary">
              <div className="flex items-center gap-1">
                <FileStack className="w-4 h-4" />
                <span>
                  {transfer.files_completed}/{transfer.total_files} {t('resumeTransfer.files')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <HardDrive className="w-4 h-4" />
                <span>{formatBytes(transfer.total_bytes - transfer.bytes_transferred)} {t('resumeTransfer.remaining')}</span>
              </div>
            </div>

            {/* Error message if failed */}
            {transfer.error && (
              <div className="mt-2 flex items-start gap-2 text-[13px] text-error">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{transfer.error}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-2"
              title={isExpanded ? t('resumeTransfer.collapse') : t('resumeTransfer.expand')}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDiscard(transfer.id)}
              disabled={isProcessing}
              className="px-2 text-error hover:text-error"
              title={t('resumeTransfer.discard')}
            >
              {isDiscarding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onResume(transfer.id)}
              disabled={isProcessing}
              leftIcon={
                isResuming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )
              }
            >
              {t('resumeTransfer.resume')}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 border-t border-border-subtle">
              <div className="pt-4 space-y-3">
                {/* Full paths */}
                <div>
                  <div className="flex items-center gap-2 text-[13px] text-text-tertiary mb-1">
                    <FolderOpen className="w-4 h-4" />
                    <span>{t('resumeTransfer.sourcePath')}</span>
                  </div>
                  <p className="text-[13px] text-text-secondary font-mono break-all pl-6">
                    {transfer.source_path}
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-[13px] text-text-tertiary mb-1">
                    <FolderOpen className="w-4 h-4" />
                    <span>{t('resumeTransfer.destPath')}</span>
                  </div>
                  <p className="text-[13px] text-text-secondary font-mono break-all pl-6">
                    {transfer.dest_path}
                  </p>
                </div>

                {/* Transfer ID for debugging */}
                <div className="pt-2 border-t border-border-subtle/50">
                  <span className="text-[11px] text-text-tertiary font-mono">
                    ID: {transfer.id}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ResumeTransferPanel() {
  const { t } = useTranslation();
  const [interruptedTransfers, setInterruptedTransfers] = useState<TransferState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { setSourcePath, setDestPath, syncState } = useSyncStore();

  // Load interrupted transfers on mount
  const loadInterruptedTransfers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const transfers = await getInterruptedTransfers();
      setInterruptedTransfers(transfers);
    } catch (err) {
      logger.error('Failed to load interrupted transfers:', err);
      setError(t('resumeTransfer.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadInterruptedTransfers();
  }, [loadInterruptedTransfers]);

  // Refresh when sync state changes to idle (transfer finished)
  useEffect(() => {
    if (syncState === 'idle') {
      loadInterruptedTransfers();
    }
  }, [syncState, loadInterruptedTransfers]);

  const handleResume = useCallback(async (transferId: string) => {
    setResumingId(transferId);
    setError(null);

    try {
      const transfer = interruptedTransfers.find((t) => t.id === transferId);
      if (!transfer) {
        throw new Error('Transfer not found');
      }

      // Resume the transfer via backend
      await resumeInterruptedTransfer(transferId);

      // Set the paths in the store so the UI shows them
      setSourcePath(transfer.source_path);
      setDestPath(transfer.dest_path);

      // Remove from interrupted list
      setInterruptedTransfers((prev) => prev.filter((t) => t.id !== transferId));

      logger.debug('Resumed interrupted transfer:', transferId);
    } catch (err) {
      logger.error('Failed to resume transfer:', err);
      setError(t('resumeTransfer.resumeError'));
    } finally {
      setResumingId(null);
    }
  }, [interruptedTransfers, setSourcePath, setDestPath, t]);

  const handleDiscard = useCallback(async (transferId: string) => {
    setDiscardingId(transferId);
    setError(null);

    try {
      await discardTransfer(transferId);
      setInterruptedTransfers((prev) => prev.filter((t) => t.id !== transferId));
      logger.debug('Discarded interrupted transfer:', transferId);
    } catch (err) {
      logger.error('Failed to discard transfer:', err);
      setError(t('resumeTransfer.discardError'));
    } finally {
      setDiscardingId(null);
    }
  }, [t]);

  const handleDiscardAll = useCallback(async () => {
    setError(null);
    
    try {
      for (const transfer of interruptedTransfers) {
        await discardTransfer(transfer.id);
      }
      setInterruptedTransfers([]);
      logger.debug('Discarded all interrupted transfers');
    } catch (err) {
      logger.error('Failed to discard all transfers:', err);
      setError(t('resumeTransfer.discardAllError'));
    }
  }, [interruptedTransfers, t]);

  // Don't render anything if there are no interrupted transfers and we're not loading
  if (!isLoading && interruptedTransfers.length === 0) {
    return null;
  }

  return (
    <Card variant="default" padding="lg" className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">
              {t('resumeTransfer.title')}
            </h3>
            <p className="text-[13px] text-text-tertiary">
              {t('resumeTransfer.subtitle', { count: interruptedTransfers.length })}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadInterruptedTransfers}
            disabled={isLoading}
            title={t('resumeTransfer.refresh')}
          >
            <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
          </Button>
          {interruptedTransfers.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscardAll}
              className="text-error hover:text-error"
            >
              {t('resumeTransfer.discardAll')}
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-xl bg-error/10 border border-error/20 flex items-center gap-2"
        >
          <XCircle className="w-4 h-4 text-error shrink-0" />
          <span className="text-[13px] text-error">{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-error hover:text-error/80"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-accent animate-spin" />
          <span className="ml-2 text-[14px] text-text-tertiary">{t('resumeTransfer.loading')}</span>
        </div>
      ) : (
        /* Transfer list */
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {interruptedTransfers.map((transfer) => (
              <InterruptedTransferRow
                key={transfer.id}
                transfer={transfer}
                onResume={handleResume}
                onDiscard={handleDiscard}
                isResuming={resumingId === transfer.id}
                isDiscarding={discardingId === transfer.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </Card>
  );
}
