import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';

// Omit children from motion props to use React's ReactNode type instead
type BaseCardProps = Omit<HTMLMotionProps<'div'>, 'ref' | 'children'>;

export interface CardProps extends BaseCardProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
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

    const cardClassName = clsx(
      'rounded-2xl',
      'transition-colors duration-150 ease-out',
      variants[variant],
      hoverable && 'cursor-pointer',
      className
    );

    const cardContent = (
      <>
        {header && (
          <div className={clsx('border-b border-border', paddings[padding])}>
            {header}
          </div>
        )}
        <div className={paddings[padding]}>{children}</div>
        {footer && (
          <div className={clsx('border-t border-border', paddings[padding])}>
            {footer}
          </div>
        )}
      </>
    );

    // Render motion.div for hoverable cards, regular div otherwise
    // Both use the same props type (HTMLMotionProps) to avoid type conflicts
    if (hoverable) {
      return (
        <motion.div
          ref={ref}
          className={cardClassName}
          whileHover={{ scale: 1.01, y: -2 }}
          transition={{ duration: 0.2 }}
          {...props}
        >
          {cardContent}
        </motion.div>
      );
    }

    // For non-hoverable cards, use motion.div without animation props
    // This maintains consistent prop types throughout
    return (
      <motion.div ref={ref} className={cardClassName} {...props}>
        {cardContent}
      </motion.div>
    );
  }
);

Card.displayName = 'Card';
