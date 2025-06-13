import { useCallback, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listResources } from "@/lib/api/connections";
import { FileItem } from "@/lib/types/file";
import { useDataManager } from "../useDataManager";
import { usePrefetch } from "../usePrefetch";

// Constants
const STALE_TIME = 5 * 60 * 1000; // 5 minutes

interface UseFolderOperationsProps {
  kbId?: string | null;
  isCreatingKB?: boolean;
  expandedFolders: Set<string>;
  setExpandedFolders: (setter: (prev: Set<string>) => Set<string>) => void;
  setLoadingFolders: (setter: (prev: Set<string>) => Set<string>) => void;
  setDelayedPollingFolders: (setter: (prev: Set<string>) => Set<string>) => void;
  pollFolderStatus: (folderPath: string, folderId: string) => Promise<void>;
  fetchKBStatusForFolder: (folderPath: string, forceRefresh?: boolean) => Promise<Map<string, string>>;
  updateCachedFilesWithStatus: (folderId: string, kbStatusMap: Map<string, string>) => { hasPending: boolean; hasErrors: boolean };
}

export function useFolderOperations({
  kbId,
  isCreatingKB,
  expandedFolders,
  setExpandedFolders,
  setLoadingFolders,
  setDelayedPollingFolders,
  pollFolderStatus,
  fetchKBStatusForFolder,
  updateCachedFilesWithStatus,
}: UseFolderOperationsProps) {
  const queryClient = useQueryClient();
  const { resolveFileStatus } = useDataManager();

  // Initialize prefetch functionality
  const {
    startPrefetch,
    stopPrefetch,
    registerFolder,
    isPrefetching,
    cancelPrefetch,
  } = usePrefetch({
    kbId,
    isEnabled: true, // Always enabled for now, can be made configurable
    isCreatingKB,
  });

  // Defer expensive tree rebuilds triggered by expansion/collapse
  const [, startTransition] = useTransition();

  // Fetch folder contents with caching
  const fetchFolderContents = useCallback(
    async (folderId: string) => {
      const result = await queryClient.fetchQuery({
        queryKey: ["drive-files", folderId],
        queryFn: () => listResources(folderId),
        staleTime: STALE_TIME,
      });
      return result?.data || [];
    },
    [queryClient]
  );

  // Extract folder path from file list
  const getFolderPath = useCallback((files: FileItem[]) => {
    if (!files.length) return "";

    const firstFile = files[0];
    const pathParts = firstFile.name.split("/");
    pathParts.pop(); // Remove filename
    return "/" + pathParts.join("/");
  }, []);

  // Toggle folder expansion
  const toggleFolder = useCallback(
    async (folderId: string) => {
      const isExpanded = expandedFolders.has(folderId);

      if (isExpanded) {
        // Collapse folder
        startTransition(() => {
          setExpandedFolders((prev) => {
            const newSet = new Set(prev);
            newSet.delete(folderId);
            return newSet;
          });
        });
        return;
      }

      // Cancel any ongoing prefetch for this folder to avoid conflicts
      cancelPrefetch(folderId);

      // Expand folder
      startTransition(() => setLoadingFolders((prev) => new Set(prev).add(folderId)));

      try {
        // 1. Fetch Google Drive contents (always needed for file tree structure)
        const driveFiles = await fetchFolderContents(folderId);

        if (kbId && driveFiles.length > 0) {
          const folderPath = getFolderPath(driveFiles);
          console.log(`📂 Expanding folder: ${folderPath}`);

          // 2. IMMEDIATE OPTIMISTIC UPDATE: Check if this folder should be optimistically indexed
          const shouldApplyOptimisticUpdate = resolveFileStatus("", kbId, folderPath) === "indexed";
          
          if (shouldApplyOptimisticUpdate) {
            console.log(`🌳 ROLLING UPDATE: Applying optimistic "indexed" status to folder: ${folderPath}`);
            
            // Apply optimistic status to all files in this folder
            const optimisticFiles = driveFiles
              .filter(file => file.type === "file")
              .map(file => ({
                ...file,
                status: "indexed" as const,
                indexed_at: new Date().toISOString()
              }));

            // Update folder status cache with optimistic data
            queryClient.setQueryData(["kb-file-status", kbId, folderPath], { 
              data: optimisticFiles 
            });
            
            console.log(`✅ Applied optimistic updates to ${optimisticFiles.length} files in ${folderPath}`);
            
            // 3. DELAYED POLLING: Only start polling if sync is completed (or if not creating KB)
            if (!isCreatingKB) {
              console.log(`🔄 Starting background polling for folder: ${folderPath} (sync completed)`);
              // Start polling with delay to avoid conflicts with optimistic updates
              setTimeout(() => {
                pollFolderStatus(folderPath, folderId);
              }, 1000);
            } else {
              console.log(`⏳ Delaying polling for folder: ${folderPath} (KB creation in progress)`);
              // Track this folder for delayed polling when KB creation completes
              setDelayedPollingFolders(prev => new Set(prev).add(folderId));
            }
          } else {
            // No optimistic update needed, fetch KB status normally but still respect sync timing
            if (!isCreatingKB) {
              console.log(`📊 Fetching KB status for folder: ${folderPath}`);
              const kbStatusMap = await fetchKBStatusForFolder(folderPath);
              updateCachedFilesWithStatus(folderId, kbStatusMap);
              
              // Start polling if there are pending files
              const files = driveFiles.filter(f => f.type === "file");
              const hasPendingFiles = files.some(f => kbStatusMap.get(f.id) === "pending");
              if (hasPendingFiles) {
                pollFolderStatus(folderPath, folderId);
              }
            } else {
              console.log(`⏳ Skipping KB status fetch during KB creation: ${folderPath}`);
            }
          }
          
          // 4. Always expand folder - status has been handled above
          startTransition(() => setExpandedFolders((prev) => new Set(prev).add(folderId)));
        } else {
          // No KB or no files, just expand
          startTransition(() => setExpandedFolders((prev) => new Set(prev).add(folderId)));
        }
      } catch (error) {
        console.error("Failed to load folder contents:", error);
        startTransition(() => setExpandedFolders((prev) => new Set(prev).add(folderId)));
      } finally {
        startTransition(() => {
          setLoadingFolders((prev) => {
            const newSet = new Set(prev);
            newSet.delete(folderId);
            return newSet;
          });
        });
      }
    },
    [
      expandedFolders,
      fetchFolderContents,
      kbId,
      getFolderPath,
      resolveFileStatus,
      queryClient,
      isCreatingKB,
      pollFolderStatus,
      fetchKBStatusForFolder,
      updateCachedFilesWithStatus,
      cancelPrefetch,
      setExpandedFolders,
      setLoadingFolders,
      setDelayedPollingFolders,
    ]
  );

  return {
    // Core operations
    toggleFolder,
    fetchFolderContents,
    getFolderPath,
    
    // Prefetch functions
    startPrefetch,
    stopPrefetch,
    registerFolder,
    isPrefetching,
  };
} 