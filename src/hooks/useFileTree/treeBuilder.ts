import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileItem } from "@/lib/types/file";
import { useDataManager } from "../useDataManager";

interface UseTreeBuilderProps {
  kbId?: string | null;
  expandedFolders: Set<string>;
  loadingFolders: Set<string>;
  refreshTrigger: number;
  rootData?: { data: FileItem[] };
}

export function useTreeBuilder({
  kbId,
  expandedFolders,
  loadingFolders,
  refreshTrigger,
  rootData,
}: UseTreeBuilderProps) {
  const queryClient = useQueryClient();
  const { resolveFileStatus, getFolderPathFromFileName, optimisticUpdateCount } = useDataManager();

  // Build hierarchical file tree
  const buildFileTree = useCallback(
    (files: FileItem[], level = 0, parentPath = ""): FileItem[] => {
      return files.map((file) => {
        const isExpanded = expandedFolders.has(file.id);
        const isLoading = loadingFolders.has(file.id);
        let children: FileItem[] = [];

        if (file.type === "directory" && isExpanded && !isLoading) {
          const folderData = queryClient.getQueryData<{ data: FileItem[] }>(["drive-files", file.id]);

          if (folderData?.data) {
            const currentPath = parentPath ? `${parentPath}/${file.name.split("/").pop()}` : file.name.split("/").pop() || "";
            children = buildFileTree(folderData.data, level + 1, currentPath);
          }
        }

        // Use DataManager's resolveFileStatus for consistent status resolution
        // Always use DataManager resolver with folder path for consistent status resolution
        const folderPath = level === 0 ? "/" : getFolderPathFromFileName(file.name);
        const resolved = resolveFileStatus(file.id, kbId || null, folderPath);
        const finalStatus: FileItem["status"] = resolved === "-" || resolved === null ? undefined : resolved;
        
        if (level === 0) {
          console.log(`Root file ${file.id} (${file.name}): resolved status: ${finalStatus || 'undefined'}`);
        }

        return {
          ...file,
          isExpanded,
          isLoading,
          children,
          level,
          status: finalStatus,
        };
      });
    },
    [expandedFolders, loadingFolders, queryClient, resolveFileStatus, kbId, getFolderPathFromFileName]
  );

  // Build file tree from root data - now reactive to optimistic cache changes
  const fileTree = useMemo(() => {
    return rootData?.data ? buildFileTree(rootData.data) : [];
  }, [rootData?.data, buildFileTree, refreshTrigger, optimisticUpdateCount]);

  // Flatten tree for table display
  const flattenTree = useCallback((tree: FileItem[]): FileItem[] => {
    const result: FileItem[] = [];

    const traverse = (items: FileItem[]) => {
      items.forEach((item) => {
        result.push(item);
        if (item.children?.length) {
          traverse(item.children);
        }
      });
    };

    traverse(tree);
    return result;
  }, []);

  const flatFiles = useMemo(() => flattenTree(fileTree), [fileTree, flattenTree]);

  return {
    fileTree,
    flatFiles,
    buildFileTree,
    flattenTree,
  };
} 