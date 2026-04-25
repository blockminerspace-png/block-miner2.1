import LegalDocumentPage from '../components/LegalDocumentPage';
import { PRIVACY_POLICY_SECTION_IDS } from '../legal/legalSectionIds';

export default function PrivacyPolicy() {
  return (
    <LegalDocumentPage
      canonicalPath="/privacy-policy"
      metaTitleKey="legal.privacyPolicy.meta.title"
      metaDescriptionKey="legal.privacyPolicy.meta.description"
      eyebrowKey="legal.privacyPolicy.eyebrow"
      titleKey="legal.privacyPolicy.title"
      introKey="legal.privacyPolicy.intro"
      sectionIds={PRIVACY_POLICY_SECTION_IDS}
      sectionsTranslationPrefix="legal.privacyPolicy.sections"
    />
  );
}
