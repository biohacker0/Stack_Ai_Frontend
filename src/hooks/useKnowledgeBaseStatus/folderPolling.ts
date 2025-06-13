import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listKBResourcesSafe } from "@/lib/api/knowledgeBase";
import { toast } from "react-toastify";

// Constants
const POLL_INTERVAL = 1000; // 1 second for faster updates

interface UseFolderPollingProps {
  kbId: string | null;
  shouldEnablePolling: boolean;
  indexedFolders: Array<{ folderPath: string; fileIds: string[] }>;
  hasShownErrorToast: boolean;
  setHasShownErrorToast: (value: boolean) => void;
}

export function useFolderPolling({ kbId, shouldEnablePolling, indexedFolders, hasShownErrorToast, setHasShownErrorToast }: UseFolderPollingProps) {
  const queryClient = useQueryClient();
  const [folderPollingStatus, setFolderPollingStatus] = useState<Map<string, boolean>>(new Map());

  // Poll folder status for indexed folders
  const pollFolderStatus = useCallback(
    async (folderPath: string, expectedFileIds: string[]) => {
      if (!kbId || !shouldEnablePolling) return;

      try {
        // Fetch current status for this folder
        const folderData = await listKBResourcesSafe(kbId, folderPath);
        const folderFiles = folderData?.data || [];

        // Update folder status cache
        queryClient.setQueryData(["kb-file-status", kbId, folderPath], { data: folderFiles });

        // Check if all expected files are settled
        let hasPending = false;
        let hasErrors = false;

        expectedFileIds.forEach((fileId) => {
          const file = folderFiles.find((f) => f.id === fileId);
          if (file) {
            if (file.status === "pending") {
              hasPending = true;
            } else if (file.status === "error" || file.status === "failed") {
              hasErrors = true;
            } else if (file.status === "indexed") {
            }
          } else {
            // File not found in KB response - might be failed or not indexed
          }
        });

        // Show error toast for failed files in this folder
        if (hasErrors && !hasShownErrorToast) {
          const failedFiles = expectedFileIds.filter((fileId) => {
            const file = folderFiles.find((f) => f.id === fileId);
            return file && (file.status === "error" || file.status === "failed");
          });

          if (failedFiles.length > 0) {
            setHasShownErrorToast(true);
            toast.error(`Failed to index ${failedFiles.length} file(s) in folder ${folderPath}. Please try creating a new knowledge base.`, {
              autoClose: 8000,
              toastId: `folder-error-${folderPath}`,
            });
          }
        }

        // Continue polling if there are still pending files
        if (hasPending) {
          console.log(
            `🔄 Continuing to poll folder ${folderPath} (${
              expectedFileIds.filter((id) => {
                const file = folderFiles.find((f) => f.id === id);
                return file && file.status === "pending";
              }).length
            } files still pending)`
          );

          setTimeout(() => pollFolderStatus(folderPath, expectedFileIds), POLL_INTERVAL);
        } else {
          setFolderPollingStatus((prev) => {
            const newMap = new Map(prev);
            newMap.set(folderPath, false); // Mark as done
            return newMap;
          });
        }
      } catch (error) {
        console.error(`❌ Error polling folder ${folderPath}:`, error);
        // Stop polling this folder on error
        setFolderPollingStatus((prev) => {
          const newMap = new Map(prev);
          newMap.set(folderPath, false);
          return newMap;
        });
      }
    },
    [kbId, shouldEnablePolling, queryClient, hasShownErrorToast, setHasShownErrorToast]
  );

  // Start folder polling when indexedFolders change
  useEffect(() => {
    if (!shouldEnablePolling || !kbId || indexedFolders.length === 0) return;

    // Reset folder polling status
    const newPollingStatus = new Map<string, boolean>();

    // Start polling for each indexed folder
    indexedFolders.forEach(({ folderPath, fileIds }) => {
      if (fileIds.length > 0) {
        newPollingStatus.set(folderPath, true);

        // Start polling with a slight delay to avoid overwhelming the API
        setTimeout(() => {
          pollFolderStatus(folderPath, fileIds);
        }, 500);
      }
    });

    setFolderPollingStatus(newPollingStatus);
  }, [indexedFolders, shouldEnablePolling, kbId, pollFolderStatus]);

  // Reset folder polling status when KB changes
  useEffect(() => {
    if (kbId) {
      setFolderPollingStatus(new Map());
    }
  }, [kbId]);

  // Check if folder polling is still active
  const isFolderPollingActive = Array.from(folderPollingStatus.values()).some((isActive) => isActive);

  return {
    folderPollingStatus,
    isFolderPollingActive,
    pollFolderStatus,
  };
}
