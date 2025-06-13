import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCacheFromStorage, saveCacheToStorage, type CacheStorageData } from "@/lib/utils/localStorage";
import { OPTIMISTIC_DELETE_REGISTRY_KEY, OptimisticDeleteRegistryData } from "./types";

export function useCachePersistence() {
  const queryClient = useQueryClient();

  // Load cache from localStorage on mount
  useEffect(() => {
    const storedCache = getCacheFromStorage();
    if (!storedCache) return;

    // Restore root resources cache
    if (storedCache.rootResources) {
      queryClient.setQueryData(["kb-resources", storedCache.kbId], storedCache.rootResources);
    }

    // Restore folder status caches
    Object.entries(storedCache.folderStatuses).forEach(([folderPath, folderData]) => {
      queryClient.setQueryData(["kb-file-status", storedCache.kbId, folderPath], folderData);
    });

    // Restore optimistic registry
    if (storedCache.optimisticRegistry) {
      queryClient.setQueryData(OPTIMISTIC_DELETE_REGISTRY_KEY, {
        entries: storedCache.optimisticRegistry,
        lastUpdated: Date.now(),
      });
    }

    // Restore optimistic folder registry
    if (storedCache.optimisticFolderRegistry) {
      queryClient.setQueryData(["optimistic-folder-registry"], {
        entries: storedCache.optimisticFolderRegistry,
        lastUpdated: Date.now(),
      });
    }
  }, [queryClient]);

  // Save cache to localStorage when data changes
  const persistCacheToStorage = useCallback(
    (kbId: string) => {
      try {
        // Get current cache data
        const rootResources = queryClient.getQueryData<{ data: any[] }>(["kb-resources", kbId]);
        const registryData = queryClient.getQueryData<OptimisticDeleteRegistryData>(OPTIMISTIC_DELETE_REGISTRY_KEY);
        const folderRegistryData = queryClient.getQueryData<{ entries: Record<string, any> }>(["optimistic-folder-registry"]);

        // Collect all folder status caches for this KB
        const folderStatuses: Record<string, { data: any[] }> = {};
        const queryCache = queryClient.getQueryCache();

        queryCache.getAll().forEach((query) => {
          if (query.queryKey[0] === "kb-file-status" && query.queryKey[1] === kbId) {
            const folderPath = query.queryKey[2] as string;
            const data = query.state.data as { data: any[] } | undefined;
            if (data) {
              folderStatuses[folderPath] = data;
            }
          }
        });

        const cacheData: CacheStorageData = {
          kbId,
          timestamp: Date.now(),
          rootResources: rootResources || null,
          folderStatuses,
          optimisticRegistry: registryData?.entries || {},
          optimisticFolderRegistry: folderRegistryData?.entries || {},
          version: "1.0",
        };

        saveCacheToStorage(cacheData);
      } catch (error) {
        console.error("Failed to persist cache:", error);
      }
    },
    [queryClient]
  );

  return {
    persistCacheToStorage,
  };
}
