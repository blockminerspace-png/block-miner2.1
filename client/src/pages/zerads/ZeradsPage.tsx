import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, MousePointerClick, AlertTriangle, Loader2, Info } from 'lucide-react';
import { api, useAuthStore } from '../../store/auth';

interface ZeradsLinkResponse {
  ok: boolean;
  url?: string;
  username?: string;
  exchangeRate?: number;
  reason?: string;
}

export default function ZeradsPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [linkData, setLinkData] = useState<ZeradsLinkResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.get<ZeradsLinkResponse>('/zerads/link');
        if (!cancelled) setLinkData(res.data);
      } catch {
        if (!cancelled) setLinkData({ ok: false, reason: 'error' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleOpen = () => {
    if (linkData?.url) {
      window.open(linkData.url, '_blank', 'noopener,noreferrer');
    }
  };

  const exchangeRate = linkData?.exchangeRate ?? 0.07;
  const hasUsername = Boolean(user?.username);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <MousePointerClick className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{t('zerads.title')}</h1>
          <p className="text-sm text-gray-400">{t('zerads.subtitle')}</p>
        </div>
      </div>

      {/* No username warning */}
      {!hasUsername && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-300">{t('zerads.no_username_title')}</p>
            <p className="text-sm text-yellow-400/80 mt-0.5">{t('zerads.no_username_body')}</p>
          </div>
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white">{t('zerads.how_it_works_title')}</h2>
          <p className="text-sm text-gray-400">{t('zerads.how_it_works_body')}</p>
        </div>

        {/* Exchange rate info */}
        <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-4 py-3">
          <Info className="w-4 h-4 text-purple-400 shrink-0" />
          <p className="text-sm text-purple-300">
            {t('zerads.exchange_rate', { rate: exchangeRate.toFixed(4) })}
          </p>
        </div>

        {/* CTA */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : linkData?.ok ? (
          <button
            onClick={handleOpen}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 transition-colors text-white font-semibold py-3 px-6"
          >
            <MousePointerClick className="w-5 h-5" />
            {t('zerads.start_earning')}
            <ExternalLink className="w-4 h-4 opacity-70" />
          </button>
        ) : linkData?.reason === 'no_username' ? (
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-700 text-gray-500 font-semibold py-3 px-6 cursor-not-allowed"
          >
            <MousePointerClick className="w-5 h-5" />
            {t('zerads.start_earning')}
          </button>
        ) : (
          <p className="text-sm text-red-400 text-center">{t('zerads.load_error')}</p>
        )}

        <p className="text-xs text-gray-500 text-center">{t('zerads.credits_delay_note')}</p>
      </div>
    </div>
  );
}
