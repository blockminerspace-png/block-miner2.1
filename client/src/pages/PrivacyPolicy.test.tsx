import { describe, expect, it } from 'vitest';
import en from '../i18n/locales/en.json';
import es from '../i18n/locales/es.json';
import ptBR from '../i18n/locales/pt-BR.json';
import { PRIVACY_POLICY_SECTION_IDS } from '../legal/legalSectionIds';

type LocaleBundle = typeof en | typeof es | typeof ptBR;

function assertPrivacySections(bundle: LocaleBundle, localeLabel: string) {
  for (const id of PRIVACY_POLICY_SECTION_IDS) {
    const sections = bundle.legal?.privacyPolicy?.sections as
      | Record<string, { title: string; paragraphs: unknown[]; bullets?: unknown[] }>
      | undefined;
    const section = sections?.[id];
    expect(section, `${localeLabel} missing privacy section ${id}`).toBeDefined();
    if (!section) throw new Error(`${localeLabel} missing privacy section ${id}`);
    expect(typeof section.title, `${localeLabel} ${id}.title`).toBe('string');
    expect(section.title.length > 0, `${localeLabel} ${id}.title empty`).toBe(true);
    expect(Array.isArray(section.paragraphs), `${localeLabel} ${id}.paragraphs`).toBe(true);
    expect(section.paragraphs.length > 0, `${localeLabel} ${id} has paragraphs`).toBe(true);
    if (Object.prototype.hasOwnProperty.call(section, 'bullets')) {
      expect(Array.isArray(section.bullets), `${localeLabel} ${id}.bullets`).toBe(true);
    }
  }
}

describe('PrivacyPolicy legal copy', () => {
  it('defines matching section structure in en, pt-BR, and es', () => {
    assertPrivacySections(en, 'en');
    assertPrivacySections(ptBR, 'pt-BR');
    assertPrivacySections(es, 'es');
  });
});
