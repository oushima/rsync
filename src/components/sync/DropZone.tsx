import { useState, useCallback, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FolderOpen, File } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../ui/Button';
import { useSync } from '../../hooks/useSync';
import { useSettingsStore } from '../../stores/settingsStore';
import type { FileItem } from '../../types';

export function DropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const { addFiles, addFilesFromDialog, addFolderFromDialog } = useSync();
  const { language } = useSettingsStore();

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the dropzone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const items = e.dataTransfer.items;
      const files: FileItem[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry?.();
          if (entry) {
            const fileItem: FileItem = {
              id: crypto.randomUUID(),
              name: entry.name,
              path: entry.fullPath || entry.name,
              size: 0, // Would need to traverse for actual size
              isDirectory: entry.isDirectory,
              modifiedAt: new Date(),
              status: 'pending',
            };
            files.push(fileItem);
          }
        }
      }

      if (files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles]
  );

  const texts = {
    en: {
      title: 'Drop your files or folders here',
      subtitle: 'or choose them with the buttons below',
      files: 'Choose files',
      folder: 'Choose folder',
      dragging: 'Let go to add them',
    },
    nl: {
      title: 'Sleep je bestanden of mappen hierheen',
      subtitle: 'of kies ze met de knoppen hieronder',
      files: 'Kies bestanden',
      folder: 'Kies map',
      dragging: 'Laat los om toe te voegen',
    },
  };

  const t = texts[language];

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={clsx(
        'relative rounded-3xl border-2 border-dashed',
        'transition-all duration-200 ease-out',
        'flex flex-col items-center justify-center gap-6 py-12 sm:py-14 px-8 sm:px-10',
        isDragging
          ? 'border-accent bg-accent-subtle'
          : 'border-border bg-bg-secondary/50 hover:border-text-tertiary hover:bg-bg-secondary/70'
      )}
    >
      <AnimatePresence mode="wait">
        {isDragging ? (
          <motion.div
            key="dragging"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-3"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
              className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center"
            >
              <Upload className="w-5 h-5 text-accent" strokeWidth={1.75} />
            </motion.div>
            <p className="text-sm font-semibold text-accent">
              {t.dragging}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-bg-tertiary flex items-center justify-center">
              <Upload className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-text-primary">
                {t.title}
              </p>
              <p className="text-xs text-text-tertiary">
                {t.subtitle}
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="md"
                onClick={addFilesFromDialog}
                leftIcon={<File className="w-4 h-4" strokeWidth={1.75} />}
                className="px-6"
              >
                {t.files}
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={addFolderFromDialog}
                leftIcon={<FolderOpen className="w-4 h-4" strokeWidth={1.75} />}
                className="px-6"
              >
                {t.folder}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
