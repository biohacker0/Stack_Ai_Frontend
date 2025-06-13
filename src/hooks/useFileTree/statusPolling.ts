import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listKBResourcesSafe } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";
import { toast } from 'react-toastify';

// Constants - PERFORMANCE OPTIMIZED
const POLL_INTERVAL = 2000; // Increase to 2 seconds to reduce main thread pressure
const MAX_CONCURRENT_POLLS = 2; // Limit concurrent polling requests

interface UseStatusPollingProps {
  kbId?: string | null;
  errorToastShown: Set<string>;
  setErrorToastShown: (setter: (prev: Set<string>) => Set<string>) => void;
}

export function useStatusPolling({ kbId, errorToastShown, setErrorToastShown }: UseStatusPollingProps) {
  const queryClient = useQueryClient();
  const activePolls = useRef<Set<string>>(new Set());
  const pollQueue = useRef<Array<{ folderPath: string; folderId: string }>>([]);

  // Process poll queue with concurrency limiting
  const processNextPoll = useCallback(() => {
    if (activePolls.current.size >= MAX_CONCURRENT_POLLS || pollQueue.current.length === 0) {
      return;
    }

    const nextPoll = pollQueue.current.shift();
    if (!nextPoll) return;

    activePolls.current.add(nextPoll.folderPath);
    
    // Execute the poll
    pollFolderStatusInternal(nextPoll.folderPath, nextPoll.folderId)
      .finally(() => {
        activePolls.current.delete(nextPoll.folderPath);
        // Process next in queue
        processNextPoll();
      });
  }, []);

  // Fetch KB status for a folder path
  const fetchKBStatusForFolder = useCallback(
    async (folderPath: string, forceRefresh: boolean = false) => {
      if (!kbId) return new Map<string, string>();

      try {
        // Only invalidate cache if forceRefresh is true
        if (forceRefresh) {
          await queryClient.invalidateQueries({
            queryKey: ["kb-file-status", kbId, folderPath],
          });
        }

        const kbData = await queryClient.fetchQuery({
          queryKey: ["kb-file-status", kbId, folderPath],
          queryFn: () => listKBResourcesSafe(kbId, folderPath),
          staleTime: 5 * 60 * 1000, // 5 minutes - don't refetch too often
        });

        const statusMap = new Map<string, string>();

        if (kbData?.data) {
          kbData.data.forEach((resource: any) => {
            statusMap.set(resource.id, resource.status || "unknown");
          });
        }

        // If we get empty data, cache it as "no indexed files" status
        if (!kbData?.data || kbData.data.length === 0) {
          // Cache the empty result so we don't keep hitting API
          queryClient.setQueryData(["kb-file-status", kbId, folderPath], { data: [] });
        }

        return statusMap;
      } catch (error) {
        console.error("Failed to fetch KB status:", error);
        return new Map<string, string>();
      }
    },
    [kbId, queryClient]
  );

  // Update cached files with KB status and return polling info
  const updateCachedFilesWithStatus = useCallback(
    (folderId: string, kbStatusMap: Map<string, string>) => {
      const folderData = queryClient.getQueryData<{ data: FileItem[] }>(["drive-files", folderId]);
      
      if (!folderData?.data) return { hasPending: false, hasErrors: false };

      let hasPending = false;
      let hasErrors = false;

      const updatedFiles = folderData.data.map(file => {
        if (file.type === "file") {
          const kbStatus = kbStatusMap.get(file.id);
          if (kbStatus) {
            if (kbStatus === "pending") hasPending = true;
            if (kbStatus === "failed" || kbStatus === "error") hasErrors = true;
            
            return { ...file, status: kbStatus as FileItem["status"] };
          }
        }
        return file;
      });

      // Batch cache update using unstable_batchedUpdates equivalent
      requestAnimationFrame(() => {
        queryClient.setQueryData(["drive-files", folderId], { data: updatedFiles });
      });

      return { hasPending, hasErrors };
    },
    [queryClient]
  );

  // Internal polling function with error handling
  const pollFolderStatusInternal = useCallback(
    async (folderPath: string, folderId: string) => {
      if (!kbId) return;

      try {
        // Get current cached status
        const currentCache = queryClient.getQueryData<{ data: FileItem[] }>(["kb-file-status", kbId, folderPath]);
        
        // Fetch fresh status from API (force refresh for polling)
        const kbStatusMap = await fetchKBStatusForFolder(folderPath, true);
        
        // Only update cache if there are meaningful changes
        let hasChanges = false;
        let hasPending = false;
        let hasErrors = false;
        const errorFiles: string[] = [];
        
        if (currentCache?.data) {
          // Compare current cache with fresh data
          kbStatusMap.forEach((newStatus, fileId) => {
            const currentFile = currentCache.data.find(f => f.id === fileId);
            const currentStatus = currentFile?.status;
            
            if (currentStatus !== newStatus) {
              hasChanges = true;
            }
            
            if (newStatus === "pending") hasPending = true;
            if (newStatus === "failed" || newStatus === "error") {
              hasErrors = true;
              errorFiles.push(currentFile?.name || fileId);
            }
          });
          
          // Only update if there are actual changes
          if (hasChanges) {
            const { hasPending: updatedHasPending, hasErrors: updatedHasErrors } = updateCachedFilesWithStatus(folderId, kbStatusMap);
            hasPending = updatedHasPending;
            hasErrors = updatedHasErrors;
          }
        } else {
          // No cache exists, update with fresh data
          const result = updateCachedFilesWithStatus(folderId, kbStatusMap);
          hasPending = result.hasPending;
          hasErrors = result.hasErrors;
          
          // Find error files for toast
          kbStatusMap.forEach((status, fileId) => {
            if (status === "failed" || status === "error") {
              const file = queryClient.getQueryData<{ data: FileItem[] }>(["drive-files", folderId])?.data?.find(f => f.id === fileId);
              errorFiles.push(file?.name || fileId);
            }
          });
        }

        // Show error toast for failed files (like root files do)
        if (hasErrors && errorFiles.length > 0 && !errorToastShown.has(folderPath)) {
          setErrorToastShown(prev => new Set(prev).add(folderPath));
          toast.error(
            `Failed to index ${errorFiles.length} file(s) in folder ${folderPath}: ${errorFiles.join(", ")}`,
            {
              autoClose: 8000,
              toastId: `folder-error-${folderPath}`
            }
          );
        }

        // Continue polling if there are still pending files
        if (hasPending) {
          // Use setTimeout in requestIdleCallback for non-blocking polling
          if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
              setTimeout(() => {
                if (!activePolls.current.has(folderPath)) {
                  pollQueue.current.push({ folderPath, folderId });
                  processNextPoll();
                }
              }, POLL_INTERVAL);
            });
          } else {
            // Fallback for browsers without requestIdleCallback
            setTimeout(() => {
              if (!activePolls.current.has(folderPath)) {
                pollQueue.current.push({ folderPath, folderId });
                processNextPoll();
              }
            }, POLL_INTERVAL);
          }
        }
      } catch (error) {
        console.error(`❌ Polling failed for ${folderPath}:`, error);
        
        // Handle 500 errors gracefully during KB creation
        if (error instanceof Error && error.message.includes("Failed to fetch resources")) {
          // Don't show error toast for 500 errors during KB creation
        } else {
          // Show error toast for other types of errors
          if (!errorToastShown.has(folderPath)) {
            setErrorToastShown(prev => new Set(prev).add(folderPath));
            toast.error(
              `Failed to fetch status for folder ${folderPath}. Please try refreshing.`,
              {
                autoClose: 5000,
                toastId: `poll-error-${folderPath}`
              }
            );
          }
        }
      }
    },
    [kbId, fetchKBStatusForFolder, updateCachedFilesWithStatus, queryClient, errorToastShown, setErrorToastShown, processNextPoll]
  );

  // Public polling function that uses queue
  const pollFolderStatus = useCallback(
    async (folderPath: string, folderId: string) => {
      // Don't queue if already polling this folder
      if (activePolls.current.has(folderPath)) {
        return;
      }

      // Don't queue duplicates
      const alreadyQueued = pollQueue.current.some(p => p.folderPath === folderPath);
      if (alreadyQueued) {
        return;
      }

      pollQueue.current.push({ folderPath, folderId });
      processNextPoll();
    },
    [processNextPoll]
  );

  return {
    fetchKBStatusForFolder,
    updateCachedFilesWithStatus,
    pollFolderStatus,
  };
} 