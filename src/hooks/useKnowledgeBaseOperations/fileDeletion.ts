import { useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteKBResource } from "@/lib/api/knowledgeBase";
import type { FileItem } from "@/lib/types/file";
import type { DeleteRequest } from "../useDataManager/types";
import { toast } from "react-toastify";

export function useFileDeletion(
  currentKB: { id: string } | null,
  isSyncCompleted: boolean,
  isSyncPending: boolean,
  queueHasItems: boolean,
  queueProcessing: boolean,
  queueCount: number,
  queue: DeleteRequest[],
  setQueueProcessing: (processing: boolean) => void,
  removeFromQueue: (requestId: string) => void,
  markFileAsDeleted: (fileId: string, fileName: string, kbId: string) => void,
  queueDeleteRequest: (fileId: string, fileName: string, kbId: string) => void,
  persistCacheToStorage: (kbId: string) => void
) {
  const queryClient = useQueryClient();

  // Process delete queue when sync completes
  useEffect(() => {
    if (isSyncCompleted && queueHasItems && !queueProcessing) {
      processQueue();
    }
  }, [isSyncCompleted, queueHasItems, queueProcessing, currentKB?.id]);

  // Process delete queue function
  const processQueue = useCallback(async () => {
    if (!currentKB?.id || queueProcessing || !queueHasItems) return;

    setQueueProcessing(true);

    try {
      // Process queue items one by one with delay
      for (const request of queue as DeleteRequest[]) {
        try {
          await deleteKBResource(request.kbId, request.resourcePath);

          // Remove from queue on success
          removeFromQueue(request.id);

          // Add delay between deletions
          if (queue.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`❌ Failed to delete ${request.fileName}:`, error);
          // Remove failed request from queue to prevent infinite retry
          removeFromQueue(request.id);
        }
      }

      toast.success(`Successfully processed delete queue`, {
        autoClose: 3000,
        toastId: "queue-processing-success",
      });
    } finally {
      setQueueProcessing(false);
    }
  }, [currentKB?.id, queue, queueProcessing, queueHasItems, queueCount, setQueueProcessing, removeFromQueue]);

  // OPTIMISTIC FILE DELETION WITH QUEUE
  const deleteFilesMutation = useMutation({
    mutationKey: ["deleteFiles"],
    mutationFn: async ({ fileIds, files }: { fileIds: string[]; files: FileItem[] }) => {
      if (!currentKB?.id) throw new Error("No KB ID");

      // If sync is pending, this will be handled by the queue
      if (isSyncPending) {
        throw new Error("Sync is pending - delete should be queued");
      }

      // Direct deletion for when sync is complete
      const deletePromises = fileIds.map(async (fileId) => {
        const file = files.find((f) => f.id === fileId);
        if (!file) return;

        const resourcePath = `/${file.name}`;
        return deleteKBResource(currentKB.id, resourcePath);
      });

      await Promise.all(deletePromises);
      return { fileIds };
    },
    onSuccess: ({ fileIds }, variables, context) => {
      // Remove files from optimistic delete registry since they're actually deleted
      fileIds.forEach((fileId) => {
        // Note: Don't remove from registry here as the files are already
        // removed from cache optimistically. The registry entry will be
        // cleaned up when the cache update happens.
      });

      // Persist cache after successful deletion
      if (currentKB?.id) {
        persistCacheToStorage(currentKB.id);
      }

      toast.success(`Successfully deleted ${fileIds.length} file(s)`, {
        autoClose: 3000,
        toastId: "file-deletion-success",
      });
    },
    onError: (error, variables, context) => {
      console.error("❌ DIRECT FILE DELETION FAILED:", error);

      toast.error("Failed to delete files. Please try again.", {
        autoClose: 5000,
        toastId: "file-deletion-error",
      });
    },
  });

  // Delete selected files function
  const deleteSelectedFiles = useCallback(
    (selectedIds: string[], files: FileItem[]) => {
      if (!currentKB?.id) {
        console.warn("No KB ID available for deletion");
        return;
      }

      // 1. IMMEDIATELY mark files as deleted in registry (locks their status)
      selectedIds.forEach((fileId) => {
        const file = files.find((f) => f.id === fileId);
        if (file) {
          markFileAsDeleted(fileId, file.name, currentKB.id);
        }
      });

      // 2. IMMEDIATELY remove from KB resources cache (shows as "-" in UI)
      const kbQueryKey = ["kb-resources", currentKB.id];
      const currentKBData = queryClient.getQueryData<{ data: FileItem[] }>(kbQueryKey);

      if (currentKBData?.data) {
        const filteredData = {
          ...currentKBData,
          data: currentKBData.data.filter((resource) => !selectedIds.includes(resource.id)),
        };

        queryClient.setQueryData(kbQueryKey, filteredData);
      }

      // 3. Handle deletion based on sync state
      if (isSyncPending) {
        // Queue the deletions for later processing

        selectedIds.forEach((fileId) => {
          const file = files.find((f) => f.id === fileId);
          if (file) {
            queueDeleteRequest(fileId, file.name, currentKB.id);
          }
        });

        toast.info(`Queued ${selectedIds.length} file(s) for deletion. They will be processed when sync completes.`, {
          autoClose: 4000,
          toastId: "files-queued-for-deletion",
        });
      } else {
        // Execute deletion immediately

        deleteFilesMutation.mutate({ fileIds: selectedIds, files });
      }
    },
    [currentKB?.id, isSyncPending, markFileAsDeleted, queueDeleteRequest, deleteFilesMutation, queryClient]
  );

  return {
    processQueue,
    deleteFilesMutation,
    deleteSelectedFiles,
    isDeleting: deleteFilesMutation.isPending,
  };
}
