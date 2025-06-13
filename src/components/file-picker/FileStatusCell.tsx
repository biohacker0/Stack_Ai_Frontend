import { FileItem } from "@/lib/types/file";
import { useOptimisticDeleteRegistry } from "@/hooks/useOptimisticDeleteRegistry";

interface FileStatusCellProps {
  file: FileItem;
  isFileDeleting?: (fileId: string) => boolean;
}

export function FileStatusCell({ file, isFileDeleting }: FileStatusCellProps) {
  const { getFileStatusOverride } = useOptimisticDeleteRegistry();

  // Check for optimistic delete override first
  const statusOverride = getFileStatusOverride(file.id);
  const status = statusOverride || file.status;

  // Never show status for directories
  if (file.type === "directory") {
    return (
      <div className="w-full">
        <span className="text-gray-400">-</span>
      </div>
    );
  }

  // Handle optimistic delete state (status is "-")
  if (statusOverride === "-" || status === undefined || status === null) {
    return (
      <div className="w-full">
        <span className="text-gray-400 font-medium">-</span>
      </div>
    );
  }

  if (status === "indexed") {
    return (
      <div className="w-full ">
        <span className="text-green-600 font-medium text-sm">✓ Indexed</span>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="w-full">
        <span className="text-yellow-600 font-medium text-sm">⏳ Indexing</span>
      </div>
    );
  }

  if (status === "pending_delete" || isFileDeleting?.(file.id)) {
    return (
      <div className="w-full">
        <span className="text-red-600 font-medium text-sm">🗑️ Deleting</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="w-full">
        <span className="text-red-600 font-medium text-sm">❌ Failed</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      <span className="text-gray-400">-</span>
    </div>
  );
}
