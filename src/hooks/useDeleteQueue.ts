import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { deleteKBResource } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";
import { toast } from "react-toastify";

interface DeleteRequest {
  id: string;
  fileId: string;
  fileName: string;
  resourcePath: string;
  kbId: string;
  timestamp: number;
}

interface DeleteQueueData {
  queue: DeleteRequest[];
  processing: boolean;
  lastUpdated: number;
}

const DELETE_QUEUE_KEY = ["delete-queue"];

export function useDeleteQueue() {
  const queryClient = useQueryClient();

  // Use useQuery to subscribe to cache changes
  const { data: queueData } = useQuery({
    queryKey: DELETE_QUEUE_KEY,
    queryFn: () => {
      // This won't actually run since we always have data
      return { queue: [], processing: false, lastUpdated: Date.now() };
    },
    initialData: { queue: [], processing: false, lastUpdated: Date.now() },
    staleTime: Infinity, // Never considered stale since we update via setQueryData
  });

  const { queue, processing } = queueData;

  // Update queue data
  const updateQueueData = useCallback(
    (updater: (prev: DeleteQueueData) => DeleteQueueData) => {
      const currentData = queryClient.getQueryData<DeleteQueueData>(DELETE_QUEUE_KEY) || queueData;

      const newData = updater(currentData);
      queryClient.setQueryData(DELETE_QUEUE_KEY, newData);

      return newData;
    },
    [queryClient, queueData]
  );

  // Add delete request to queue
  const queueDeleteRequest = useCallback(
    (fileId: string, fileName: string, kbId: string) => {
      const deleteRequest: DeleteRequest = {
        id: `delete-${fileId}-${Date.now()}`,
        fileId,
        fileName,
        resourcePath: `/${fileName}`, // Root level files
        kbId,
        timestamp: Date.now(),
      };

      updateQueueData((prev) => ({
        ...prev,
        queue: [...prev.queue, deleteRequest],
        lastUpdated: Date.now(),
      }));

      return deleteRequest.id;
    },
    [updateQueueData]
  );

  // Remove delete request from queue
  const removeFromQueue = useCallback(
    (requestId: string) => {
      updateQueueData((prev) => ({
        ...prev,
        queue: prev.queue.filter((req) => req.id !== requestId),
        lastUpdated: Date.now(),
      }));
    },
    [updateQueueData]
  );

  // Execute a single delete request
  const executeDeleteRequest = useCallback(async (request: DeleteRequest): Promise<boolean> => {
    try {
      await deleteKBResource(request.kbId, request.resourcePath);

      return true;
    } catch (error) {
      console.error(`❌ Delete failed: ${request.fileName}`, error);
      toast.error(`Failed to delete ${request.fileName}. Please try again.`, {
        autoClose: 5000,
        toastId: `delete-error-${request.fileId}`,
      });
      return false;
    }
  }, []);

  // Process entire queue sequentially
  const processQueue = useCallback(
    async (currentKbId: string | null) => {
      if (!currentKbId || processing || queue.length === 0) {
        return;
      }

      // Mark as processing
      updateQueueData((prev) => ({
        ...prev,
        processing: true,
        lastUpdated: Date.now(),
      }));

      const results: { success: number; failed: number } = { success: 0, failed: 0 };

      try {
        // Process requests sequentially with 1000ms delay
        for (const request of queue) {
          // Skip if request is for a different KB
          if (request.kbId !== currentKbId) {
            continue;
          }

          const success = await executeDeleteRequest(request);

          if (success) {
            results.success++;
            // Remove successful request from queue immediately
            removeFromQueue(request.id);
          } else {
            results.failed++;
          }

          // Add delay between requests to avoid overwhelming server
          if (queue.indexOf(request) < queue.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }

        // Show summary toast
        if (results.success > 0) {
          toast.success(`Successfully deleted ${results.success} file(s)${results.failed > 0 ? `. ${results.failed} failed.` : ""}`, {
            autoClose: 3000,
            toastId: "queue-processing-success",
          });
        }
      } finally {
        // Mark as not processing
        updateQueueData((prev) => ({
          ...prev,
          processing: false,
          lastUpdated: Date.now(),
        }));
      }
    },
    [queue, processing, updateQueueData, executeDeleteRequest, removeFromQueue]
  );

  // Update KB ID in all queued requests (when switching from temp to real KB)
  const updateQueueKBId = useCallback(
    (oldKbId: string, newKbId: string) => {
      updateQueueData((prev) => ({
        ...prev,
        queue: prev.queue.map((request) => (request.kbId === oldKbId ? { ...request, kbId: newKbId } : request)),
        lastUpdated: Date.now(),
      }));
    },
    [updateQueueData]
  );

  // Clear entire queue
  const clearQueue = useCallback(() => {
    updateQueueData((prev) => ({
      queue: [],
      processing: false,
      lastUpdated: Date.now(),
    }));
  }, [updateQueueData]);

  // Get queue stats
  const queueStats = useMemo(
    () => ({
      count: queue.length,
      processing,
      hasItems: queue.length > 0,
    }),
    [queue.length, processing]
  );

  return {
    queue,
    processing,
    queueStats,
    queueDeleteRequest,
    removeFromQueue,
    processQueue,
    clearQueue,
    executeDeleteRequest,
    updateQueueKBId,
  };
}
