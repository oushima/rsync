import { useTranslation } from 'react-i18next';
import { FolderOpen, ArrowRight, Shield, Power, Files, RefreshCw, Clock, Ban, HelpCircle, Fingerprint, Zap, Gauge } from 'lucide-react';
import clsx from 'clsx';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';
import { Dropdown } from '../ui/Dropdown';
import { ExcludePatterns } from './ExcludePatterns';
import type { FileExistsAction } from '../../types';
import { BANDWIDTH_PRESETS } from '../../types';

export function SyncOptions() {
  const { t } = useTranslation();
  const { syncOptions, destPath, syncState } = useSyncStore();
  const { selectDestFolder, updateSyncOptions } = useSync();

  const isDisabled = ['preparing', 'syncing', 'paused'].includes(syncState);

  const fileExistsOptions = [
    { 
      value: 'replace-different' as FileExistsAction, 
      label: t('options.replaceDifferentLabel'), 
      description: t('options.replaceDifferentDesc'),
      icon: <Files className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'replace-older' as FileExistsAction, 
      label: t('options.replaceSmartLabel'), 
      description: t('options.replaceSmartDesc'),
      icon: <Clock className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'replace-all' as FileExistsAction, 
      label: t('options.replaceAllLabel'), 
      description: t('options.replaceAllDesc'),
      icon: <RefreshCw className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'skip' as FileExistsAction, 
      label: t('options.skipLabel'), 
      description: t('options.skipDesc'),
      icon: <Ban className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'ask' as FileExistsAction, 
      label: t('options.askLabel'), 
      description: t('options.askDesc'),
      icon: <HelpCircle className="w-4 h-4" strokeWidth={1.75} />,
    },
  ];

  const verifyOptions = [
    { 
      value: 'off', 
      label: t('options.verifyOffLabel'), 
      description: t('options.verifyOffDesc'),
      icon: <Zap className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'during', 
      label: t('options.verifyDuringLabel'), 
      description: t('options.verifyDuringDesc'),
      icon: <Fingerprint className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'after', 
      label: t('options.verifyAfterLabel'), 
      description: t('options.verifyAfterDesc'),
      icon: <Fingerprint className="w-4 h-4" strokeWidth={1.75} />,
    },
    { 
      value: 'both', 
      label: t('options.verifyBothLabel'), 
      description: t('options.verifyBothDesc'),
      icon: <Shield className="w-4 h-4" strokeWidth={1.75} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Destination Selector */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <label className="text-xs font-medium text-text-secondary uppercase tracking-wide block mb-3">
          {t('options.destination')}
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
                {t('options.selectDest')}
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

      {/* File Conflict Options */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <div className="flex items-center gap-2 mb-2">
          <Files className="w-4 h-4 text-accent" strokeWidth={1.75} />
          <h3 className="text-[15px] font-semibold text-text-primary">
            {t('options.conflictTitle')}
          </h3>
        </div>
        <p className="text-[13px] text-text-tertiary mb-5 leading-relaxed">
          {t('options.conflictNote')}
        </p>
        
        <Dropdown
          value={syncOptions.fileExistsAction}
          onChange={(value) => updateSyncOptions({ fileExistsAction: value as FileExistsAction })}
          options={fileExistsOptions}
          disabled={isDisabled}
        />
      </div>

      {/* File Integrity Verification */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-accent" strokeWidth={1.75} />
          <h3 className="text-[15px] font-semibold text-text-primary">
            {t('options.integrityTitle')}
          </h3>
        </div>
        <p className="text-[13px] text-text-tertiary mb-5 leading-relaxed">
          {t('options.integrityNote')}
        </p>
        
        <div className="space-y-4">
          <Dropdown
            label={t('options.verifyLabel')}
            value={syncOptions.verifyChecksum}
            onChange={(value) => updateSyncOptions({ verifyChecksum: value as 'off' | 'during' | 'after' | 'both' })}
            options={verifyOptions}
            disabled={isDisabled}
          />
          
          {syncOptions.verifyChecksum !== 'off' && (
            <Toggle
              label={t('options.autoRepairLabel')}
              description={t('options.autoRepairDesc')}
              checked={syncOptions.autoRepair}
              onChange={(e) => updateSyncOptions({ autoRepair: e.target.checked })}
              disabled={isDisabled}
            />
          )}
        </div>
      </div>

      {/* Other Options */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <div className="flex items-center gap-2 mb-5">
          <h3 className="text-[15px] font-semibold text-text-primary">
            {t('options.otherTitle')}
          </h3>
        </div>
        
        <div className="space-y-4">
          <Toggle
            label={t('options.deleteOrphansLabel')}
            description={t('options.deleteOrphansDesc')}
            checked={syncOptions.deleteOrphans}
            onChange={(e) => updateSyncOptions({ deleteOrphans: e.target.checked })}
            disabled={isDisabled}
          />
          <Toggle
            label={t('options.preserveLabel')}
            description={t('options.preserveDesc')}
            checked={syncOptions.preservePermissions}
            onChange={(e) => updateSyncOptions({ preservePermissions: e.target.checked })}
            disabled={isDisabled}
          />
          <Toggle
            label={t('options.symlinkLabel')}
            description={t('options.symlinkDesc')}
            checked={syncOptions.followSymlinks}
            onChange={(e) => updateSyncOptions({ followSymlinks: e.target.checked })}
            disabled={isDisabled}
          />
          <Toggle
            label={t('options.dryRunLabel')}
            description={t('options.dryRunDesc')}
            checked={syncOptions.dryRun}
            onChange={(e) => updateSyncOptions({ dryRun: e.target.checked })}
            disabled={isDisabled}
          />
        </div>
      </div>

      {/* Exclude Patterns */}
      <ExcludePatterns
        patterns={syncOptions.excludePatterns}
        onChange={(patterns) => updateSyncOptions({ excludePatterns: patterns })}
        disabled={isDisabled}
      />

      {/* Bandwidth Throttling */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <div className="flex items-center gap-2 mb-2">
          <Gauge className="w-4 h-4 text-accent" strokeWidth={1.75} />
          <h3 className="text-[15px] font-semibold text-text-primary">
            {t('options.bandwidthTitle')}
          </h3>
        </div>
        <p className="text-[13px] text-text-tertiary mb-5 leading-relaxed">
          {t('options.bandwidthDesc')}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { value: BANDWIDTH_PRESETS.unlimited, label: t('options.bandwidthUnlimited') },
            { value: BANDWIDTH_PRESETS['1mbps'], label: '1 Mbps' },
            { value: BANDWIDTH_PRESETS['5mbps'], label: '5 Mbps' },
            { value: BANDWIDTH_PRESETS['10mbps'], label: '10 Mbps' },
            { value: BANDWIDTH_PRESETS['50mbps'], label: '50 Mbps' },
            { value: BANDWIDTH_PRESETS['100mbps'], label: '100 Mbps' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateSyncOptions({ bandwidthLimit: option.value })}
              disabled={isDisabled}
              className={clsx(
                'px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                syncOptions.bandwidthLimit === option.value
                  ? 'bg-accent text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:bg-bg-primary hover:text-text-primary',
                isDisabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* After Complete Options */}
      <div className="rounded-3xl bg-bg-secondary border border-border-subtle shadow-xs p-6 md:p-7">
        <div className="flex items-center gap-2 mb-4">
          <Power className="w-4 h-4 text-accent" strokeWidth={1.75} />
          <h3 className="text-[15px] font-semibold text-text-primary">
            {t('options.afterTitle')}
          </h3>
        </div>
        <Toggle
          label={t('options.shutdownLabel')}
          description={t('options.shutdownDesc')}
          checked={syncOptions.shutdownAfterComplete}
          onChange={(e) => updateSyncOptions({ shutdownAfterComplete: e.target.checked })}
          disabled={isDisabled}
        />
      </div>
    </div>
  );
}
