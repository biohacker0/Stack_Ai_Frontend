// Simple types for files and folders
export interface FileItem {
  id: string;
  name: string;
  type: "file" | "directory";
  size: number;
  mime_type?: string;
  status?: "indexed" | "pending" | "pending_delete" | "unknown" | "failed" | "deleted" | "error";
  indexed_at?: string;
  // UI state
  isSelected?: boolean;
  isExpanded?: boolean;
  isLoading?: boolean; // For folder loading state
  children?: FileItem[];
  level?: number; // For indentation in tree view
}

export interface FileListResponse {
  data: FileItem[];
}
