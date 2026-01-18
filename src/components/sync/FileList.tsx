import { motion, AnimatePresence } from 'framer-motion';
import { File, Folder, Trash2, CheckCircle, XCircle, Clock, Loader2, AlertTriangle, Check } from 'lucide-react';
import clsx from 'clsx';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Tooltip } from '../ui/Tooltip';
import type { FileItem, FileStatus } from '../../types';

const statusIcons: Record<FileStatus, typeof Clock> = {
  pending: Clock,
  syncing: Loader2,
  completed: CheckCircle,
  error: XCircle,
  skipped: AlertTriangle,
  conflict: AlertTriangle,
};

const statusColors: Record<FileStatus, string> = {
  pending: 'text-text-tertiary',
  syncing: 'text-accent',
  completed: 'text-success',
  error: 'text-error',
  skipped: 'text-warning',
  conflict: 'text-warning',
};

interface FileRowProps {
  file: FileItem;
  onRemove: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

function FileRow({ file, onRemove, isSelected, onToggleSelect }: FileRowProps) {
  const { formatBytes } = useSync();
  const { syncState } = useSyncStore();
  const { language } = useSettingsStore();

  const StatusIcon = statusIcons[file.status];
  const isRunning = ['preparing', 'syncing'].includes(syncState);

  const statusLabels: Record<FileStatus, { en: string; nl: string }> = {
    pending: { en: 'Waiting', nl: 'Wachten' },
    syncing: { en: 'Copying', nl: 'Bezig met kopiëren' },
    completed: { en: 'Done', nl: 'Klaar' },
    error: { en: 'Problem', nl: 'Probleem' },
    skipped: { en: 'Skipped', nl: 'Overgeslagen' },
    conflict: { en: 'Needs your help', nl: 'Hulp nodig' },
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -4 }}
      className={clsx(
        'flex items-center gap-3 py-3 px-4 rounded-xl',
        'bg-bg-tertiary/50',
        'border-2 transition-all duration-200 ease-out',
        'hover:bg-bg-tertiary',
        isSelected 
          ? 'border-accent bg-accent-subtle shadow-md' 
          : 'border-transparent'
      )}
    >
      {/* Custom Animated Checkbox */}
      <motion.button
        type="button"
        onClick={() => onToggleSelect(file.id)}
        disabled={isRunning}
        className={clsx(
          'relative shrink-0 w-5 h-5 rounded-md border-2 transition-colors duration-200',
          'flex items-center justify-center',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          isSelected 
            ? 'bg-accent border-accent' 
            : 'bg-transparent border-border hover:border-accent/50',
          isRunning && 'opacity-50 cursor-not-allowed'
        )}
        whileTap={{ scale: 0.9 }}
      >
        <AnimatePresence mode="wait">
          {isSelected && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Icon */}
      <div className="shrink-0">
        {file.isDirectory ? (
          <Folder className="w-4 h-4 text-accent" strokeWidth={1.75} />
        ) : (
          <File className="w-4 h-4 text-text-tertiary" strokeWidth={1.75} />
        )}
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {file.name}
        </p>
        <p className="text-xs text-text-tertiary truncate">
          {file.path}
        </p>
        {file.status === 'syncing' && typeof file.progress === 'number' && (
          <ProgressBar
            value={file.progress}
            size="sm"
            className="mt-1"
            animated
          />
        )}
      </div>

      {/* Size */}
      <div className="shrink-0 text-[14px] text-text-tertiary tabular-nums">
        {formatBytes(file.size)}
      </div>

      {/* Status */}
      <Tooltip content={statusLabels[file.status][language]} position="left">
        <div className={clsx('shrink-0', statusColors[file.status])}>
          <StatusIcon
            className={clsx('w-4.5 h-4.5', file.status === 'syncing' && 'animate-spin')}
            strokeWidth={1.75}
          />
        </div>
      </Tooltip>

      {/* Remove Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(file.id)}
        disabled={isRunning}
        className="shrink-0 h-10 w-10 p-0 text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
      >
        <Trash2 className="w-5 h-5" strokeWidth={1.75} />
      </Button>
    </motion.div>
  );
}

export function FileList() {
  const { files, selectedFiles, toggleFileSelection, selectAllFiles, deselectAllFiles } = useSyncStore();
  const { removeFile, clearFiles } = useSync();
  const { language } = useSettingsStore();

  const texts = {
    en: {
      noFiles: 'No files yet',
      addFilesHint: 'Add files above to get started',
      selectAll: 'Select all',
      deselectAll: 'Select none',
      clearAll: 'Clear list',
      files: 'files',
      selected: 'chosen',
    },
    nl: {
      noFiles: 'Nog geen bestanden',
      addFilesHint: 'Voeg hierboven bestanden toe om te beginnen',
      selectAll: 'Alles kiezen',
      deselectAll: 'Niets kiezen',
      clearAll: 'Lijst leegmaken',
      files: 'bestanden',
      selected: 'gekozen',
    },
  };

  const t = texts[language];

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-[15px] text-text-tertiary">
          {files.length} {t.files} · {selectedFiles.size} {t.selected}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="md"
            onClick={selectedFiles.size === files.length ? deselectAllFiles : selectAllFiles}
            className="text-[14px] px-3"
          >
            {selectedFiles.size === files.length ? t.deselectAll : t.selectAll}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={clearFiles}
            className="text-[14px] px-3 text-error hover:text-error"
          >
            {t.clearAll}
          </Button>
        </div>
      </div>

      {/* File List */}
      <div className="rounded-2xl bg-bg-secondary/50 border border-border-subtle p-4 shadow-sm">
        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1 -mr-1">
          <AnimatePresence mode="popLayout">
            {files.map((file, index) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <FileRow
                  file={file}
                  onRemove={removeFile}
                  isSelected={selectedFiles.has(file.id)}
                  onToggleSelect={toggleFileSelection}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
