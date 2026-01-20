import { memo, useRef, useCallback, useMemo, useState, useEffect, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { File, Folder, FolderOpen, Trash2, CheckCircle, XCircle, Clock, Loader2, AlertTriangle, Check, ChevronRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useShallow } from 'zustand/shallow';
import { useSyncStore } from '../../stores/syncStore';
import { useSync } from '../../hooks/useSync';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import { Tooltip } from '../ui/Tooltip';
import type { FileItem, FileStatus } from '../../types';

const statusIcons: Record<FileStatus, typeof Clock> = {
  pending: Clock,
  syncing: Loader2,
  completed: CheckCircle,
  error: XCircle,
  skipped: AlertTriangle,
  conflict: AlertTriangle,
};

const statusColors: Record<FileStatus, string> = {
  pending: 'text-text-tertiary',
  syncing: 'text-accent',
  completed: 'text-success',
  error: 'text-error',
  skipped: 'text-warning',
  conflict: 'text-warning',
};

// Tree node structure
interface TreeNode {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  depth: number;
  size: number;
  status: FileStatus;
  progress?: number;
  children?: TreeNode[];
  isExpanded?: boolean;
  fileCount?: number;
  totalSize?: number;
}

// Build tree from flat file list
function buildTree(files: FileItem[], basePath: string): TreeNode[] {
  const root: TreeNode = {
    id: 'root',
    name: basePath.split('/').pop() || basePath,
    path: basePath,
    isDirectory: true,
    depth: 0,
    size: 0,
    status: 'pending',
    children: [],
    isExpanded: true,
    fileCount: 0,
    totalSize: 0,
  };

  for (const file of files) {
    let relativePath = file.path;
    if (relativePath.startsWith(basePath)) {
      relativePath = relativePath.slice(basePath.length);
      if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
    }

    const segments = relativePath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;
      const currentPath = basePath + '/' + segments.slice(0, i + 1).join('/');

      if (!current.children) current.children = [];

      let child = current.children.find(c => c.name === segment);

      if (!child) {
        child = {
          id: currentPath,
          name: segment,
          path: currentPath,
          isDirectory: isLast ? file.isDirectory : true,
          depth: i + 1,
          size: isLast ? file.size : 0,
          status: isLast ? file.status : 'pending',
          progress: isLast ? file.progress : undefined,
          children: isLast && !file.isDirectory ? undefined : [],
          isExpanded: true,
          fileCount: 0,
          totalSize: 0,
        };
        current.children.push(child);
      }

      if (isLast) {
        child.size = file.size;
        child.status = file.status;
        child.progress = file.progress;
      }

      current = child;
    }
  }

  // Calculate folder stats and sort
  function processNode(node: TreeNode): { fileCount: number; totalSize: number } {
    if (!node.children || node.children.length === 0) {
      return { fileCount: node.isDirectory ? 0 : 1, totalSize: node.size };
    }

    node.children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    let fileCount = 0;
    let totalSize = 0;

    for (const child of node.children) {
      const stats = processNode(child);
      fileCount += stats.fileCount;
      totalSize += stats.totalSize;
    }

    node.fileCount = fileCount;
    node.totalSize = totalSize;
    return { fileCount, totalSize };
  }

  processNode(root);

  return [root];
}

// Flatten tree for virtualization
function flattenTree(nodes: TreeNode[], expandedPaths: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];

  function traverse(node: TreeNode) {
    result.push({ ...node, isExpanded: expandedPaths.has(node.path) });

    if (node.children && expandedPaths.has(node.path)) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return result;
}

interface TreeRowProps {
  node: TreeNode;
  onToggleExpand: (path: string) => void;
  onRemove: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  isRunning: boolean;
  formatBytes: (bytes: number) => string;
  isRoot: boolean;
  isFocused?: boolean;
}

const TreeRow = memo(function TreeRow({
  node,
  onToggleExpand,
  onRemove,
  isSelected,
  onToggleSelect,
  isRunning,
  formatBytes,
  isRoot,
  isFocused = false,
}: TreeRowProps) {
  const { t } = useTranslation();
  const StatusIcon = statusIcons[node.status];

  const handleToggle = useCallback(() => onToggleSelect(node.id), [onToggleSelect, node.id]);
  const handleRemove = useCallback(() => onRemove(node.id), [onRemove, node.id]);
  const handleExpand = useCallback(() => onToggleExpand(node.path), [onToggleExpand, node.path]);

  const indentPx = node.depth * 20;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? node.isExpanded : undefined}
      aria-level={node.depth + 1}
      aria-selected={isSelected}
      tabIndex={isFocused ? 0 : -1}
      className={clsx(
        'flex items-center gap-2 py-2 px-3 rounded-lg',
        'transition-colors duration-100',
        isRoot
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-bg-tertiary/50',
        isSelected && !isRoot && 'bg-accent/8 border border-accent/25',
        !isSelected && !isRoot && 'border border-transparent',
        isFocused && 'ring-2 ring-accent/50 ring-inset'
      )}
      style={{ marginLeft: indentPx }}
    >
      {/* Expand/Collapse for directories */}
      {hasChildren ? (
        <button
          type="button"
          onClick={handleExpand}
          className="shrink-0 w-5 h-5 flex items-center justify-center text-text-tertiary hover:text-text-secondary transition-colors rounded hover:bg-bg-tertiary"
        >
          {node.isExpanded ? (
            <ChevronDown className="w-4 h-4" strokeWidth={2} />
          ) : (
            <ChevronRight className="w-4 h-4" strokeWidth={2} />
          )}
        </button>
      ) : (
        <div className="shrink-0 w-5 h-5" />
      )}

      {/* Icon */}
      <div className="shrink-0">
        {node.isDirectory ? (
          node.isExpanded ? (
            <FolderOpen className={clsx('w-[18px] h-[18px]', isRoot ? 'text-accent' : 'text-accent/70')} strokeWidth={1.75} />
          ) : (
            <Folder className={clsx('w-[18px] h-[18px]', isRoot ? 'text-accent' : 'text-accent/70')} strokeWidth={1.75} />
          )
        ) : (
          <File className="w-[18px] h-[18px] text-text-tertiary" strokeWidth={1.75} />
        )}
      </div>

      {/* Checkbox (not for root) */}
      {!isRoot && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={isRunning}
          aria-label={isSelected ? t('fileList.deselectAll') : t('fileList.selectAll')}
          aria-pressed={isSelected}
          className={clsx(
            'relative shrink-0 w-4 h-4 rounded border-[1.5px] transition-colors duration-100',
            'flex items-center justify-center',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            isSelected
              ? 'bg-accent border-accent'
              : 'bg-transparent border-border hover:border-accent/50',
            isRunning && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSelected && (
            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
          )}
        </button>
      )}

      {/* Name & Info */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <p className={clsx(
          'text-[13px] truncate',
          isRoot ? 'font-semibold text-accent' : 'font-medium text-text-primary'
        )}>
          {node.name}
        </p>
        {node.isDirectory && node.fileCount !== undefined && node.fileCount > 0 && (
          <span className="text-[11px] text-text-tertiary shrink-0 bg-bg-tertiary px-1.5 py-0.5 rounded">
            {node.fileCount.toLocaleString()} {t('fileList.items')}
          </span>
        )}
        {node.status === 'syncing' && typeof node.progress === 'number' && (
          <div className="flex-1 max-w-[80px]">
            <ProgressBar value={node.progress} size="sm" animated />
          </div>
        )}
      </div>

      {/* Size */}
      <div className="shrink-0 text-[11px] text-text-tertiary tabular-nums">
        {node.isDirectory && node.totalSize !== undefined
          ? formatBytes(node.totalSize)
          : formatBytes(node.size)}
      </div>

      {/* Status */}
      {!isRoot && (
        <Tooltip content={t(`fileList.status.${node.status}`)} position="left">
          <div className={clsx('shrink-0', statusColors[node.status])}>
            <StatusIcon
              className={clsx('w-4 h-4', node.status === 'syncing' && 'animate-spin')}
              strokeWidth={1.75}
            />
          </div>
        </Tooltip>
      )}

      {/* Remove Button (not for root) */}
      {!isRoot && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isRunning}
          aria-label={`${t('common.delete')} ${node.name}`}
          className={clsx(
            'shrink-0 w-6 h-6 flex items-center justify-center rounded',
            'text-text-tertiary hover:text-error hover:bg-error/10 transition-colors',
            isRunning && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.node.id === next.node.id &&
    prev.node.status === next.node.status &&
    prev.node.progress === next.node.progress &&
    prev.node.isExpanded === next.node.isExpanded &&
    prev.isSelected === next.isSelected &&
    prev.isRunning === next.isRunning &&
    prev.isRoot === next.isRoot &&
    prev.isFocused === next.isFocused
  );
});

const ROW_HEIGHT = 40;
const ROW_GAP = 2;

export function FileList() {
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Combined selector with shallow comparison to prevent unnecessary re-renders
  const {
    normalizedFiles,
    selectedFiles,
    toggleFileSelection,
    selectAllFiles,
    deselectAllFiles,
    syncState,
    isScanning,
    scanProgress,
    sourcePath,
  } = useSyncStore(
    useShallow((state) => ({
      normalizedFiles: state.normalizedFiles,
      selectedFiles: state.selectedFiles,
      toggleFileSelection: state.toggleFileSelection,
      selectAllFiles: state.selectAllFiles,
      deselectAllFiles: state.deselectAllFiles,
      syncState: state.syncState,
      isScanning: state.isScanning,
      scanProgress: state.scanProgress,
      sourcePath: state.sourcePath,
    }))
  );

  const { removeFile, clearFiles, formatBytes } = useSync();

  const fileIds = normalizedFiles.ids;
  const fileCount = fileIds.length;
  const isRunning = ['preparing', 'syncing'].includes(syncState);

  // Use deferred value for non-blocking tree building with large file counts
  // This allows React to interrupt the tree computation if higher priority updates come in
  const deferredNormalizedFiles = useDeferredValue(normalizedFiles);
  const deferredFileIds = useDeferredValue(fileIds);
  const isStale = deferredNormalizedFiles !== normalizedFiles;

  // Build tree structure from files (non-blocking with deferred values)
  const tree = useMemo(() => {
    if (deferredFileIds.length === 0 || !sourcePath) return [];
    const files = deferredFileIds.map(id => deferredNormalizedFiles.byId[id]).filter(Boolean);
    return buildTree(files, sourcePath);
  }, [deferredNormalizedFiles, deferredFileIds, sourcePath]);

  // Initialize expanded paths with root and first level
  useEffect(() => {
    if (tree.length > 0 && !initialized) {
      const initial = new Set<string>();
      function addInitial(nodes: TreeNode[], depth = 0) {
        for (const node of nodes) {
          if (depth < 2) {
            initial.add(node.path);
            if (node.children) addInitial(node.children, depth + 1);
          }
        }
      }
      addInitial(tree);
      setExpandedPaths(initial);
      setInitialized(true);
    }
  }, [tree, initialized]);

  // Reset initialization when files are cleared
  useEffect(() => {
    if (fileCount === 0) {
      setInitialized(false);
      setExpandedPaths(new Set());
    }
  }, [fileCount]);

  // Flatten for virtualization
  const flatNodes = useMemo(() => {
    return flattenTree(tree, expandedPaths);
  }, [tree, expandedPaths]);

  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const handleRemove = useCallback((id: string) => {
    removeFile(id);
  }, [removeFile]);

  const handleToggleSelect = useCallback((id: string) => {
    toggleFileSelection(id);
  }, [toggleFileSelection]);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Keyboard navigation for the tree
  const handleTreeKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (flatNodes.length === 0) return;

    const currentIndex = focusedNodeId
      ? flatNodes.findIndex((n) => n.id === focusedNodeId)
      : -1;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < flatNodes.length - 1) {
          setFocusedNodeId(flatNodes[currentIndex + 1].id);
        } else if (currentIndex === -1 && flatNodes.length > 0) {
          setFocusedNodeId(flatNodes[0].id);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          setFocusedNodeId(flatNodes[currentIndex - 1].id);
        } else if (currentIndex === -1 && flatNodes.length > 0) {
          setFocusedNodeId(flatNodes[flatNodes.length - 1].id);
        }
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (currentIndex >= 0) {
          const node = flatNodes[currentIndex];
          if (node.isDirectory && node.children && node.children.length > 0) {
            if (!expandedPaths.has(node.path)) {
              handleToggleExpand(node.path);
            } else if (currentIndex < flatNodes.length - 1) {
              // Already expanded, move to first child
              setFocusedNodeId(flatNodes[currentIndex + 1].id);
            }
          }
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (currentIndex >= 0) {
          const node = flatNodes[currentIndex];
          if (node.isDirectory && expandedPaths.has(node.path)) {
            // Collapse if expanded
            handleToggleExpand(node.path);
          } else if (node.depth > 0) {
            // Move to parent
            const parentPath = node.path.split('/').slice(0, -1).join('/');
            const parentNode = flatNodes.find((n) => n.path === parentPath);
            if (parentNode) {
              setFocusedNodeId(parentNode.id);
            }
          }
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (currentIndex >= 0) {
          const node = flatNodes[currentIndex];
          if (node.depth > 0) {
            // Toggle selection for non-root nodes
            handleToggleSelect(node.id);
          } else if (node.isDirectory && node.children && node.children.length > 0) {
            // Toggle expand for root
            handleToggleExpand(node.path);
          }
        }
        break;
      case 'Home':
        event.preventDefault();
        if (flatNodes.length > 0) {
          setFocusedNodeId(flatNodes[0].id);
        }
        break;
      case 'End':
        event.preventDefault();
        if (flatNodes.length > 0) {
          setFocusedNodeId(flatNodes[flatNodes.length - 1].id);
        }
        break;
    }
  }, [flatNodes, focusedNodeId, expandedPaths, handleToggleExpand, handleToggleSelect]);

  if (isScanning && fileCount === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl bg-bg-secondary/50 border border-border-subtle p-8 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
            <p className="text-sm text-text-secondary">{t('fileList.scanning')}</p>
            {scanProgress && (
              <p className="text-xs text-text-tertiary">
                {scanProgress.count.toLocaleString()} {t('fileList.files')} · {formatBytes(scanProgress.totalSize)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (fileCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header with explanation */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary font-medium">
          {t('fileList.willCopy')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-text-tertiary">
            {fileCount.toLocaleString()} {t('fileList.files')} · {selectedFiles.size.toLocaleString()} {t('fileList.selected')}
            {isScanning && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
              </span>
            )}
            {isStale && !isScanning && (
              <span className="ml-2 inline-flex items-center gap-1 text-accent">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>{t('common.updating')}</span>
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectedFiles.size === fileCount ? deselectAllFiles : selectAllFiles}
              className="text-xs px-2 h-6"
            >
              {selectedFiles.size === fileCount ? t('fileList.deselectAll') : t('fileList.selectAll')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFiles}
              className="text-xs px-2 h-6 text-error hover:text-error"
            >
              {t('fileList.clearAll')}
            </Button>
          </div>
        </div>
      </div>

      {/* Tree View */}
      <div className="rounded-xl bg-bg-secondary/30 border border-border-subtle p-2 shadow-sm">
        <div
          ref={scrollContainerRef}
          role="tree"
          aria-label={t('fileList.willCopy')}
          tabIndex={0}
          onKeyDown={handleTreeKeyDown}
          className="max-h-[45vh] overflow-y-auto overflow-x-hidden pr-2 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-inset rounded-lg">
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const node = flatNodes[virtualItem.index];
              if (!node) return null;

              const isRoot = node.depth === 0;

              return (
                <div
                  key={node.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${ROW_HEIGHT - ROW_GAP}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <TreeRow
                    node={node}
                    onToggleExpand={handleToggleExpand}
                    onRemove={handleRemove}
                    isSelected={selectedFiles.has(node.id)}
                    onToggleSelect={handleToggleSelect}
                    isRunning={isRunning}
                    formatBytes={formatBytes}
                    isRoot={isRoot}
                    isFocused={focusedNodeId === node.id}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
