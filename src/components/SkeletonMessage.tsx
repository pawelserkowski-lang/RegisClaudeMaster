export function SkeletonMessage() {
  return (
    <div className="flex gap-4 animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-emerald-400/20 border border-emerald-400/50" />
      <div className="flex-1 space-y-3">
        <div className="h-4 w-3/5 rounded bg-emerald-900/60" />
        <div className="h-4 w-4/5 rounded bg-emerald-900/60" />
        <div className="h-4 w-2/5 rounded bg-emerald-900/60" />
      </div>
    </div>
  );
}
