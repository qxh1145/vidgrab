interface ProgressBarProps {
  progress: number; // 0 to 100
  status?: string;
  colorClass?: string;
}

export default function ProgressBar({
  progress,
  status,
  colorClass = 'bg-indigo-600',
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className="w-full">
      <div className="flex justify-between items-center text-xs mb-1 font-medium">
        <span className="text-gray-700 dark:text-gray-300 capitalize">
          {status || `${clamped}%`}
        </span>
        <span className="text-gray-500 dark:text-gray-400 font-mono">
          {clamped}%
        </span>
      </div>
      <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full transition-all duration-300 ease-out rounded-full ${colorClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
