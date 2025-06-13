import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileItem } from "@/lib/types/file";

interface FilePickerControlsProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filteredCount: number;
  selectedFiles: FileItem[];
  selectedResourceIds: string[];
  hasKB: boolean | undefined;
  isCreatingKB: boolean | undefined;
  isDeletingKB: boolean | undefined;
  isActuallyDeleting?: boolean;
  onCreateKB?: (resourceIds: string[], files: FileItem[]) => void;
  onCreateNewKB?: () => void;
  onDeleteFiles?: (selectedIds: string[]) => void;
  allFiles: FileItem[];
  clearSelection: () => void;
}

export function FilePickerControls({
  searchValue,
  onSearchChange,
  filteredCount,
  selectedFiles,
  selectedResourceIds,
  hasKB,
  isCreatingKB,
  isDeletingKB,
  isActuallyDeleting = false,
  onCreateKB,
  onCreateNewKB,
  onDeleteFiles,
  allFiles,
  clearSelection,
}: FilePickerControlsProps) {
  return (
    <div className="flex flex-col gap-4 flex-shrink-0">
      {/* Search Section - Full Width */}
      <div className="flex items-center space-x-2 w-full">
        <Input
          placeholder="Filter by name or status (indexed, pending, etc.)"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full border-gray-300 focus:border-blue-500 focus:ring-blue-500"
        />
        {searchValue && <span className="text-sm text-gray-500 whitespace-nowrap">Showing {filteredCount} filtered results</span>}
      </div>

      {/* Action Buttons - Below Search */}
      <div className="w-full">
        {!hasKB ? (
          // Single button - full width
          <Button
            disabled={selectedFiles.length === 0 || isCreatingKB}
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              onCreateKB?.(selectedResourceIds, allFiles);
              clearSelection(); // Clear selection after creating KB
            }}
          >
            {isCreatingKB ? "Creating KB..." : `Create Knowledge Base (${selectedFiles.length} files)`}
          </Button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <Button
              variant="outline"
              disabled={selectedFiles.length === 0 || isActuallyDeleting}
              onClick={() => {
                onDeleteFiles?.(selectedResourceIds);
                clearSelection(); // Clear selection after deleting files
              }}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {isActuallyDeleting ? "Deleting..." : `Delete Selected Files (${selectedFiles.length})`}
            </Button>
            <Button variant="outline" onClick={onCreateNewKB} disabled={isDeletingKB}>
              Create New Knowledge Base
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
