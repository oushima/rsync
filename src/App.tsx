import { AnimatePresence, motion } from 'framer-motion';
import { useSyncStore } from './stores/syncStore';
import { useSettingsStore } from './stores/settingsStore';
import { useTheme } from './hooks/useTheme';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DropZone } from './components/sync/DropZone';
import { FileList } from './components/sync/FileList';
import { OutputSelector } from './components/sync/OutputSelector';
import { TransferProgress } from './components/sync/TransferProgress';

import { ConflictDialog } from './components/sync/ConflictDialog';
import { HistoryPanel } from './components/sync/HistoryPanel';
import { SettingsPanel } from './components/settings/SettingsPanel';

function SyncPage() {
  return (
    <div className="flex flex-col gap-8 h-full">
      {/* Drop zone for adding files */}
      <DropZone />
      
      {/* File list */}
      <FileList />

      {/* Output destination selector */}
      <OutputSelector />

      {/* Progress at bottom */}
      <TransferProgress />
    </div>
  );
}

function App() {
  const { currentPage } = useSyncStore();
  const { language } = useSettingsStore();
  
  // Initialize theme
  useTheme();

  const pageVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  return (
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
    </div>
  );
}

export default App;
