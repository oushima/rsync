import { Sun, Moon, Smartphone, Monitor } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import type { ThemeMode } from '../../types';

interface ThemeOption {
  mode: ThemeMode;
  icon: typeof Sun;
  label: { en: string; nl: string };
  description: { en: string; nl: string };
}

const themeOptions: ThemeOption[] = [
  {
    mode: 'light',
    icon: Sun,
    label: { en: 'Light', nl: 'Licht' },
    description: { en: 'Bright and warm', nl: 'Helder en warm' },
  },
  {
    mode: 'dark',
    icon: Moon,
    label: { en: 'Dark', nl: 'Donker' },
    description: { en: 'Soft on your eyes', nl: 'Rustig voor je ogen' },
  },
  {
    mode: 'oled',
    icon: Smartphone,
    label: { en: 'OLED', nl: 'OLED' },
    description: { en: 'Deep black', nl: 'Diep zwart' },
  },
  {
    mode: 'system',
    icon: Monitor,
    label: { en: 'System', nl: 'Systeem' },
    description: { en: 'Follow your Mac', nl: 'Volg je Mac' },
  },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const { language } = useSettingsStore();

  return (
    <div>
      <h3 className="text-[15px] font-medium text-text-primary mb-3">
        {language === 'nl' ? 'Kies een thema' : 'Choose a theme'}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-0.5">
        {themeOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = theme === option.mode;

          return (
            <motion.button
              key={option.mode}
              onClick={() => setTheme(option.mode)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={clsx(
                'relative p-5 rounded-xl',
                'flex flex-col items-center gap-2',
                'border transition-all duration-150 ease-out',
                isSelected
                  ? 'border-accent bg-accent/5'
                  : 'border-border bg-bg-secondary hover:border-accent/50'
              )}
            >
              {isSelected && (
                <motion.div
                  layoutId="theme-indicator"
                  className="absolute -inset-0.5 rounded-xl border-2 border-accent pointer-events-none"
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
              <div
                className={clsx(
                  'w-12 h-12 rounded-full flex items-center justify-center',
                  isSelected
                    ? 'bg-accent text-white'
                    : 'bg-bg-tertiary text-text-tertiary'
                )}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p
                  className={clsx(
                    'text-[15px] font-medium',
                    isSelected
                      ? 'text-accent'
                      : 'text-text-primary'
                  )}
                >
                  {option.label[language]}
                </p>
                <p className="text-[13px] text-text-tertiary">
                  {option.description[language]}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
