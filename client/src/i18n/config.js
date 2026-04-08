import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import translationEN from './locales/en.json';
import translationPT from './locales/pt-BR.json';
import translationES from './locales/es.json';

const resources = {
  en: {
    translation: translationEN,
  },
  'pt-BR': {
    translation: translationPT,
  },
  es: {
    translation: translationES,
  },
  'es-ES': {
    translation: translationES,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en', // Default language if browser language is not available
    supportedLngs: ['en', 'pt-BR', 'es', 'es-ES'],
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    detection: {
      // Sem `navigator`: primeira visita usa inglês (fallbackLng); PT/ES só após escolha guardada em localStorage ou ?lng=
      order: ['querystring', 'localStorage', 'cookie', 'htmlTag'],
      caches: ['localStorage'],
      lookupQuerystring: 'lng',
    },
  });

export default i18n;
