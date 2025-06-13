import { useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listResources } from "@/lib/api/connections";
import { listKBResourcesSafe } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";

interface UsePrefetchProps {
  kbId?: string | null;
  isEnabled?: boolean;
  isCreatingKB?: boolean;
}

interface PrefetchRequest {
  folderId: string;
  abortController: AbortController;
  timeoutId: NodeJS.Timeout;
}

// PERFORMANCE: Limit concurrent requests to prevent main thread blocking
const MAX_CONCURRENT_PREFETCHES = 3;

export function usePrefetch({ kbId, isEnabled = true, isCreatingKB = false }: UsePrefetchProps = {}) {
  const queryClient = useQueryClient();
  const activePrefetches = useRef<Map<string, PrefetchRequest>>(new Map());
  const intersectionObserver = useRef<IntersectionObserver | null>(null);
  const visibleFolders = useRef<Set<string>>(new Set());
  const requestQueue = useRef<string[]>([]);
  const activeRequestCount = useRef<number>(0);

  // Initialize intersection observer for viewport detection
  useEffect(() => {
    if (!isEnabled) return;

    intersectionObserver.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const folderId = entry.target.getAttribute("data-folder-id");
          if (!folderId) return;

          if (entry.isIntersecting) {
            visibleFolders.current.add(folderId);
          } else {
            visibleFolders.current.delete(folderId);
            // Cancel prefetch if folder goes out of view
            cancelPrefetch(folderId);
          }
        });
      },
      {
        root: null,
        rootMargin: "50px", // Start prefetching 50px before folder comes into view
        threshold: 0.1,
      }
    );

    return () => {
      intersectionObserver.current?.disconnect();
      // Cancel all active prefetches on cleanup
      activePrefetches.current.forEach((request) => {
        clearTimeout(request.timeoutId);
        request.abortController.abort();
      });
      activePrefetches.current.clear();
      requestQueue.current = [];
      activeRequestCount.current = 0;
    };
  }, [isEnabled]);

  // Process queued requests when slots become available
  const processQueue = useCallback(() => {
    if (activeRequestCount.current >= MAX_CONCURRENT_PREFETCHES || requestQueue.current.length === 0) {
      return;
    }

    const folderId = requestQueue.current.shift();
    if (!folderId) return;

    // Only process if still visible
    if (visibleFolders.current.has(folderId)) {
      activeRequestCount.current++;

      const abortController = new AbortController();

      prefetchFolderContents(folderId, abortController.signal).finally(() => {
        activeRequestCount.current--;
        // Process next in queue
        processQueue();
      });
    } else {
      // If not visible anymore, continue with queue
      processQueue();
    }
  }, []);

  // Cancel a specific prefetch request
  const cancelPrefetch = useCallback((folderId: string) => {
    const request = activePrefetches.current.get(folderId);
    if (request) {
      clearTimeout(request.timeoutId);
      request.abortController.abort();
      activePrefetches.current.delete(folderId);
    }

    // Remove from queue if present
    requestQueue.current = requestQueue.current.filter((id) => id !== folderId);
  }, []);

  // Get folder path from file list (same logic as useFileTree)
  const getFolderPath = useCallback((files: FileItem[]) => {
    if (!files.length) return "";
    const firstFile = files[0];
    const pathParts = firstFile.name.split("/");
    pathParts.pop(); // Remove filename
    return "/" + pathParts.join("/");
  }, []);

  // Pre-fetch folder contents and KB status - OPTIMIZED
  const prefetchFolderContents = useCallback(
    async (folderId: string, abortSignal: AbortSignal) => {
      try {
        // Check if already cached and fresh
        const existingData = queryClient.getQueryData(["drive-files", folderId]);
        let driveResult = existingData as { data: FileItem[] } | undefined;

        // If not cached, prefetch Google Drive contents
        if (!existingData && !abortSignal.aborted) {
          if (process.env.NODE_ENV === "development") {
          }

          await queryClient.prefetchQuery({
            queryKey: ["drive-files", folderId],
            queryFn: async () => {
              if (abortSignal.aborted) throw new Error("Aborted");
              return listResources(folderId);
            },
            staleTime: 5 * 60 * 1000, // 5 minutes
          });

          // Get the cached result to extract folder path
          driveResult = queryClient.getQueryData<{ data: FileItem[] }>(["drive-files", folderId]);
        }

        // If we have a KB, prefetch KB status (with throttling)
        if (kbId && driveResult?.data && driveResult.data.length > 0 && !abortSignal.aborted) {
          const folderPath = getFolderPath(driveResult.data);

          // Check if KB status is already cached
          const existingKBStatus = queryClient.getQueryData(["kb-file-status", kbId, folderPath]);

          if (!existingKBStatus) {
            // Use requestIdleCallback for non-critical KB status prefetch
            if ("requestIdleCallback" in window) {
              requestIdleCallback(() => {
                if (!abortSignal.aborted) {
                  queryClient.prefetchQuery({
                    queryKey: ["kb-file-status", kbId, folderPath],
                    queryFn: async () => {
                      if (abortSignal.aborted) throw new Error("Aborted");
                      return listKBResourcesSafe(kbId, folderPath);
                    },
                    staleTime: 1 * 60 * 1000, // 1 minute for KB status
                  });
                }
              });
            }
          }
        }
      } catch (error: any) {
        if (error.message !== "Aborted" && process.env.NODE_ENV === "development") {
          console.error(`Prefetch failed for folder ${folderId}:`, error);
        }
      }
    },
    [queryClient, kbId, getFolderPath]
  );

  // Start prefetch on hover with delay and queueing
  const startPrefetch = useCallback(
    (folderId: string, delay: number = 300) => {
      if (!isEnabled) return;

      // Don't prefetch if folder is not visible
      if (!visibleFolders.current.has(folderId)) {
        return;
      }

      // Cancel existing prefetch for this folder
      cancelPrefetch(folderId);

      // Create new abort controller
      const abortController = new AbortController();

      // Set timeout for delayed prefetch
      const timeoutId = setTimeout(() => {
        // Double-check folder is still visible before adding to queue
        if (visibleFolders.current.has(folderId) && !abortController.signal.aborted) {
          // Add to queue instead of executing immediately
          if (!requestQueue.current.includes(folderId)) {
            requestQueue.current.push(folderId);
            processQueue();
          }
        }
      }, delay);

      // Store the request
      activePrefetches.current.set(folderId, {
        folderId,
        abortController,
        timeoutId,
      });
    },
    [isEnabled, cancelPrefetch, processQueue]
  );

  // Stop prefetch on mouse leave
  const stopPrefetch = useCallback(
    (folderId: string) => {
      cancelPrefetch(folderId);
    },
    [cancelPrefetch]
  );

  // Register folder element for viewport tracking
  const registerFolder = useCallback(
    (element: HTMLElement | null, folderId: string) => {
      if (!element || !intersectionObserver.current) return;

      element.setAttribute("data-folder-id", folderId);
      intersectionObserver.current.observe(element);

      // Return cleanup function
      return () => {
        intersectionObserver.current?.unobserve(element);
        visibleFolders.current.delete(folderId);
        cancelPrefetch(folderId);
      };
    },
    [cancelPrefetch]
  );

  // Check if folder is currently being prefetched
  const isPrefetching = useCallback((folderId: string) => {
    return activePrefetches.current.has(folderId) || requestQueue.current.includes(folderId);
  }, []);

  return {
    startPrefetch,
    stopPrefetch,
    registerFolder,
    isPrefetching,
    cancelPrefetch,
  };
}
