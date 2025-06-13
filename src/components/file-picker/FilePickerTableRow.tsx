import React from "react";
import { flexRender, Row } from "@tanstack/react-table";

import { TableRow, TableCell } from "@/components/ui/table";
import { FileItem } from "@/lib/types/file";

interface FilePickerTableRowProps {
  row: Row<FileItem>;
  isSelected: boolean;
  // Prefetch functions
  startPrefetch?: (folderId: string, delay?: number) => void;
  stopPrefetch?: (folderId: string) => void;
}

/**
 * Memoised table row.
 * – selection state
 * – expansion/loading state (folder caret)
 * – status text/icon
 */
export const FilePickerTableRow: React.FC<FilePickerTableRowProps> = React.memo(
  ({ row, isSelected, startPrefetch, stopPrefetch }) => {
    const file = row.original;
    const isDirectory = file.type === "directory";
    const isExpanded = file.isExpanded;
    const isLoading = file.isLoading;

    // Hover handlers to trigger/stop prefetching for folders
    const handleRowMouseEnter = React.useCallback(() => {
      if (isDirectory && !isExpanded && !isLoading && startPrefetch) {
        startPrefetch(file.id, 300);
      }
    }, [isDirectory, isExpanded, isLoading, file.id, startPrefetch]);

    const handleRowMouseLeave = React.useCallback(() => {
      if (isDirectory && stopPrefetch) {
        stopPrefetch(file.id);
      }
    }, [isDirectory, file.id, stopPrefetch]);

    return (
      <TableRow
        data-state={isSelected ? "selected" : undefined}
        className={`hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
        onMouseEnter={handleRowMouseEnter}
        onMouseLeave={handleRowMouseLeave}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell
            key={cell.id}
            className="last:border-r-0 py-2 px-2"
            style={{
              width: cell.column.columnDef.size ? `${cell.column.columnDef.size}px` : "auto",
              minWidth: cell.column.columnDef.size ? `${cell.column.columnDef.size}px` : "auto",
              maxWidth: cell.column.columnDef.size ? `${cell.column.columnDef.size}px` : "auto",
            }}
          >
            <div className="flex items-center gap-2 text-sm font-normal leading-normal">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
          </TableCell>
        ))}
      </TableRow>
    );
  },
  (prevProps, nextProps) => {
    const prevFile = prevProps.row.original;
    const nextFile = nextProps.row.original;

    // 1. Check immutable identifiers
    if (prevFile.id !== nextFile.id) return false;

    // 2. Check selection state
    if (prevProps.isSelected !== nextProps.isSelected) return false;

    // 3. Check expansion / loading state
    if (prevFile.isExpanded !== nextFile.isExpanded) return false;
    if (prevFile.isLoading !== nextFile.isLoading) return false;

    // 4. Check status (indexed / pending / etc.)
    if (prevFile.status !== nextFile.status) return false;

    return true; // No meaningful visual change → skip re-render
  }
);

FilePickerTableRow.displayName = "FilePickerTableRow";
