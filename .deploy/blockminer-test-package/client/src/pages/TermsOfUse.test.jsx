import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';
import ptBR from '../i18n/locales/pt-BR.json';
import { TERMS_OF_USE_SECTION_IDS } from '../legal/legalSectionIds';

function assertTermsSections(bundle, localeLabel) {
  for (const id of TERMS_OF_USE_SECTION_IDS) {
    const section = bundle.legal?.termsOfUse?.sections?.[id];
    expect(section, `${localeLabel} missing section ${id}`).toBeDefined();
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
