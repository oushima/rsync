import { useEffect, useRef, useCallback, useState } from 'react';
import { useSyncStore } from '../stores/syncStore';
import { getActiveTransfers, getTransferState, isTauriApp } from '../utils/tauriCommands';
import type { TransferState } from '../types';

export function useTransferState() {
  const {
    syncState,
    transferStats,
    updateTransferStats,
  } = useSyncStore();

  const speedSamplesRef = useRef<number[]>([]);
  const lastBytesRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(Date.now());

  // Calculate real-time speed with smoothing
  const updateSpeed = useCallback(() => {
    const now = Date.now();
    const elapsed = (now - lastTimeRef.current) / 1000;
    
    if (elapsed > 0) {
      const bytesDelta = transferStats.transferredBytes - lastBytesRef.current;
      const instantSpeed = bytesDelta / elapsed;
      
      // Keep last 10 samples for smoothing
      speedSamplesRef.current.push(instantSpeed);
      if (speedSamplesRef.current.length > 10) {
        speedSamplesRef.current.shift();
      }
      
      // Calculate smoothed speed
      const smoothedSpeed = speedSamplesRef.current.reduce((a, b) => a + b, 0) / speedSamplesRef.current.length;
      
      // Calculate ETA
      const remainingBytes = transferStats.totalBytes - transferStats.transferredBytes;
      const eta = smoothedSpeed > 0 ? remainingBytes / smoothedSpeed : null;
      
      updateTransferStats({
        currentSpeed: smoothedSpeed,
        estimatedTimeRemaining: eta,
      });
    }
    
    lastBytesRef.current = transferStats.transferredBytes;
    lastTimeRef.current = now;
  }, [transferStats.transferredBytes, transferStats.totalBytes, updateTransferStats]);

  // Update speed periodically during sync
  useEffect(() => {
    if (syncState !== 'syncing') return;
    
    const interval = setInterval(updateSpeed, 500);
    return () => clearInterval(interval);
  }, [syncState, updateSpeed]);

  // Reset speed tracking when sync starts
  useEffect(() => {
    if (syncState === 'preparing') {
      speedSamplesRef.current = [];
      lastBytesRef.current = 0;
      lastTimeRef.current = Date.now();
    }
  }, [syncState]);

  const getProgressPercentage = useCallback((): number => {
    if (transferStats.totalBytes === 0) return 0;
    return Math.round((transferStats.transferredBytes / transferStats.totalBytes) * 100);
  }, [transferStats.transferredBytes, transferStats.totalBytes]);

  const getFileProgressPercentage = useCallback((): number => {
    if (transferStats.totalFiles === 0) return 0;
    return Math.round((transferStats.completedFiles / transferStats.totalFiles) * 100);
  }, [transferStats.completedFiles, transferStats.totalFiles]);

  const getElapsedTime = useCallback((): number => {
    if (!transferStats.startTime) return 0;
    return (Date.now() - transferStats.startTime.getTime()) / 1000;
  }, [transferStats.startTime]);

  return {
    transferStats,
    progressPercentage: getProgressPercentage(),
    fileProgressPercentage: getFileProgressPercentage(),
    elapsedTime: getElapsedTime(),
    isTransferring: syncState === 'syncing',
    isPaused: syncState === 'paused',
    isComplete: syncState === 'completed',
  };
}

/**
 * Hook for polling backend transfer state.
 * 
 * This provides an alternative to the event-based updates for scenarios where:
 * - Components mount after a transfer is already in progress
 * - Need to verify UI state matches backend state
 * - Want to display multiple active transfers from the sync engine
 * 
 * @param options Configuration options
 * @returns Active transfers from the backend
 */
export function useBackendTransferState(options: {
  /** Whether polling is enabled (default: true when syncing) */
  enabled?: boolean;
  /** Polling interval in ms (default: 1000) */
  intervalMs?: number;
} = {}) {
  const { syncState, transferId } = useSyncStore();
  const { enabled = syncState === 'syncing', intervalMs = 1000 } = options;
  
  const [activeTransfers, setActiveTransfers] = useState<TransferState[]>([]);
  const [currentTransfer, setCurrentTransfer] = useState<TransferState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch all active transfers
  const fetchActiveTransfers = useCallback(async () => {
    if (!isTauriApp()) return;
    
    try {
      const transfers = await getActiveTransfers();
      setActiveTransfers(transfers);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  // Fetch specific transfer by ID
  const fetchTransferState = useCallback(async (id: string) => {
    if (!isTauriApp()) return null;
    
    try {
      const state = await getTransferState(id);
      return state;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }, []);

  // Poll for active transfers when enabled
  useEffect(() => {
    if (!enabled || !isTauriApp()) {
      setActiveTransfers([]);
      return;
    }

    setIsLoading(true);
    fetchActiveTransfers().finally(() => setIsLoading(false));

    const intervalId = setInterval(fetchActiveTransfers, intervalMs);
    return () => clearInterval(intervalId);
  }, [enabled, intervalMs, fetchActiveTransfers]);

  // Fetch current transfer state when transferId changes
  useEffect(() => {
    if (!transferId || !isTauriApp()) {
      setCurrentTransfer(null);
      return;
    }

    const fetchCurrent = async () => {
      const state = await fetchTransferState(transferId);
      setCurrentTransfer(state);
    };

    fetchCurrent();
  }, [transferId, fetchTransferState]);

  return {
    /** All active transfers from the backend */
    activeTransfers,
    /** Current transfer state (if transferId is set) */
    currentTransfer,
    /** Whether initial load is in progress */
    isLoading,
    /** Last error encountered */
    error,
    /** Manually refresh active transfers */
    refresh: fetchActiveTransfers,
    /** Fetch a specific transfer's state */
    getTransfer: fetchTransferState,
  };
}
