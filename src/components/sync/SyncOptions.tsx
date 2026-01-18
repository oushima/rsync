import { FolderOpen, ArrowRight, Shield, Power } from 'lucide-react';
import clsx from 'clsx';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';

export function SyncOptions() {
  const { syncOptions, destPath, syncState } = useSyncStore();
  const { selectDestFolder, updateSyncOptions } = useSync();
  const { language } = useSettingsStore();

  const isDisabled = ['preparing', 'syncing', 'paused'].includes(syncState);

  const texts = {
    en: {
      destination: 'Destination (where copies go)',
      selectDest: 'Choose the folder where the copies should go',
      options: 'How to copy',
      overwriteNewer: 'Overwrite newer files',
      overwriteNewerDesc: 'Replace even if the other file is newer',
      overwriteOlder: 'Overwrite older files',
      overwriteOlderDesc: 'Replace only if the other file is older',
      skipExisting: 'Skip existing files',
      skipExistingDesc: 'Leave files that are already there',
      deleteOrphans: 'Delete extra files',
      deleteOrphansDesc: 'Remove files that only exist in the destination',
      preservePermissions: 'Keep permissions',
      preservePermissionsDesc: 'Keep the original file permissions',
      followSymlinks: 'Follow shortcuts (symlinks)',
      followSymlinksDesc: 'Copy what the shortcut points to',
      dryRun: 'Dry run',
      dryRunDesc: 'Show a preview without changing anything',
      verification: 'File verification',
      verifyChecksum: 'Verify files are copied correctly',
      verifyOff: 'Off - Trust the copy',
      verifyDuring: 'During - Check while copying',
      verifyAfter: 'After - Check when done',
      verifyBoth: 'Both - Double check everything',
      autoRepair: 'Auto-repair',
      autoRepairDesc: 'If a file is broken, try copying it again',
      afterComplete: 'When finished',
      shutdownAfterComplete: 'Turn off computer when done',
      shutdownAfterCompleteDesc: 'Shut down your Mac after all files are copied',
    },
    nl: {
      destination: 'Bestemming (waar kopieën heen gaan)',
      selectDest: 'Kies de map waar de kopieën moeten komen',
      options: 'Hoe kopiëren',
      overwriteNewer: 'Nieuwere bestanden overschrijven',
      overwriteNewerDesc: 'Vervang ook als het andere bestand nieuwer is',
      overwriteOlder: 'Oudere bestanden overschrijven',
      overwriteOlderDesc: 'Vervang alleen als het andere bestand ouder is',
      skipExisting: 'Bestaande bestanden overslaan',
      skipExistingDesc: 'Laat bestanden die er al zijn staan',
      deleteOrphans: 'Extra bestanden verwijderen',
      deleteOrphansDesc: 'Verwijder bestanden die alleen op de bestemming staan',
      preservePermissions: 'Permissies bewaren',
      preservePermissionsDesc: 'Behoud de originele bestandsrechten',
      followSymlinks: 'Snelkoppelingen volgen (symlinks)',
      followSymlinksDesc: 'Kopieer waar de snelkoppeling naar wijst',
      dryRun: 'Proefdraaien',
      dryRunDesc: 'Toon een voorbeeld zonder iets te veranderen',
      verification: 'Bestandscontrole',
      verifyChecksum: 'Controleer of bestanden goed gekopieerd zijn',
      verifyOff: 'Uit - Vertrouw de kopie',
      verifyDuring: 'Tijdens - Controleer tijdens kopiëren',
      verifyAfter: 'Na afloop - Controleer als het klaar is',
      verifyBoth: 'Beide - Dubbel controleren',
      autoRepair: 'Automatisch herstellen',
      autoRepairDesc: 'Als een bestand kapot is, probeer opnieuw te kopiëren',
      afterComplete: 'Als het klaar is',
      shutdownAfterComplete: 'Computer uitzetten als klaar',
      shutdownAfterCompleteDesc: 'Zet je Mac uit nadat alle bestanden gekopieerd zijn',
    },
  };

  const t = texts[language];

  const options = [
    { key: 'overwriteNewer', label: t.overwriteNewer, desc: t.overwriteNewerDesc },
    { key: 'overwriteOlder', label: t.overwriteOlder, desc: t.overwriteOlderDesc },
    { key: 'skipExisting', label: t.skipExisting, desc: t.skipExistingDesc },
    { key: 'deleteOrphans', label: t.deleteOrphans, desc: t.deleteOrphansDesc },
    { key: 'preservePermissions', label: t.preservePermissions, desc: t.preservePermissionsDesc },
    { key: 'followSymlinks', label: t.followSymlinks, desc: t.followSymlinksDesc },
    { key: 'dryRun', label: t.dryRun, desc: t.dryRunDesc },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      {/* Destination Selector */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-3">
          {t.destination}
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div
            className={clsx(
              'flex-1 flex items-center gap-2 px-3 py-2',
              'rounded-lg',
              'bg-bg-primary',
              'border border-border'
            )}
          >
            <FolderOpen className="w-4 h-4 text-accent shrink-0" strokeWidth={1.75} />
            {destPath ? (
              <span className="text-sm text-text-primary truncate">
                {destPath}
              </span>
            ) : (
              <span className="text-sm text-text-tertiary">
                {t.selectDest}
              </span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={selectDestFolder}
            disabled={isDisabled}
            className="px-3 w-full sm:w-auto"
          >
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {/* Sync Options */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-3">
          {t.options}
        </label>
        <div className="space-y-3">
          {options.map((option) => (
            <Toggle
              key={option.key}
              label={option.label}
              description={option.desc}
              checked={syncOptions[option.key]}
              onChange={(e) =>
                updateSyncOptions({ [option.key]: e.target.checked })
              }
              disabled={isDisabled}
            />
          ))}
        </div>
      </div>

      {/* Verification Options */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-accent" strokeWidth={1.75} />
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            {t.verification}
          </label>
        </div>
        <div className="space-y-4">
          <Select
            label={t.verifyChecksum}
            value={syncOptions.verifyChecksum}
            onChange={(e) => updateSyncOptions({ verifyChecksum: e.target.value as 'off' | 'during' | 'after' | 'both' })}
            disabled={isDisabled}
            options={[
              { value: 'off', label: t.verifyOff },
              { value: 'during', label: t.verifyDuring },
              { value: 'after', label: t.verifyAfter },
              { value: 'both', label: t.verifyBoth },
            ]}
          />
          {syncOptions.verifyChecksum !== 'off' && (
            <Toggle
              label={t.autoRepair}
              description={t.autoRepairDesc}
              checked={syncOptions.autoRepair}
              onChange={(e) => updateSyncOptions({ autoRepair: e.target.checked })}
              disabled={isDisabled}
            />
          )}
        </div>
      </div>

      {/* After Complete Options */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <div className="flex items-center gap-2 mb-4">
          <Power className="w-4 h-4 text-accent" strokeWidth={1.75} />
          <label className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            {t.afterComplete}
          </label>
        </div>
        <Toggle
          label={t.shutdownAfterComplete}
          description={t.shutdownAfterCompleteDesc}
          checked={syncOptions.shutdownAfterComplete}
          onChange={(e) => updateSyncOptions({ shutdownAfterComplete: e.target.checked })}
          disabled={isDisabled}
        />
      </div>
    </div>
  );
}
