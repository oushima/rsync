# RSync Application - Development Guidelines

## Table of Contents
1. [User-Friendly Messaging Standards](#user-friendly-messaging-standards)
2. [Error Handling Guidelines](#error-handling-guidelines)
3. [Notification System](#notification-system)
4. [Data Integrity Requirements](#data-integrity-requirements)
5. [Gap Analysis & Roadmap](#gap-analysis--roadmap)

---

## User-Friendly Messaging Standards

### The Golden Rule
**Every message should be understandable by a non-technical user ("granny-friendly") while also including technical details for power users.**

### Message Structure (5 Components)

Every error, warning, or notification should include:

1. **Simple Title** (3-7 words)
   - What happened in plain English
   - No technical jargon
   - Example: "The copy doesn't match the original"

2. **Detailed Message** (1-2 sentences)
   - Explain WHAT went wrong
   - Explain WHY it might have happened
   - Use analogies when helpful
   - Example: "The file was copied, but something changed during the process. This can happen if your computer was busy or the disk is having issues."

3. **Action Hint** (1-2 sentences)
   - Tell the user exactly what to do
   - Start with an action verb
   - Example: "Click 'Try again' to copy it fresh. If it keeps happening, try restarting your computer."

4. **Prevention Tip** (1 sentence, optional)
   - How to avoid this in the future
   - Example: "Keep your Mac plugged in during large transfers."

5. **Technical Details** (optional, collapsible)
   - Raw error codes, file paths, timestamps
   - For users who want to troubleshoot or report bugs
   - Example: "Error code: ENOSPC. Path: /Volumes/Backup/large-file.mp4"

### Language Guidelines

✅ **DO:**
- Use "you" and "your" (second person)
- Use present tense for current state
- Use contractions ("doesn't" instead of "does not")
- Use simple words (2nd grade reading level)
- Include emoji for visual scanning 🎉 ⚠️ ❌

❌ **DON'T:**
- Use technical terms without explanation
- Use passive voice ("An error occurred" → "We couldn't copy the file")
- Use vague language ("Something went wrong" → "The disk is full")
- Blame the user ("You did X wrong" → "X couldn't be completed")

### Examples by Category

#### Success Messages
```
Title: "Sync Complete! 🎉"
Message: "Successfully synced 42 files. Your folders are now in sync."
```

#### Error Messages
```
Title: "Not Enough Disk Space"
Message: "The backup drive only has 2.3 GB free, but you need 15.7 GB."
Action: "Free up space by deleting files you don't need, or choose a different destination."
Prevention: "Keep at least 10% of your drive free for system operations."
Technical: "Error: ENOSPC. Available: 2,469,216,256 bytes. Required: 16,856,432,640 bytes."
```

#### Warning Messages
```
Title: "File Conflict Needs Your Attention"
Message: "A file named 'report.docx' exists in both locations with different content."
Action: "Review the conflict and decide whether to keep the source, destination, or both versions."
```

### Internationalization (i18n)

All messages MUST be in the translation files:
- `src/i18n/locales/en.json` - English
- `src/i18n/locales/nl.json` - Dutch

Use the `t()` function for all user-facing text:
```typescript
t('verification.checksumMismatch.simple')
t('verification.checksumMismatch.detail')
t('verification.checksumMismatch.action')
```

---

## Error Handling Guidelines

### Error Classification

All errors should be classified into one of these categories:

| Category | User Impact | Notification | Recovery |
|----------|-------------|--------------|----------|
| `success` | Positive | Optional | N/A |
| `warning` | Needs attention | Yes | User decision |
| `error` | Blocking | Yes | Retry or abort |
| `info` | FYI | Optional | N/A |

### Specific Error Types

The Rust backend defines these error types in `src-tauri/src/errors.rs`:

| Error | When to Use | User Message Pattern |
|-------|-------------|---------------------|
| `DiskFull` | ENOSPC, no space left | "The drive is full. Free up X GB to continue." |
| `DriveDisconnected` | ENODEV, EIO on external drive | "The drive was disconnected. Reconnect and resume." |
| `FileLocked` | EBUSY | "This file is being used by another app. Close it and retry." |
| `PermissionDenied` | EACCES | "RSync needs permission. Go to Settings → Permissions." |
| `FileModifiedDuringTransfer` | Source changed mid-copy | "The file changed while copying. We'll copy the latest version." |
| `NetworkTimeout` | Network drive timeout | "The network connection was lost. Check your connection." |
| `PathTooLong` | ENAMETOOLONG | "This file path is too long. Rename it to be shorter." |
| `HashMismatch` | Verification failed | "The copy doesn't match the original. We'll try again." |

### Frontend Error Transformation

Transform technical errors to user-friendly messages in the frontend:

```typescript
// src/utils/errorMessages.ts
export function humanizeError(error: SyncError): UserFriendlyError {
  // Match error patterns and return structured message
}
```

---

## Notification System

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Notification Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Backend Event  →  notificationStore  →  NotificationCenter │
│       ↓                    ↓                     ↓          │
│  Tauri Event        In-App History         Native OS Toast  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Notification Categories

All notification types are defined in `src/types/index.ts`:

| Category | Default On | Native Toast | Description |
|----------|------------|--------------|-------------|
| `sync_completed` | ✅ | ✅ | Sync finished successfully |
| `sync_failed` | ✅ | ✅ | Sync encountered an error |
| `disk_space_critical` | ✅ | ✅ | No disk space remaining |
| `drive_disconnected` | ✅ | ✅ | External drive unplugged |
| `verification_error` | ✅ | ✅ | File integrity check failed |
| `conflict_detected` | ✅ | ✅ | File conflict needs resolution |
| `sync_paused` | ❌ | ❌ | User paused the sync |
| `queue_item_completed` | ❌ | ❌ | Individual file finished |

### Adding a New Notification

1. Add the category to `NotificationCategory` type in `src/types/index.ts`
2. Add default preference in `DEFAULT_NOTIFICATION_PREFERENCES`
3. Create helper function in `src/stores/notificationStore.ts`
4. Add translations in both locale files
5. Call the helper where the event occurs

---

## Data Integrity Requirements

### Zero Tolerance Policy

**This application handles user data. There is ZERO tolerance for:**
- Partial/corrupt files left on disk
- Silent data loss
- Undetected file corruption
- Race conditions in state management
- Memory leaks during long operations

### Atomic Operations

All file operations MUST be atomic:

```rust
// ✅ CORRECT: Use atomic copy
copy_file_atomic(source, dest, options, callback)?;

// ❌ WRONG: Direct write to destination
copy_file_with_progress(source, dest, options, callback)?;
```

The atomic copy pattern:
1. Write to temporary file (`.rsync-tmp`)
2. Verify integrity (optional but recommended)
3. Atomic rename to final destination
4. Clean up on failure

### Disk Space Monitoring

ALWAYS check disk space:
1. **Before sync**: Pre-flight check for total size
2. **During sync**: Periodic checks (every 100MB or 30 seconds)
3. **On write failure**: Classify error correctly

### State Persistence

Transfer state is persisted to disk for crash recovery:
- Location: `~/.rsync/transfers/`
- Format: JSON with atomic write (temp + rename)
- Frequency: Every progress callback

---

## Gap Analysis & Roadmap

### Current Status: 7.5/10

### Completed ✅

1. ✅ Notification capability added to Tauri
2. ✅ In-app notification center with history
3. ✅ Granular notification preferences
4. ✅ Streaming hash computation (fixed memory bomb)
5. ✅ Atomic file copy operations
6. ✅ Partial file cleanup utilities
7. ✅ Disk space pre-checking
8. ✅ Granular error types (DiskFull, DriveDisconnected, etc.)
9. ✅ IO error classification
10. ✅ User-friendly messaging infrastructure

### Remaining Work

#### Tier 1: Critical (Must Have)
- [ ] Resume Transfer UI - Surface interrupted transfers to users
- [ ] Drive disconnect detection - Monitor volume changes during sync
- [ ] Use `copy_file_atomic` in sync_engine.rs

#### Tier 2: High Priority
- [ ] First-time setup wizard
- [ ] Help/documentation panel
- [ ] Keyboard shortcuts
- [ ] Replace polling with events in useTransferState

#### Tier 3: Medium Priority
- [ ] Battery level monitoring (auto-pause at 10%)
- [ ] Export/import settings
- [ ] Individual pause/cancel for queue items
- [ ] Priority queue management

#### Tier 4: Polish
- [ ] Skeleton loaders during scanning
- [ ] Standardize on logger utility
- [ ] Extract magic numbers to constants

---

## Code Quality Standards

### No Anti-Patterns

❌ **Avoid:**
- `setInterval` for polling (use events)
- `setTimeout` without cleanup
- Magic numbers (use named constants)
- Empty catch blocks (always log)
- `console.log` in production (use logger)
- `.unwrap()` in Rust (use `?` operator)

✅ **Prefer:**
- Event-driven architecture (Tauri events)
- Typed constants with documentation
- Proper error boundaries
- Structured logging via logger utility
- Result types with proper error handling

### Testing Checklist

Before releasing, verify these scenarios:
- [ ] PC shuts down mid-transfer → State recovers
- [ ] Disk fills during sync → Clean error, no partial files
- [ ] USB unplugged mid-transfer → Detected, pausable, resumable
- [ ] Permission revoked mid-sync → Graceful failure
- [ ] File modified during copy → Detected, user notified
- [ ] RAM pressure → Graceful degradation
- [ ] 1000+ files → No UI freeze

---

## File Reference

| File | Purpose |
|------|---------|
| `src/stores/notificationStore.ts` | Notification state and helpers |
| `src/components/notifications/NotificationCenter.tsx` | UI components |
| `src/components/settings/NotificationSettings.tsx` | Preference toggles |
| `src/types/index.ts` | Type definitions |
| `src-tauri/src/errors.rs` | Rust error types |
| `src-tauri/src/file_ops.rs` | Atomic file operations |
| `src/i18n/locales/*.json` | Translations |

---

*Last Updated: January 2026*
