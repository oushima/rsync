import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      hoverable = false,
      header,
      footer,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const variants = {
      default: 'bg-bg-secondary border border-border shadow-xs',
      elevated: 'bg-bg-secondary border border-border-subtle shadow-md',
      outlined: 'bg-transparent border border-border-subtle',
    };

    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    };

    const Component = hoverable ? motion.div : 'div';
    const hoverProps = hoverable
      ? {
          whileHover: { scale: 1.01, y: -2 },
          transition: { duration: 0.2 },
        }
      : {};

    return (
      <Component
        ref={ref}
        className={clsx(
          'rounded-2xl',
          'transition-colors duration-150 ease-out',
          variants[variant],
          hoverable && 'cursor-pointer',
          className
        )}
        {...hoverProps}
        {...(props as any)}
      >
        {header && (
          <div
            className={clsx(
              'border-b border-border',
              paddings[padding]
            )}
          >
            {header}
          </div>
        )}
        <div className={paddings[padding]}>{children}</div>
        {footer && (
          <div
            className={clsx(
              'border-t border-border',
              paddings[padding]
            )}
          >
            {footer}
          </div>
        )}
      </Component>
    );
  }
);

Card.displayName = 'Card';
