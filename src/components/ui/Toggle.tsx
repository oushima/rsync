import { forwardRef, type InputHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'sm' | 'md';
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, description, size = 'md', className, id, checked, onChange, ...props }, ref) => {
    const toggleId = id || `toggle-${Math.random().toString(36).slice(2)}`;

    const sizes = {
      sm: {
        track: 'w-8 h-5',
        thumb: 'w-4 h-4',
        translate: checked ? 13 : 2,
        translateY: 2,
      },
      md: {
        track: 'w-11 h-6',
        thumb: 'w-5 h-5',
        translate: checked ? 22 : 2,
        translateY: 2,
      },
    };

    const currentSize = sizes[size];

    return (
      <div className={clsx('flex items-center justify-between gap-3 py-1', className)}>
        {(label || description) && (
          <div className="flex flex-col min-w-0 flex-1">
            {label && (
              <label
                htmlFor={toggleId}
                className="text-sm font-medium text-text-primary cursor-pointer leading-tight"
              >
                {label}
              </label>
            )}
            {description && (
              <p className="text-xs text-text-tertiary leading-tight mt-0.5">
                {description}
              </p>
            )}
          </div>
        )}
        <div className="relative shrink-0">
          <input
            ref={ref}
            type="checkbox"
            id={toggleId}
            checked={checked}
            onChange={onChange}
            className="sr-only peer"
            {...props}
          />
          <label
            htmlFor={toggleId}
            className={clsx(
              'block rounded-full cursor-pointer',
              'transition-colors duration-200',
              currentSize.track,
              checked
                ? 'bg-accent'
                : 'bg-bg-quaternary'
            )}
          >
            <motion.span
              className={clsx(
                'block rounded-full bg-white',
                'shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)]',
                currentSize.thumb
              )}
              animate={{
                x: currentSize.translate,
                y: currentSize.translateY,
              }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </label>
        </div>
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';
