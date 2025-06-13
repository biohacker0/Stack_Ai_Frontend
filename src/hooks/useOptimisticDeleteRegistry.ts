import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

interface OptimisticDeleteEntry {
  fileId: string;
  fileName: string;
  kbId: string;
  timestamp: number;
  locked: boolean; // Prevents any status updates
}

interface OptimisticDeleteRegistryData {
  entries: Record<string, OptimisticDeleteEntry>;
  lastUpdated: number;
}

const OPTIMISTIC_DELETE_REGISTRY_KEY = ["optimistic-delete-registry"];

export function useOptimisticDeleteRegistry() {
  const queryClient = useQueryClient();

  // Get current registry from React Query cache
  const registryData = useMemo(() => {
    const data = queryClient.getQueryData<OptimisticDeleteRegistryData>(OPTIMISTIC_DELETE_REGISTRY_KEY);
    return data || { entries: {}, lastUpdated: Date.now() };
  }, [queryClient]);

  const { entries } = registryData;

  // Update registry data
  const updateRegistryData = useCallback(
    (updater: (prev: OptimisticDeleteRegistryData) => OptimisticDeleteRegistryData) => {
      const currentData = queryClient.getQueryData<OptimisticDeleteRegistryData>(OPTIMISTIC_DELETE_REGISTRY_KEY) || {
        entries: {},
        lastUpdated: Date.now(),
      };

      const newData = updater(currentData);
      queryClient.setQueryData(OPTIMISTIC_DELETE_REGISTRY_KEY, newData);

      return newData;
    },
    [queryClient]
  );

  // Mark file as optimistically deleted
  const markFileAsDeleted = useCallback(
    (fileId: string, fileName: string, kbId: string) => {
      const entry: OptimisticDeleteEntry = {
        fileId,
        fileName,
        kbId,
        timestamp: Date.now(),
        locked: true,
      };

      updateRegistryData((prev) => ({
        ...prev,
        entries: {
          ...prev.entries,
          [fileId]: entry,
        },
        lastUpdated: Date.now(),
      }));
    },
    [updateRegistryData]
  );

  // Remove file from registry (when delete is actually processed)
  const removeFileFromRegistry = useCallback(
    (fileId: string) => {
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
    [updateRegistryData]
  );

  // Check if file is marked as deleted
  const isFileMarkedAsDeleted = useCallback(
    (fileId: string): boolean => {
      return fileId in entries;
    },
    [entries]
  );

  // Check if file status is locked (prevents polling updates)
  const isFileStatusLocked = useCallback(
    (fileId: string): boolean => {
      const entry = entries[fileId];
      return entry?.locked ?? false;
    },
    [entries]
  );

  // Get deleted file entry
  const getDeletedFileEntry = useCallback(
    (fileId: string): OptimisticDeleteEntry | null => {
      return entries[fileId] || null;
    },
    [entries]
  );

  // Clear entire registry (for new KB creation)
  const clearRegistry = useCallback(() => {
    updateRegistryData((prev) => ({
      entries: {},
      lastUpdated: Date.now(),
    }));
  }, [updateRegistryData]);

  // Get registry stats
  const registryStats = useMemo(() => {
    const entryValues = Object.values(entries);
    return {
      count: entryValues.length,
      lockedCount: entryValues.filter((entry) => entry.locked).length,
      hasEntries: entryValues.length > 0,
      fileIds: Object.keys(entries),
    };
  }, [entries]);

  // Filter out deleted files from polling responses
  const filterPollingResponse = useCallback(
    <T extends { id: string }>(items: T[]): T[] => {
      return items.filter((item) => !isFileMarkedAsDeleted(item.id));
    },
    [isFileMarkedAsDeleted]
  );

  // Get the override status for a file (returns "-" if deleted, null otherwise)
  const getFileStatusOverride = useCallback(
    (fileId: string): string | null => {
      if (isFileMarkedAsDeleted(fileId)) {
        return "-"; // Show as deleted
      }
      return null; // No override
    },
    [isFileMarkedAsDeleted]
  );

  return {
    entries,
    registryStats,
    markFileAsDeleted,
    removeFileFromRegistry,
    isFileMarkedAsDeleted,
    isFileStatusLocked,
    getDeletedFileEntry,
    clearRegistry,
    filterPollingResponse,
    getFileStatusOverride,
  };
}
