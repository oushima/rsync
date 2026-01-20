import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Trash2, 
  Calendar, 
  Clock, 
  CalendarDays,
  CalendarClock,
  AlertCircle,
  Bookmark
} from 'lucide-react';
import clsx from 'clsx';
import { useScheduleStore } from '../../stores/scheduleStore';
import { useProfilesStore } from '../../stores/profilesStore';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Modal } from '../ui/Modal';
import { Toggle } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { MAX_SCHEDULED_SYNCS, type ScheduledSync } from '../../types';

/** Days of the week starting from Sunday (0) */
const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

/** Days of the month (1-31) */
const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

/** Schedule types for the form */
const SCHEDULE_TYPES = ['once', 'daily', 'weekly', 'monthly'] as const;

type ScheduleType = (typeof SCHEDULE_TYPES)[number];

interface ScheduleFormData {
  profileId: string;
  type: ScheduleType;
  time: string;
  dayOfWeek: number;
  dayOfMonth: number;
  date: string;
}

const DEFAULT_FORM_DATA: ScheduleFormData = {
  profileId: '',
  type: 'daily',
  time: '09:00',
  dayOfWeek: 1, // Monday
  dayOfMonth: 1,
  date: new Date().toISOString().split('T')[0],
};

function getScheduleTypeIcon(type: ScheduleType): React.ReactNode {
  switch (type) {
    case 'once':
      return <Calendar className="w-4 h-4" strokeWidth={1.75} />;
    case 'daily':
      return <Clock className="w-4 h-4" strokeWidth={1.75} />;
    case 'weekly':
      return <CalendarDays className="w-4 h-4" strokeWidth={1.75} />;
    case 'monthly':
      return <CalendarClock className="w-4 h-4" strokeWidth={1.75} />;
  }
}

export function ScheduleManager() {
  const { t, i18n } = useTranslation();
  
  // Use individual selectors to avoid creating new objects on each render
  const schedules = useScheduleStore((state) => state.schedules);
  const addSchedule = useScheduleStore((state) => state.addSchedule);
  const deleteSchedule = useScheduleStore((state) => state.deleteSchedule);
  const toggleSchedule = useScheduleStore((state) => state.toggleSchedule);
  
  const profiles = useProfilesStore((state) => state.profiles);
  const getProfile = useProfilesStore((state) => state.getProfile);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ScheduleFormData>(DEFAULT_FORM_DATA);
  const [formError, setFormError] = useState<string | null>(null);

  const isAtLimit = schedules.length >= MAX_SCHEDULED_SYNCS;
  const hasProfiles = profiles.length > 0;

  // Profile options for the select dropdown
  const profileOptions = useMemo(() => 
    profiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
    })),
    [profiles]
  );

  // Schedule type options
  const typeOptions = useMemo(() => 
    SCHEDULE_TYPES.map((type) => ({
      value: type,
      label: t(`schedules.type${type.charAt(0).toUpperCase() + type.slice(1)}`),
    })),
    [t]
  );

  // Day of week options
  const dayOfWeekOptions = useMemo(() => 
    DAYS_OF_WEEK.map((day) => ({
      value: String(day),
      label: t(`schedules.days.${day}`),
    })),
    [t]
  );

  // Day of month options
  const dayOfMonthOptions = useMemo(() => 
    DAYS_OF_MONTH.map((day) => ({
      value: String(day),
      label: String(day),
    })),
    []
  );

  const formatDateTime = useCallback((date: Date | string | null): string => {
    if (!date) return t('schedules.never');
    const dateObj = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(i18n.language === 'nl' ? 'nl-NL' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(dateObj);
  }, [i18n.language, t]);

  const getScheduleDescription = useCallback((schedule: ScheduledSync): string => {
    const timeStr = schedule.time;
    
    switch (schedule.type) {
      case 'once':
        return schedule.date 
          ? `${formatDateTime(schedule.date)} at ${timeStr}`
          : timeStr;
      case 'daily':
        return `${t('schedules.typeDaily')} at ${timeStr}`;
      case 'weekly':
        return schedule.dayOfWeek !== undefined
          ? `${t(`schedules.days.${schedule.dayOfWeek}`)} at ${timeStr}`
          : timeStr;
      case 'monthly':
        return schedule.dayOfMonth !== undefined
          ? `${t('schedules.dayOfMonth')} ${schedule.dayOfMonth} at ${timeStr}`
          : timeStr;
      default:
        return timeStr;
    }
  }, [formatDateTime, t]);

  const handleOpenModal = useCallback(() => {
    setFormData({
      ...DEFAULT_FORM_DATA,
      profileId: profiles[0]?.id || '',
      date: new Date().toISOString().split('T')[0],
    });
    setFormError(null);
    setIsModalOpen(true);
  }, [profiles]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setFormError(null);
  }, []);

  const handleFormChange = useCallback(<K extends keyof ScheduleFormData>(
    field: K,
    value: ScheduleFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    // Validate profile selection
    if (!formData.profileId) {
      setFormError(t('schedules.profile') + ' is required');
      return;
    }

    // Build schedule data based on type
    const scheduleData: Omit<ScheduledSync, 'id' | 'createdAt' | 'lastRun' | 'nextRun'> = {
      profileId: formData.profileId,
      enabled: true,
      type: formData.type,
      time: formData.time,
    };

    // Add type-specific fields
    if (formData.type === 'weekly') {
      scheduleData.dayOfWeek = formData.dayOfWeek;
    } else if (formData.type === 'monthly') {
      scheduleData.dayOfMonth = formData.dayOfMonth;
    } else if (formData.type === 'once') {
      scheduleData.date = formData.date;
    }

    const result = addSchedule(scheduleData);
    
    if (result) {
      handleCloseModal();
    } else {
      setFormError(t('schedules.limitReached', { max: MAX_SCHEDULED_SYNCS }));
    }
  }, [formData, addSchedule, handleCloseModal, t]);

  const handleDelete = useCallback((scheduleId: string) => {
    deleteSchedule(scheduleId);
  }, [deleteSchedule]);

  const handleToggle = useCallback((scheduleId: string) => {
    toggleSchedule(scheduleId);
  }, [toggleSchedule]);

  return (
    <Card variant="default" padding="lg">
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {t('schedules.title')}
            </h2>
            {schedules.length > 0 && (
              <p className="text-sm text-text-tertiary mt-0.5">
                {schedules.length} / {MAX_SCHEDULED_SYNCS}
              </p>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={handleOpenModal}
            disabled={isAtLimit || !hasProfiles}
          >
            {t('schedules.add')}
          </Button>
        </div>

        {/* No profiles warning */}
        {!hasProfiles && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
            <AlertCircle className="w-5 h-5 text-warning shrink-0" />
            <p className="text-sm text-text-secondary">
              {t('profiles.noProfiles')}. Create a profile first to schedule syncs.
            </p>
          </div>
        )}

        {/* Empty state */}
        {hasProfiles && schedules.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center mb-3">
              <CalendarClock className="w-6 h-6 text-text-tertiary" />
            </div>
            <p className="text-text-primary font-medium">{t('schedules.noSchedules')}</p>
            <p className="text-sm text-text-tertiary mt-1">{t('schedules.noSchedulesDesc')}</p>
          </div>
        )}

        {/* Schedule list */}
        <AnimatePresence mode="popLayout">
          {schedules.map((schedule) => {
            const profile = getProfile(schedule.profileId);
            
            return (
              <motion.div
                key={schedule.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                layout
              >
                <div 
                  className={clsx(
                    'p-4 rounded-xl border transition-colors',
                    schedule.enabled 
                      ? 'bg-bg-tertiary border-border' 
                      : 'bg-bg-secondary border-border-subtle opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Schedule info */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={clsx(
                        'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                        schedule.enabled ? 'bg-accent/10 text-accent' : 'bg-bg-quaternary text-text-tertiary'
                      )}>
                        {getScheduleTypeIcon(schedule.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* Profile name */}
                        <div className="flex items-center gap-2">
                          <Bookmark className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                          <p className="text-sm font-medium text-text-primary truncate">
                            {profile?.name || 'Unknown Profile'}
                          </p>
                        </div>
                        
                        {/* Schedule description */}
                        <p className="text-sm text-text-secondary mt-0.5">
                          {getScheduleDescription(schedule)}
                        </p>
                        
                        {/* Next run */}
                        {schedule.nextRun && schedule.enabled && (
                          <p className="text-xs text-text-tertiary mt-1.5 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {t('schedules.nextRun')}: {formatDateTime(schedule.nextRun)}
                          </p>
                        )}
                        
                        {/* Last run */}
                        {schedule.lastRun && (
                          <p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {t('schedules.lastRun')}: {formatDateTime(schedule.lastRun)}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-3 shrink-0">
                      <Toggle
                        size="sm"
                        checked={schedule.enabled}
                        onChange={() => handleToggle(schedule.id)}
                        aria-label={schedule.enabled ? t('schedules.disable') : t('schedules.enable')}
                      />
                      <button
                        onClick={() => handleDelete(schedule.id)}
                        className="p-2 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
                        aria-label={t('schedules.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Limit warning */}
        {isAtLimit && (
          <p className="text-sm text-warning text-center">
            {t('schedules.limitReached', { max: MAX_SCHEDULED_SYNCS })}
          </p>
        )}
      </div>

      {/* Add Schedule Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={t('schedules.add')}
        size="md"
      >
        <div className="flex flex-col gap-5 pt-4">
          {/* Profile Select */}
          <Select
            label={t('schedules.profile')}
            value={formData.profileId}
            onChange={(e) => handleFormChange('profileId', e.target.value)}
            options={profileOptions}
            placeholder={t('schedules.profile')}
          />

          {/* Schedule Type */}
          <Select
            label={t('schedules.type')}
            value={formData.type}
            onChange={(e) => handleFormChange('type', e.target.value as ScheduleType)}
            options={typeOptions}
          />

          {/* Time Input */}
          <Input
            type="time"
            label={t('schedules.time')}
            value={formData.time}
            onChange={(e) => handleFormChange('time', e.target.value)}
          />

          {/* Day of Week (for weekly) */}
          {formData.type === 'weekly' && (
            <Select
              label={t('schedules.dayOfWeek')}
              value={String(formData.dayOfWeek)}
              onChange={(e) => handleFormChange('dayOfWeek', parseInt(e.target.value, 10))}
              options={dayOfWeekOptions}
            />
          )}

          {/* Day of Month (for monthly) */}
          {formData.type === 'monthly' && (
            <Select
              label={t('schedules.dayOfMonth')}
              value={String(formData.dayOfMonth)}
              onChange={(e) => handleFormChange('dayOfMonth', parseInt(e.target.value, 10))}
              options={dayOfMonthOptions}
            />
          )}

          {/* Date (for once) */}
          {formData.type === 'once' && (
            <Input
              type="date"
              label={t('schedules.date')}
              value={formData.date}
              onChange={(e) => handleFormChange('date', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
            />
          )}

          {/* Error message */}
          {formError && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-error/10 border border-error/20">
              <AlertCircle className="w-4 h-4 text-error shrink-0" />
              <p className="text-sm text-error">{formError}</p>
            </div>
          )}

          {/* Form actions */}
          <div className="flex gap-3 mt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleCloseModal}
            >
              {t('progress.confirmNo')}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleSubmit}
            >
              {t('schedules.add')}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
