import { FileItem } from "@/lib/types/file";

/**
 * Process resource IDs for KB creation
 * Since backend doesn't recursively index, we need to include ALL folder IDs
 * Only remove individual files if their direct parent folder is selected
 */
export function deduplicateResourceIds(selectedIds: string[], files: FileItem[]): string[] {
  if (selectedIds.length <= 1) {
    return selectedIds; // No deduplication needed
  }

  // Create a map of file ID to file for quick lookup
  const fileMap = new Map<string, FileItem>();
  files.forEach((file) => {
    fileMap.set(file.id, file);
  });

  // Find all selected folders
  const selectedFolders = selectedIds.map((id) => fileMap.get(id)).filter((file): file is FileItem => file?.type === "directory");

  if (selectedFolders.length === 0) {
    return selectedIds; // No folders selected, no deduplication needed
  }

  // Only remove individual FILES if their DIRECT parent folder is selected
  // Keep ALL folders (backend needs explicit folder IDs for nested indexing)
  const deduplicatedIds = selectedIds.filter((id) => {
    const file = fileMap.get(id);
    if (!file) return true; // Keep unknown IDs

    // Always keep folders - backend needs ALL folder IDs
    if (file.type === "directory") return true;

    // For files, only remove if DIRECT parent folder is selected
    const isDirectChildOfSelectedFolder = selectedFolders.some((folder) => {
      // Check if file is a direct child (not nested deeper)
      const filePath = file.name;
      const folderPath = folder.name;

      // File should start with folder path + "/"
      if (!filePath.startsWith(folderPath + "/")) return false;

      // Check if it's a direct child (no additional "/" after folder path)
      const remainingPath = filePath.substring(folderPath.length + 1);
      return !remainingPath.includes("/"); // Direct child has no more "/"
    });

    // Keep the file only if it's NOT a direct child of any selected folder
    return !isDirectChildOfSelectedFolder;
  });
  return deduplicatedIds;
}
