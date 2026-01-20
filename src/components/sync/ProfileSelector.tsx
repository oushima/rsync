import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkPlus, ChevronDown, Bookmark, Trash2, Edit2, Check, X, Clock } from 'lucide-react';
import clsx from 'clsx';
import { useProfilesStore, useProfiles } from '../../stores/profilesStore';
import { useSyncStore } from '../../stores/syncStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { MAX_SYNC_PROFILES } from '../../types';

/**
 * Sorts profiles by last used (most recent first), then by creation date.
 */
function sortProfilesByLastUsed<T extends { lastUsed: Date | null; createdAt: Date }>(profiles: T[]): T[] {
  return [...profiles].sort((a, b) => {
    if (a.lastUsed && b.lastUsed) {
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    }
    if (a.lastUsed) return -1;
    if (b.lastUsed) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function ProfileSelector() {
  const { t, i18n } = useTranslation();
  const rawProfiles = useProfiles();
  const { addProfile, deleteProfile, markProfileUsed, updateProfile } = useProfilesStore();
  const { sourcePath, destPath, setSourcePath, setDestPath } = useSyncStore();
  const { defaultSyncOptions, updateSyncOptions } = useSettingsStore();
  
  // Sort profiles in a stable way using useMemo
  const profiles = useMemo(() => sortProfilesByLastUsed(rawProfiles), [rawProfiles]);
  
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setEditingId(null);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus input when save dialog opens
  useEffect(() => {
    if (showSaveDialog && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showSaveDialog]);

  const canSaveProfile = sourcePath && destPath;
  const isAtLimit = profiles.length >= MAX_SYNC_PROFILES;

  const handleSaveProfile = useCallback(() => {
    if (!profileName.trim()) {
      setError(t('profiles.nameRequired'));
      return;
    }
    if (!sourcePath || !destPath) {
      setError(t('profiles.pathsRequired'));
      return;
    }

    const result = addProfile({
      name: profileName.trim(),
      sourcePath,
      destPath,
      options: defaultSyncOptions,
    });

    if (result) {
      setProfileName('');
      setShowSaveDialog(false);
      setError(null);
    } else {
      setError(t('profiles.limitReached', { max: MAX_SYNC_PROFILES }));
    }
  }, [profileName, sourcePath, destPath, defaultSyncOptions, addProfile, t]);

  const handleLoadProfile = useCallback((profileId: string) => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    setSourcePath(profile.sourcePath);
    setDestPath(profile.destPath);
    updateSyncOptions(profile.options);
    markProfileUsed(profileId);
    setIsOpen(false);
  }, [profiles, setSourcePath, setDestPath, updateSyncOptions, markProfileUsed]);

  const handleDeleteProfile = useCallback((profileId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteProfile(profileId);
  }, [deleteProfile]);

  const handleStartEdit = useCallback((profileId: string, currentName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingId(profileId);
    setEditingName(currentName);
  }, []);

  const handleSaveEdit = useCallback((profileId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (editingName.trim()) {
      updateProfile(profileId, { name: editingName.trim() });
    }
    setEditingId(null);
  }, [editingName, updateProfile]);

  const handleCancelEdit = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingId(null);
  }, []);

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date instanceof Date ? date : new Date(date));
  };

  return (
    <div className="flex items-center gap-2">
      {/* Profiles Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          leftIcon={<Bookmark className="w-4 h-4" />}
          rightIcon={<ChevronDown className={clsx('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />}
          disabled={profiles.length === 0}
        >
          {t('profiles.title')}
          {profiles.length > 0 && (
            <span className="ml-1 text-xs text-text-tertiary">({profiles.length})</span>
          )}
        </Button>

        <AnimatePresence>
          {isOpen && profiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-2 w-80 max-h-80 overflow-y-auto bg-bg-primary border border-border rounded-xl shadow-lg z-50"
            >
              <div className="p-2 space-y-1">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    onClick={() => editingId !== profile.id && handleLoadProfile(profile.id)}
                    className={clsx(
                      'px-3 py-2.5 rounded-lg transition-colors',
                      editingId === profile.id ? 'bg-bg-tertiary' : 'hover:bg-bg-secondary cursor-pointer'
                    )}
                  >
                    {editingId === profile.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 px-2 py-1 text-sm bg-bg-primary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(profile.id, e as unknown as React.MouseEvent);
                            if (e.key === 'Escape') handleCancelEdit(e as unknown as React.MouseEvent);
                          }}
                          autoFocus
                        />
                        <button
                          onClick={(e) => handleSaveEdit(profile.id, e)}
                          className="p-1 rounded hover:bg-success/10 text-success"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 rounded hover:bg-bg-secondary text-text-tertiary"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">
                            {profile.name}
                          </p>
                          <p className="text-xs text-text-tertiary truncate mt-0.5">
                            {profile.sourcePath.split('/').pop()} → {profile.destPath.split('/').pop()}
                          </p>
                          {profile.lastUsed && (
                            <p className="text-xs text-text-tertiary flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(profile.lastUsed)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => handleStartEdit(profile.id, profile.name, e)}
                            className="p-1.5 rounded-lg hover:bg-bg-tertiary text-text-tertiary hover:text-text-primary transition-colors"
                            title={t('profiles.rename')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteProfile(profile.id, e)}
                            className="p-1.5 rounded-lg hover:bg-error/10 text-text-tertiary hover:text-error transition-colors"
                            title={t('profiles.delete')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Save Profile Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowSaveDialog(true)}
        disabled={!canSaveProfile || isAtLimit}
        leftIcon={<BookmarkPlus className="w-4 h-4" />}
        title={isAtLimit ? t('profiles.limitReached', { max: MAX_SYNC_PROFILES }) : undefined}
      >
        {t('profiles.save')}
      </Button>

      {/* Save Profile Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => { setShowSaveDialog(false); setError(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-bg-primary rounded-2xl border border-border shadow-xl p-6 w-full max-w-md mx-4"
            >
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                {t('profiles.saveTitle')}
              </h3>
              
              <Input
                ref={inputRef}
                label={t('profiles.nameLabel')}
                placeholder={t('profiles.namePlaceholder')}
                value={profileName}
                onChange={(e) => { setProfileName(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveProfile()}
                error={error || undefined}
              />

              <div className="mt-4 p-3 rounded-lg bg-bg-secondary text-sm">
                <p className="text-text-tertiary">{t('profiles.willSave')}</p>
                <p className="text-text-primary truncate mt-1">{sourcePath}</p>
                <p className="text-text-tertiary mt-1">→</p>
                <p className="text-text-primary truncate">{destPath}</p>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <Button
                  variant="ghost"
                  onClick={() => { setShowSaveDialog(false); setError(null); setProfileName(''); }}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSaveProfile}
                  disabled={!profileName.trim()}
                >
                  {t('profiles.saveButton')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
