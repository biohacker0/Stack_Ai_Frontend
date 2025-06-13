import { Skeleton } from "@/components/ui/skeleton";

interface TableSkeletonProps {
  message?: string;
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ 
  message = "Loading...", 
  rows = 8, 
  columns = 4 
}: TableSkeletonProps) {
  return (
    <div className="w-full">
      {/* Loading message */}
      <div className="text-center py-6 text-gray-600 font-medium">
        {message}
      </div>
      
      {/* Skeleton rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center space-x-4 px-2 py-2.5">
            {/* Checkbox skeleton */}
            <Skeleton className="h-4 w-4 rounded" />
            
            {/* Content skeletons */}
            <div className="flex-1 flex items-center space-x-2">
              {/* File/folder icon */}
              <Skeleton className="h-4 w-4 rounded" />
              
              {/* File name - varying widths for realism */}
              <Skeleton 
                className="h-4 rounded" 
                style={{ 
                  width: `${120 + (rowIndex % 4) * 40}px` 
                }} 
              />
            </div>
            
            {/* Size column */}
            <div className="w-20 text-right">
              <Skeleton className="h-4 w-12 ml-auto rounded" />
            </div>
            
            {/* Status column */}
            <div className="w-24">
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 