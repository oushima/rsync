import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, CheckCircle2, XCircle, Loader2, ListPlus, File } from 'lucide-react';
import clsx from 'clsx';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useTransferState } from '../../hooks/useTransferState';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Modal } from '../ui/Modal';
import type { ActiveFileTransfer } from '../../types';

export function TransferProgress() {
  const { t } = useTranslation();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { syncState, transferStats, sourcePath, destPath } = useSyncStore();
  const { startSync, pauseSync, resumeSync, cancelSync, reset, formatBytes, formatTime, canSync, isRunning, isPaused, queueTransfer } = useSync();
  const { progressPercentage, elapsedTime } = useTransferState();
  const { confirmBeforeSync } = useSettingsStore();

  const handleStartClick = useCallback(() => {
    if (confirmBeforeSync) {
      setShowConfirmModal(true);
    } else {
      startSync();
    }
  }, [confirmBeforeSync, startSync]);

  const handleConfirmStart = useCallback(() => {
    setShowConfirmModal(false);
    startSync();
  }, [startSync]);

  const stateInfo = {
    idle: { title: t('progress.ready'), desc: t('progress.readyDesc'), icon: Play, color: 'text-text-tertiary' },
    preparing: { title: t('progress.preparing'), desc: t('progress.preparingDesc'), icon: Loader2, color: 'text-accent' },
    syncing: { title: t('progress.syncing'), desc: t('progress.syncingDesc'), icon: Loader2, color: 'text-accent' },
    paused: { title: t('progress.paused'), desc: t('progress.pausedDesc'), icon: Pause, color: 'text-warning' },
    completed: { title: t('progress.completed'), desc: t('progress.completedDesc'), icon: CheckCircle2, color: 'text-success' },
    cancelled: { title: t('progress.cancelled'), desc: t('progress.cancelledDesc'), icon: XCircle, color: 'text-text-tertiary' },
    error: { title: t('progress.error'), desc: t('progress.errorDesc'), icon: XCircle, color: 'text-error' },
  };

  const currentState = stateInfo[syncState];
  const StateIcon = currentState.icon;
  const isSpinning = syncState === 'syncing' || syncState === 'preparing';

  // Hide when idle
  if (syncState === 'idle') {
    const handleAddToQueue = () => {
      if (sourcePath && destPath) {
        queueTransfer(sourcePath, destPath);
      }
    };

    return (
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 sm:p-8">
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={handleAddToQueue}
            disabled={!canSync}
            leftIcon={<ListPlus className="w-4 h-4" strokeWidth={1.75} />}
            className="px-6"
          >
            {t('progress.addToQueue')}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleStartClick}
            disabled={!canSync}
            leftIcon={<Play className="w-4 h-4" strokeWidth={1.75} />}
            className="px-8"
          >
            {t('progress.start')}
          </Button>
        </div>

        <Modal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title={t('progress.confirmTitle')}
        >
          <div className="space-y-6">
            <p className="text-[15px] text-text-secondary">{t('progress.confirmMessage')}</p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowConfirmModal(false)}
              >
                {t('progress.confirmNo')}
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmStart}
              >
                {t('progress.confirmYes')}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 sm:p-8 lg:p-10">
      <div className="flex flex-col gap-8">
        {/* Header - minimal */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <motion.div
            animate={isSpinning ? { rotate: 360 } : {}}
            transition={isSpinning ? { repeat: Infinity, duration: 1, ease: 'linear' } : {}}
            className={clsx(
              'w-12 h-12 rounded-2xl flex items-center justify-center',
              'bg-bg-tertiary'
            )}
          >
            <StateIcon className={clsx('w-6 h-6', currentState.color)} strokeWidth={1.75} />
          </motion.div>
          <div className="flex-1">
            <h3 className="text-[17px] font-semibold text-text-primary">
              {currentState.title}
            </h3>
            <p className="text-[15px] text-text-tertiary">
              {currentState.desc}
            </p>
          </div>
          
          {/* Inline actions */}
          <div className="flex flex-wrap gap-2">
            {isRunning && (
              <>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={pauseSync}
                  className="px-4"
                  aria-label={t('progress.pause')}
                >
                  <Pause className="w-4.5 h-4.5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={cancelSync}
                  className="px-4 text-error"
                  aria-label={t('progress.cancel')}
                >
                  <Square className="w-4.5 h-4.5" strokeWidth={1.75} />
                </Button>
              </>
            )}
            {isPaused && (
              <>
                <Button
                  variant="primary"
                  size="md"
                  onClick={resumeSync}
                  className="px-4"
                  aria-label={t('progress.resume')}
                >
                  <Play className="w-4.5 h-4.5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={cancelSync}
                  className="px-4 text-error"
                  aria-label={t('progress.cancel')}
                >
                  <Square className="w-4.5 h-4.5" strokeWidth={1.75} />
                </Button>
              </>
            )}
            {(syncState === 'completed' || syncState === 'cancelled' || syncState === 'error') && (
              <Button
                variant="secondary"
                size="md"
                onClick={reset}
                leftIcon={<RotateCcw className="w-4.5 h-4.5" strokeWidth={1.75} />}
              >
                {t('progress.reset')}
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {(isRunning || isPaused) && (
          <div className="space-y-6">
            {/* Individual File Transfers - Beautiful cards for parallel transfers */}
            {transferStats.activeTransfers?.length > 1 && (
              <div className="space-y-3">
                <span className="text-[13px] font-medium text-text-tertiary">{t('progress.currentFile')}:</span>
                <div className="grid gap-2">
                  {transferStats.activeTransfers.map((transfer) => (
                    <ActiveTransferCard
                      key={transfer.id}
                      transfer={transfer}
                      formatBytes={formatBytes}
                      isPaused={isPaused}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Single file display (when only 1 concurrent transfer) */}
            {(!transferStats.activeTransfers || transferStats.activeTransfers.length <= 1) && 
             (transferStats.currentFiles?.length > 0 || transferStats.currentFile) && (
              <div className="flex flex-col gap-2 px-4 py-3 rounded-2xl bg-bg-tertiary/50">
                <span className="text-[13px] text-text-tertiary">{t('progress.currentFile')}:</span>
                <div className="flex flex-col gap-1.5">
                  {transferStats.currentFiles?.length > 0 ? (
                    transferStats.currentFiles.map((file, index) => (
                      <span 
                        key={index}
                        className="text-[14px] font-medium text-text-primary truncate"
                        title={file}
                      >
                        {file.split(/[\/\\]/).pop() || file}
                      </span>
                    ))
                  ) : transferStats.currentFile && (
                    <span 
                      className="text-[14px] font-medium text-text-primary truncate"
                      title={transferStats.currentFile}
                    >
                      {transferStats.currentFile.split(/[\/\\]/).pop() || transferStats.currentFile}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-text-tertiary">{t('progress.overallProgress')}</span>
                <span className="font-medium text-text-primary tabular-nums">{Math.round(progressPercentage)}%</span>
              </div>
              <ProgressBar
                value={progressPercentage}
                size="lg"
                showValue={false}
                animated
                striped={isPaused}
                shimmer={!isPaused}
              />
            </div>

            {/* Stats - horizontal, compact */}
            <div className="flex flex-wrap items-center gap-6 text-[14px]">
              <StatItem
                label={t('progress.files')}
                value={`${transferStats.completedFiles}/${transferStats.totalFiles}`}
              />
              <StatItem
                label={t('progress.transferred')}
                value={formatBytes(transferStats.transferredBytes)}
              />
              <StatItem
                label={t('progress.speed')}
                value={`${formatBytes(transferStats.currentSpeed)}/s`}
              />
              <StatItem
                label={t('progress.elapsed')}
                value={formatTime(elapsedTime)}
              />
              <StatItem
                label={t('progress.remaining')}
                value={transferStats.estimatedTimeRemaining ? formatTime(transferStats.estimatedTimeRemaining) : '--'}
              />
            </div>
          </div>
        )}

        {/* Completed Stats */}
        {syncState === 'completed' && (
          <div className="flex items-center justify-center gap-10 text-[14px]">
            <StatItem
              label={t('progress.files')}
              value={`${transferStats.completedFiles}`}
            />
            <StatItem
              label={t('progress.transferred')}
              value={formatBytes(transferStats.transferredBytes)}
            />
            <StatItem
              label={t('progress.elapsed')}
              value={formatTime(elapsedTime)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-tertiary">{label}</span>
      <span className="font-medium text-text-primary tabular-nums">{value}</span>
    </div>
  );
}

interface ActiveTransferCardProps {
  transfer: ActiveFileTransfer;
  formatBytes: (bytes: number) => string;
  isPaused: boolean;
}

function ActiveTransferCard({ transfer, formatBytes, isPaused }: ActiveTransferCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="relative overflow-hidden rounded-xl bg-bg-tertiary/60 border border-border-subtle"
    >
      {/* Background progress fill */}
      <motion.div
        className="absolute inset-0 bg-accent/10"
        initial={{ width: '0%' }}
        animate={{ width: `${transfer.progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      
      {/* Content */}
      <div className="relative flex items-center gap-3 px-4 py-3">
        {/* File Icon */}
        <div className="shrink-0 w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
          <File className="w-4 h-4 text-accent" strokeWidth={1.75} />
        </div>
        
        {/* File Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-text-primary truncate" title={transfer.filePath}>
            {transfer.fileName}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-text-tertiary tabular-nums">
              {formatBytes(transfer.transferredBytes)} / {formatBytes(transfer.size)}
            </span>
            {transfer.speed > 0 && !isPaused && (
              <span className="text-[11px] text-accent tabular-nums">
                {formatBytes(transfer.speed)}/s
              </span>
            )}
          </div>
        </div>
        
        {/* Progress Percentage */}
        <div className="shrink-0 flex items-center gap-2">
          <div className="w-12 h-1.5 rounded-full bg-bg-primary overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: `${transfer.progress}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </div>
          <span className="text-[12px] font-medium text-text-secondary tabular-nums w-10 text-right">
            {Math.round(transfer.progress)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}
