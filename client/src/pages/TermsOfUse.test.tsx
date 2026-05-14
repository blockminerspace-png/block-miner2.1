import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';
import ptBR from '../i18n/locales/pt-BR.json';
import { TERMS_OF_USE_SECTION_IDS } from '../legal/legalSectionIds';

type LocaleBundle = typeof en | typeof es | typeof ptBR;

function assertTermsSections(bundle: LocaleBundle, localeLabel: string) {
  for (const id of TERMS_OF_USE_SECTION_IDS) {
    const sections = bundle.legal?.termsOfUse?.sections as
      | Record<string, { title: string; paragraphs: unknown[] }>
      | undefined;
    const section = sections?.[id];
    expect(section, `${localeLabel} missing section ${id}`).toBeDefined();
    if (!section) throw new Error(`${localeLabel} missing section ${id}`);
    expect(typeof section.title, `${localeLabel} ${id}.title`).toBe('string');
    expect(section.title.length > 0, `${localeLabel} ${id}.title empty`).toBe(true);
    expect(Array.isArray(section.paragraphs), `${localeLabel} ${id}.paragraphs`).toBe(true);
    expect(section.paragraphs.length > 0, `${localeLabel} ${id} has paragraphs`).toBe(true);
  }
}

describe('TermsOfUse legal copy', () => {
  it('defines matching section structure in en, pt-BR, and es', () => {
    assertTermsSections(en, 'en');
    assertTermsSections(ptBR, 'pt-BR');
    assertTermsSections(es, 'es');
  });
});
