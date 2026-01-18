import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = () => {
    const id = setTimeout(() => setIsVisible(true), delay);
    setTimeoutId(id);
  };

  const hideTooltip = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    setIsVisible(false);
  };

  const positions = {
    top: {
      initial: { opacity: 0, y: 5 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 5 },
      className: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    },
    bottom: {
      initial: { opacity: 0, y: -5 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -5 },
      className: 'top-full left-1/2 -translate-x-1/2 mt-2',
    },
    left: {
      initial: { opacity: 0, x: 5 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 5 },
      className: 'right-full top-1/2 -translate-y-1/2 mr-2',
    },
    right: {
      initial: { opacity: 0, x: -5 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -5 },
      className: 'left-full top-1/2 -translate-y-1/2 ml-2',
    },
  };

  const positionConfig = positions[position];

  return (
    <div
      className={clsx('relative inline-flex', className)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={positionConfig.initial}
            animate={positionConfig.animate}
            exit={positionConfig.exit}
            transition={{ duration: 0.15 }}
            className={clsx(
              'absolute z-50 whitespace-nowrap',
              'px-2.5 py-1.5 rounded-lg',
              'bg-bg-quaternary text-text-primary',
              'text-sm shadow-md',
              'border border-border',
              positionConfig.className
            )}
            role="tooltip"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
