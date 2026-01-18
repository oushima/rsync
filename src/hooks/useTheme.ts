import { useEffect, useCallback } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import type { ThemeMode } from '../types';

export function useTheme() {
  const { theme, setTheme } = useSettingsStore();

  const getSystemTheme = useCallback((): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  const getEffectiveTheme = useCallback((): 'light' | 'dark' | 'oled' => {
    if (theme === 'system') {
      return getSystemTheme();
    }
    return theme;
  }, [theme, getSystemTheme]);

  const applyTheme = useCallback((themeToApply: 'light' | 'dark' | 'oled') => {
    document.documentElement.setAttribute('data-theme', themeToApply);
    
    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const bgColor = themeToApply === 'light' ? '#FFFFFF' : 
                    themeToApply === 'dark' ? '#1A1915' : '#000000';
    
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', bgColor);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = bgColor;
      document.head.appendChild(meta);
    }
  }, []);

  useEffect(() => {
    applyTheme(getEffectiveTheme());
  }, [theme, applyTheme, getEffectiveTheme]);

  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      applyTheme(getSystemTheme());
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, applyTheme, getSystemTheme]);

  const toggleTheme = useCallback(() => {
    const modes: ThemeMode[] = ['light', 'dark', 'oled', 'system'];
    const currentIndex = modes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % modes.length;
    setTheme(modes[nextIndex]);
  }, [theme, setTheme]);

  return {
    theme,
    effectiveTheme: getEffectiveTheme(),
    setTheme,
    toggleTheme,
    isDark: getEffectiveTheme() !== 'light',
  };
}
