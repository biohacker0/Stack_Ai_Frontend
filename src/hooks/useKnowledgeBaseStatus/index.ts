import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { listKBResources } from "@/lib/api/knowledgeBase";
import { usePollingState } from "./pollingState";
import { useFolderPolling } from "./folderPolling";
import { useStatusFiltering } from "./statusFiltering";

// Constants
const POLL_INTERVAL = 1000; // 1 second for faster updates

interface UseKnowledgeBaseStatusProps {
  kbId: string | null;
  enabled?: boolean;
  indexedFolders?: Array<{ folderPath: string; fileIds: string[] }>;
}

export function useKnowledgeBaseStatus({ kbId, enabled = true, indexedFolders = [] }: UseKnowledgeBaseStatusProps) {
  // Initialize polling state
  const { shouldPoll, shouldEnablePolling, hasShownErrorToast, setHasShownErrorToast, pollingStartTime, isTemporaryKB, checkPollingTimeout, stopPolling, resetErrorToast } = usePollingState({
    kbId,
    enabled,
  });

  // Poll KB resources (root level)
  const {
    data: kbResources,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["kb-resources", kbId],
    queryFn: () => listKBResources(kbId!),
    enabled: shouldEnablePolling,
    refetchInterval: shouldEnablePolling ? POLL_INTERVAL : false,
    refetchIntervalInBackground: true,
    staleTime: 0, // Always consider data stale for polling
  });

  // Initialize folder polling
  const { folderPollingStatus, isFolderPollingActive, pollFolderStatus } = useFolderPolling({
    kbId,
    shouldEnablePolling,
    indexedFolders,
    hasShownErrorToast,
    setHasShownErrorToast,
  });

  // Initialize status filtering and mapping
  const { filteredKbResources, statusMap, statusCounts, allFilesSettled, checkUnsettledFiles } = useStatusFiltering({
    kbResources: kbResources || null,
    folderPollingStatus,
    hasShownErrorToast,
    setHasShownErrorToast,
  });

  // Determine if polling should continue
  useEffect(() => {
    if (!enabled || !kbId) return;

    // If we have no data yet, keep polling
    if (!filteredKbResources?.data) return;

    const resources = filteredKbResources.data;

    // Check polling timeout first
    if (checkPollingTimeout()) return;

    // If empty KB (data is empty array), this means all files are deleted or not indexed
    // We should stop polling in this case
    if (resources.length === 0) {
      stopPolling("Empty KB resources");
      return;
    }

    // Filter only files (directories are always "unknown")
    const files = resources.filter((item: any) => item.type === "file");

    // If no files in KB, stop polling
    if (files.length === 0) {
      stopPolling("No files in KB");
      return;
    }

    // Check for unsettled files and handle error notifications
    const { hasUnsettledFiles } = checkUnsettledFiles;

    // Continue polling if there are any unsettled files OR folder polling is active
    if (!hasUnsettledFiles && !isFolderPollingActive) {
      stopPolling("All files settled and folder polling complete");
      return;
    }

    // Continue polling
    if (hasUnsettledFiles) {
    }
    if (isFolderPollingActive) {
    }
  }, [filteredKbResources, checkPollingTimeout, enabled, kbId, isFolderPollingActive, checkUnsettledFiles, stopPolling]);

  return {
    kbResources: filteredKbResources?.data || [],
    statusMap,
    statusCounts,
    allFilesSettled,
    isLoading,
    error,
    refetch,
    shouldPoll, // Expose for debugging
    folderPollingStatus, // Expose folder polling status
  };
}
