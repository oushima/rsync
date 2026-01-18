import { FileWarning, File, Calendar, HardDrive } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useSettingsStore } from '../../stores/settingsStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { ConflictResolution } from '../../types';

export function ConflictDialog() {
  const { currentConflict, setCurrentConflict, resolveConflict } = useSyncStore();
  const { formatBytes } = useSync();
  const { language } = useSettingsStore();

  if (!currentConflict) return null;

  const texts = {
    en: {
      title: 'Two files have the same name',
      description: 'There is already a file with this name. What should we do?',
      source: 'From your source folder',
      destination: 'Already in destination',
      modified: 'Changed',
      size: 'Size',
      keepSource: 'Use source file',
      keepSourceDesc: 'Replace the destination file',
      keepDest: 'Keep destination file',
      keepDestDesc: 'Leave the existing file',
      keepBoth: 'Keep both files',
      keepBothDesc: 'Rename the new one and keep both',
      skip: 'Skip this file',
      skipDesc: 'Leave it and continue',
    },
    nl: {
      title: 'Twee bestanden hebben dezelfde naam',
      description: 'Er is al een bestand met deze naam. Wat wil je doen?',
      source: 'Uit je bronmap',
      destination: 'Al in de bestemming',
      modified: 'Gewijzigd',
      size: 'Grootte',
      keepSource: 'Bronbestand gebruiken',
      keepSourceDesc: 'Vervang het bestand op de bestemming',
      keepDest: 'Bestand op bestemming houden',
      keepDestDesc: 'Laat het bestaande bestand staan',
      keepBoth: 'Beide bewaren',
      keepBothDesc: 'Hernoem het nieuwe bestand en bewaar beide',
      skip: 'Dit bestand overslaan',
      skipDesc: 'Sla dit over en ga verder',
    },
  };

  const t = texts[language];

  const handleResolve = (resolution: ConflictResolution) => {
    resolveConflict(currentConflict.id, resolution);
    setCurrentConflict(null);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(language === 'nl' ? 'nl-NL' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <Modal
      isOpen={true}
      onClose={() => setCurrentConflict(null)}
      title={t.title}
      description={t.description}
      size="lg"
    >
      <div className="space-y-8">
        {/* File Info */}
        <div className="flex items-center gap-4 p-5 rounded-xl bg-bg-tertiary">
          <FileWarning className="w-9 h-9 text-warning" />
          <div>
            <p className="text-[16px] font-medium text-text-primary">
              {currentConflict.file.name}
            </p>
            <p className="text-[14px] text-text-secondary truncate">
              {currentConflict.file.path}
            </p>
          </div>
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-5">
          {/* Source */}
          <div className="p-5 rounded-xl border border-border">
            <h4 className="text-[15px] font-medium text-text-primary mb-3">
              {t.source}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[14px]">
                <Calendar className="w-4.5 h-4.5 text-text-tertiary" />
                <span className="text-text-secondary">{t.modified}:</span>
                <span className="text-text-primary">
                  {formatDate(currentConflict.sourceModified)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[14px]">
                <HardDrive className="w-4.5 h-4.5 text-text-tertiary" />
                <span className="text-text-secondary">{t.size}:</span>
                <span className="text-text-primary">
                  {formatBytes(currentConflict.sourceSize)}
                </span>
              </div>
            </div>
          </div>

          {/* Destination */}
          <div className="p-5 rounded-xl border border-border">
            <h4 className="text-[15px] font-medium text-text-primary mb-3">
              {t.destination}
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[14px]">
                <Calendar className="w-4.5 h-4.5 text-text-tertiary" />
                <span className="text-text-secondary">{t.modified}:</span>
                <span className="text-text-primary">
                  {formatDate(currentConflict.destModified)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[14px]">
                <HardDrive className="w-4.5 h-4.5 text-text-tertiary" />
                <span className="text-text-secondary">{t.size}:</span>
                <span className="text-text-primary">
                  {formatBytes(currentConflict.destSize)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Resolution Options */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="primary"
            onClick={() => handleResolve('keep-source')}
            className="flex-col h-auto py-4"
          >
            <File className="w-5 h-5 mb-1" />
            <span>{t.keepSource}</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleResolve('keep-dest')}
            className="flex-col h-auto py-4"
          >
            <File className="w-5 h-5 mb-1" />
            <span>{t.keepDest}</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleResolve('keep-both')}
            className="flex-col h-auto py-4"
          >
            <span>{t.keepBoth}</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => handleResolve('skip')}
            className="flex-col h-auto py-4"
          >
            <span>{t.skip}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
