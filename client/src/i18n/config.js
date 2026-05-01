import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translations
import translationEN from './locales/en.json';
import translationPT from './locales/pt-BR.json';
import translationES from './locales/es.json';
import { resolveFallbackLanguages, resolveInitialLanguage } from './language.js';

const resources = {
  en: {
    translation: translationEN,
  },
  'pt-BR': {
    translation: translationPT,
  },
  /** Browsers often report `pt` without region — map to the same bundle as pt-BR */
  pt: {
    translation: translationPT,
  },
  /** Portugal (pt-PT) uses the same app bundle as pt-BR for now */
  'pt-PT': {
    translation: translationPT,
  },
  es: {
    translation: translationES,
  },
  'es-ES': {
    translation: translationES,
  },
};

function readStoredLanguage() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage?.getItem('i18nextLng') || '';
  } catch {
    return '';
  }
}

function readStoredLanguageUserSet() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem('i18nextLngUserSet') === '1';
  } catch {
    return false;
  }
}

const initialLanguage = resolveInitialLanguage({
  search: typeof window !== 'undefined' ? window.location.search : '',
  storedLanguage: readStoredLanguage(),
  storedLanguageUserSet: readStoredLanguageUserSet(),
  cookieString: typeof document !== 'undefined' ? document.cookie : '',
  htmlLang: typeof document !== 'undefined' ? document.documentElement?.lang : '',
  navigatorLanguage: typeof navigator !== 'undefined' ? navigator.language : '',
  navigatorLanguages: typeof navigator !== 'undefined' ? navigator.languages : [],
});

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLanguage,
    // i18next v25+ logs a Locize promo to console unless this is false
    showSupportNotice: false,
    debug: Boolean(import.meta.env?.DEV),
    fallbackLng: (code) => resolveFallbackLanguages(code),
    supportedLngs: ['en', 'pt-BR', 'pt', 'pt-PT', 'es', 'es-ES'],
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  });

i18n.on('languageChanged', (lng) => {
  const map = {
    en: 'en',
    pt: 'pt-BR',
    'pt-BR': 'pt-BR',
    'pt-PT': 'pt-PT',
    es: 'es',
    'es-ES': 'es-ES',
  };
  const normalized = map[lng] || lng || 'en';
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem('i18nextLng', normalized);
    } catch {
      /* private mode / storage disabled */
    }
  }
  if (typeof document === 'undefined') return;
  document.documentElement.lang = normalized;
});

export default i18n;
