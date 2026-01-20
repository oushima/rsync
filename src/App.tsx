import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useCallback } from 'react';
import { useSyncStore } from './stores/syncStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTheme } from './hooks/useTheme';
import { useSync } from './hooks/useSync';
import { useDragDropManager } from './hooks/useDragDrop';
import { useScheduleRunner } from './hooks/useScheduleRunner';
import { useTray, type TrayStatus } from './hooks/useTray';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DropZone } from './components/sync/DropZone';
import { ErrorBanner } from './components/sync/ErrorBanner';
import { FileList } from './components/sync/FileList';
import { OutputSelector } from './components/sync/OutputSelector';
import { TransferProgress } from './components/sync/TransferProgress';
import { TransferQueue } from './components/sync/TransferQueue';
import { SourceMissingModal } from './components/sync/SourceMissingModal';
import { InsufficientSpaceModal } from './components/sync/InsufficientSpaceModal';
import { ConflictDialog } from './components/sync/ConflictDialog';
import { HistoryPanel } from './components/sync/HistoryPanel';
import { SettingsPanel } from './components/settings/SettingsPanel';
import { VerificationErrorModal } from './components/sync/VerificationErrorModal';
import { ShutdownCountdownModal } from './components/sync/ShutdownCountdownModal';
import { ProfileSelector } from './components/sync/ProfileSelector';
import { NotificationCenter } from './components/notifications/NotificationCenter';
import { ResumeTransferPanel } from './components/sync/ResumeTransferPanel';
import type { VerificationErrorDisplay, VerificationErrorReason, SyncState } from './types';

function SyncPage() {
  return (
    <div className="flex flex-col gap-8 h-full">
      {/* Error Banner */}
      <ErrorBanner />

      {/* Resume Transfer Panel - shows interrupted transfers */}
      <ResumeTransferPanel />

      {/* Profile Selector */}
      <div className="flex justify-end">
        <ProfileSelector />
      </div>
      
      {/* Source and Destination zones side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <DropZone />
        <OutputSelector />
      </div>
      
      {/* File list */}
      <FileList />

      {/* Progress at bottom */}
      <TransferProgress />

      {/* Transfer Queue */}
      <TransferQueue />
    </div>
  );
}

function App() {
  const { 
    currentPage, 
    insufficientSpaceError, 
    hideInsufficientSpaceError,
    verificationErrors,
    showVerificationErrors,
    setShowVerificationErrors,
    clearVerificationErrors,
    syncState,
    pauseSync,
    resumeSync,
  } = useSyncStore();
  const { language } = useSettingsStore();
  const { 
    sourceMissingError, 
    handleRemoveErroredFromQueue, 
    handleRetryLater,
    selectDestFolder,
    shutdownState,
    cancelShutdown,
    executeShutdown,
    dismissShutdownError,
    retryVerificationError,
    retryAllVerificationErrors,
  } = useSync();
  
  // Initialize theme
  useTheme();
  
  // Initialize global drag-drop event manager
  useDragDropManager();

  // Initialize schedule runner for automatic scheduled syncs
  useScheduleRunner();

  // Convert SyncState to TrayStatus
  const mapSyncStateToTrayStatus = useCallback((state: SyncState): TrayStatus => {
    switch (state) {
      case 'syncing':
      case 'preparing':
        return 'syncing';
      case 'paused':
        return 'paused';
      case 'error':
        return 'error';
      case 'idle':
      case 'completed':
      case 'cancelled':
      default:
        return 'idle';
    }
  }, []);

  // Handle tray menu actions
  const handleTrayPauseSync = useCallback(() => {
    if (syncState === 'syncing') {
      pauseSync();
    }
  }, [syncState, pauseSync]);

  const handleTrayResumeSync = useCallback(() => {
    if (syncState === 'paused') {
      resumeSync();
    }
  }, [syncState, resumeSync]);

  // Initialize tray integration
  const { updateStatus } = useTray({
    onPauseSync: handleTrayPauseSync,
    onResumeSync: handleTrayResumeSync,
  });

  // Update tray status when sync state changes
  useEffect(() => {
    const trayStatus = mapSyncStateToTrayStatus(syncState);
    updateStatus(trayStatus);
  }, [syncState, mapSyncStateToTrayStatus, updateStatus]);

  /**
   * Transforms store verification errors to display format for the modal.
   * Maps checksum mismatches and other error types to user-friendly categories.
   */
  const transformVerificationErrors = (): VerificationErrorDisplay[] => {
    return verificationErrors.map((error) => {
      // Determine reason based on error characteristics
      let reason: VerificationErrorReason = 'unknown';
      
      if (error.sourceChecksum !== error.destChecksum) {
        reason = 'checksum_mismatch';
      }
      // Additional reason detection can be added here based on error properties
      
      // Extract file name from path
      const pathParts = error.filePath.split('/');
      const fileName = pathParts[pathParts.length - 1] || error.filePath;
      
      return {
        fileName,
        filePath: error.filePath,
        reason,
        canRetry: !error.repairAttempted || !error.repairSuccessful,
      };
    });
  };

  const handleVerificationRetry = async (filePath: string) => {
    try {
      await retryVerificationError(filePath);
    } catch (error) {
      console.error('Failed to retry verification for file:', filePath, error);
    }
  };

  const handleVerificationRetryAll = async () => {
    try {
      await retryAllVerificationErrors();
    } catch (error) {
      console.error('Failed to retry all verification errors:', error);
    }
  };

  const handleVerificationSkipAll = () => {
    clearVerificationErrors();
    setShowVerificationErrors(false);
  };

  const handleVerificationClose = () => {
    setShowVerificationErrors(false);
  };

  const pageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden bg-bg-secondary p-3 gap-3">
      {/* Sidebar */}
      <Sidebar language={language} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-2xl bg-bg-primary shadow-sm">
        <Header />

        {/* Page Content */}
        <main className="flex-1 overflow-auto px-6 py-8 sm:px-8 sm:py-10 md:px-12 md:py-12">
          <div className="w-full max-w-300 2xl:max-w-350 mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentPage}
                  variants={pageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="h-full"
                >
                  {currentPage === 'sync' && <SyncPage />}
                  {currentPage === 'history' && <HistoryPanel />}
                  {currentPage === 'settings' && <SettingsPanel />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Conflict Dialog */}
        <ConflictDialog />

        {/* Source Missing Error Modal */}
        <SourceMissingModal
          isOpen={sourceMissingError.isOpen}
          queueItem={sourceMissingError.queueItem}
          onRemove={handleRemoveErroredFromQueue}
          onRetryLater={handleRetryLater}
        />

        {/* Insufficient Space Modal */}
        {insufficientSpaceError && (
          <InsufficientSpaceModal
            isOpen={insufficientSpaceError.isOpen}
            onClose={hideInsufficientSpaceError}
            onSelectNewDestination={selectDestFolder}
            requiredSpace={insufficientSpaceError.requiredSpace}
            availableSpace={insufficientSpaceError.availableSpace}
            destinationPath={insufficientSpaceError.destinationPath}
            destinationName={insufficientSpaceError.destinationName}
          />
        )}

        {/* Verification Error Modal */}
        <VerificationErrorModal
          isOpen={showVerificationErrors && verificationErrors.length > 0}
          onClose={handleVerificationClose}
          errors={transformVerificationErrors()}
          onRetry={handleVerificationRetry}
          onRetryAll={handleVerificationRetryAll}
          onSkipAll={handleVerificationSkipAll}
        />

        {/* Shutdown Countdown Modal */}
        <ShutdownCountdownModal
          isOpen={shutdownState.isOpen}
          onCancel={shutdownState.error ? dismissShutdownError : cancelShutdown}
          onComplete={executeShutdown}
          isInitiating={shutdownState.isInitiating}
          error={shutdownState.error}
        />

        {/* Notification Center */}
        <NotificationCenter />
      </div>
    </ErrorBoundary>
  );
}

export default App;
