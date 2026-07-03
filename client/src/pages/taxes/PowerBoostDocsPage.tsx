import { Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { ArrowLeft, Check, Rocket, ShieldCheck } from 'lucide-react';

const SYSTEM_ROWS = [
  'system_faucet',
  'system_shortlinks',
  'system_youtube',
  'system_autoMining',
] as const;

const HOW_STEPS = ['how_it_works_s1', 'how_it_works_s2', 'how_it_works_s3', 'how_it_works_s4', 'how_it_works_s5'] as const;
const IMPORTANT_KEYS = ['important_1', 'important_2', 'important_3', 'important_4'] as const;
const FAQ_KEYS = ['faq_1_q', 'faq_1_a', 'faq_2_q', 'faq_2_a', 'faq_3_q', 'faq_3_a'] as const;

export default function PowerBoostDocsPage() {
  const { t } = useTranslation();
  const cost = 0.01;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
      <Link
        to="/taxes"
        className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('powerBoost.docs.back')}
      </Link>

      <header className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Rocket className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">{t('powerBoost.docs.title')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('powerBoost.docs.intro')}</p>
        </div>
      </header>

      <div className="space-y-8">
        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            {t('powerBoost.how_it_works_title')}
          </h2>
          <ol className="space-y-3">
            {HOW_STEPS.map((key, idx) => (
              <li
                key={key}
                className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm leading-relaxed text-slate-200"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {idx + 1}
                </span>
                {t(`powerBoost.${key}`, { cost })}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            {t('powerBoost.docs.duration_title')}
          </h2>
          <div className="overflow-hidden rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/70">
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-400">
                    {t('powerBoost.table_system')}
                  </th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-slate-400">
                    {t('powerBoost.table_normal')}
                  </th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-emerald-400/90">
                    {t('powerBoost.table_boosted')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {SYSTEM_ROWS.map((key, idx) => (
                  <tr key={key} className={idx < SYSTEM_ROWS.length - 1 ? 'border-b border-slate-800/70' : ''}>
                    <td className="px-4 py-3 font-semibold text-white">{t(`powerBoost.${key}`)}</td>
                    <td className="px-4 py-3 text-slate-400">{t('powerBoost.duration_24h')}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400">{t('powerBoost.duration_7d')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-300" />
            <h2 className="text-sm font-bold text-amber-100">{t('powerBoost.important_title')}</h2>
          </div>
          <ul className="space-y-3">
            {IMPORTANT_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-sm leading-relaxed text-amber-100/85">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2.5} />
                <span className={key === 'important_3' ? 'font-semibold text-amber-50' : undefined}>
                  {t(`powerBoost.${key}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
            {t('powerBoost.docs.examples_title')}
          </h2>
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">
            <p>{t('powerBoost.docs.example_today')}</p>
            <p>{t('powerBoost.docs.example_tomorrow')}</p>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            {t('powerBoost.docs.faq_title')}
          </h2>
          <dl className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <dt className="text-sm font-bold text-white">{t(`powerBoost.docs.${FAQ_KEYS[i * 2]}`)}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-400">
                  {t(`powerBoost.docs.${FAQ_KEYS[i * 2 + 1]}`)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs leading-relaxed text-slate-500">
          <Trans i18nKey="powerBoost.footer_note" />
        </p>
      </div>
    </div>
  );
}
