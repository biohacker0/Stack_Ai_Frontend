import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteKBResource } from "@/lib/api/knowledgeBase";
import { FileItem } from "@/lib/types/file";
import { listResources } from "@/lib/api/connections";
import { listKBResources } from "@/lib/api/knowledgeBase";

export function useKnowledgeBaseDeletion(kbId: string | null, statusMap?: Map<string, string>) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Delete multiple files mutation
  const deleteFilesMutation = useMutation({
    mutationFn: async (filesToDelete: FileItem[]) => {
      const results = [];

      for (const file of filesToDelete) {
        try {
          setDeletingFiles((prev) => new Set(prev).add(file.id));

          const response = await deleteKBResource(kbId!, file.name);

          // Check if deletion was successful based on response format
          const isSuccess = response && (response.success === true || (typeof response === "object" && response.message === "Resource deleted"));

          if (isSuccess) {
            results.push({ file, success: true });
          } else {
            console.error(`Deletion failed for ${file.name}:`, response);
            results.push({ file, success: false, error: "Deletion failed" });
          }
        } catch (error) {
          console.error(`Error deleting ${file.name}:`, error);
          results.push({ file, success: false, error });
        } finally {
          setDeletingFiles((prev) => {
            const newSet = new Set(prev);
            newSet.delete(file.id);
            return newSet;
          });
        }
      }

      return results;
    },
    onSuccess: async (results) => {
      const successCount = results.filter((r) => r.success).length;
      const totalCount = results.length;

      // STEP 1: Immediately invalidate and remove all KB-related queries
      queryClient.removeQueries({ queryKey: ["kb-resources"] });
      queryClient.removeQueries({ queryKey: ["kb-file-status"] });

      // STEP 2: Remove all cached drive files
      queryClient.removeQueries({ queryKey: ["drive-files"] });

      // STEP 3: Wait a moment for backend to process, then refetch KB resources
      if (kbId) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms

        await queryClient.fetchQuery({
          queryKey: ["kb-resources", kbId],
          queryFn: () => listKBResources(kbId),
          staleTime: 0, // Force fresh fetch
        });
      }

      // STEP 4: Finally refetch root drive files

      await queryClient.fetchQuery({
        queryKey: ["drive-files", "root"],
        queryFn: () => listResources(),
        staleTime: 0, // Force fresh fetch
      });

      setIsDeleting(false);

      // Show success message if any files were deleted
      if (successCount > 0) {
      }

      // Show error message if any deletions failed
      const failedCount = totalCount - successCount;
      if (failedCount > 0) {
        console.error(`${failedCount} file(s) failed to delete`);
      }
    },
    onError: (error) => {
      console.error("Deletion process failed:", error);
      setIsDeleting(false);
    },
  });

  // Filter and process selected files for deletion
  const deleteSelectedFiles = useCallback(
    (selectedIds: string[], allFiles: FileItem[]) => {
      if (!kbId) {
        console.warn("No KB ID available for deletion");
        return;
      }

      // Create file map for quick lookup
      const fileMap = new Map<string, FileItem>();
      allFiles.forEach((file) => {
        fileMap.set(file.id, file);
      });

      // Process selection to find deletable files
      const filesToDelete: FileItem[] = [];

      selectedIds.forEach((id) => {
        const item = fileMap.get(id);
        if (!item) return;

        if (item.type === "file") {
          // Check actual displayed status using statusMap
          const actualStatus = statusMap?.get(item.id) || item.status;
          if (actualStatus === "indexed") {
            filesToDelete.push(item);
          }
        } else if (item.type === "directory") {
          // Folder selection - find all indexed files inside
          const indexedFilesInFolder = allFiles.filter((file) => {
            if (file.type !== "file" || !file.name.startsWith(item.name + "/")) return false;

            const actualStatus = statusMap?.get(file.id) || file.status;
            return actualStatus === "indexed";
          });
          filesToDelete.push(...indexedFilesInFolder);
        }
      });

      // Remove duplicates
      const uniqueFiles = filesToDelete.filter((file, index, arr) => arr.findIndex((f) => f.id === file.id) === index);

      if (uniqueFiles.length === 0) {
        console.warn("No indexed files selected for deletion");
        return;
      }

      setIsDeleting(true);
      deleteFilesMutation.mutate(uniqueFiles);
    },
    [kbId, deleteFilesMutation, statusMap]
  );

  // Check if a file is currently being deleted
  const isFileDeleting = useCallback(
    (fileId: string) => {
      return deletingFiles.has(fileId);
    },
    [deletingFiles]
  );

  // Check if a file can be deleted (indexed status)
  const canDeleteFile = useCallback(
    (file: FileItem) => {
      if (file.type !== "file") return false;

      // Use statusMap if available (shows actual UI status), otherwise fall back to file.status
      const actualStatus = statusMap?.get(file.id) || file.status;
      return actualStatus === "indexed";
    },
    [statusMap]
  );

  // Check if a folder has any deletable files
  const canDeleteFolder = useCallback(
    (folder: FileItem, allFiles: FileItem[]) => {
      if (folder.type !== "directory") return false;

      return allFiles.some((file) => {
        if (file.type !== "file" || !file.name.startsWith(folder.name + "/")) return false;

        // Use statusMap if available (shows actual UI status), otherwise fall back to file.status
        const actualStatus = statusMap?.get(file.id) || file.status;
        return actualStatus === "indexed";
      });
    },
    [statusMap]
  );

  return {
    isDeleting,
    deleteSelectedFiles,
    isFileDeleting,
    canDeleteFile,
    canDeleteFolder,
    isError: deleteFilesMutation.isError,
    error: deleteFilesMutation.error,
  };
}
