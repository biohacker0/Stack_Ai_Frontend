import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listResources } from "@/lib/api/connections";
import { useDataManager } from "../useDataManager";
import { useTreeState } from "./treeState";
import { useStatusPolling } from "./statusPolling";
import { useFolderOperations } from "./folderOperations";
import { useTreeBuilder } from "./treeBuilder";

// Constants
const STALE_TIME = 5 * 60 * 1000; // 5 minutes

interface UseFileTreeProps {
  kbId?: string | null;
  statusMap?: Map<string, string>;
  isCreatingKB?: boolean;
}

export function useFileTree({ kbId, isCreatingKB }: UseFileTreeProps = {}) {
  const queryClient = useQueryClient();
  const { isDescendantOfOptimisticFolder } = useDataManager();

  // Initialize all state management
  const {
    expandedFolders,
    loadingFolders,
    errorToastShown,
    refreshTrigger,
    delayedPollingFolders,
    setExpandedFolders,
    setLoadingFolders,
    setErrorToastShown,
    setDelayedPollingFolders,
    collapseAllFolders,
    forceRefresh,
  } = useTreeState();

  // Initialize status polling functionality
  const { fetchKBStatusForFolder, updateCachedFilesWithStatus, pollFolderStatus } = useStatusPolling({
    kbId,
    errorToastShown,
    setErrorToastShown,
  });

  // Initialize folder operations
  const { toggleFolder, getFolderPath, startPrefetch, stopPrefetch, registerFolder, isPrefetching } = useFolderOperations({
    kbId,
    isCreatingKB,
    expandedFolders,
    setExpandedFolders,
    setLoadingFolders,
    setDelayedPollingFolders,
    pollFolderStatus,
    fetchKBStatusForFolder,
    updateCachedFilesWithStatus,
  });

  // Fetch root files
  const {
    data: rootData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["drive-files", "root"],
    queryFn: () => listResources(),
    staleTime: STALE_TIME,
  });

  // Initialize tree builder
  const { flatFiles } = useTreeBuilder({
    kbId,
    expandedFolders,
    loadingFolders,
    refreshTrigger,
    rootData,
  });

  // Handle delayed polling when KB creation completes
  useEffect(() => {
    // When KB creation completes (isCreatingKB changes from true to false)
    // Start polling for any folders that were expanded during creation
    if (!isCreatingKB && kbId && delayedPollingFolders.size > 0) {
      delayedPollingFolders.forEach((folderId) => {
        // Get folder data to extract path
        const folderData = queryClient.getQueryData<{ data: any[] }>(["drive-files", folderId]);
        if (folderData?.data && folderData.data.length > 0) {
          const folderPath = getFolderPath(folderData.data);

          // Check if this folder should have optimistic updates
          if (isDescendantOfOptimisticFolder(kbId, folderPath)) {
            setTimeout(() => {
              pollFolderStatus(folderPath, folderId);
            }, 1000); // Small delay to let things settle
          }
        }
      });

      // Clear the delayed polling set
      setDelayedPollingFolders(new Set());
    }
  }, [isCreatingKB, kbId, delayedPollingFolders, queryClient, getFolderPath, isDescendantOfOptimisticFolder, pollFolderStatus, setDelayedPollingFolders]);

  return {
    files: flatFiles,
    isLoading,
    error,
    expandedFolders,
    toggleFolder,
    collapseAllFolders,
    refetch,
    // Prefetch functions
    startPrefetch,
    stopPrefetch,
    registerFolder,
    isPrefetching,
    // Force refresh for optimistic updates
    forceRefresh,
  };
}
