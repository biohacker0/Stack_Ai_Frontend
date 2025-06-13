import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileItem } from "@/lib/types/file";

export function useCacheOperations(
  incrementOptimisticUpdateCounter: () => void,
  persistCacheToStorage: (kbId: string) => void
) {
  const queryClient = useQueryClient();

  // Root KB Resources Cache (for root files)
  const updateKBResourcesCache = useCallback(
    (kbId: string, updater: (prev: { data: FileItem[] } | undefined) => { data: FileItem[] }) => {
      const cacheKey = ["kb-resources", kbId];
      const currentData = queryClient.getQueryData<{ data: FileItem[] }>(cacheKey);
      const newData = updater(currentData);
      queryClient.setQueryData(cacheKey, newData);
      console.log(`📝 [DataManager] Updated KB root cache: ${kbId}`);
      
      // Persist cache to localStorage
      persistCacheToStorage(kbId);
      
      // Trigger re-render for optimistic updates
      incrementOptimisticUpdateCounter();
    },
    [queryClient, incrementOptimisticUpdateCounter, persistCacheToStorage]
  );

  const removeFromKBResourcesCache = useCallback(
    (kbId: string, fileIds: string[]) => {
      updateKBResourcesCache(kbId, (prev) => {
        if (!prev?.data) return { data: [] };
        return {
          data: prev.data.filter(resource => !fileIds.includes(resource.id))
        };
      });
    },
    [updateKBResourcesCache]
  );

  // Folder File Cache Operations (for Google Drive files)
  const updateFolderFileCache = useCallback(
    (folderId: string, updater: (prev: { data: FileItem[] } | undefined) => { data: FileItem[] }) => {
      const cacheKey = ["drive-files", folderId];
      const currentData = queryClient.getQueryData<{ data: FileItem[] }>(cacheKey);
      const newData = updater(currentData);
      queryClient.setQueryData(cacheKey, newData);
      console.log(`📝 [DataManager] Updated folder file cache: ${folderId}`);
    },
    [queryClient]
  );

  // Folder Status Cache Operations (for KB folder status)
  const updateFolderStatusCache = useCallback(
    (kbId: string, folderPath: string, updater: (prev: { data: FileItem[] } | undefined) => { data: FileItem[] }) => {
      const cacheKey = ["kb-file-status", kbId, folderPath];
      const currentData = queryClient.getQueryData<{ data: FileItem[] }>(cacheKey);
      const newData = updater(currentData);
      queryClient.setQueryData(cacheKey, newData);
      console.log(`📝 [DataManager] Updated folder status cache: ${kbId}${folderPath}`);
      
      // Persist cache to localStorage
      persistCacheToStorage(kbId);
    },
    [queryClient, persistCacheToStorage]
  );

  const removeFromFolderStatusCache = useCallback(
    (kbId: string, folderPath: string, fileIds: string[]) => {
      updateFolderStatusCache(kbId, folderPath, (prev) => {
        if (!prev?.data) return { data: [] };
        return {
          data: prev.data.filter(resource => !fileIds.includes(resource.id))
        };
      });
    },
    [updateFolderStatusCache]
  );

  // Set optimistic "indexed" status for folder contents
  const setFolderContentsAsIndexed = useCallback(
    (kbId: string, folderPath: string, fileIds: string[], files: FileItem[]) => {
      const optimisticFiles = fileIds.map(fileId => {
        const file = files.find(f => f.id === fileId);
        return {
          id: fileId,
          name: file?.name || "",
          type: file?.type || "file" as const,
          size: file?.size || 0,
          status: "indexed" as const,
          indexed_at: new Date().toISOString()
        };
      }).filter(f => f.type === "file"); // Only files have status

      updateFolderStatusCache(kbId, folderPath, () => ({ data: optimisticFiles }));
      console.log(`✅ [DataManager] Set ${optimisticFiles.length} files as indexed in folder ${folderPath}`);
      
      // Trigger re-render for expanded folders
      incrementOptimisticUpdateCounter();
    },
    [updateFolderStatusCache, incrementOptimisticUpdateCounter]
  );

  return {
    updateKBResourcesCache,
    removeFromKBResourcesCache,
    updateFolderFileCache,
    updateFolderStatusCache,
    removeFromFolderStatusCache,
    setFolderContentsAsIndexed,
  };
} 