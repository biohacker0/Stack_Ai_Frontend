import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Data structure for tracking optimistically indexed folder trees
interface OptimisticFolderEntry {
  kbId: string;
  folderId: string;
  folderPath: string;
  createdAt: number;
  rootFolderIds: string[]; // All root folders selected in the same KB creation
}

interface OptimisticFolderRegistryData {
  entries: Record<string, OptimisticFolderEntry>; // Key: `${kbId}-${folderId}`
  lastUpdated: number;
}

// Query key for the registry
const OPTIMISTIC_FOLDER_REGISTRY_KEY = ["optimistic-folder-registry"];

export function useOptimisticFolderRegistry() {
  const queryClient = useQueryClient();

  // Get registry data from React Query cache
  const { data: registryData } = useQuery({
    queryKey: OPTIMISTIC_FOLDER_REGISTRY_KEY,
    queryFn: () => ({ entries: {}, lastUpdated: Date.now() }),
    initialData: { entries: {}, lastUpdated: Date.now() },
    staleTime: Infinity,
  });

  // Helper to update registry data
  const updateRegistryData = useCallback(
    (updater: (prev: OptimisticFolderRegistryData) => OptimisticFolderRegistryData) => {
      const currentData = queryClient.getQueryData<OptimisticFolderRegistryData>(OPTIMISTIC_FOLDER_REGISTRY_KEY) || registryData;
      const newData = updater(currentData);
      queryClient.setQueryData(OPTIMISTIC_FOLDER_REGISTRY_KEY, newData);
      return newData;
    },
    [queryClient, registryData]
  );

  // Extract folder path from file name or folder name
  const getFolderPathFromName = useCallback((name: string): string => {
    const pathParts = name.split("/");
    // If it ends with a filename, remove it; if it's a folder path, keep as is
    if (pathParts[pathParts.length - 1].includes('.')) {
      pathParts.pop(); // Remove filename
    }
    return "/" + pathParts.join("/");
  }, []);

  // Mark folders as optimistically indexed (called during KB creation)
  const markFoldersAsOptimisticallyIndexed = useCallback(
    (kbId: string, selectedFolderIds: string[], folderNameMap: Map<string, string>) => {
      console.log(`🌳 [OptimisticFolderRegistry] Marking ${selectedFolderIds.length} folders for KB: ${kbId}`);
      
      updateRegistryData((prev) => {
        const newEntries = { ...prev.entries };
        const timestamp = Date.now();

        selectedFolderIds.forEach(folderId => {
          const folderName = folderNameMap.get(folderId);
          if (folderName) {
            const folderPath = getFolderPathFromName(folderName);
            const entryKey = `${kbId}-${folderId}`;
            
            newEntries[entryKey] = {
              kbId,
              folderId,
              folderPath,
              createdAt: timestamp,
              rootFolderIds: selectedFolderIds, // Store all selected folders
            };
            
            console.log(`📁 [OptimisticFolderRegistry] Registered folder: ${folderPath} (${folderId})`);
          }
        });

        return {
          entries: newEntries,
          lastUpdated: timestamp,
        };
      });
    },
    [updateRegistryData, getFolderPathFromName]
  );

  // Check if a folder path is a descendant of any optimistically indexed folder
  const isDescendantOfOptimisticFolder = useCallback(
    (kbId: string, targetFolderPath: string): boolean => {
      if (!kbId || !targetFolderPath) return false;

      // Normalize the target path
      const normalizedTarget = targetFolderPath.startsWith('/') ? targetFolderPath : `/${targetFolderPath}`;
      
      // Check all registry entries for this KB
      const entries = Object.values(registryData.entries) as OptimisticFolderEntry[];
      const kbEntries = entries.filter(entry => entry.kbId === kbId);
      
      for (const entry of kbEntries) {
        const registeredPath = entry.folderPath;
        
        // Check if target path is a descendant of registered path
        if (normalizedTarget.startsWith(registeredPath + "/") || normalizedTarget === registeredPath) {
          console.log(`🎯 [OptimisticFolderRegistry] Found ancestor: ${registeredPath} for ${normalizedTarget}`);
          return true;
        }
      }
      
      return false;
    },
    [registryData.entries]
  );

  // Get the optimistic ancestor folder for a given path
  const getOptimisticAncestorFolder = useCallback(
    (kbId: string, targetFolderPath: string): OptimisticFolderEntry | null => {
      if (!kbId || !targetFolderPath) return null;

      const normalizedTarget = targetFolderPath.startsWith('/') ? targetFolderPath : `/${targetFolderPath}`;
      
      const entries = Object.values(registryData.entries) as OptimisticFolderEntry[];
      const kbEntries = entries.filter(entry => entry.kbId === kbId);
      
      // Find the closest ancestor (longest matching path)
      let bestMatch: OptimisticFolderEntry | null = null;
      let longestMatch = 0;
      
      for (const entry of kbEntries) {
        const registeredPath = entry.folderPath;
        
        if (normalizedTarget.startsWith(registeredPath + "/") || normalizedTarget === registeredPath) {
          if (registeredPath.length > longestMatch) {
            longestMatch = registeredPath.length;
            bestMatch = entry;
          }
        }
      }
      
      return bestMatch;
    },
    [registryData.entries]
  );

  // Check if a specific folder ID is registered as optimistic
  const isFolderOptimisticallyIndexed = useCallback(
    (kbId: string, folderId: string): boolean => {
      const entryKey = `${kbId}-${folderId}`;
      return entryKey in registryData.entries;
    },
    [registryData.entries]
  );

  // Remove a specific folder from the registry
  const removeOptimisticFolder = useCallback(
    (kbId: string, folderId: string) => {
      const entryKey = `${kbId}-${folderId}`;
      
      updateRegistryData((prev) => {
        const newEntries = { ...prev.entries };
        delete newEntries[entryKey];
        
        console.log(`🗑️ [OptimisticFolderRegistry] Removed folder: ${entryKey}`);
        
        return {
          entries: newEntries,
          lastUpdated: Date.now(),
        };
      });
    },
    [updateRegistryData]
  );

  // Clear all optimistic folders for a KB
  const clearOptimisticFoldersForKB = useCallback(
    (kbId: string) => {
      updateRegistryData((prev) => {
        const newEntries = { ...prev.entries };
        
        // Remove all entries for this KB
        Object.keys(newEntries).forEach(entryKey => {
          if (newEntries[entryKey].kbId === kbId) {
            delete newEntries[entryKey];
          }
        });
        
        console.log(`🧹 [OptimisticFolderRegistry] Cleared all folders for KB: ${kbId}`);
        
        return {
          entries: newEntries,
          lastUpdated: Date.now(),
        };
      });
    },
    [updateRegistryData]
  );

  // Clear entire registry
  const clearOptimisticFolderRegistry = useCallback(() => {
    updateRegistryData(() => ({
      entries: {},
      lastUpdated: Date.now(),
    }));
    
    console.log("🧹 [OptimisticFolderRegistry] Cleared entire registry");
  }, [updateRegistryData]);

  // Get all optimistic folders for debugging
  const getOptimisticFoldersForKB = useCallback(
    (kbId: string): OptimisticFolderEntry[] => {
      const entries = Object.values(registryData.entries) as OptimisticFolderEntry[];
      return entries.filter(entry => entry.kbId === kbId);
    },
    [registryData.entries]
  );

  return {
    // Registry data
    optimisticFolderEntries: registryData.entries,
    optimisticFolderCount: Object.keys(registryData.entries).length,
    
    // Core functions
    markFoldersAsOptimisticallyIndexed,
    isDescendantOfOptimisticFolder,
    getOptimisticAncestorFolder,
    isFolderOptimisticallyIndexed,
    
    // Management functions
    removeOptimisticFolder,
    clearOptimisticFoldersForKB,
    clearOptimisticFolderRegistry,
    
    // Utility functions
    getOptimisticFoldersForKB,
    getFolderPathFromName,
  };
} 