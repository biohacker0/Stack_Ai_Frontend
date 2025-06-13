import { useMemo } from "react";
import { FileItem } from "@/lib/types/file";
import { useOptimisticDeleteRegistry } from "../useOptimisticDeleteRegistry";
import { toast } from "react-toastify";

interface UseStatusFilteringProps {
  kbResources: { data: any[] } | null;
  folderPollingStatus: Map<string, boolean>;
  hasShownErrorToast: boolean;
  setHasShownErrorToast: (value: boolean) => void;
}

export function useStatusFiltering({ kbResources, folderPollingStatus, hasShownErrorToast, setHasShownErrorToast }: UseStatusFilteringProps) {
  // Get optimistic delete registry
  const { filterPollingResponse, getFileStatusOverride } = useOptimisticDeleteRegistry();

  // Filter polling data to exclude optimistically deleted files
  const filteredKbResources = useMemo(() => {
    if (!kbResources?.data) return null;

    // Filter out files that are marked as optimistically deleted
    const filteredData = filterPollingResponse(kbResources.data);

    return {
      ...kbResources,
      data: filteredData,
    };
  }, [kbResources, filterPollingResponse]);

  // Build status map for quick lookups
  // IMPORTANT: Only include files that are actually in the KB and not optimistically deleted
  // Files not in this map will fall back to their default status
  // OPTIMISTIC UI: Treat "pending" as "indexed" so users see instant feedback
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();

    if (filteredKbResources?.data) {
      filteredKbResources.data.forEach((resource: any) => {
        let displayStatus: FileItem["status"] = resource.status || "unknown";

        // Check if this file has a status override (e.g., optimistically deleted)
        const override = getFileStatusOverride(resource.id);
        if (override && override !== null) {
          // Override is "-" for deleted files, which we'll treat as undefined status
          displayStatus = undefined; // Show as "-" in UI
        } else {
          // OPTIMISTIC UI: Show "pending" as "indexed" to match optimistic updates
          // Only revert to error if it actually fails
          if (displayStatus === "pending") {
            displayStatus = "indexed";
          } else {
          }
        }

        map.set(resource.id, displayStatus || "unknown");
      });
    } else {
    }

    return map;
  }, [filteredKbResources?.data, getFileStatusOverride]);

  // Calculate if all files are settled (including error status)
  const allFilesSettled = useMemo(() => {
    if (!filteredKbResources?.data) return false;

    const files = filteredKbResources.data.filter((item: any) => item.type === "file");
    if (files.length === 0) return true; // No files means settled

    const rootFilesSettled = files.every(
      (file: any) => file.status === "indexed" || file.status === "error"
      // Note: we don't include pending_delete here because that means deletion is in progress
    );

    // Also check if folder polling is complete
    const folderPollingComplete = Array.from(folderPollingStatus.values()).every((isActive) => !isActive);

    return rootFilesSettled && folderPollingComplete;
  }, [filteredKbResources?.data, folderPollingStatus]);

  // Count files by status (including error)
  const statusCounts = useMemo(() => {
    const counts = {
      indexed: 0,
      pending: 0,
      pending_delete: 0,
      error: 0,
      unknown: 0,
    };

    filteredKbResources?.data?.forEach((resource: any) => {
      const status = resource.status || "unknown";
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    });

    return counts;
  }, [filteredKbResources?.data]);

  // Check for unsettled files and handle error notifications
  const checkUnsettledFiles = useMemo(() => {
    if (!filteredKbResources?.data) return { hasUnsettledFiles: false, files: [] };

    // Filter only files (directories are always "unknown")
    const files = filteredKbResources.data.filter((item: any) => item.type === "file");

    // Check for unsettled files (pending or pending_delete)
    const pendingFiles = files.filter((file: any) => file.status === "pending");
    const pendingDeleteFiles = files.filter((file: any) => file.status === "pending_delete");
    const errorFiles = files.filter((file: any) => file.status === "error");

    // Show error toast if not already shown
    if (errorFiles.length > 0 && !hasShownErrorToast) {
      setHasShownErrorToast(true);
      toast.error(`Failed to index ${errorFiles.length} file(s). The knowledge base may be corrupted. Please create a new knowledge base.`, {
        autoClose: 8000,
        toastId: "kb-error-toast", // Prevent duplicate toasts
      });
    }

    const hasUnsettledFiles = pendingFiles.length > 0 || pendingDeleteFiles.length > 0;

    return {
      hasUnsettledFiles,
      files,
      pendingFiles,
      pendingDeleteFiles,
      errorFiles,
    };
  }, [filteredKbResources?.data, hasShownErrorToast, setHasShownErrorToast]);

  return {
    filteredKbResources,
    statusMap,
    statusCounts,
    allFilesSettled,
    checkUnsettledFiles,
  };
}
