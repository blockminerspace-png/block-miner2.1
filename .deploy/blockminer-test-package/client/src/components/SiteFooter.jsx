import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BrandLogo from './BrandLogo';

/**
 * Shared site footer with persistent legal links.
 */
export default function SiteFooter({ compact = false }) {
  const { t } = useTranslation();

  return (
    <footer className={`border-t border-white/10 bg-[#02070f] text-slate-300 ${compact ? 'px-4 py-6' : 'px-6 py-10'}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <BrandLogo variant="header" />
            <p className="mt-4 text-sm leading-6 text-slate-400">
              {t('legal.footer.description')}
            </p>
          </div>

          <nav aria-label={t('legal.footer.navigationAriaLabel')}>
            <ul className="flex flex-col gap-3 text-sm md:items-end">
              <li>
                <Link className="transition-colors hover:text-sky-400" to="/">
                  {t('legal.footer.home')}
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-sky-400" to="/privacy-policy">
                  {t('legal.footer.privacyPolicy')}
                </Link>
              </li>
              <li>
                <Link className="transition-colors hover:text-sky-400" to="/terms-of-use">
                  {t('legal.footer.termsOfUse')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-5 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>{t('legal.footer.copyright', { year: new Date().getFullYear() })}</p>
          <p>{t('legal.footer.complianceNote')}</p>
        </div>
      </div>
    </footer>
  );
}
