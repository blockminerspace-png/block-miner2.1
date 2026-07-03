export default function ChartsFallback({ cols = 2 }: { cols?: 1 | 2 }) {
  return (
    <div
      className={`grid grid-cols-1 ${cols === 2 ? 'xl:grid-cols-2' : ''} gap-6`}
      role="status"
      aria-busy="true"
      aria-label="Charts loading"
    >
      <div className="h-[280px] rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
      {cols === 2 ? <div className="h-[280px] rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" /> : null}
    </div>
  );
}
