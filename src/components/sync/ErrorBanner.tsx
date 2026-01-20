import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { Button } from '../ui/Button';

export function ErrorBanner() {
  const { t } = useTranslation();
  const { syncState, lastError, clearError } = useSyncStore();

  const showError = syncState === 'error' && lastError;

  return (
    <AnimatePresence>
      {showError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          role="alert"
          aria-live="assertive"
          className="rounded-2xl bg-error/10 border border-error/20 p-4 mb-4"
        >
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-error/20 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-error" strokeWidth={1.75} />
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="text-[15px] font-semibold text-error mb-1">
                {t('errors.title')}
              </h4>
              <p className="text-[14px] text-error/80 wrap-break-word">
                {lastError}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={clearError}
              aria-label={t('errors.dismiss')}
              className="shrink-0 text-error hover:bg-error/10 hover:text-error"
            >
              <X className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
