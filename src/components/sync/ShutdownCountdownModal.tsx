import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Power, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

/**
 * Duration in seconds for the shutdown countdown.
 * This should match SHUTDOWN_DELAY_SECONDS in the Rust backend.
 */
const SHUTDOWN_COUNTDOWN_SECONDS = 60;

interface ShutdownCountdownModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onComplete: () => void;
  isInitiating?: boolean;
  error?: string | null;
}

/**
 * Modal component that displays a countdown before system shutdown.
 * Uses requestAnimationFrame-based timing for accurate countdown display.
 * Provides cancel functionality and visual feedback.
 */
export function ShutdownCountdownModal({
  isOpen,
  onCancel,
  onComplete,
  isInitiating = false,
  error = null,
}: ShutdownCountdownModalProps) {
  const { t } = useTranslation();
  
  // Use refs for animation frame tracking
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const remainingSecondsRef = useRef<number>(SHUTDOWN_COUNTDOWN_SECONDS);
  const displayElementRef = useRef<HTMLSpanElement | null>(null);
  const progressElementRef = useRef<HTMLDivElement | null>(null);

  /**
   * Updates the countdown display using direct DOM manipulation for performance.
   * This avoids React re-renders during the countdown animation.
   */
  const updateDisplay = useCallback((remainingSeconds: number) => {
    if (displayElementRef.current) {
      displayElementRef.current.textContent = String(Math.ceil(remainingSeconds));
    }
    if (progressElementRef.current) {
      const progress = ((SHUTDOWN_COUNTDOWN_SECONDS - remainingSeconds) / SHUTDOWN_COUNTDOWN_SECONDS) * 100;
      progressElementRef.current.style.width = `${progress}%`;
    }
  }, []);

  /**
   * Animation frame-based countdown loop.
   * Uses timestamp differences for accurate timing regardless of frame rate.
   */
  const tick = useCallback((timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp;
    }

    const elapsed = (timestamp - startTimeRef.current) / 1000;
    const remaining = SHUTDOWN_COUNTDOWN_SECONDS - elapsed;
    remainingSecondsRef.current = remaining;

    if (remaining <= 0) {
      updateDisplay(0);
      onComplete();
      return;
    }

    updateDisplay(remaining);
    animationFrameRef.current = requestAnimationFrame(tick);
  }, [onComplete, updateDisplay]);

  /**
   * Start the countdown when modal opens, cleanup on close or unmount.
   */
  useEffect(() => {
    if (isOpen && !isInitiating && !error) {
      // Reset state
      startTimeRef.current = null;
      remainingSecondsRef.current = SHUTDOWN_COUNTDOWN_SECONDS;
      updateDisplay(SHUTDOWN_COUNTDOWN_SECONDS);
      
      // Start animation loop
      animationFrameRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isOpen, isInitiating, error, tick, updateDisplay]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleCancel = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    onCancel();
  }, [onCancel]);

  // Determine content based on state
  const renderContent = () => {
    if (error) {
      return (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <X className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-text-primary">
            {t('shutdown.failed')}
          </h3>
          <p className="text-sm text-text-secondary mb-6">
            {t('shutdown.failedMessage', { error })}
          </p>
          <Button onClick={handleCancel} variant="primary">
            {t('common.close')}
          </Button>
        </div>
      );
    }

    if (isInitiating) {
      return (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            >
              <Power className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </motion.div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-text-primary">
            {t('shutdown.initiating')}
          </h3>
          <p className="text-sm text-text-secondary">
            {t('shutdown.authRequired')}
          </p>
        </div>
      );
    }

    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
          <Power className="h-8 w-8 text-orange-600 dark:text-orange-400" />
        </div>
        
        {/* Large countdown number */}
        <div className="mb-4">
          <span
            ref={displayElementRef}
            className="text-5xl font-bold text-orange-600 dark:text-orange-400 tabular-nums"
          >
            {SHUTDOWN_COUNTDOWN_SECONDS}
          </span>
        </div>
        
        <h3 className="mb-2 text-lg font-semibold text-text-primary">
          {t('shutdown.title')}
        </h3>
        <p className="text-sm text-text-secondary mb-6">
          {t('shutdown.description')}
        </p>
        
        {/* Progress bar showing countdown */}
        <div className="mb-6 h-2 w-full overflow-hidden rounded-full bg-bg-tertiary">
          <div
            ref={progressElementRef}
            className="h-full bg-orange-500 transition-none"
            style={{ width: '0%' }}
          />
        </div>
        
        <Button
          onClick={handleCancel}
          variant="primary"
          className="w-full"
        >
          {t('shutdown.cancel')}
        </Button>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title=""
      closeOnOverlayClick={!isInitiating}
      closeOnEscape={!isInitiating}
      showCloseButton={false}
      size="sm"
    >
      {renderContent()}
    </Modal>
  );
}
