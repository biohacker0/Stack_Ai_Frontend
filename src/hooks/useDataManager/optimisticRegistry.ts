import { useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileItem } from "@/lib/types/file";
import { useOptimisticFolderRegistry } from "../useOptimisticFolderRegistry";
import { OPTIMISTIC_DELETE_REGISTRY_KEY, OPTIMISTIC_UPDATE_COUNTER_KEY, OptimisticDeleteRegistryData } from "./types";

export function useOptimisticRegistry() {
  const queryClient = useQueryClient();

  // Import optimistic folder registry
  const { isDescendantOfOptimisticFolder } = useOptimisticFolderRegistry();

  const { data: registryData } = useQuery({
    queryKey: OPTIMISTIC_DELETE_REGISTRY_KEY,
    queryFn: () => ({ entries: {}, lastUpdated: Date.now() }),
    initialData: { entries: {}, lastUpdated: Date.now() },
    staleTime: Infinity,
  });

  const { data: optimisticUpdateCounter } = useQuery({
    queryKey: OPTIMISTIC_UPDATE_COUNTER_KEY,
    queryFn: () => ({ count: 0, lastUpdated: Date.now() }),
    initialData: { count: 0, lastUpdated: Date.now() },
    staleTime: Infinity,
  });

  /**
   * Memoised status cache – see explanation above.
   */
  const statusCacheRef = useRef<Map<string, FileItem["status"] | "-" | null>>(new Map());

  // Clear cache whenever registry or optimistic counter changes
  useEffect(() => {
    statusCacheRef.current.clear();
  }, [registryData?.lastUpdated, optimisticUpdateCounter?.lastUpdated]);

  const incrementOptimisticUpdateCounter = useCallback(() => {
    // Batch counter updates using requestAnimationFrame to prevent excessive re-renders
    requestAnimationFrame(() => {
      const currentData = queryClient.getQueryData<{ count: number; lastUpdated: number }>(OPTIMISTIC_UPDATE_COUNTER_KEY) || optimisticUpdateCounter;
      const newData = {
        count: currentData.count + 1,
        lastUpdated: Date.now(),
      };
      queryClient.setQueryData(OPTIMISTIC_UPDATE_COUNTER_KEY, newData);
      // console.log(`🔄 [DataManager] Optimistic update counter incremented: ${newData.count}`);
    });
  }, [queryClient, optimisticUpdateCounter]);

  /**
   * File Status Precedence (highest to lowest):
   * 1. Optimistic Delete Registry (locked as "-")
   * 2. KB Resources Cache (root files - from network)
   * 3. Folder Status Cache (folder files - from network)
   * 4. Optimistic Folder Registry (descendant of optimistically indexed folder)
   * 5. Default (undefined)
   */
  const resolveFileStatus = useCallback(
    (fileId: string, kbId: string | null, folderPath?: string): FileItem["status"] | "-" | null => {
      const cacheKey = `${fileId}|${kbId ?? ""}|${folderPath ?? ""}`;

      // Fast path – return cached result if available
      if (statusCacheRef.current.has(cacheKey)) {
        return statusCacheRef.current.get(cacheKey)!;
      }

      // 1. Check optimistic delete registry (highest priority)
      if (fileId in registryData.entries) {
        statusCacheRef.current.set(cacheKey, "-");
        return "-"; // Show as deleted
      }

      // 2. Check KB resources cache (root files)
      if (kbId) {
        const kbResources = queryClient.getQueryData<{ data: FileItem[] }>(["kb-resources", kbId]);
        const resource = kbResources?.data?.find((r) => r.id === fileId);
        if (resource) {
          // Apply optimistic UI: show "pending" as "indexed"
          const status = resource.status === "pending" ? "indexed" : resource.status;
          statusCacheRef.current.set(cacheKey, status);
          return status;
        }
      }

      // 3. Check folder status cache (folder files)
      if (kbId && folderPath) {
        const folderStatus = queryClient.getQueryData<{ data: FileItem[] }>(["kb-file-status", kbId, folderPath]);
        const folderFile = folderStatus?.data?.find((r) => r.id === fileId);
        if (folderFile) {
          // Apply optimistic UI: show "pending" as "indexed"
          const status = folderFile.status === "pending" ? "indexed" : folderFile.status;
          statusCacheRef.current.set(cacheKey, status);
          return status;
        }
      }

      // 4. Check optimistic folder registry (new priority level)
      if (kbId && folderPath && isDescendantOfOptimisticFolder(kbId, folderPath)) {
        statusCacheRef.current.set(cacheKey, "indexed");
        return "indexed"; // Show as optimistically indexed
      }

      // 5. Default (file not in KB or no data)
      statusCacheRef.current.set(cacheKey, null);
      return null;
    },
    [registryData.entries, queryClient, isDescendantOfOptimisticFolder]
  );

  const updateRegistryData = useCallback(
    (updater: (prev: OptimisticDeleteRegistryData) => OptimisticDeleteRegistryData) => {
      const currentData = queryClient.getQueryData<OptimisticDeleteRegistryData>(OPTIMISTIC_DELETE_REGISTRY_KEY) || registryData;
      const newData = updater(currentData);
      queryClient.setQueryData(OPTIMISTIC_DELETE_REGISTRY_KEY, newData);
      return newData;
    },
    [queryClient, registryData]
  );

  return {
    registryData,
    updateRegistryData,
    optimisticUpdateCounter,
    incrementOptimisticUpdateCounter,
    resolveFileStatus,
  };
}
