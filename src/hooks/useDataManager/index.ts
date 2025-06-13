import { useMemo } from "react";
import { clearCacheFromStorage } from "@/lib/utils/localStorage";
import { useOptimisticFolderRegistry } from "../useOptimisticFolderRegistry";
import { useCachePersistence } from "./cachePersistence";
import { useSyncState } from "./syncState";
import { useDeleteQueue } from "./deleteQueue";
import { useOptimisticRegistry } from "./optimisticRegistry";
import { useCacheOperations } from "./cacheOperations";
import { useFolderHelpers } from "./folderHelpers";
import { DeleteRequest, OptimisticDeleteEntry } from "./types";

/**
 * Centralized Data Manager
 * 
 * This hook provides a single source of truth for all application state:
 * 1. Sync State Management
 * 2. Delete Queue Management  
 * 3. Optimistic Delete Registry
 * 4. File Status Resolution (with clear precedence)
 * 5. Cache Operations (Root + Folder)
 * 6. Folder Operations
 */
export function useDataManager() {
  // Import optimistic folder registry
  const {
    isDescendantOfOptimisticFolder,
    getOptimisticAncestorFolder,
    markFoldersAsOptimisticallyIndexed,
    clearOptimisticFoldersForKB,
  } = useOptimisticFolderRegistry();

  // Cache persistence
  const { persistCacheToStorage } = useCachePersistence();

  // Sync state
  const { syncStateData, updateSyncState } = useSyncState();

  // Delete queue
  const { queueData, updateQueueData } = useDeleteQueue();

  // Optimistic registry
  const { 
    registryData, 
    updateRegistryData, 
    optimisticUpdateCounter, 
    incrementOptimisticUpdateCounter, 
    resolveFileStatus 
  } = useOptimisticRegistry();

  // Cache operations
  const {
    updateKBResourcesCache,
    removeFromKBResourcesCache,
    updateFolderFileCache,
    updateFolderStatusCache,
    removeFromFolderStatusCache,
    setFolderContentsAsIndexed,
  } = useCacheOperations(incrementOptimisticUpdateCounter, persistCacheToStorage);

  // Folder helpers
  const {
    getFolderPathFromFileName,
    getFolderContents,
    getAllDescendantFileIds,
  } = useFolderHelpers();

  // ==================== COMPUTED VALUES ====================
  
  const computedValues = useMemo(() => {
    const { state: syncState, kbId: syncKbId } = syncStateData;
    const { queue, processing } = queueData;
    const { entries } = registryData;
    const { count: optimisticUpdateCount } = optimisticUpdateCounter;

    return {
      // Sync state
      syncState,
      syncKbId,
      isSyncPending: syncState === "pending",
      isSyncCompleted: syncState === "synced",
      isSyncIdle: syncState === "idle",

      // Queue state
      queue,
      queueProcessing: processing,
      queueCount: queue.length,
      queueHasItems: queue.length > 0,

      // Registry state
      optimisticDeleteEntries: entries,
      optimisticDeleteCount: Object.keys(entries).length,
      
      // Optimistic update tracking
      optimisticUpdateCount,
    };
  }, [syncStateData, queueData, registryData, optimisticUpdateCounter]);

  // ==================== PUBLIC API ====================
  
  return {
    // State access
    ...computedValues,

    // Sync operations
    setSyncPending: (kbId: string) => updateSyncState("pending", kbId),
    setSyncCompleted: (kbId: string) => updateSyncState("synced", kbId),
    resetSyncState: () => updateSyncState("idle", null),

    // Queue operations
    queueDeleteRequest: (fileId: string, fileName: string, kbId: string) => {
      const deleteRequest: DeleteRequest = {
        id: `delete-${fileId}-${Date.now()}`,
        fileId,
        fileName,
        resourcePath: `/${fileName}`,
        kbId,
        timestamp: Date.now(),
      };

      updateQueueData((prev) => ({
        ...prev,
        queue: [...prev.queue, deleteRequest],
        lastUpdated: Date.now(),
      }));

      console.log(`📝 [DataManager] Queued: ${fileName}`);
      return deleteRequest.id;
    },

    removeFromQueue: (requestId: string) => {
      updateQueueData((prev) => ({
        ...prev,
        queue: prev.queue.filter(req => req.id !== requestId),
        lastUpdated: Date.now(),
      }));
    },

    updateQueueKBId: (oldKbId: string, newKbId: string) => {
      updateQueueData((prev) => ({
        ...prev,
        queue: prev.queue.map(request => 
          request.kbId === oldKbId 
            ? { ...request, kbId: newKbId }
            : request
        ),
        lastUpdated: Date.now(),
      }));
      console.log(`🔄 [DataManager] Updated queue KB ID: ${oldKbId} → ${newKbId}`);
    },

    setQueueProcessing: (processing: boolean) => {
      updateQueueData((prev) => ({
        ...prev,
        processing,
        lastUpdated: Date.now(),
      }));
    },

    clearQueue: () => {
      updateQueueData(() => ({
        queue: [],
        processing: false,
        lastUpdated: Date.now(),
      }));
      console.log("🧹 [DataManager] Queue cleared");
    },

    // Registry operations
    markFileAsDeleted: (fileId: string, fileName: string, kbId: string) => {
      const entry: OptimisticDeleteEntry = {
        fileId,
        fileName,
        kbId,
        timestamp: Date.now(),
        locked: true,
      };

      updateRegistryData((prev) => ({
        ...prev,
        entries: { ...prev.entries, [fileId]: entry },
        lastUpdated: Date.now(),
      }));

      console.log(`🔒 [DataManager] Marked as deleted: ${fileName}`);
      
      // Trigger re-render for optimistic deletes
      incrementOptimisticUpdateCounter();
    },

    removeFromRegistry: (fileId: string) => {
      updateRegistryData((prev) => {
        const newEntries = { ...prev.entries };
        delete newEntries[fileId];
        return {
          ...prev,
          entries: newEntries,
          lastUpdated: Date.now(),
        };
      });
    },

    clearRegistry: () => {
      updateRegistryData(() => ({
        entries: {},
        lastUpdated: Date.now(),
      }));
      console.log("🧹 [DataManager] Registry cleared");
    },

    // Root cache operations (existing)
    updateKBResourcesCache,
    removeFromKBResourcesCache,

    // Folder cache operations (new)
    updateFolderFileCache,
    updateFolderStatusCache,
    removeFromFolderStatusCache,
    setFolderContentsAsIndexed,

    // Status resolution
    resolveFileStatus,

    // Folder helpers
    getFolderPathFromFileName,
    getFolderContents,
    getAllDescendantFileIds,

    // Cache persistence
    persistCacheToStorage,

    // Optimistic folder registry operations
    markFoldersAsOptimisticallyIndexed,
    isDescendantOfOptimisticFolder,
    getOptimisticAncestorFolder,
    clearOptimisticFoldersForKB,

    // Utility
    clearAllState: () => {
      updateSyncState("idle", null);
      updateQueueData(() => ({ queue: [], processing: false, lastUpdated: Date.now() }));
      updateRegistryData(() => ({ entries: {}, lastUpdated: Date.now() }));
      clearCacheFromStorage();
      console.log("🧹 [DataManager] All state cleared");
    },
  };
}

// Re-export types for backward compatibility
export type { DeleteRequest } from "./types"; 