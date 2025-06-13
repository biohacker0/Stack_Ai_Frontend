"use client";

import { useFileTree } from "@/hooks/useFileTree";
import { useKnowledgeBaseOperations } from "@/hooks/useKnowledgeBaseOperations";
import { FilePickerTable } from "./FilePickerTable";

// FilePicker with optimistic UI updates
// - KB creation: Shows files as "indexed" immediately, no loaders
// - File deletion: Shows files as "-" immediately, no loaders
// - Background API calls happen seamlessly
export function FilePicker() {
  const {
    currentKB,
    hasKB,
    isCreating,
    createKnowledgeBaseWithFiles,
    createNewKB,
    statusMap,
    statusCounts,
    allFilesSettled,
    isPolling,
    // Deletion functions
    isDeleting,
    isActuallyDeleting,
    deleteSelectedFiles,
    isFileDeleting,
    canDeleteFile,
    canDeleteFolder,
    // New sync and queue state
    syncState,
    isSyncPending,
    isSyncCompleted,
    queueHasItems,
    queueCount,
    queueProcessing,
  } = useKnowledgeBaseOperations();

  const { files, isLoading, error, toggleFolder, collapseAllFolders, startPrefetch, stopPrefetch, registerFolder, isPrefetching } = useFileTree({
    kbId: currentKB?.id || null,
    statusMap,
    isCreatingKB: isCreating,
  });

  // Show error if any
  if (error) {
    return (
      <div className="p-6">
        <h2 className="text-xl text-red-600">Error loading files</h2>
        <pre className="mt-2">{JSON.stringify(error, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-shrink-0 p-4 pb-2">{/* Sync State Indicator */}</div>

      <div className="flex-1 min-h-0 p-4">
        <FilePickerTable
          files={files}
          isLoading={isLoading}
          toggleFolder={toggleFolder}
          onCreateKB={(resourceIds, files) => {
            createKnowledgeBaseWithFiles(resourceIds, files);
          }}
          onCreateNewKB={createNewKB}
          onDeleteFiles={(selectedIds) => {
            deleteSelectedFiles(selectedIds, files);
          }}
          hasKB={hasKB}
          isCreatingKB={isCreating}
          isDeletingKB={isDeleting}
          isActuallyDeleting={isActuallyDeleting}
          statusMap={statusMap}
          canDeleteFile={canDeleteFile}
          canDeleteFolder={(folder) => canDeleteFolder(folder, files)}
          isFileDeleting={isFileDeleting}
          kbId={currentKB?.id || null}
          // Prefetch functions
          startPrefetch={startPrefetch}
          stopPrefetch={stopPrefetch}
          registerFolder={registerFolder}
          isPrefetching={isPrefetching}
        />
      </div>
    </div>
  );
}
