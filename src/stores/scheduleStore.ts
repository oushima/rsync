import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScheduledSync } from '../types';
import { MAX_SCHEDULED_SYNCS } from '../types';

/**
 * Generates a unique ID for a scheduled sync.
 */
function generateScheduleId(): string {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Calculates the next run date based on schedule configuration.
 * Uses pure date arithmetic - no intervals or magic numbers.
 */
function calculateNextRun(schedule: Omit<ScheduledSync, 'id' | 'createdAt' | 'lastRun' | 'nextRun'>): Date | null {
  if (!schedule.enabled) return null;
  
  const now = new Date();
  const [hours, minutes] = schedule.time.split(':').map(Number);
  
  switch (schedule.type) {
    case 'once': {
      if (!schedule.date) return null;
      const date = new Date(schedule.date);
      date.setHours(hours, minutes, 0, 0);
      // If the date is in the past, return null
      return date > now ? date : null;
    }
    
    case 'daily': {
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      // If we've passed today's time, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    }
    
    case 'weekly': {
      if (schedule.dayOfWeek === undefined) return null;
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      const currentDay = next.getDay();
      let daysUntil = schedule.dayOfWeek - currentDay;
      if (daysUntil < 0 || (daysUntil === 0 && next <= now)) {
        daysUntil += 7;
      }
      next.setDate(next.getDate() + daysUntil);
      return next;
    }
    
    case 'monthly': {
      if (schedule.dayOfMonth === undefined) return null;
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      next.setDate(schedule.dayOfMonth);
      // If we've passed this month's date, go to next month
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        next.setDate(schedule.dayOfMonth);
      }
      return next;
    }
    
    default:
      return null;
  }
}

interface ScheduleState {
  schedules: ScheduledSync[];
  
  // Actions
  addSchedule: (schedule: Omit<ScheduledSync, 'id' | 'createdAt' | 'lastRun' | 'nextRun'>) => ScheduledSync | null;
  updateSchedule: (id: string, updates: Partial<Omit<ScheduledSync, 'id' | 'createdAt'>>) => boolean;
  deleteSchedule: (id: string) => void;
  toggleSchedule: (id: string) => void;
  markScheduleRun: (id: string) => void;
  getSchedule: (id: string) => ScheduledSync | undefined;
  getDueSchedules: () => ScheduledSync[];
  recalculateAllNextRuns: () => void;
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      schedules: [],

      addSchedule: (scheduleData) => {
        const state = get();
        
        if (state.schedules.length >= MAX_SCHEDULED_SYNCS) {
          return null;
        }

        const nextRun = calculateNextRun(scheduleData);
        
        const newSchedule: ScheduledSync = {
          id: generateScheduleId(),
          profileId: scheduleData.profileId,
          enabled: scheduleData.enabled,
          type: scheduleData.type,
          time: scheduleData.time,
          dayOfWeek: scheduleData.dayOfWeek,
          dayOfMonth: scheduleData.dayOfMonth,
          date: scheduleData.date,
          lastRun: null,
          nextRun,
          createdAt: new Date(),
        };

        set((state) => ({
          schedules: [...state.schedules, newSchedule],
        }));

        return newSchedule;
      },

      updateSchedule: (id, updates) => {
        const state = get();
        const scheduleIndex = state.schedules.findIndex((s) => s.id === id);
        
        if (scheduleIndex === -1) {
          return false;
        }

        set((state) => ({
          schedules: state.schedules.map((s) => {
            if (s.id !== id) return s;
            const updated = { ...s, ...updates };
            // Recalculate next run if schedule parameters changed
            if (
              updates.enabled !== undefined ||
              updates.type !== undefined ||
              updates.time !== undefined ||
              updates.dayOfWeek !== undefined ||
              updates.dayOfMonth !== undefined ||
              updates.date !== undefined
            ) {
              updated.nextRun = calculateNextRun(updated);
            }
            return updated;
          }),
        }));

        return true;
      },

      deleteSchedule: (id) => {
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        }));
      },

      toggleSchedule: (id) => {
        set((state) => ({
          schedules: state.schedules.map((s) => {
            if (s.id !== id) return s;
            const updated = { ...s, enabled: !s.enabled };
            updated.nextRun = calculateNextRun(updated);
            return updated;
          }),
        }));
      },

      markScheduleRun: (id) => {
        const now = new Date();
        set((state) => ({
          schedules: state.schedules.map((s) => {
            if (s.id !== id) return s;
            const updated = { ...s, lastRun: now };
            // For 'once' schedules, disable after running
            if (s.type === 'once') {
              updated.enabled = false;
              updated.nextRun = null;
            } else {
              updated.nextRun = calculateNextRun(updated);
            }
            return updated;
          }),
        }));
      },

      getSchedule: (id) => {
        return get().schedules.find((s) => s.id === id);
      },

      getDueSchedules: () => {
        const now = new Date();
        return get().schedules.filter((s) => 
          s.enabled && s.nextRun && new Date(s.nextRun) <= now
        );
      },

      recalculateAllNextRuns: () => {
        set((state) => ({
          schedules: state.schedules.map((s) => ({
            ...s,
            nextRun: calculateNextRun(s),
          })),
        }));
      },
    }),
    {
      name: 'rsync-schedules',
      // Handle Date serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          
          try {
            const parsed = JSON.parse(str);
            if (parsed.state?.schedules) {
              parsed.state.schedules = parsed.state.schedules.map((schedule: Record<string, unknown>) => ({
                ...schedule,
                createdAt: schedule.createdAt ? new Date(schedule.createdAt as string) : new Date(),
                lastRun: schedule.lastRun ? new Date(schedule.lastRun as string) : null,
                nextRun: schedule.nextRun ? new Date(schedule.nextRun as string) : null,
              }));
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);

/**
 * Hook to get all schedules sorted by next run.
 */
export const useSchedules = () => useScheduleStore((state) => 
  [...state.schedules].sort((a, b) => {
    if (!a.nextRun && !b.nextRun) return 0;
    if (!a.nextRun) return 1;
    if (!b.nextRun) return -1;
    return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
  })
);

/**
 * Hook to get schedule actions.
 */
export const useScheduleActions = () => useScheduleStore((state) => ({
  addSchedule: state.addSchedule,
  updateSchedule: state.updateSchedule,
  deleteSchedule: state.deleteSchedule,
  toggleSchedule: state.toggleSchedule,
  markScheduleRun: state.markScheduleRun,
  getDueSchedules: state.getDueSchedules,
  recalculateAllNextRuns: state.recalculateAllNextRuns,
}));
