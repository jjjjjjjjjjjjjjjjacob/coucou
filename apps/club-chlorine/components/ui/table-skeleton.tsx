import { Skeleton } from "./skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function TableSkeleton({
  rows = 10,
  columns = 8,
  className = "",
}: TableSkeletonProps) {
  // Define varied widths for more realistic table appearance
  const getColumnWidth = (index: number) => {
    const widths = [
      "w-8", // Checkbox column
      "w-32", // Name/Guest column
      "w-16", // List column
      "w-20", // Attendees column
      "w-24", // Created column
      "w-28", // Custom field column
      "w-20", // Approval column
      "w-20", // Ticket column
      "w-16", // Actions column
    ];
    return widths[index % widths.length] || "w-20";
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Header skeleton */}
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: columns }).map((_, j) => (
          <Skeleton
            key={`header-${j}`}
            className={`h-8 ${getColumnWidth(j)}`}
          />
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`row-${i}`} className="flex gap-2 py-1">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton
              key={`cell-${i}-${j}`}
              className={`h-8 ${getColumnWidth(j)}`}
            />
          ))}
        </div>
      ))}

      {/* Pagination skeleton */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <Skeleton className="h-6 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    </div>
  );
}

