import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, AlertCircle, Filter, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { EXCLUDE_PATTERN_PRESETS, validateGlobPattern } from '../../types';

interface ExcludePatternsProps {
  patterns: string[];
  onChange: (patterns: string[]) => void;
  disabled?: boolean;
}

export function ExcludePatterns({ patterns, onChange, disabled = false }: ExcludePatternsProps) {
  const { t } = useTranslation();
  const [newPattern, setNewPattern] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addPattern = useCallback(() => {
    const trimmed = newPattern.trim();
    if (!trimmed) return;

    // Validate pattern
    const validationError = validateGlobPattern(trimmed);
    if (validationError) {
      setError(t('excludePatterns.invalidPattern', { error: validationError }));
      return;
    }

    // Check for duplicates
    if (patterns.includes(trimmed)) {
      setError(t('excludePatterns.duplicate'));
      return;
    }

    onChange([...patterns, trimmed]);
    setNewPattern('');
    setError(null);
  }, [newPattern, patterns, onChange, t]);

  const removePattern = useCallback((pattern: string) => {
    onChange(patterns.filter(p => p !== pattern));
  }, [patterns, onChange]);

  const addPreset = useCallback((presetPatterns: readonly string[]) => {
    const newPatterns = presetPatterns.filter(p => !patterns.includes(p));
    if (newPatterns.length > 0) {
      onChange([...patterns, ...newPatterns]);
    }
  }, [patterns, onChange]);

  const clearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPattern();
    }
  }, [addPattern]);

  return (
    <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Filter className="w-4 h-4 text-accent" strokeWidth={1.75} />
        <h3 className="text-[15px] font-semibold text-text-primary">
          {t('excludePatterns.title')}
        </h3>
      </div>
      <p className="text-[13px] text-text-tertiary mb-5 leading-relaxed">
        {t('excludePatterns.description')}
      </p>

      {/* Add new pattern */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <Input
            value={newPattern}
            onChange={(e) => {
              setNewPattern(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('excludePatterns.placeholder')}
            disabled={disabled}
            className="w-full"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={addPattern}
          disabled={disabled || !newPattern.trim()}
          className="px-3"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} />
        </Button>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="flex items-center gap-2 text-red-500 text-[13px]">
              <AlertCircle className="w-4 h-4" strokeWidth={1.75} />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preset buttons */}
      <div className="mb-4">
        <p className="text-[12px] text-text-tertiary uppercase tracking-wide mb-2">
          {t('excludePatterns.presets')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addPreset(EXCLUDE_PATTERN_PRESETS.system)}
            disabled={disabled}
            className="text-xs"
          >
            {t('excludePatterns.presetSystem')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addPreset(EXCLUDE_PATTERN_PRESETS.development)}
            disabled={disabled}
            className="text-xs"
          >
            {t('excludePatterns.presetDev')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addPreset(EXCLUDE_PATTERN_PRESETS.temporary)}
            disabled={disabled}
            className="text-xs"
          >
            {t('excludePatterns.presetTemp')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addPreset(EXCLUDE_PATTERN_PRESETS.ide)}
            disabled={disabled}
            className="text-xs"
          >
            {t('excludePatterns.presetIde')}
          </Button>
        </div>
      </div>

      {/* Current patterns */}
      {patterns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] text-text-tertiary uppercase tracking-wide">
              {t('excludePatterns.current', { count: patterns.length })}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              disabled={disabled}
              className="text-xs text-text-tertiary hover:text-red-500"
            >
              <Trash2 className="w-3 h-3 mr-1" strokeWidth={1.75} />
              {t('excludePatterns.clearAll')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence mode="popLayout">
              {patterns.map((pattern) => (
                <motion.div
                  key={pattern}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  className={clsx(
                    'flex items-center gap-1.5 px-2.5 py-1.5',
                    'bg-bg-primary border border-border rounded-lg',
                    'text-[13px] text-text-secondary',
                    'font-mono'
                  )}
                >
                  <span>{pattern}</span>
                  <button
                    onClick={() => removePattern(pattern)}
                    disabled={disabled}
                    className={clsx(
                      'p-0.5 rounded hover:bg-red-500/10 hover:text-red-500',
                      'transition-colors duration-150',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    aria-label={t('excludePatterns.remove', { pattern })}
                  >
                    <X className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Empty state */}
      {patterns.length === 0 && (
        <div className="text-center py-4 text-text-tertiary text-[13px]">
          {t('excludePatterns.empty')}
        </div>
      )}

      {/* Help text */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-[12px] text-text-tertiary leading-relaxed">
          {t('excludePatterns.help')}
        </p>
      </div>
    </div>
  );
}
