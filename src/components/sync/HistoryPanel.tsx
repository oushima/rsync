import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { History, CheckCircle, XCircle, AlertCircle, Trash2, Clock, HardDrive, FileStack, Download, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useHistoryStore } from '../../stores/historyStore';
import { useSync } from '../../hooks/useSync';
import { Button } from '../ui/Button';
import { logger } from '../../utils/logger';
import type { TransferHistoryItem } from '../../types';

interface HistoryRowProps {
  item: TransferHistoryItem;
}

function HistoryRow({ item }: HistoryRowProps) {
  const { t, i18n } = useTranslation();
  const { formatBytes, formatTime } = useSync();

  const statusConfig = {
    completed: {
      icon: CheckCircle,
      color: 'text-success',
      labelKey: 'history.done',
    },
    cancelled: {
      icon: XCircle,
      color: 'text-text-tertiary',
      labelKey: 'history.stopped',
    },
    error: {
      icon: AlertCircle,
      color: 'text-error',
      labelKey: 'history.problem',
    },
  };

  const status = statusConfig[item.status];
  const StatusIcon = status.icon;

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={clsx(
        'p-5 rounded-2xl',
        'bg-bg-secondary',
        'border border-border-subtle',
        'shadow-xs',
        'hover:bg-bg-tertiary',
        'transition-colors duration-150 ease-out'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div
          className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center shrink-0',
            'bg-bg-tertiary'
          )}
        >
          <StatusIcon className={clsx('w-6 h-6', status.color)} />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('text-[15px] font-medium', status.color)}>
              {t(status.labelKey)}
            </span>
            <span className="text-[13px] text-text-tertiary">
              {formatDate(item.timestamp)}
            </span>
          </div>
          <p className="text-[15px] text-text-primary truncate mb-2">
            {item.sourcePath || item.destPath}
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-5 text-[13px] text-text-secondary">
            <div className="flex items-center gap-1">
              <FileStack className="w-4 h-4" />
              <span>
                {item.filesCount} {t('history.filesCopied')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <HardDrive className="w-4 h-4" />
              <span>{formatBytes(item.totalSize)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{formatTime(item.duration)}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function HistoryPanel() {
  const { t } = useTranslation();
  const { history, clearHistory } = useHistoryStore();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportLogs = useCallback(async () => {
    if (isExporting || history.length === 0) return;

    setIsExporting(true);
    try {
      const filePath = await save({
        title: t('history.exportTitle'),
        defaultPath: `rsync-history-${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'CSV', extensions: ['csv'] },
        ],
      });

      if (!filePath) {
        setIsExporting(false);
        return;
      }

      const isCSV = filePath.toLowerCase().endsWith('.csv');
      let content: string;

      if (isCSV) {
        // Generate CSV
        const headers = ['ID', 'Source', 'Destination', 'Files', 'Size (bytes)', 'Duration (s)', 'Status', 'Timestamp'];
        const rows = history.map((item) => [
          item.id,
          `"${(item.sourcePath || '').replace(/"/g, '""')}"`,
          `"${(item.destPath || '').replace(/"/g, '""')}"`,
          item.filesCount.toString(),
          item.totalSize.toString(),
          item.duration.toString(),
          item.status,
          item.timestamp instanceof Date ? item.timestamp.toISOString() : String(item.timestamp),
        ]);
        content = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      } else {
        // Generate JSON
        content = JSON.stringify(history, null, 2);
      }

      await writeTextFile(filePath, content);
      logger.debug(`History exported to ${filePath}`);
    } catch (error) {
      logger.error('Failed to export history:', error);
    } finally {
      setIsExporting(false);
    }
  }, [history, isExporting, t]);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center mb-4">
          <History className="w-8 h-8 text-text-tertiary" />
        </div>
        <p className="text-[17px] text-text-secondary font-medium">{t('history.noHistory')}</p>
        <p className="text-[15px] text-text-tertiary mt-1">{t('history.noHistoryDesc')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-text-primary">
            {t('history.title')}
          </h2>
          <p className="text-[14px] text-text-secondary">
            {history.length} {t('history.items')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="md"
          onClick={clearHistory}
          leftIcon={<Trash2 className="w-4.5 h-4.5" />}
          className="text-error hover:text-error"
        >
          {t('history.clearHistory')}
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={handleExportLogs}
          disabled={isExporting}
          leftIcon={isExporting ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Download className="w-4.5 h-4.5" />}
        >
          {t('history.exportLogs')}
        </Button>
      </div>

      {/* History List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {history.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.05, 0.3) }}
            >
              <HistoryRow item={item} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
