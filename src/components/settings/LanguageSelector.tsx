import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useSettingsStore } from '../../stores/settingsStore';

interface LanguageOption {
  code: 'en' | 'nl';
  label: string;
  nativeLabel: string;
  flag: string;
}

const languageOptions: LanguageOption[] = [
  {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
    flag: '🇺🇸',
  },
  {
    code: 'nl',
    label: 'Dutch',
    nativeLabel: 'Nederlands',
    flag: '🇳🇱',
  },
];

export function LanguageSelector() {
  const { language, setLanguage } = useSettingsStore();

  return (
    <div>
      <h3 className="text-sm font-medium text-text-primary mb-3">
        {language === 'nl' ? 'Taal' : 'Language'}
      </h3>
      <div className="flex gap-3">
        {languageOptions.map((option) => {
          const isSelected = language === option.code;

          return (
            <motion.button
              key={option.code}
              onClick={() => setLanguage(option.code)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={clsx(
                'relative flex-1 p-4 rounded-lg',
                'flex items-center gap-3',
                'border transition-all duration-150 ease-out',
                isSelected
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-bg-secondary hover:border-accent/50'
              )}
            >
              {isSelected && (
                <motion.div
                  layoutId="language-indicator"
                  className="absolute inset-0 rounded-lg border-2 border-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <div
                className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  'bg-bg-tertiary',
                  'text-lg font-bold'
                )}
              >
                {option.flag}
              </div>
              <div className="text-left">
                <p
                  className={clsx(
                    'text-sm font-medium',
                    isSelected
                      ? 'text-accent'
                      : 'text-text-primary'
                  )}
                >
                  {option.nativeLabel}
                </p>
                <p className="text-xs text-text-tertiary">
                  {option.label}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
