import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  X, 
  Check, 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  Trash2,
  CheckCheck,
  ChevronRight,
  HardDrive,
  Shield,
  FileWarning,
  Calendar,
  Pause,
  Play,
  AlertOctagon,
  Clock
} from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../stores/notificationStore';
import { useSyncStore } from '../../stores/syncStore';
import type { AppNotification, NotificationType, NotificationCategory } from '../../types';

/**
 * Format a date as a relative time string (e.g., "2 hours ago")
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return new Date(date).toLocaleDateString();
}

/**
 * Get the icon component for a notification type.
 */
function getNotificationIcon(type: NotificationType, category: NotificationCategory) {
  // Category-specific icons first
  switch (category) {
    case 'drive_disconnected':
      return HardDrive;
    case 'permission_error':
      return Shield;
    case 'file_corruption':
    case 'verification_error':
      return FileWarning;
    case 'schedule_triggered':
    case 'schedule_completed':
    case 'schedule_failed':
      return Calendar;
    case 'sync_paused':
      return Pause;
    case 'sync_resumed':
      return Play;
    case 'disk_space_critical':
      return AlertOctagon;
    case 'transfer_interrupted':
      return Clock;
  }
  
  // Fallback to type-based icons
  switch (type) {
    case 'success':
      return Check;
    case 'error':
      return AlertCircle;
    case 'warning':
      return AlertTriangle;
    case 'info':
    default:
      return Info;
  }
}

/**
 * Get the color classes for a notification type.
 */
function getNotificationColors(type: NotificationType) {
  switch (type) {
    case 'success':
      return {
        bg: 'bg-success/10',
        border: 'border-success/20',
        icon: 'text-success',
        dot: 'bg-success',
      };
    case 'error':
      return {
        bg: 'bg-error/10',
        border: 'border-error/20',
        icon: 'text-error',
        dot: 'bg-error',
      };
    case 'warning':
      return {
        bg: 'bg-warning/10',
        border: 'border-warning/20',
        icon: 'text-warning',
        dot: 'bg-warning',
      };
    case 'info':
    default:
      return {
        bg: 'bg-accent/10',
        border: 'border-accent/20',
        icon: 'text-accent',
        dot: 'bg-accent',
      };
  }
}

/**
 * Individual notification item component.
 */
function NotificationItem({ 
  notification, 
  onDismiss, 
  onMarkAsRead,
  onAction,
}: { 
  notification: AppNotification;
  onDismiss: () => void;
  onMarkAsRead: () => void;
  onAction?: () => void;
}) {
  const { t } = useTranslation();
  const colors = getNotificationColors(notification.type);
  const Icon = getNotificationIcon(notification.type, notification.category);
  const timeAgo = formatTimeAgo(notification.timestamp);
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className={clsx(
        'relative p-4 rounded-xl border transition-all duration-200',
        colors.bg,
        colors.border,
        !notification.read && 'ring-1 ring-accent/30',
        'hover:shadow-md'
      )}
      onClick={() => {
        if (!notification.read) onMarkAsRead();
      }}
    >
      {/* Unread indicator */}
      {!notification.read && (
        <div className={clsx(
          'absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse',
          colors.dot
        )} />
      )}
      
      <div className="flex gap-3">
        {/* Icon */}
        <div className={clsx(
          'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
          colors.bg
        )}>
          <Icon className={clsx('w-5 h-5', colors.icon)} strokeWidth={1.75} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-sm text-text-primary leading-tight">
              {notification.title}
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="shrink-0 p-1 -m-1 rounded-md text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
              aria-label={t('notifications.dismiss')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Message */}
          <p className="mt-1 text-sm text-text-secondary leading-relaxed">
            {notification.message}
          </p>
          
          {/* Technical details (collapsible) */}
          {notification.technicalDetails && (
            <details className="mt-2 group">
              <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary flex items-center gap-1">
                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                Technical details
              </summary>
              <p className="mt-1 text-xs text-text-tertiary font-mono bg-bg-tertiary rounded-md p-2">
                {notification.technicalDetails}
              </p>
            </details>
          )}
          
          {/* Action hint */}
          {notification.actionHint && (
            <p className="mt-2 text-xs text-accent/80">
              💡 {notification.actionHint}
            </p>
          )}
          
          {/* Prevention tip */}
          {notification.preventionTip && (
            <p className="mt-1 text-xs text-text-tertiary">
              🔮 Tip: {notification.preventionTip}
            </p>
          )}
          
          {/* Footer with timestamp and action */}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-text-tertiary">
              {timeAgo}
            </span>
            
            {notification.action && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.();
                }}
                className="text-xs font-medium text-accent hover:text-accent/80 flex items-center gap-1 transition-colors"
              >
                {notification.action.label}
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Notification Center Panel - slides in from the right.
 */
export function NotificationCenter() {
  const { t } = useTranslation();
  const { 
    notifications, 
    isPanelOpen, 
    setPanelOpen,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAllNotifications,
    clearReadNotifications,
    getUnreadCount,
  } = useNotificationStore();
  const { setCurrentPage } = useSyncStore();
  
  const unreadCount = getUnreadCount();
  const hasNotifications = notifications.length > 0;
  const hasReadNotifications = notifications.some(n => n.read);
  
  const handleAction = (notification: AppNotification) => {
    if (!notification.action) return;
    
    switch (notification.action.actionId) {
      case 'open_permissions':
        setCurrentPage('settings');
        setPanelOpen(false);
        break;
      case 'view_verification_errors':
      case 'resolve_conflicts':
        setCurrentPage('sync');
        setPanelOpen(false);
        break;
      default:
        // Unknown action - silently ignore
        break;
    }
  };
  
  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setPanelOpen(false)}
          />
        )}
      </AnimatePresence>
      
      {/* Panel */}
      <AnimatePresence>
        {isPanelOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className={clsx(
              'fixed top-0 right-0 bottom-0 w-full max-w-md z-50',
              'bg-bg-secondary border-l border-border-subtle',
              'flex flex-col shadow-2xl'
            )}
          >
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Bell className="w-5 h-5 text-text-primary" strokeWidth={1.75} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-medium flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <h2 className="font-semibold text-text-primary">
                  {t('notifications.title', 'Notifications')}
                </h2>
              </div>
              
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
                    title={t('notifications.markAllRead', 'Mark all as read')}
                  >
                    <CheckCheck className="w-4 h-4" />
                  </button>
                )}
                {hasReadNotifications && (
                  <button
                    onClick={clearReadNotifications}
                    className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
                    title={t('notifications.clearRead', 'Clear read')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setPanelOpen(false)}
                  className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
                  aria-label={t('common.close')}
                >
                  <X className="w-5 h-5" />  
                </button>
              </div>
            </div>
            
            {/* Notification List */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {hasNotifications ? (
                <div className="space-y-3">
                  <AnimatePresence mode="popLayout">
                    {notifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onDismiss={() => removeNotification(notification.id)}
                        onMarkAsRead={() => markAsRead(notification.id)}
                        onAction={() => handleAction(notification)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-bg-tertiary flex items-center justify-center mb-4">
                    <Bell className="w-8 h-8 text-text-tertiary" strokeWidth={1.5} />
                  </div>
                  <h3 className="font-medium text-text-primary mb-1">
                    {t('notifications.empty', 'All caught up!')}
                  </h3>
                  <p className="text-sm text-text-tertiary">
                    {t('notifications.emptyDesc', 'No notifications yet. Start a sync to see updates here.')}
                  </p>
                </div>
              )}
            </div>
            
            {/* Footer */}
            {hasNotifications && (
              <div className="shrink-0 px-5 py-3 border-t border-border-subtle">
                <button
                  onClick={clearAllNotifications}
                  className="w-full py-2 text-sm text-text-tertiary hover:text-error transition-colors"
                >
                  {t('notifications.clearAll', 'Clear all notifications')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Notification Bell Button - shows in header.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const { isPanelOpen, togglePanel, getUnreadCount } = useNotificationStore();
  const unreadCount = getUnreadCount();
  
  return (
    <button
      onClick={togglePanel}
      className={clsx(
        'relative p-2 rounded-xl transition-colors',
        isPanelOpen 
          ? 'bg-accent/10 text-accent' 
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
      )}
      aria-label={t('notifications.bellLabel', { count: unreadCount })}
    >
      <Bell className="w-5 h-5" strokeWidth={1.75} />
      
      {/* Badge */}
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className={clsx(
              'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1',
              'rounded-full bg-error text-white',
              'text-[10px] font-semibold flex items-center justify-center',
              'shadow-sm'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
