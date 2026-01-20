import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Smartphone, Globe, FolderSync, History, Settings, Coffee } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settingsStore';
import { useSyncStore } from '../../stores/syncStore';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { pollSleepStatus, isTauriApp } from '../../utils/tauriCommands';
import { NotificationBell } from '../notifications/NotificationCenter';
import type { ThemeMode } from '../../types';

const themeIcons: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  oled: Smartphone,
  system: Monitor,
};

const themeLabels: Record<ThemeMode, { en: string; nl: string }> = {
  light: { en: 'Light', nl: 'Licht' },
  dark: { en: 'Dark', nl: 'Donker' },
  oled: { en: 'OLED', nl: 'OLED' },
  system: { en: 'System', nl: 'Systeem' },
};

const languageLabels = {
  en: 'EN',
  nl: 'NL',
};

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useSettingsStore();
  const { currentPage, setCurrentPage, syncState } = useSyncStore();
  const [isPreventingSleep, setIsPreventingSleep] = useState(false);

  // Poll sleep prevention status when sync is active
  useEffect(() => {
    if (!isTauriApp()) return;
    
    // Only poll when syncing is active
    const isActive = syncState === 'syncing' || syncState === 'preparing';
    if (!isActive) {
      setIsPreventingSleep(false);
      return;
    }

    const stopPolling = pollSleepStatus({
      intervalMs: 2000,
      onStatusChange: setIsPreventingSleep,
    });

    return () => {
      stopPolling();
    };
  }, [syncState]);

  const ThemeIcon = themeIcons[theme];
  const themeLabel = themeLabels[theme][language];

  const navItems = [
    { id: 'sync' as const, label: language === 'nl' ? 'Sync' : 'Sync', icon: FolderSync },
    { id: 'history' as const, label: language === 'nl' ? 'Geschiedenis' : 'History', icon: History },
    { id: 'settings' as const, label: language === 'nl' ? 'Instellingen' : 'Settings', icon: Settings },
  ];

  return (
    <header
      className={clsx(
        'shrink-0',
        'bg-bg-primary/90 backdrop-blur supports-backdrop-filter:bg-bg-primary/75',
        'border-b border-border-subtle',
        'px-5 sm:px-7 md:px-10',
        'sticky top-0 z-30'
      )}
    >
      <div className="h-18 flex items-center justify-between">
        {/* Page Title - Clean and minimal */}
        <div className="flex items-center">
          <h1 className="text-[17px] font-semibold text-text-primary tracking-[-0.01em]">
            {language === 'nl' ? 'Maak twee mappen gelijk' : 'Make two folders match'}
          </h1>
        </div>

        {/* Actions - Minimal and unobtrusive */}
        <div className="flex items-center gap-2">
          {/* Sleep Prevention Indicator */}
          {isPreventingSleep && (
            <Tooltip
              content={language === 'en' ? 'Keeping system awake during transfer' : 'Systeem blijft wakker tijdens overdracht'}
              position="bottom"
            >
              <div className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-warning/10 text-warning">
                <Coffee className="w-4 h-4" strokeWidth={1.75} />
                <span className="text-xs font-medium hidden sm:inline">
                  {language === 'en' ? 'Awake' : 'Wakker'}
                </span>
              </div>
            </Tooltip>
          )}

          {/* Language Toggle */}
          <Tooltip
            content={language === 'en' ? 'Use Dutch' : 'Use English'}
            position="bottom"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLanguage(language === 'en' ? 'nl' : 'en')}
              className="gap-1.5 px-3 h-9 rounded-full"
            >
              <Globe className="w-4 h-4" strokeWidth={1.75} />
              <span className="text-xs font-medium">{languageLabels[language]}</span>
            </Button>
          </Tooltip>

          {/* Theme Toggle */}
          <Tooltip content={themeLabel} position="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="px-3 h-9 rounded-full"
            >
              <ThemeIcon className="w-4 h-4" strokeWidth={1.75} />
            </Button>
          </Tooltip>

          {/* Notification Bell */}
          <NotificationBell />
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden pb-4">
        <div className="grid grid-cols-3 gap-2">
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={clsx(
                  'flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium',
                  'transition-colors duration-150',
                  isActive
                    ? 'bg-accent-subtle text-accent'
                    : 'bg-bg-secondary text-text-secondary hover:text-text-primary'
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
