import { AlertTriangle, RefreshCw } from 'lucide-react';

type AdminMinersErrorProps = {
  message: string;
  onRetry?: () => void;
};

export function AdminMinersError({ message, onRetry }: AdminMinersErrorProps) {
  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-slate-950/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-amber-100 transition hover:border-amber-300"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}
