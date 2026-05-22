import { useTranslation } from 'react-i18next';
import { Receipt, Zap, Clock, Info } from 'lucide-react';

export default function TaxesPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
          <Receipt className="w-10 h-10 text-yellow-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">{t('taxes.title')}</h1>
        <p className="text-gray-400 max-w-md">{t('taxes.coming_soon_desc')}</p>
      </div>

      <div className="w-full rounded-xl border border-white/10 bg-white/5 p-6 flex flex-col gap-5">
        <p className="text-sm font-medium text-gray-300 uppercase tracking-widest">{t('taxes.planned_features')}</p>

        <div className="flex items-start gap-4">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <p className="text-white font-medium">{t('taxes.feature_energy_tax')}</p>
            <p className="text-sm text-gray-400">{t('taxes.feature_energy_tax_desc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-medium">{t('taxes.feature_weekly_charge')}</p>
            <p className="text-sm text-gray-400">{t('taxes.feature_weekly_charge_desc')}</p>
          </div>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Info className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-white font-medium">{t('taxes.feature_transparency')}</p>
            <p className="text-sm text-gray-400">{t('taxes.feature_transparency_desc')}</p>
          </div>
        </div>
      </div>

      <div className="w-full rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-5 py-4 flex items-center gap-3">
        <Clock className="w-5 h-5 text-yellow-400 shrink-0" />
        <p className="text-sm text-yellow-300">{t('taxes.coming_soon_notice')}</p>
      </div>
    </div>
  );
}
