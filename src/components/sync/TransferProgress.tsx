import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Square, RotateCcw, CheckCircle2, XCircle, Loader2, ListPlus } from 'lucide-react';
import clsx from 'clsx';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useTransferState } from '../../hooks/useTransferState';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Modal } from '../ui/Modal';

export function TransferProgress() {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const { syncState, transferStats, sourcePath, destPath } = useSyncStore();
  const { startSync, pauseSync, resumeSync, cancelSync, reset, formatBytes, formatTime, canSync, isRunning, isPaused, queueTransfer } = useSync();
  const { progressPercentage, elapsedTime } = useTransferState();
  const { language, confirmBeforeSync } = useSettingsStore();

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

  const texts = {
    en: {
      ready: 'Ready to make folders match',
      readyDesc: 'Pick files and a destination to start',
      preparing: 'Getting things ready...',
      preparingDesc: 'Looking at your files',
      syncing: 'Copying and matching',
      syncingDesc: 'Moving files to the right place',
      paused: 'Paused',
      pausedDesc: 'Press resume to continue',
      completed: 'All done',
      completedDesc: 'Your folders match now',
      cancelled: 'Stopped',
      cancelledDesc: 'We stopped the copy',
      error: 'Something went wrong',
      errorDesc: 'The copy could not finish',
      start: 'Start copying',
      addToQueue: 'Add to Queue',
      pause: 'Pause',
      resume: 'Resume',
      cancel: 'Stop',
      reset: 'Start new sync',
      speed: 'Speed',
      elapsed: 'Time spent',
      remaining: 'Time left',
      files: 'Files',
      transferred: 'Copied',
      currentFile: 'Copying now',
      confirmTitle: 'Start copying?',
      confirmMessage: 'This will copy files from the source to the destination folder.',
      confirmYes: 'Yes, start copying',
      confirmNo: 'Cancel',
    },
    nl: {
      ready: 'Klaar om mappen gelijk te maken',
      readyDesc: 'Kies bestanden en een bestemming om te starten',
      preparing: 'Even voorbereiden...',
      preparingDesc: 'We kijken naar je bestanden',
      syncing: 'Kopiëren en gelijkmaken',
      syncingDesc: 'We zetten bestanden op de juiste plek',
      paused: 'Gepauzeerd',
      pausedDesc: 'Klik op hervatten om door te gaan',
      completed: 'Helemaal klaar',
      completedDesc: 'Je mappen zijn nu gelijk',
      cancelled: 'Gestopt',
      cancelledDesc: 'We hebben het kopiëren gestopt',
      error: 'Er ging iets mis',
      errorDesc: 'Het kopiëren kon niet afmaken',
      start: 'Start met kopiëren',
      addToQueue: 'Toevoegen aan wachtrij',
      pause: 'Pauze',
      resume: 'Hervat',
      cancel: 'Stop',
      reset: 'Nieuwe sync starten',
      speed: 'Snelheid',
      elapsed: 'Tijd bezig',
      remaining: 'Tijd over',
      files: 'Bestanden',
      transferred: 'Gekopieerd',
      currentFile: 'Nu bezig met',
      confirmTitle: 'Beginnen met kopiëren?',
      confirmMessage: 'Dit kopieert bestanden van de bron naar de bestemmingsmap.',
      confirmYes: 'Ja, begin met kopiëren',
      confirmNo: 'Annuleren',
    },
  };

  const t = texts[language];

  const stateInfo = {
    idle: { title: t.ready, desc: t.readyDesc, icon: Play, color: 'text-text-tertiary' },
    preparing: { title: t.preparing, desc: t.preparingDesc, icon: Loader2, color: 'text-accent' },
    syncing: { title: t.syncing, desc: t.syncingDesc, icon: Loader2, color: 'text-accent' },
    paused: { title: t.paused, desc: t.pausedDesc, icon: Pause, color: 'text-warning' },
    completed: { title: t.completed, desc: t.completedDesc, icon: CheckCircle2, color: 'text-success' },
    cancelled: { title: t.cancelled, desc: t.cancelledDesc, icon: XCircle, color: 'text-text-tertiary' },
    error: { title: t.error, desc: t.errorDesc, icon: XCircle, color: 'text-error' },
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
            {t.addToQueue}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleStartClick}
            disabled={!canSync}
            leftIcon={<Play className="w-4 h-4" strokeWidth={1.75} />}
            className="px-8"
          >
            {t.start}
          </Button>
        </div>

        <Modal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          title={t.confirmTitle}
        >
          <div className="space-y-6">
            <p className="text-[15px] text-text-secondary">{t.confirmMessage}</p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setShowConfirmModal(false)}
              >
                {t.confirmNo}
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmStart}
              >
                {t.confirmYes}
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
                >
                  <Pause className="w-4.5 h-4.5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={cancelSync}
                  className="px-4 text-error"
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
                >
                  <Play className="w-4.5 h-4.5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={cancelSync}
                  className="px-4 text-error"
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
                {t.reset}
              </Button>
            )}
          </div>
        </div>

        {/* Progress */}
        {(isRunning || isPaused) && (
          <div className="space-y-6">
            {/* Current file(s) being transferred */}
            {(transferStats.currentFiles?.length > 0 || transferStats.currentFile) && (
              <div className="flex flex-col gap-2 px-4 py-3 rounded-2xl bg-bg-tertiary/50">
                <span className="text-[13px] text-text-tertiary">{t.currentFile}:</span>
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
            
            <ProgressBar
              value={progressPercentage}
              size="lg"
              showValue
              animated
              striped={isPaused}
            />

            {/* Stats - horizontal, compact */}
            <div className="flex flex-wrap items-center gap-6 text-[14px]">
              <StatItem
                label={t.files}
                value={`${transferStats.completedFiles}/${transferStats.totalFiles}`}
              />
              <StatItem
                label={t.transferred}
                value={formatBytes(transferStats.transferredBytes)}
              />
              <StatItem
                label={t.speed}
                value={`${formatBytes(transferStats.currentSpeed)}/s`}
              />
              <StatItem
                label={t.elapsed}
                value={formatTime(elapsedTime)}
              />
              <StatItem
                label={t.remaining}
                value={transferStats.estimatedTimeRemaining ? formatTime(transferStats.estimatedTimeRemaining) : '--'}
              />
            </div>
          </div>
        )}

        {/* Completed Stats */}
        {syncState === 'completed' && (
          <div className="flex items-center justify-center gap-10 text-[14px]">
            <StatItem
              label={t.files}
              value={`${transferStats.completedFiles}`}
            />
            <StatItem
              label={t.transferred}
              value={formatBytes(transferStats.transferredBytes)}
            />
            <StatItem
              label={t.elapsed}
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
