import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';

// Omit motion-specific props that we handle explicitly to avoid type conflicts
type MotionButtonProps = Omit<HTMLMotionProps<'button'>, 'ref' | 'whileTap' | 'transition'>;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      className,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center justify-center gap-2
      font-medium rounded-full
      transition-all duration-150 ease-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary
      disabled:opacity-40 disabled:cursor-not-allowed
    `;

    const variants = {
      primary: `
        bg-accent text-white
        hover:bg-accent-hover
        active:bg-accent-active
        shadow-accent
      `,
      secondary: `
        bg-bg-tertiary text-text-primary
        border border-border
        hover:bg-bg-quaternary
        hover:border-border
        shadow-xs
      `,
      ghost: `
        bg-transparent text-text-secondary
        hover:bg-bg-tertiary
        hover:text-text-primary
      `,
      danger: `
        bg-error text-white
        hover:brightness-95
      `,
    };

    const sizes = {
      sm: 'h-9 px-3.5 text-[13px]',
      md: 'h-11 px-5 text-[14px]',
      lg: 'h-12 px-6 text-[15px]',
    };

    return (
      <motion.button
        ref={ref}
        className={clsx(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || isLoading}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        transition={{ duration: 0.08 }}
        {...(props as MotionButtonProps)}
      >
        {isLoading ? (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
