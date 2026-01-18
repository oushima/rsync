import { motion } from 'framer-motion';
import { FolderSync, History, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';
import { useSyncStore } from '../../stores/syncStore';
import { Tooltip } from '../ui/Tooltip';
import type { NavigationPage } from '../../types';

interface NavItem {
  id: NavigationPage;
  label: string;
  labelNl: string;
  icon: typeof FolderSync;
}

const navItems: NavItem[] = [
  { id: 'sync', label: 'Sync', labelNl: 'Synchroniseren', icon: FolderSync },
  { id: 'history', label: 'History', labelNl: 'Geschiedenis', icon: History },
  { id: 'settings', label: 'Settings', labelNl: 'Instellingen', icon: Settings },
];

interface SidebarProps {
  language?: 'en' | 'nl';
}

export function Sidebar({ language = 'en' }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { currentPage, setCurrentPage } = useSyncStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 76 : 260 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className={clsx(
        'hidden md:flex flex-col shrink-0 min-h-full rounded-2xl',
        'bg-bg-tertiary shadow-sm'
      )}
    >
      {/* Logo Section - Hero style */}
      <div className={clsx(
        'flex flex-col items-center pt-8 pb-6',
        isCollapsed ? 'px-3' : 'px-6'
      )}>
        <div className={clsx(
          'relative',
          isCollapsed ? 'w-12 h-12' : 'w-20 h-20'
        )}>
          <img 
            src="/app-icon.png" 
            alt="RSync" 
            className="w-full h-full rounded-2xl shadow-md"
          />
          {/* Subtle glow effect */}
          <div className="absolute inset-0 rounded-2xl bg-accent/20 blur-xl -z-10 scale-110" />
        </div>
        {!isCollapsed && (
          <div className="mt-4 text-center">
            <h1 className="font-semibold text-lg text-text-primary tracking-tight">
              RSync
            </h1>
            <p className="text-xs text-text-tertiary mt-0.5">
              {language === 'nl' ? 'Bestandssynchronisatie' : 'File Synchronization'}
            </p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className={clsx('mx-4 border-t border-border-subtle', isCollapsed && 'mx-3')} />

      {/* Navigation - macOS Finder-like */}
      <nav className={clsx('flex-1 pt-4', isCollapsed ? 'px-2 flex flex-col items-center' : 'px-4')}>
        <ul className={clsx(isCollapsed ? 'space-y-2 flex flex-col items-center' : 'space-y-1 w-full')}>
          {navItems.map((item) => {
            const isActive = currentPage === item.id;
            const label = language === 'nl' ? item.labelNl : item.label;
            const Icon = item.icon;

            const button = (
              <motion.button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={clsx(
                  'flex items-center',
                  'rounded-xl',
                  'transition-colors duration-150 ease-out',
                  isCollapsed 
                    ? 'w-12 h-12 justify-center' 
                    : 'w-full gap-2.5 px-3 py-2.5 text-left',
                  isActive
                    ? 'bg-accent-subtle text-accent'
                    : 'text-text-secondary hover:bg-bg-quaternary hover:text-text-primary'
                )}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className={clsx(
                  'shrink-0', 
                  isCollapsed ? 'w-5 h-5' : 'w-4 h-4',
                  isActive && 'text-accent'
                )} strokeWidth={1.75} />
                {!isCollapsed && (
                  <span className="text-sm font-medium">{label}</span>
                )}
              </motion.button>
            );

            return (
              <li key={item.id}>
                {isCollapsed ? (
                  <Tooltip content={label} position="right">
                    {button}
                  </Tooltip>
                ) : (
                  button
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle - subtle */}
      <div className="px-3 py-4">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={clsx(
            'w-full flex items-center justify-center gap-2 px-2 py-2',
            'rounded-lg',
            'text-text-tertiary',
            'hover:bg-bg-tertiary hover:text-text-secondary',
            'transition-colors duration-150 ease-out'
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
