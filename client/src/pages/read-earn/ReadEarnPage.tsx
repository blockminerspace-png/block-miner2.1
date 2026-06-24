import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  BookOpen,
  ExternalLink,
  KeyRound,
  Loader2,
  Sparkles,
  X,
  PartyPopper
} from 'lucide-react';
import { api } from '../../store/auth';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import type { TFunction } from 'i18next';
import { isAxiosError } from 'axios';

interface ReadEarnCampaign {
  id: number;
  title: string;
  expiresAt: string;
  partnerUrl: string;
}

interface ReadEarnCampaignsResponse {
  ok?: boolean;
  campaigns?: ReadEarnCampaign[];
}

interface ReadEarnReward {
  rewardType?: string;
  hashrateValidityDays?: number;
  rewardAmount?: number | string;
  rewardMinerId?: number | string;
}

interface ReadEarnRedeemResponse {
  ok?: boolean;
  reward?: ReadEarnReward;
  code?: string;
}

function formatEndsAt(iso: string, locale: string | undefined) {
  try {
    return new Date(iso).toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  } catch {
    return '—';
  }
}

function rewardSummary(reward: ReadEarnReward, t: TFunction) {
  if (!reward) return '';
  const rt = String(reward.rewardType || '').toLowerCase();
  if (rt === 'hashrate') {
    const days = Number(reward.hashrateValidityDays) > 0 ? Number(reward.hashrateValidityDays) : 7;
    return t('readEarn.reward_hashrate', {
      value: String(reward.rewardAmount),
      days: String(days)
    });
  }
  if (rt === 'blk') {
    return t('readEarn.reward_blk', { value: String(reward.rewardAmount) });
  }
  if (rt === 'machine') {
    return t('readEarn.reward_machine', {
      minerId: String(reward.rewardMinerId ?? '—'),
      level: String(Math.floor(Number(reward.rewardAmount)) || 1)
    });
  }
  return '';
}

export default function ReadEarn() {
  const { t, i18n } = useTranslation();
  const [campaigns, setCampaigns] = useState<ReadEarnCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCampaign, setModalCampaign] = useState<ReadEarnCampaign | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successReward, setSuccessReward] = useState<ReadEarnReward | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ReadEarnCampaignsResponse>('/read-earn/campaigns');
      if (res.data?.ok) setCampaigns(res.data.campaigns || []);
      else toast.error(t('readEarn.load_error'));
    } catch {
      toast.error(t('readEarn.load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const openModal = (c: ReadEarnCampaign) => {
    setModalCampaign(c);
    setCode('');
    setSuccessReward(null);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalCampaign(null);
    setCode('');
    setSuccessReward(null);
  };

  const handleRedeem = async () => {
    if (!modalCampaign || !code.trim()) return;
    setSubmitting(true);
    setSuccessReward(null);
    try {
      const res = await api.post<ReadEarnRedeemResponse>('/read-earn/redeem', {
        campaignId: modalCampaign.id,
        code: code.trim()
      });
      const d = res.data;
      if (d?.ok && d.reward) {
        setSuccessReward(d.reward);
        await load();
        return;
      }
      const errCode = d?.code;
      if (errCode === 'READ_EARN_ALREADY_CLAIMED') {
        toast.error(t('readEarn.error_claimed'));
      } else if (errCode === 'READ_EARN_UNAVAILABLE') {
        toast.error(t('readEarn.error_unavailable'));
      } else {
        toast.error(t('readEarn.error_unavailable'));
      }
    } catch (e: unknown) {
      const errCode = isAxiosError(e) ? (e.response?.data as { code?: string } | undefined)?.code : undefined;
      const status = isAxiosError(e) ? e.response?.status : undefined;
      if (errCode === 'READ_EARN_ALREADY_CLAIMED') toast.error(t('readEarn.error_claimed'));
      else if (status === 400 && errCode !== 'READ_EARN_UNAVAILABLE') {
        toast.error(t('readEarn.error_invalid'));
      } else toast.error(t('readEarn.error_unavailable'));
    } finally {
      setSubmitting(false);
    }
  };

  const locale = i18n.language || undefined;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20">
          <Sparkles className="w-8 h-8 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
            {t('readEarn.title')}
          </h1>
          <p className="text-slate-400 mt-1 text-sm md:text-base max-w-xl">
            {t('readEarn.subtitle')}
          </p>
        </div>
      </div>

      <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="read-earn-top" />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-violet-400" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-10 text-center text-slate-500">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
          {t('readEarn.empty')}
        </div>
      ) : (
        <ul className="space-y-4">
          {campaigns.map((c: ReadEarnCampaign) => (
            <li
              key={c.id}
              className="rounded-2xl border border-white/5 bg-slate-900/50 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div>
                <h2 className="font-bold text-white text-lg">{c.title}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {t('readEarn.ends')}: {formatEndsAt(c.expiresAt, locale)}
                </p>
                <a
                  href={c.partnerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 mt-3"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('readEarn.read_article')}
                </a>
              </div>
              <button
                type="button"
                onClick={() => openModal(c)}
                className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                {t('readEarn.submit_code')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {modalCampaign && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="read-earn-modal-title"
              className="relative w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 p-6 shadow-2xl"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeModal}
                className="absolute top-4 right-4 p-1 rounded-lg text-slate-500 hover:text-white hover:bg-white/5"
                aria-label={t('readEarn.cancel')}
              >
                <X className="w-5 h-5" />
              </button>

              {!successReward ? (
                <>
                  <h2
                    id="read-earn-modal-title"
                    className="text-lg font-bold text-white pr-8 mb-1"
                  >
                    {t('readEarn.modal_title')}
                  </h2>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2">{modalCampaign.title}</p>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {t('readEarn.code_label')}
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t('readEarn.code_placeholder')}
                    className="w-full rounded-xl bg-slate-900 border border-white/10 px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 mb-6"
                  />
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm font-medium"
                    >
                      {t('readEarn.cancel')}
                    </button>
                    <button
                      type="button"
                      disabled={submitting || !code.trim()}
                      onClick={handleRedeem}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('readEarn.submitting')}
                        </>
                      ) : (
                        t('readEarn.submit')
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <motion.div
                  className="text-center py-4"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.05 }}
                    className="inline-flex p-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-4"
                  >
                    <PartyPopper className="w-12 h-12 text-emerald-400" />
                  </motion.div>
                  <h3 className="text-xl font-black text-white mb-2">{t('readEarn.success_title')}</h3>
                  <p className="text-emerald-400/90 font-mono text-sm mb-2">
                    {rewardSummary(successReward, t)}
                  </p>
                  <p className="text-slate-500 text-sm mb-6">{t('readEarn.success_hint')}</p>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-6 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold"
                  >
                    {t('readEarn.done')}
                  </button>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
