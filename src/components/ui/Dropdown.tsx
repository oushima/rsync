import { useState, useRef, useEffect, useCallback, useId, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function Dropdown({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select an option',
  disabled = false,
  className,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value);
  const enabledOptions = options.filter((opt) => !opt.disabled);

  const handleSelect = useCallback((optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  }, [onChange]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setFocusedIndex(-1);
        return;
      }

      if (!isOpen) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev + 1;
            return next >= enabledOptions.length ? 0 : next;
          });
          break;
        case 'ArrowUp':
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev - 1;
            return next < 0 ? enabledOptions.length - 1 : next;
          });
          break;
        case 'Enter':
        case ' ':
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < enabledOptions.length) {
            handleSelect(enabledOptions[focusedIndex].value);
          }
          break;
        case 'Home':
          event.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          event.preventDefault();
          setFocusedIndex(enabledOptions.length - 1);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, focusedIndex, enabledOptions, handleSelect]);

  // Reset focused index when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const selectedIndex = enabledOptions.findIndex((opt) => opt.value === value);
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    } else {
      setFocusedIndex(-1);
    }
  }, [isOpen, enabledOptions, value]);

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      {label && (
        <label className="block text-sm font-medium text-text-primary mb-2">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'w-full flex items-center justify-between gap-3',
          'px-4 py-3 rounded-xl',
          'bg-bg-tertiary/50 hover:bg-bg-tertiary',
          'border border-border-subtle hover:border-border',
          'transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
          isOpen && 'ring-2 ring-accent/50 border-accent',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {selectedOption?.icon && (
            <div className="shrink-0 text-accent">{selectedOption.icon}</div>
          )}
          <div className="text-left min-w-0">
            <p className="text-[15px] font-medium text-text-primary truncate">
              {selectedOption?.label || placeholder}
            </p>
            {selectedOption?.description && (
              <p className="text-[13px] text-text-tertiary truncate mt-0.5">
                {selectedOption.description}
              </p>
            )}
          </div>
        </div>
        <ChevronDown
          className={clsx(
            'shrink-0 w-5 h-5 text-text-tertiary transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={clsx(
              'absolute z-50 w-full mt-2',
              'rounded-xl overflow-hidden',
              'bg-bg-secondary border border-border-subtle',
              'shadow-xl shadow-black/20'
            )}
          >
            <div
              id={listboxId}
              role="listbox"
              aria-label={label || 'Options'}
              className="p-1.5 max-h-[320px] overflow-y-auto"
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                const isFocused = enabledOptions[focusedIndex]?.value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    disabled={option.disabled}
                    className={clsx(
                      'w-full flex items-start gap-3 px-3 py-3 rounded-lg',
                      'transition-colors duration-100',
                      'text-left',
                      isSelected
                        ? 'bg-accent/15'
                        : 'hover:bg-bg-tertiary/70',
                      isFocused && !isSelected && 'bg-bg-tertiary/50 ring-2 ring-accent/30',
                      option.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {/* Checkmark or Icon */}
                    <div className="shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center">
                      {isSelected ? (
                        <Check className="w-4 h-4 text-accent" strokeWidth={2.5} />
                      ) : option.icon ? (
                        <div className="text-text-tertiary">{option.icon}</div>
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={clsx(
                        'text-[15px] font-medium',
                        isSelected ? 'text-accent' : 'text-text-primary'
                      )}>
                        {option.label}
                      </p>
                      {option.description && (
                        <p className="text-[13px] text-text-tertiary mt-0.5 leading-relaxed">
                          {option.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
