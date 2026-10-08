export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="h-8 w-8 rounded-full border-4 border-bg-elevated border-t-accent-blue animate-spin" />
      <span className="text-xs text-text-secondary font-medium tracking-wide">
        Analyzing traces...
      </span>
    </div>
  );
}
