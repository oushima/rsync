import { motion } from 'framer-motion';
import { FolderOutput, FolderOpen, X } from 'lucide-react';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';

export function OutputSelector() {
  const { destPath, setDestPath } = useSyncStore();
  const { selectDestFolder } = useSync();
  const { language } = useSettingsStore();

  const texts = {
    en: {
      title: 'Output destination',
      subtitle: 'Choose where to copy files to',
      placeholder: 'No destination selected',
      choose: 'Choose folder',
      change: 'Change',
      clear: 'Clear',
    },
    nl: {
      title: 'Uitvoerbestemming',
      subtitle: 'Kies waar bestanden naartoe gekopieerd worden',
      placeholder: 'Geen bestemming gekozen',
      choose: 'Kies map',
      change: 'Wijzig',
      clear: 'Wissen',
    },
  };

  const t = texts[language];

  return (
    <div className="rounded-2xl bg-bg-secondary/50 border border-border-subtle p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Icon and Label */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <FolderOutput className="w-5 h-5 text-accent" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {t.title}
            </p>
            {destPath ? (
              <motion.p 
                key={destPath}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-text-tertiary truncate"
                title={destPath}
              >
                {destPath}
              </motion.p>
            ) : (
              <p className="text-xs text-text-tertiary">
                {t.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {destPath && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDestPath(null)}
              className="text-text-tertiary hover:text-error"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </Button>
          )}
          <Button
            variant={destPath ? 'secondary' : 'primary'}
            size="md"
            onClick={selectDestFolder}
            leftIcon={<FolderOpen className="w-4 h-4" strokeWidth={1.75} />}
            className="px-5"
          >
            {destPath ? t.change : t.choose}
          </Button>
        </div>
      </div>
    </div>
  );
}
