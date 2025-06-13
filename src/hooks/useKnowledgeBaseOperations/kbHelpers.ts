import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FileItem } from "@/lib/types/file";

export function useKBHelpers(
  getFolderContents: (folderId: string) => FileItem[],
  getFolderPathFromFileName: (fileName: string) => string,
  getAllDescendantFileIds: (parentFiles: FileItem[], allFiles: FileItem[]) => string[]
) {
  const queryClient = useQueryClient();

  // Helper to find all files within selected folders
  const findAllFilesInSelectedFolders = useCallback(
    async (selectedIds: string[], allFiles: FileItem[]): Promise<{ folderFiles: Array<{ folderId: string; folderPath: string; fileIds: string[] }>; allFileIds: string[] }> => {
      const folderFiles: Array<{ folderId: string; folderPath: string; fileIds: string[] }> = [];
      const allFileIds: string[] = [];

      // Process each selected item
      for (const selectedId of selectedIds) {
        const selectedItem = allFiles.find((f) => f.id === selectedId);

        if (selectedItem?.type === "directory") {
          // Check if folder contents are cached
          let folderContents = getFolderContents(selectedId);

          if (folderContents.length === 0) {
            // 🚀 EAGER FETCHING: Folder not cached, fetch contents now

            try {
              // Fetch folder contents from API
              const response = await queryClient.fetchQuery({
                queryKey: ["drive-files", selectedId],
                queryFn: async () => {
                  const { listResources } = await import("@/lib/api/connections");
                  return listResources(selectedId);
                },
                staleTime: 5 * 60 * 1000, // 5 minutes
              });

              folderContents = response?.data || [];
            } catch (error) {
              console.error(`❌ Failed to fetch folder contents for ${selectedItem.name}:`, error);
              folderContents = []; // Continue with empty contents
            }
          }

          if (folderContents.length > 0) {
            // Extract folder path from first file in folder
            const folderPath = getFolderPathFromFileName(folderContents[0].name);

            // Find all file IDs recursively within this folder
            const fileIds = getAllDescendantFileIds(folderContents, allFiles);

            if (fileIds.length > 0) {
              folderFiles.push({
                folderId: selectedId,
                folderPath,
                fileIds,
              });

              allFileIds.push(...fileIds);
            }
          }
        } else if (selectedItem?.type === "file") {
          // Individual file
          allFileIds.push(selectedId);
        }
      }

      return { folderFiles, allFileIds };
    },
    [queryClient, getFolderContents, getFolderPathFromFileName, getAllDescendantFileIds]
  );

  return {
    findAllFilesInSelectedFolders,
  };
}
