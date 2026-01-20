import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SyncProfile } from '../types';
import { DEFAULT_SYNC_OPTIONS, MAX_SYNC_PROFILES } from '../types';

/**
 * Generates a unique ID for a profile.
 */
function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface ProfilesState {
  profiles: SyncProfile[];
  
  // Actions
  addProfile: (profile: Omit<SyncProfile, 'id' | 'createdAt' | 'lastUsed'>) => SyncProfile | null;
  updateProfile: (id: string, updates: Partial<Omit<SyncProfile, 'id' | 'createdAt'>>) => boolean;
  deleteProfile: (id: string) => void;
  markProfileUsed: (id: string) => void;
  getProfile: (id: string) => SyncProfile | undefined;
  getProfilesByLastUsed: () => SyncProfile[];
}

export const useProfilesStore = create<ProfilesState>()(
  persist(
    (set, get) => ({
      profiles: [],

      addProfile: (profileData) => {
        const state = get();
        
        // Check if we've reached the maximum
        if (state.profiles.length >= MAX_SYNC_PROFILES) {
          return null;
        }

        const newProfile: SyncProfile = {
          id: generateProfileId(),
          name: profileData.name,
          sourcePath: profileData.sourcePath,
          destPath: profileData.destPath,
          options: { ...DEFAULT_SYNC_OPTIONS, ...profileData.options },
          createdAt: new Date(),
          lastUsed: null,
        };

        set((state) => ({
          profiles: [...state.profiles, newProfile],
        }));

        return newProfile;
      },

      updateProfile: (id, updates) => {
        const state = get();
        const profileIndex = state.profiles.findIndex((p) => p.id === id);
        
        if (profileIndex === -1) {
          return false;
        }

        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }));

        return true;
      },

      deleteProfile: (id) => {
        set((state) => ({
          profiles: state.profiles.filter((p) => p.id !== id),
        }));
      },

      markProfileUsed: (id) => {
        set((state) => ({
          profiles: state.profiles.map((p) =>
            p.id === id ? { ...p, lastUsed: new Date() } : p
          ),
        }));
      },

      getProfile: (id) => {
        return get().profiles.find((p) => p.id === id);
      },

      getProfilesByLastUsed: () => {
        return [...get().profiles].sort((a, b) => {
          // Profiles with lastUsed come first, sorted by most recent
          if (a.lastUsed && b.lastUsed) {
            return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
          }
          if (a.lastUsed) return -1;
          if (b.lastUsed) return 1;
          // Fall back to creation date
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      },
    }),
    {
      name: 'rsync-profiles',
      // Handle Date serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          
          try {
            const parsed = JSON.parse(str);
            // Convert date strings back to Date objects
            if (parsed.state?.profiles) {
              parsed.state.profiles = parsed.state.profiles.map((profile: Record<string, unknown>) => ({
                ...profile,
                createdAt: profile.createdAt ? new Date(profile.createdAt as string) : new Date(),
                lastUsed: profile.lastUsed ? new Date(profile.lastUsed as string) : null,
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
 * Hook to get all profiles (raw array, stable reference).
 * For sorted profiles by last used, use useMemo in the component.
 */
export const useProfiles = () => useProfilesStore((state) => state.profiles);

/**
 * Hook to get profile actions.
 * Note: Use useProfilesStore directly for individual actions to avoid re-renders.
 */
export const useProfileActions = () => {
  const addProfile = useProfilesStore((state) => state.addProfile);
  const updateProfile = useProfilesStore((state) => state.updateProfile);
  const deleteProfile = useProfilesStore((state) => state.deleteProfile);
  const markProfileUsed = useProfilesStore((state) => state.markProfileUsed);
  const getProfile = useProfilesStore((state) => state.getProfile);
  
  return { addProfile, updateProfile, deleteProfile, markProfileUsed, getProfile };
};
