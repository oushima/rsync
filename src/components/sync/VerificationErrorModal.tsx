import { AlertTriangle, RefreshCw, X, HelpCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useSettingsStore } from '../../stores/settingsStore';

interface VerificationError {
  fileName: string;
  filePath: string;
  reason: 'checksum_mismatch' | 'file_missing' | 'permission_denied' | 'disk_full' | 'unknown';
  canRetry: boolean;
}

interface VerificationErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: VerificationError[];
  onRetry: (filePath: string) => void;
  onRetryAll: () => void;
  onSkipAll: () => void;
}

export function VerificationErrorModal({
  isOpen,
  onClose,
  errors,
  onRetry,
  onRetryAll,
  onSkipAll,
}: VerificationErrorModalProps) {
  const { language } = useSettingsStore();

  const texts = {
    en: {
      title: 'Some files need your attention',
      subtitle: "We tried to copy these files, but something went wrong. Don't worry, your original files are safe!",
      retryAll: 'Try copying all again',
      skipAll: 'Skip these and continue',
      close: 'Close',
      retry: 'Try again',
      whyTitle: 'What happened?',
      whatCanIDo: 'What can I do?',
      reasons: {
        checksum_mismatch: {
          simple: 'The copy doesn\'t match the original',
          detail: 'The file was copied, but something changed during the process. This can happen if your computer was busy or the disk is having issues.',
          action: 'Click "Try again" to copy it fresh. If it keeps happening, try restarting your computer.',
        },
        file_missing: {
          simple: 'The file disappeared',
          detail: 'We couldn\'t find this file anymore. Maybe it was moved or deleted by another program.',
          action: 'Check if the file still exists in the original location. If you moved it, you\'ll need to add it again.',
        },
        permission_denied: {
          simple: 'We don\'t have permission',
          detail: 'Your Mac is protecting this location. RSync needs special permission to copy files here.',
          action: 'Go to Settings → Permissions and make sure RSync has "Full Disk Access" turned on.',
        },
        disk_full: {
          simple: 'Not enough space',
          detail: 'The destination disk is full. There\'s no room left to save this file.',
          action: 'Free up some space on the destination disk by deleting files you don\'t need, then try again.',
        },
        unknown: {
          simple: 'Something unexpected happened',
          detail: 'We\'re not sure exactly what went wrong, but we couldn\'t complete the copy.',
          action: 'Try again. If it still doesn\'t work, restart RSync and try once more.',
        },
      },
    },
    nl: {
      title: 'Sommige bestanden hebben je aandacht nodig',
      subtitle: 'We probeerden deze bestanden te kopiëren, maar er ging iets mis. Maak je geen zorgen, je originele bestanden zijn veilig!',
      retryAll: 'Probeer alles opnieuw',
      skipAll: 'Sla deze over en ga door',
      close: 'Sluiten',
      retry: 'Opnieuw proberen',
      whyTitle: 'Wat is er gebeurd?',
      whatCanIDo: 'Wat kan ik doen?',
      reasons: {
        checksum_mismatch: {
          simple: 'De kopie komt niet overeen met het origineel',
          detail: 'Het bestand is gekopieerd, maar er is iets veranderd tijdens het proces. Dit kan gebeuren als je computer druk bezig was of de schijf problemen heeft.',
          action: 'Klik op "Opnieuw proberen" om het vers te kopiëren. Als het blijft gebeuren, probeer je computer opnieuw op te starten.',
        },
        file_missing: {
          simple: 'Het bestand is verdwenen',
          detail: 'We konden dit bestand niet meer vinden. Misschien is het verplaatst of verwijderd door een ander programma.',
          action: 'Controleer of het bestand nog op de originele plek staat. Als je het hebt verplaatst, moet je het opnieuw toevoegen.',
        },
        permission_denied: {
          simple: 'We hebben geen toestemming',
          detail: 'Je Mac beschermt deze locatie. RSync heeft speciale toestemming nodig om hier bestanden te kopiëren.',
          action: 'Ga naar Instellingen → Toestemmingen en zorg dat RSync "Volledige schijftoegang" aan heeft staan.',
        },
        disk_full: {
          simple: 'Niet genoeg ruimte',
          detail: 'De doelschijf is vol. Er is geen ruimte meer om dit bestand op te slaan.',
          action: 'Maak ruimte vrij op de doelschijf door bestanden te verwijderen die je niet nodig hebt, en probeer dan opnieuw.',
        },
        unknown: {
          simple: 'Er is iets onverwachts gebeurd',
          detail: 'We weten niet precies wat er mis ging, maar we konden het kopiëren niet voltooien.',
          action: 'Probeer het opnieuw. Als het nog steeds niet werkt, herstart RSync en probeer het nog een keer.',
        },
      },
    },
  };

  const t = texts[language];

  if (errors.length === 0) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t.title} size="lg">
      <div className="flex flex-col gap-6">
        {/* Friendly intro */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-warning/10 border border-warning/20">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" strokeWidth={1.75} />
          <p className="text-sm text-text-primary leading-relaxed">
            {t.subtitle}
          </p>
        </div>

        {/* Error list */}
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {errors.map((error, index) => {
            const reason = t.reasons[error.reason];
            return (
              <div
                key={`${error.filePath}-${index}`}
                className="p-4 rounded-2xl bg-bg-tertiary border border-border-subtle"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {error.fileName}
                    </p>
                    <p className="text-xs text-text-tertiary truncate mt-0.5">
                      {error.filePath}
                    </p>
                  </div>
                  {error.canRetry && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRetry(error.filePath)}
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />}
                    >
                      {t.retry}
                    </Button>
                  )}
                </div>

                {/* Simple explanation */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
                    <span className="text-sm font-medium text-warning">{reason.simple}</span>
                  </div>
                  
                  <div className="pl-5 space-y-2">
                    <div>
                      <p className="text-xs font-medium text-text-secondary mb-0.5">{t.whyTitle}</p>
                      <p className="text-xs text-text-tertiary leading-relaxed">{reason.detail}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-secondary mb-0.5 flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" strokeWidth={1.75} />
                        {t.whatCanIDo}
                      </p>
                      <p className="text-xs text-text-tertiary leading-relaxed">{reason.action}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="primary"
            size="md"
            onClick={onRetryAll}
            leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={1.75} />}
            className="flex-1"
          >
            {t.retryAll}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onSkipAll}
            className="flex-1"
          >
            {t.skipAll}
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            leftIcon={<X className="w-4 h-4" strokeWidth={1.75} />}
          >
            {t.close}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
