import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileItem } from "@/lib/types/file";

export function useFolderHelpers() {
  const queryClient = useQueryClient();

  // Extract folder path from file name (same logic as useFileTree)
  const getFolderPathFromFileName = useCallback((fileName: string): string => {
    const pathParts = fileName.split("/");
    pathParts.pop(); // Remove filename
    return "/" + pathParts.join("/");
  }, []);

  // Get all files in a folder from the file cache
  const getFolderContents = useCallback((folderId: string): FileItem[] => {
    const folderData = queryClient.getQueryData<{ data: FileItem[] }>(["drive-files", folderId]);
    return folderData?.data || [];
  }, [queryClient]);

  // Find all descendant file IDs recursively
  const getAllDescendantFileIds = useCallback(
    (parentFiles: FileItem[], allFiles: FileItem[]): string[] => {
      const descendants: string[] = [];
      
      const processFiles = (files: FileItem[]) => {
        files.forEach(file => {
          if (file.type === "file") {
            descendants.push(file.id);
          } else if (file.type === "directory") {
            // Find files in this directory
            const childFiles = allFiles.filter(f => 
              f.name.startsWith(file.name + "/") && 
              f.name.split("/").length === file.name.split("/").length + 1
            );
            processFiles(childFiles);
          }
        });
      };
      
      processFiles(parentFiles);
      return descendants;
    },
    []
  );

  return {
    getFolderPathFromFileName,
    getFolderContents,
    getAllDescendantFileIds,
  };
} 