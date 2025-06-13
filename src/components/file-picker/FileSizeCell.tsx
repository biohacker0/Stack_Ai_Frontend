interface FileSizeCellProps {
  size: number;
}

export function FileSizeCell({ size }: FileSizeCellProps) {
  if (size === 0) {
    return <div className="text-right pr-8">-</div>;
  }

  const formatSize = (bytes: number): string => {
    if (bytes > 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes > 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
  };

  return (
    <div className="text-right pr-8">
      {formatSize(size)}
    </div>
  );
} 