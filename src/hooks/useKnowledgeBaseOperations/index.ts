import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { saveKBToStorage, getKBFromStorage, clearKBFromStorage, clearCacheFromStorage } from "@/lib/utils/localStorage";
import type { FileItem } from "@/lib/types/file";
import { useKBState } from "./kbState";
import { useKBHelpers } from "./kbHelpers";
import { useKBCreation } from "./kbCreation";
import { useFileDeletion } from "./fileDeletion";

export function useKnowledgeBaseOperations() {
  const queryClient = useQueryClient();

  // Get state and all data manager functions
  const kbState = useKBState();
  const {
    currentKB,
    setCurrentKB,
    hasKB,
    indexedFolders,
    setIndexedFolders,
    statusMap,
    statusCounts,
    allFilesSettled,
    isPolling,
    shouldPoll,
    isActuallyDeleting,
    isFileDeleting,
    canDeleteFile,
    canDeleteFolder,
    // Data manager functions
    isSyncPending,
    isSyncCompleted,
    setSyncPending,
    setSyncCompleted,
    queue,
    queueProcessing,
    queueCount,
    queueHasItems,
    queueDeleteRequest,
    removeFromQueue,
    updateQueueKBId,
    setQueueProcessing,
    clearQueue,
    markFileAsDeleted,
    clearRegistry,
    resolveFileStatus,
    updateKBResourcesCache,
    updateFolderStatusCache,
    removeFromKBResourcesCache,
    setFolderContentsAsIndexed,
    getFolderPathFromFileName,
    getFolderContents,
    getAllDescendantFileIds,
    persistCacheToStorage,
    markFoldersAsOptimisticallyIndexed,
    isDescendantOfOptimisticFolder,
    getOptimisticAncestorFolder,
    clearOptimisticFoldersForKB,
    clearAllState,
    syncState,
    resetSyncState,
  } = kbState;

  // Get helpers
  const { findAllFilesInSelectedFolders } = useKBHelpers(getFolderContents, getFolderPathFromFileName, getAllDescendantFileIds);

  // Get KB creation functionality
  const { createKBMutation } = useKBCreation(
    setSyncPending,
    setSyncCompleted,
    updateKBResourcesCache,
    updateFolderStatusCache,
    markFoldersAsOptimisticallyIndexed,
    clearOptimisticFoldersForKB,
    updateQueueKBId,
    setCurrentKB,
    setIndexedFolders,
    getFolderPathFromFileName,
    getAllDescendantFileIds
  );

  // Get file deletion functionality
  const { processQueue, deleteFilesMutation, deleteSelectedFiles, isDeleting } = useFileDeletion(
    currentKB,
    isSyncCompleted,
    isSyncPending,
    queueHasItems,
    queueProcessing,
    queueCount,
    queue,
    setQueueProcessing,
    removeFromQueue,
    markFileAsDeleted,
    queueDeleteRequest,
    persistCacheToStorage
  );

  // Public functions
  const createKnowledgeBaseWithFiles = useCallback(
    (resourceIds: string[], files: FileItem[]) => {
      if (resourceIds.length === 0) {
        console.warn("No files selected for KB creation");
        return;
      }

      createKBMutation.mutate({ resourceIds, files });
    },
    [createKBMutation]
  );

  const createNewKB = useCallback(() => {
    // 1. Use comprehensive cleanup from DataManager (this handles everything)
    clearAllState();

    // 2. Clear KB from localStorage
    clearKBFromStorage();

    // 3. Clear ALL React Query caches to ensure clean state
    queryClient.clear();

    // 4. Reset component state
    setCurrentKB(null);
    setIndexedFolders([]);

    // 5. Force page reload to ensure completely clean state

    window.location.reload();
  }, [clearAllState, queryClient, setCurrentKB, setIndexedFolders]);

  return {
    currentKB,
    hasKB,
    isCreating: createKBMutation.isPending,
    createKnowledgeBaseWithFiles,
    createNewKB,
    statusMap, // Use original status map since resolveFileStatus handles optimistic overrides
    statusCounts,
    allFilesSettled,
    isPolling,
    // Deletion functions
    isDeleting,
    isActuallyDeleting, // From useKnowledgeBaseDeletion - tracks actual API calls
    deleteSelectedFiles,
    isFileDeleting,
    canDeleteFile,
    canDeleteFolder,
    // New sync and queue state
    syncState,
    isSyncPending,
    isSyncCompleted,
    queue,
    queueProcessing,
    queueCount,
    queueHasItems,
  };
}
