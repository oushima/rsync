import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { FileWarning, File, Calendar, HardDrive, CheckCircle2, SkipForward, Copy, AlertCircle } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import type { ConflictResolution } from '../../types';
import { logger } from '../../utils/logger';

export function ConflictDialog() {
  const { t } = useTranslation();
  const { currentConflict, conflicts, setCurrentConflict, resolveConflict } = useSyncStore();
  const { formatBytes } = useSync();
  const [isResolving, setIsResolving] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  // Count of remaining conflicts (including current one)
  const remainingCount = conflicts.length;
  const pendingCount = remainingCount - 1; // Excluding current

  // Auto-show next conflict when current is resolved
  useEffect(() => {
    if (!currentConflict && conflicts.length > 0 && !transitioning) {
      // Small delay for smooth transition
      setTransitioning(true);
      const timer = setTimeout(() => {
        setCurrentConflict(conflicts[0]);
        setTransitioning(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [currentConflict, conflicts, setCurrentConflict, transitioning]);

  // Send system notification when app is not focused and conflict appears
  useEffect(() => {
    const notifyIfNeeded = async () => {
      if (currentConflict && document.hidden) {
        try {
          // Use browser Notification API
          if ('Notification' in window) {
            let permission = Notification.permission;
            if (permission === 'default') {
              permission = await Notification.requestPermission();
            }
            if (permission === 'granted') {
              new Notification(t('conflict.notificationTitle'), {
                body: t('conflict.notificationBody', { fileName: currentConflict.file.name }),
                icon: '/icons/icon.png',
              });
            }
          }
        } catch (error) {
          logger.debug('Notification not available:', error);
        }
      }
    };
    notifyIfNeeded();
  }, [currentConflict, t]);

  const handleResolve = useCallback(async (resolution: ConflictResolution) => {
    if (isResolving || !currentConflict) return;
    setIsResolving(true);

    try {
      if (applyToAll && conflicts.length > 1) {
        // Apply same resolution to all remaining conflicts
        for (const conflict of conflicts) {
          await resolveConflict(conflict.id, resolution);
        }
        setApplyToAll(false);
      } else {
        // Resolve just this one
        await resolveConflict(currentConflict.id, resolution);
      }
      setCurrentConflict(null);
    } finally {
      setIsResolving(false);
    }
  }, [applyToAll, conflicts, currentConflict, resolveConflict, setCurrentConflict, isResolving]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date instanceof Date ? date : new Date(date));
  };

  if (!currentConflict) return null;

  // Determine which file is newer/larger for visual hints
  const sourceNewer = new Date(currentConflict.sourceModified) > new Date(currentConflict.destModified);
  const sourceLarger = currentConflict.sourceSize > currentConflict.destSize;
  const sizeDifferent = currentConflict.sourceSize !== currentConflict.destSize;

  return (
    <Modal
      isOpen={true}
      onClose={() => {}} // Don't allow closing without decision
      title={t('conflict.title')}
      size="lg"
      showCloseButton={false}
      closeOnOverlayClick={false}
      closeOnEscape={false}
    >
      <div className="space-y-6">
        {/* Pending count badge */}
        {pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 py-2 px-4 rounded-full bg-warning/10 text-warning text-sm font-medium mx-auto w-fit"
          >
            <AlertCircle className="w-4 h-4" />
            <span>{t('conflict.pendingCount', { count: pendingCount })}</span>
          </motion.div>
        )}

        {/* File Info with animation for transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentConflict.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-4 p-5 rounded-xl bg-bg-tertiary"
          >
            <FileWarning className="w-9 h-9 text-warning shrink-0" />
            <div className="min-w-0">
              <p className="text-[16px] font-medium text-text-primary truncate">
                {currentConflict.file.name}
              </p>
              <p className="text-[13px] text-text-tertiary truncate">
                {currentConflict.file.path}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Size mismatch warning */}
        {sizeDifferent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 p-4 rounded-xl bg-error/10 border border-error/20"
          >
            <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-error">
                {t('conflict.sizeMismatch')}
              </p>
              <p className="text-xs text-error/80 mt-1">
                {t('conflict.sizeMismatchDesc')}
              </p>
            </div>
          </motion.div>
        )}

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-4">
          {/* Source */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className={`p-4 rounded-xl border-2 transition-colors ${
              sourceNewer ? 'border-success/50 bg-success/5' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[14px] font-semibold text-text-primary">
                {t('conflict.source')}
              </h4>
              {sourceNewer && (
                <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                  {t('conflict.newer')}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px]">
                <Calendar className="w-4 h-4 text-text-tertiary" />
                <span className="text-text-primary">
                  {formatDate(currentConflict.sourceModified)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <HardDrive className="w-4 h-4 text-text-tertiary" />
                <span className={`text-text-primary ${sourceLarger ? 'font-semibold text-success' : ''}`}>
                  {formatBytes(currentConflict.sourceSize)}
                </span>
                {sourceLarger && sizeDifferent && (
                  <span className="text-xs text-success">
                    (+{formatBytes(currentConflict.sourceSize - currentConflict.destSize)})
                  </span>
                )}
              </div>
            </div>
          </motion.div>

          {/* Destination */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className={`p-4 rounded-xl border-2 transition-colors ${
              !sourceNewer ? 'border-success/50 bg-success/5' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[14px] font-semibold text-text-primary">
                {t('conflict.destination')}
              </h4>
              {!sourceNewer && (
                <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
                  {t('conflict.newer')}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px]">
                <Calendar className="w-4 h-4 text-text-tertiary" />
                <span className="text-text-primary">
                  {formatDate(currentConflict.destModified)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <HardDrive className="w-4 h-4 text-text-tertiary" />
                <span className={`text-text-primary ${!sourceLarger && sizeDifferent ? 'font-semibold text-success' : ''}`}>
                  {formatBytes(currentConflict.destSize)}
                </span>
                {!sourceLarger && sizeDifferent && (
                  <span className="text-xs text-success">
                    (+{formatBytes(currentConflict.destSize - currentConflict.sourceSize)})
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Apply to all toggle (only show if there are more conflicts) */}
        {pendingCount > 0 && (
          <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
            <Toggle
              label={t('conflict.applyToAll')}
              description={t('conflict.applyToAllDesc', { count: pendingCount })}
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
            />
          </div>
        )}

        {/* Resolution Options */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="primary"
            onClick={() => handleResolve('keep-source')}
            className="flex-col h-auto py-4 gap-2"
            disabled={isResolving}
            isLoading={isResolving}
          >
            <Copy className="w-5 h-5" />
            <span className="font-semibold">{t('conflict.keepSource')}</span>
            <span className="text-xs opacity-80">{t('conflict.keepSourceDesc')}</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleResolve('keep-dest')}
            className="flex-col h-auto py-4 gap-2"
            disabled={isResolving}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">{t('conflict.keepDest')}</span>
            <span className="text-xs opacity-80">{t('conflict.keepDestDesc')}</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleResolve('keep-both')}
            className="flex-col h-auto py-4 gap-2"
            disabled={isResolving}
          >
            <File className="w-5 h-5" />
            <span className="font-semibold">{t('conflict.keepBoth')}</span>
            <span className="text-xs opacity-80">{t('conflict.keepBothDesc')}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleResolve('skip')}
            className="flex-col h-auto py-4 gap-2"
            disabled={isResolving}
          >
            <SkipForward className="w-5 h-5" />
            <span className="font-semibold">{t('conflict.skip')}</span>
            <span className="text-xs opacity-80">{t('conflict.skipDesc')}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
