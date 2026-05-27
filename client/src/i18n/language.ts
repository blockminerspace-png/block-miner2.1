function firstNonEmpty(values: readonly unknown[] = []): string {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function normalizeExplicitLanguage(raw: unknown): 'pt-BR' | 'es' | 'en' | null {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith('pt')) return 'pt-BR';
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('en')) return 'en';
  return null;
}

export function normalizeBrowserLanguage(raw: unknown): 'pt-BR' | 'es' | 'en' {
  // Auto-detect from the browser's preferred language. Portuguese → pt-BR,
  // Spanish → es, anything else (including en-*, fr, de, ja, …) → en.
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'en';
  if (value.startsWith('pt')) return 'pt-BR';
  if (value.startsWith('es')) return 'es';
  return 'en';
}

export function extractCookieLanguage(cookieString = ''): string | null {
  const match = String(cookieString || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('i18next='));
  if (!match) return null;
  return decodeURIComponent(match.slice('i18next='.length));
}

export interface ResolveInitialLanguageOptions {
  search?: string;
  storedLanguage?: string;
  storedLanguageUserSet?: boolean;
  cookieString?: string;
  htmlLang?: string;
  navigatorLanguage?: string;
  navigatorLanguages?: readonly string[];
}

export function resolveInitialLanguage(options: ResolveInitialLanguageOptions = {}): 'pt-BR' | 'es' | 'en' {
  const {
    search = '',
    storedLanguage = '',
    storedLanguageUserSet = false,
    cookieString = '',
    htmlLang = '',
    navigatorLanguage = '',
    navigatorLanguages = [],
  } = options;

  const queryLanguage = (() => {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    return params.get('lng');
  })();

  const explicit = firstNonEmpty([
    queryLanguage,
    storedLanguageUserSet ? storedLanguage : '',
    extractCookieLanguage(cookieString),
  ]);
  const explicitLanguage = normalizeExplicitLanguage(explicit);
  if (explicitLanguage) return explicitLanguage;

  const browserRaw = firstNonEmpty([
    ...(Array.isArray(navigatorLanguages) ? navigatorLanguages : []),
    navigatorLanguage,
    htmlLang,
  ]);
  return normalizeBrowserLanguage(browserRaw);
}

export function resolveFallbackLanguages(activeLanguage: unknown): string[] {
  const normalized = normalizeExplicitLanguage(activeLanguage) || 'en';
  if (normalized === 'pt-BR') return ['pt-BR', 'en', 'es'];
  if (normalized === 'es') return ['es', 'pt-BR', 'en'];
  return ['en', 'pt-BR', 'es'];
}
