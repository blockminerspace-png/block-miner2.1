import { memo, Suspense } from 'react';
import { lazyWithRetry } from '../../../../shared/utils/lazyWithRetry';
import { useTranslation } from 'react-i18next';
import { Download, Wrench } from 'lucide-react';
import type { StatsDashboardContext } from '../../stats.types';
import { exportEarningsCsv, exportPowerStatsCsv } from '../../utils/exportStats';

const CalculatorPage = lazyWithRetry(() => import('../../../calculator/CalculatorPage'));

function ToolsTab({ power, earnings }: StatsDashboardContext) {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
        <h2 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
          <Wrench className="w-5 h-5 text-slate-400" />
          {t('powerStats.dashboard.tools_exports')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => exportPowerStatsCsv(power, 'blockminer-power-stats')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider"
          >
            <Download className="w-4 h-4" />
            {t('powerStats.export_csv')}
          </button>
          {earnings ? (
            <button
              type="button"
              onClick={() => exportEarningsCsv(earnings, 'blockminer-earnings')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider"
            >
              <Download className="w-4 h-4" />
              {t('powerStats.dashboard.export_earnings')}
            </button>
          ) : null}
        </div>
      </div>

      <Suspense
        fallback={
          <div className="h-48 rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" role="status" />
        }
      >
        <CalculatorPage />
      </Suspense>
    </div>
  );
}

export default memo(ToolsTab);
