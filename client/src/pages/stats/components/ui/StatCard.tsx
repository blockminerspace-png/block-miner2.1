import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  accent?: string;
  border?: string;
  className?: string;
};

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'text-white',
  border = 'border-slate-800 bg-slate-900/60',
  className = '',
}: Props) {
  return (
    <div className={`rounded-2xl border p-5 ${border} ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        {Icon ? <Icon className={`w-4 h-4 ${accent}`} /> : null}
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      </div>
      <p className={`text-2xl md:text-3xl font-black tabular-nums tracking-tight ${accent}`}>{value}</p>
      {sub ? <div className="mt-2 text-[11px] text-slate-500 leading-relaxed">{sub}</div> : null}
    </div>
  );
}
