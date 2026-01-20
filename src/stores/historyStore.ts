import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TransferHistoryItem } from '../types';

/**
 * Maximum number of history items to retain.
 * Prevents storage bloat while maintaining useful history.
 */
const MAX_HISTORY_ITEMS = 100;

/**
 * Serialized format of TransferHistoryItem for storage.
 * Dates are stored as ISO strings since localStorage cannot serialize Date objects.
 */
interface SerializedHistoryItem extends Omit<TransferHistoryItem, 'timestamp'> {
  timestamp: string;
}

interface HistoryState {
  /** Transfer history items, ordered newest first */
  history: TransferHistoryItem[];
  
  /**
   * Add a new history item to the store.
   * Automatically enforces MAX_HISTORY_ITEMS limit by removing oldest entries.
   * @param item - The transfer history item to add
   */
  addHistoryItem: (item: TransferHistoryItem) => void;
  
  /**
   * Add a new history item using partial data, auto-generating ID and timestamp.
   * Useful for creating history entries without manual ID/timestamp management.
   * @param data - Partial history data (id and timestamp are optional)
   */
  addHistoryEntry: (data: Omit<TransferHistoryItem, 'id' | 'timestamp'> & { id?: string; timestamp?: Date }) => void;
  
  /**
   * Remove a specific history item by ID.
   * @param id - The ID of the history item to remove
   */
  removeHistoryItem: (id: string) => void;
  
  /**
   * Clear all history items.
   */
  clearHistory: () => void;
  
  /**
   * Get history items filtered by status.
   * @param status - The status to filter by
   */
  getHistoryByStatus: (status: TransferHistoryItem['status']) => TransferHistoryItem[];
  
  /**
   * Get the total count of history items.
   */
  getHistoryCount: () => number;
}

/**
 * Persisted store for transfer history.
 * 
 * Uses Zustand's persist middleware with localStorage.
 * Handles Date serialization/deserialization automatically.
 * Enforces a maximum of 100 items to prevent storage bloat.
 */
export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      history: [],

      addHistoryItem: (item) =>
        set((state) => {
          // Prepend new item and enforce limit
          const newHistory = [item, ...state.history].slice(0, MAX_HISTORY_ITEMS);
          return { history: newHistory };
        }),

      addHistoryEntry: (data) => {
        const item: TransferHistoryItem = {
          id: data.id ?? crypto.randomUUID(),
          timestamp: data.timestamp ?? new Date(),
          sourcePath: data.sourcePath,
          destPath: data.destPath,
          filesCount: data.filesCount,
          totalSize: data.totalSize,
          duration: data.duration,
          status: data.status,
          errorMessage: data.errorMessage,
        };
        get().addHistoryItem(item);
      },

      removeHistoryItem: (id) =>
        set((state) => ({
          history: state.history.filter((item) => item.id !== id),
        })),

      clearHistory: () => set({ history: [] }),

      getHistoryByStatus: (status) => {
        return get().history.filter((item) => item.status === status);
      },

      getHistoryCount: () => {
        return get().history.length;
      },
    }),
    {
      name: 'rsync-history',
      
      /**
       * Custom storage configuration to handle Date serialization.
       * Dates are stored as ISO strings and parsed back to Date objects on load.
       */
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          
          try {
            const parsed = JSON.parse(str);
            
            // Deserialize: Convert ISO strings back to Date objects
            if (parsed.state?.history) {
              parsed.state.history = parsed.state.history.map((item: SerializedHistoryItem): TransferHistoryItem => ({
                ...item,
                timestamp: new Date(item.timestamp),
              }));
            }
            
            return parsed;
          } catch {
            // If parsing fails, return null to use default state
            return null;
          }
        },
        
        setItem: (name, value) => {
          // Serialize: Convert Date objects to ISO strings
          const serialized = {
            ...value,
            state: {
              ...value.state,
              history: value.state.history.map((item: TransferHistoryItem): SerializedHistoryItem => ({
                ...item,
                timestamp: item.timestamp instanceof Date 
                  ? item.timestamp.toISOString() 
                  : item.timestamp,
              })),
            },
          };
          
          localStorage.setItem(name, JSON.stringify(serialized));
        },
        
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
      
      /**
       * Version for migration support.
       * Increment when making breaking changes to the storage schema.
       */
      version: 1,
      
      /**
       * Migration function for handling schema changes between versions.
       */
      migrate: (persistedState, _version) => {
        // Currently at version 1, no migrations needed
        // Future migrations would go here:
        // if (_version === 0) {
        //   // Migrate from version 0 to 1
        // }
        return persistedState as HistoryState;
      },

      /**
       * Only persist the history array, not the action functions.
       */
      partialize: (state) => ({ history: state.history }) as HistoryState,
    }
  )
);

/**
 * Hook to access history with automatic re-render on changes.
 * This is a convenience alias for consistency with other stores.
 */
export const useTransferHistory = () => useHistoryStore((state) => state.history);

/**
 * Selector hooks for common patterns.
 */
export const useHistoryActions = () => useHistoryStore((state) => ({
  addHistoryItem: state.addHistoryItem,
  addHistoryEntry: state.addHistoryEntry,
  removeHistoryItem: state.removeHistoryItem,
  clearHistory: state.clearHistory,
}));
