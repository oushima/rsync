import { useEffect, useRef } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen, TauriEvent } from '@tauri-apps/api/event';
import { useSyncStore } from '../stores/syncStore';

/**
 * Global drag-drop state manager.
 * Using a class to encapsulate mutable state instead of module-level let variables.
 * This prevents issues with HMR and ensures proper cleanup.
 */
class DragDropState {
  private dropCallbacks = new Map<string, (paths: string[]) => void>();
  private pendingDrop: { paths: string[]; x: number; y: number } | null = null;
  private setupDone = false;
  private unlisteners: Array<() => void> = [];

  registerCallback(zoneId: string, callback: (paths: string[]) => void) {
    this.dropCallbacks.set(zoneId, callback);
  }

  unregisterCallback(zoneId: string) {
    this.dropCallbacks.delete(zoneId);
  }

  hasCallback(zoneId: string): boolean {
    return this.dropCallbacks.has(zoneId);
  }

  getCallback(zoneId: string) {
    return this.dropCallbacks.get(zoneId);
  }

  setPendingDrop(drop: { paths: string[]; x: number; y: number } | null) {
    this.pendingDrop = drop;
  }

  processPendingDrop = () => {
    if (!this.pendingDrop) return;
    
    const { paths, x, y } = this.pendingDrop;
    this.pendingDrop = null;
    
    const zones = document.querySelectorAll('[data-dropzone]');
    for (const zone of zones) {
      const rect = zone.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        const zoneId = zone.getAttribute('data-dropzone');
        if (zoneId && this.hasCallback(zoneId)) {
          this.getCallback(zoneId)!(paths);
        }
        break;
      }
    }
  };

  isSetupDone(): boolean {
    return this.setupDone;
  }

  markSetupDone() {
    this.setupDone = true;
  }

  addUnlistener(unlisten: () => void) {
    this.unlisteners.push(unlisten);
  }

  cleanup() {
    this.setupDone = false;
    this.unlisteners.forEach(u => u());
    this.unlisteners = [];
  }
}

// Single instance for the application lifecycle
const dragDropState = new DragDropState();

// HMR cleanup to prevent listener accumulation during development
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    dragDropState.cleanup();
  });
}

export function useDropZone(
  zoneId: string,
  onDrop: (paths: string[]) => void
) {
  const ref = useRef<HTMLDivElement>(null);
  const { isDraggingFiles, dragPosition } = useSyncStore();
  
  const callbackRef = useRef(onDrop);
  callbackRef.current = onDrop;

  useEffect(() => {
    dragDropState.registerCallback(zoneId, (paths) => callbackRef.current(paths));
    return () => { dragDropState.unregisterCallback(zoneId); };
  }, [zoneId]);

  let isHovered = false;
  if (isDraggingFiles && dragPosition && ref.current) {
    const rect = ref.current.getBoundingClientRect();
    isHovered = (
      dragPosition.x >= rect.left &&
      dragPosition.x <= rect.right &&
      dragPosition.y >= rect.top &&
      dragPosition.y <= rect.bottom
    );
  }

  return { ref, isHovered, isDraggingFiles };
}

export function useDragDropManager() {
  useEffect(() => {
    if (!isTauri() || dragDropState.isSetupDone()) return;
    dragDropState.markSetupDone();

    listen<{ paths: string[]; position: { x: number; y: number } }>(
      TauriEvent.DRAG_ENTER,
      (e) => {
        useSyncStore.setState({ 
          isDraggingFiles: true, 
          dragPosition: { x: e.payload.position.x, y: e.payload.position.y }
        });
      }
    ).then(u => dragDropState.addUnlistener(u));

    listen<{ position: { x: number; y: number } }>(
      TauriEvent.DRAG_OVER,
      (e) => {
        useSyncStore.setState({ 
          dragPosition: { x: e.payload.position.x, y: e.payload.position.y }
        });
      }
    ).then(u => dragDropState.addUnlistener(u));

    listen<{ paths: string[]; position: { x: number; y: number } }>(
      TauriEvent.DRAG_DROP,
      (e) => {
        dragDropState.setPendingDrop({ 
          paths: e.payload.paths, 
          x: e.payload.position.x, 
          y: e.payload.position.y 
        });
        useSyncStore.setState({ isDraggingFiles: false, dragPosition: null });
        requestAnimationFrame(dragDropState.processPendingDrop);
      }
    ).then(u => dragDropState.addUnlistener(u));

    listen(TauriEvent.DRAG_LEAVE, () => {
      useSyncStore.setState({ isDraggingFiles: false, dragPosition: null });
    }).then(u => dragDropState.addUnlistener(u));

    return () => {
      dragDropState.cleanup();
    };
  }, []);
}
