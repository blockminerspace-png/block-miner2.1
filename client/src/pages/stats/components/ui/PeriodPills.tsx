import { useTranslation } from 'react-i18next';
import type { EarningsUiFilter } from '../../stats.config';

const FILTERS: EarningsUiFilter[] = ['today', '7d', '30d', '90d', 'all'];

type Props = {
  value: EarningsUiFilter;
  onChange: (v: EarningsUiFilter) => void;
};

export default function PeriodPills({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-colors ${
            value === p
              ? 'bg-sky-500 text-slate-950 border-sky-400'
              : 'bg-slate-900/80 text-slate-500 border-slate-700 hover:text-white'
          }`}
        >
          {t(`powerStats.dashboard.period.${p}`)}
        </button>
      ))}
    </div>
  );
}
