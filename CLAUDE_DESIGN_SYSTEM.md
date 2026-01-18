# Claude.ai Design System Documentation

A comprehensive reference for recreating the Claude.ai visual design language.

---

## 1. Color Scheme

### Primary Brand Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Claude Orange/Coral** | `#E07A3C` | rgb(224, 122, 60) | Primary accent, CTAs, brand identity |
| **Claude Terracotta** | `#DA7756` | rgb(218, 119, 86) | Secondary accent, hover states |
| **Claude Warm Orange** | `#D97757` | rgb(217, 119, 87) | Alternative accent |
| **Claude Peach** | `#F5A97F` | rgb(245, 169, 127) | Light accent, highlights |

### Light Mode Colors

#### Backgrounds
| Name | Hex | Usage |
|------|-----|-------|
| **Background Primary** | `#FFFFFF` | Main content areas |
| **Background Secondary** | `#FAF9F7` | Subtle alternating sections |
| **Background Tertiary** | `#F5F4F2` | Cards, elevated surfaces |
| **Background Quaternary** | `#EFEEEC` | Input fields, code blocks |
| **Background Cream** | `#FFFCF9` | Warm background variant |

#### Text Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Text Primary** | `#1A1915` | Headlines, primary content |
| **Text Secondary** | `#5D5D5D` | Body text, descriptions |
| **Text Tertiary** | `#8B8B8B` | Captions, timestamps, placeholders |
| **Text Muted** | `#A3A3A3` | Disabled states, hints |
| **Text Inverse** | `#FFFFFF` | Text on dark backgrounds |

#### Border Colors
| Name | Hex | Usage |
|------|-----|-------|
| **Border Light** | `#E8E7E5` | Subtle dividers |
| **Border Default** | `#D4D3D0` | Input borders, cards |
| **Border Strong** | `#C1C0BD` | Focused inputs |
| **Border Hover** | `#B0AFAC` | Hover states |

### Dark Mode Colors

#### Backgrounds
| Name | Hex | Usage |
|------|-----|-------|
| **Background Primary** | `#1A1915` | Main content areas |
| **Background Secondary** | `#252420` | Chat area, elevated surfaces |
| **Background Tertiary** | `#2F2E29` | Cards, modals |
| **Background Quaternary** | `#3A3935` | Input fields, code blocks |
| **Background Elevated** | `#454440` | Dropdown menus, tooltips |

#### Text Colors (Dark Mode)
| Name | Hex | Usage |
|------|-----|-------|
| **Text Primary** | `#ECECEC` | Headlines, primary content |
| **Text Secondary** | `#B4B4B4` | Body text, descriptions |
| **Text Tertiary** | `#8B8B8B` | Captions, timestamps |
| **Text Muted** | `#6B6B6B` | Disabled states |

#### Border Colors (Dark Mode)
| Name | Hex | Usage |
|------|-----|-------|
| **Border Dark** | `#3A3935` | Subtle dividers |
| **Border Default** | `#4A4945` | Input borders |
| **Border Strong** | `#5A5955` | Focused inputs |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#10B981` | Success messages, confirmations |
| **Success Light** | `#D1FAE5` | Success backgrounds |
| **Warning** | `#F59E0B` | Warnings, cautions |
| **Warning Light** | `#FEF3C7` | Warning backgrounds |
| **Error** | `#EF4444` | Error states, destructive actions |
| **Error Light** | `#FEE2E2` | Error backgrounds |
| **Info** | `#3B82F6` | Information, links |
| **Info Light** | `#DBEAFE` | Info backgrounds |

### Hover & Focus States

```css
/* Button hover */
--hover-bg-opacity: 0.08;
--hover-bg-light: rgba(0, 0, 0, 0.04);
--hover-bg-dark: rgba(255, 255, 255, 0.08);

/* Focus ring */
--focus-ring-color: #E07A3C;
--focus-ring-width: 2px;
--focus-ring-offset: 2px;
--focus-ring-style: solid;

/* Focus outline (accessibility) */
--focus-outline: 2px solid #E07A3C;
--focus-outline-offset: 2px;

/* Link hover */
--link-hover-opacity: 0.8;
```

---

## 2. Typography

### Font Families

```css
/* Primary font - UI and body text */
--font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

/* Display/Marketing font */
--font-family-display: 'Styrene A', 'Inter', -apple-system, sans-serif;

/* Monospace - Code blocks */
--font-family-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, monospace;

/* Alternative sans (seen in some sections) */
--font-family-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

### Font Sizes

```css
/* Base scale (rem based, 1rem = 16px) */
--font-size-xs: 0.75rem;     /* 12px */
--font-size-sm: 0.875rem;    /* 14px */
--font-size-base: 1rem;      /* 16px */
--font-size-lg: 1.125rem;    /* 18px */
--font-size-xl: 1.25rem;     /* 20px */
--font-size-2xl: 1.5rem;     /* 24px */
--font-size-3xl: 1.875rem;   /* 30px */
--font-size-4xl: 2.25rem;    /* 36px */
--font-size-5xl: 3rem;       /* 48px */
--font-size-6xl: 3.75rem;    /* 60px */
--font-size-7xl: 4.5rem;     /* 72px */
```

### Font Weights

```css
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

### Line Heights

```css
--line-height-none: 1;
--line-height-tight: 1.25;
--line-height-snug: 1.375;
--line-height-normal: 1.5;
--line-height-relaxed: 1.625;
--line-height-loose: 2;

/* Specific use cases */
--line-height-heading: 1.2;
--line-height-body: 1.6;
--line-height-code: 1.5;
```

### Letter Spacing

```css
--letter-spacing-tighter: -0.05em;
--letter-spacing-tight: -0.025em;
--letter-spacing-normal: 0;
--letter-spacing-wide: 0.025em;
--letter-spacing-wider: 0.05em;
```

### Typography Presets

```css
/* Heading Styles */
.heading-1 {
  font-size: 3rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.025em;
}

.heading-2 {
  font-size: 2.25rem;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.heading-3 {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
}

.heading-4 {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
}

/* Body Styles */
.body-large {
  font-size: 1.125rem;
  font-weight: 400;
  line-height: 1.6;
}

.body-default {
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
}

.body-small {
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
}

/* Caption/Label */
.caption {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.02em;
}
```

---

## 3. Spacing & Layout

### Spacing Scale

```css
/* Base unit: 4px */
--space-0: 0;
--space-0.5: 0.125rem;  /* 2px */
--space-1: 0.25rem;     /* 4px */
--space-1.5: 0.375rem;  /* 6px */
--space-2: 0.5rem;      /* 8px */
--space-2.5: 0.625rem;  /* 10px */
--space-3: 0.75rem;     /* 12px */
--space-3.5: 0.875rem;  /* 14px */
--space-4: 1rem;        /* 16px */
--space-5: 1.25rem;     /* 20px */
--space-6: 1.5rem;      /* 24px */
--space-7: 1.75rem;     /* 28px */
--space-8: 2rem;        /* 32px */
--space-9: 2.25rem;     /* 36px */
--space-10: 2.5rem;     /* 40px */
--space-11: 2.75rem;    /* 44px */
--space-12: 3rem;       /* 48px */
--space-14: 3.5rem;     /* 56px */
--space-16: 4rem;       /* 64px */
--space-20: 5rem;       /* 80px */
--space-24: 6rem;       /* 96px */
--space-28: 7rem;       /* 112px */
--space-32: 8rem;       /* 128px */
```

### Common Padding Patterns

```css
/* Buttons */
--btn-padding-sm: 0.375rem 0.75rem;   /* 6px 12px */
--btn-padding-md: 0.5rem 1rem;        /* 8px 16px */
--btn-padding-lg: 0.75rem 1.5rem;     /* 12px 24px */

/* Cards */
--card-padding-sm: 1rem;              /* 16px */
--card-padding-md: 1.5rem;            /* 24px */
--card-padding-lg: 2rem;              /* 32px */

/* Input fields */
--input-padding-x: 0.75rem;           /* 12px */
--input-padding-y: 0.625rem;          /* 10px */

/* Modal */
--modal-padding: 1.5rem;              /* 24px */

/* Chat messages */
--message-padding: 1rem 1.25rem;      /* 16px 20px */
```

### Border Radius

```css
--radius-none: 0;
--radius-sm: 0.25rem;      /* 4px */
--radius-md: 0.375rem;     /* 6px */
--radius-default: 0.5rem;  /* 8px */
--radius-lg: 0.75rem;      /* 12px */
--radius-xl: 1rem;         /* 16px */
--radius-2xl: 1.25rem;     /* 20px */
--radius-3xl: 1.5rem;      /* 24px */
--radius-full: 9999px;     /* Pill shape */

/* Component-specific */
--radius-button: 0.5rem;   /* 8px */
--radius-input: 0.5rem;    /* 8px */
--radius-card: 0.75rem;    /* 12px */
--radius-modal: 1rem;      /* 16px */
--radius-tooltip: 0.375rem; /* 6px */
--radius-avatar: 9999px;   /* Full circle */
```

### Container Widths

```css
--container-sm: 640px;
--container-md: 768px;
--container-lg: 1024px;
--container-xl: 1280px;
--container-2xl: 1536px;

/* Chat-specific */
--chat-max-width: 768px;
--sidebar-width: 260px;
--sidebar-collapsed-width: 68px;
```

### Z-Index Scale

```css
--z-behind: -1;
--z-normal: 0;
--z-tooltip: 10;
--z-sticky: 20;
--z-fixed: 30;
--z-overlay: 40;
--z-modal: 50;
--z-popover: 60;
--z-toast: 70;
```

---

## 4. Components

### Buttons

```css
/* Primary Button */
.btn-primary {
  background-color: #E07A3C;
  color: #FFFFFF;
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: none;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.btn-primary:hover {
  background-color: #C96A32;
}

.btn-primary:focus {
  outline: 2px solid #E07A3C;
  outline-offset: 2px;
}

.btn-primary:active {
  background-color: #B35D2A;
}

.btn-primary:disabled {
  background-color: #D4D3D0;
  color: #8B8B8B;
  cursor: not-allowed;
}

/* Secondary Button */
.btn-secondary {
  background-color: transparent;
  color: #1A1915;
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #D4D3D0;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-secondary:hover {
  background-color: rgba(0, 0, 0, 0.04);
  border-color: #B0AFAC;
}

/* Ghost Button */
.btn-ghost {
  background-color: transparent;
  color: #5D5D5D;
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: none;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.btn-ghost:hover {
  background-color: rgba(0, 0, 0, 0.04);
  color: #1A1915;
}

/* Icon Button */
.btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background-color: transparent;
  color: #5D5D5D;
  border: none;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-icon:hover {
  background-color: rgba(0, 0, 0, 0.04);
  color: #1A1915;
}

/* Button Sizes */
.btn-sm { padding: 0.375rem 0.75rem; font-size: 0.75rem; }
.btn-md { padding: 0.5rem 1rem; font-size: 0.875rem; }
.btn-lg { padding: 0.75rem 1.5rem; font-size: 1rem; }
```

### Input Fields

```css
/* Text Input */
.input {
  width: 100%;
  padding: 0.625rem 0.75rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: #1A1915;
  background-color: #FFFFFF;
  border: 1px solid #D4D3D0;
  border-radius: 0.5rem;
  outline: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.input::placeholder {
  color: #A3A3A3;
}

.input:hover {
  border-color: #B0AFAC;
}

.input:focus {
  border-color: #E07A3C;
  box-shadow: 0 0 0 3px rgba(224, 122, 60, 0.15);
}

.input:disabled {
  background-color: #F5F4F2;
  color: #8B8B8B;
  cursor: not-allowed;
}

.input-error {
  border-color: #EF4444;
}

.input-error:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

/* Chat Input (Textarea) */
.chat-input {
  width: 100%;
  min-height: 52px;
  max-height: 200px;
  padding: 0.875rem 1rem;
  font-size: 1rem;
  font-family: inherit;
  color: #1A1915;
  background-color: #FFFFFF;
  border: 1px solid #E8E7E5;
  border-radius: 1.5rem;
  resize: none;
  outline: none;
  overflow-y: auto;
}

.chat-input:focus {
  border-color: #D4D3D0;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05);
}
```

### Cards & Containers

```css
/* Card */
.card {
  background-color: #FFFFFF;
  border: 1px solid #E8E7E5;
  border-radius: 0.75rem;
  padding: 1.5rem;
  transition: box-shadow 200ms ease;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* Elevated Card */
.card-elevated {
  background-color: #FFFFFF;
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08),
              0 4px 12px rgba(0, 0, 0, 0.05);
}

/* Chat Message Card (Claude) */
.message-claude {
  background-color: #FAF9F7;
  border-radius: 1rem;
  padding: 1rem 1.25rem;
}

/* Chat Message Card (User) */
.message-user {
  background-color: #F5F4F2;
  border-radius: 1rem;
  padding: 1rem 1.25rem;
}

/* Artifact Container */
.artifact-container {
  background-color: #FFFFFF;
  border: 1px solid #E8E7E5;
  border-radius: 0.75rem;
  overflow: hidden;
}

.artifact-header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #E8E7E5;
  background-color: #FAF9F7;
}

.artifact-content {
  padding: 1rem;
}
```

### Navigation

```css
/* Sidebar */
.sidebar {
  width: 260px;
  height: 100vh;
  background-color: #FAF9F7;
  border-right: 1px solid #E8E7E5;
  display: flex;
  flex-direction: column;
  padding: 0.75rem;
}

/* Sidebar Item */
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.5rem;
  color: #5D5D5D;
  text-decoration: none;
  font-size: 0.875rem;
  transition: all 150ms ease;
}

.sidebar-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
  color: #1A1915;
}

.sidebar-item.active {
  background-color: rgba(0, 0, 0, 0.06);
  color: #1A1915;
}

/* Top Navigation */
.navbar {
  height: 3.5rem;
  padding: 0 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #FFFFFF;
  border-bottom: 1px solid #E8E7E5;
}

/* Tabs */
.tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  background-color: #F5F4F2;
  border-radius: 0.5rem;
}

.tab {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #5D5D5D;
  background-color: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.tab:hover {
  color: #1A1915;
}

.tab.active {
  background-color: #FFFFFF;
  color: #1A1915;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
```

### Modal Dialogs

```css
/* Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: fadeIn 150ms ease;
}

/* Modal */
.modal {
  background-color: #FFFFFF;
  border-radius: 1rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  overflow: hidden;
  animation: scaleIn 200ms ease;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #E8E7E5;
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: #1A1915;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #E8E7E5;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
```

### Loading States

```css
/* Spinner */
.spinner {
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid #E8E7E5;
  border-top-color: #E07A3C;
  border-radius: 50%;
  animation: spin 600ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Skeleton */
.skeleton {
  background: linear-gradient(
    90deg,
    #F5F4F2 25%,
    #EFEEEC 50%,
    #F5F4F2 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 0.375rem;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  gap: 0.25rem;
  padding: 1rem;
}

.typing-dot {
  width: 0.5rem;
  height: 0.5rem;
  background-color: #B4B4B4;
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite;
}

.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-0.5rem); }
}

/* Streaming Text Effect */
.streaming-text {
  animation: fadeInChar 50ms ease-out forwards;
}

@keyframes fadeInChar {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Progress Bar */
.progress-bar {
  height: 0.25rem;
  background-color: #E8E7E5;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: #E07A3C;
  border-radius: 9999px;
  transition: width 300ms ease;
}
```

### Tooltips & Popovers

```css
/* Tooltip */
.tooltip {
  position: absolute;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: #FFFFFF;
  background-color: #1A1915;
  border-radius: 0.375rem;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  white-space: nowrap;
  z-index: 60;
  animation: tooltipFade 150ms ease;
}

@keyframes tooltipFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Dropdown Menu */
.dropdown {
  position: absolute;
  min-width: 12rem;
  padding: 0.25rem;
  background-color: #FFFFFF;
  border: 1px solid #E8E7E5;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
              0 4px 6px -2px rgba(0, 0, 0, 0.05);
  z-index: 50;
  animation: dropdownSlide 150ms ease;
}

@keyframes dropdownSlide {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: #5D5D5D;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.dropdown-item:hover {
  background-color: rgba(0, 0, 0, 0.04);
  color: #1A1915;
}

.dropdown-divider {
  height: 1px;
  margin: 0.25rem 0;
  background-color: #E8E7E5;
}
```

---

## 5. Animations & Transitions

### Transition Durations

```css
--duration-instant: 50ms;
--duration-fast: 100ms;
--duration-normal: 150ms;
--duration-moderate: 200ms;
--duration-slow: 300ms;
--duration-slower: 400ms;
--duration-lazy: 500ms;
```

### Easing Functions

```css
/* Standard easings */
--ease-linear: linear;
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

/* Custom easings */
--ease-smooth: cubic-bezier(0.25, 0.1, 0.25, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

### Common Animations

```css
/* Fade In */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Fade In Up */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Fade In Down */
@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scale In */
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Slide In Right */
@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Slide In Left */
@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Ping (notification badge) */
@keyframes ping {
  75%, 100% {
    transform: scale(2);
    opacity: 0;
  }
}

/* Message appear */
@keyframes messageAppear {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Transition Presets

```css
/* Default transition */
.transition-default {
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Color transition */
.transition-colors {
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease;
}

/* Transform transition */
.transition-transform {
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* Opacity transition */
.transition-opacity {
  transition: opacity 150ms ease;
}

/* Shadow transition */
.transition-shadow {
  transition: box-shadow 200ms ease;
}
```

---

## 6. Shadows

```css
/* Elevation levels */
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-default: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);

/* Inner shadow */
--shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05);

/* Focus ring shadow */
--shadow-focus: 0 0 0 3px rgba(224, 122, 60, 0.15);
```

---

## 7. CSS Custom Properties (Complete Token Set)

```css
:root {
  /* Colors - Light Mode */
  --color-primary: #E07A3C;
  --color-primary-hover: #C96A32;
  --color-primary-active: #B35D2A;
  
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #FAF9F7;
  --color-bg-tertiary: #F5F4F2;
  --color-bg-quaternary: #EFEEEC;
  
  --color-text-primary: #1A1915;
  --color-text-secondary: #5D5D5D;
  --color-text-tertiary: #8B8B8B;
  --color-text-muted: #A3A3A3;
  
  --color-border-light: #E8E7E5;
  --color-border-default: #D4D3D0;
  --color-border-strong: #C1C0BD;
  
  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  
  /* Spacing */
  --space-unit: 0.25rem;
  
  /* Radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;
  
  /* Transitions */
  --transition-fast: 100ms ease;
  --transition-normal: 150ms ease;
  --transition-slow: 300ms ease;
}

/* Dark Mode */
[data-theme="dark"],
.dark {
  --color-bg-primary: #1A1915;
  --color-bg-secondary: #252420;
  --color-bg-tertiary: #2F2E29;
  --color-bg-quaternary: #3A3935;
  
  --color-text-primary: #ECECEC;
  --color-text-secondary: #B4B4B4;
  --color-text-tertiary: #8B8B8B;
  --color-text-muted: #6B6B6B;
  
  --color-border-light: #3A3935;
  --color-border-default: #4A4945;
  --color-border-strong: #5A5955;
}
```

---

## 8. Responsive Breakpoints

```css
/* Mobile First Breakpoints */
--breakpoint-sm: 640px;   /* Small devices */
--breakpoint-md: 768px;   /* Medium devices */
--breakpoint-lg: 1024px;  /* Large devices */
--breakpoint-xl: 1280px;  /* Extra large */
--breakpoint-2xl: 1536px; /* 2X Extra large */

/* Media Queries */
@media (min-width: 640px) { /* sm */ }
@media (min-width: 768px) { /* md */ }
@media (min-width: 1024px) { /* lg */ }
@media (min-width: 1280px) { /* xl */ }
@media (min-width: 1536px) { /* 2xl */ }

/* Preferred color scheme */
@media (prefers-color-scheme: dark) { }
@media (prefers-color-scheme: light) { }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 9. Iconography

Claude.ai uses simple, outline-style icons with these properties:

```css
.icon {
  width: 1.25rem;     /* 20px default */
  height: 1.25rem;
  stroke-width: 1.5;
  stroke: currentColor;
  fill: none;
}

.icon-sm {
  width: 1rem;        /* 16px */
  height: 1rem;
}

.icon-lg {
  width: 1.5rem;      /* 24px */
  height: 1.5rem;
}
```

---

## Quick Reference: Most Used Values

| Property | Value |
|----------|-------|
| Primary accent | `#E07A3C` |
| Body text | `#1A1915` / `#ECECEC` (dark) |
| Secondary text | `#5D5D5D` / `#B4B4B4` (dark) |
| Main background | `#FFFFFF` / `#1A1915` (dark) |
| Secondary background | `#FAF9F7` / `#252420` (dark) |
| Default border | `#D4D3D0` / `#4A4945` (dark) |
| Border radius (button) | `0.5rem` (8px) |
| Border radius (card) | `0.75rem` (12px) |
| Font family | `Inter` |
| Base font size | `16px` |
| Transition | `150ms ease` |
| Focus ring | `2px solid #E07A3C` |

---

*Last updated: January 2026*
