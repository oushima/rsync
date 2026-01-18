import { useEffect, useRef, useCallback } from 'react';
import { useSyncStore } from '../stores/syncStore';

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
