/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import SupportAttachmentThumbnails from './SupportAttachmentThumbnails';

const enSupportTickets = {
  attachment_alt: 'Attachment preview',
  attachment_open_full: 'Open full size in a new tab',
  attachment_failed: 'Image could not be loaded.',
};

function createTestI18n() {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    initImmediate: false,
    interpolation: { escapeValue: false },
    resources: {
      en: { translation: { support_tickets: enSupportTickets } },
    },
  });
  return instance;
}

function renderThumbnails(props: ComponentProps<typeof SupportAttachmentThumbnails>) {
  const i18n = createTestI18n();
  return render(
    <I18nextProvider i18n={i18n}>
      <SupportAttachmentThumbnails {...props} />
    </I18nextProvider>
  );
}

describe('SupportAttachmentThumbnails', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders nothing when there are no attachments', () => {
    const { container } = renderThumbnails({ attachments: [] });
    expect(container.firstChild).toBeNull();
  });

  it('renders a link with translated title and large preview classes by default', () => {
    renderThumbnails({
      attachments: [{ url: 'https://example.com/a.png', mimeType: 'image/png' }],
    });
    const link = screen.getByRole('link', { name: /attachment preview/i });
    expect(link).toHaveAttribute('href', 'https://example.com/a.png');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('title', 'Open full size in a new tab');
    const img = screen.getByRole('img', { name: /attachment preview/i });
    expect(img).toHaveClass('object-contain');
  });

  it('uses compact cropping classes when variant is compact', () => {
    renderThumbnails({
      variant: 'compact',
      attachments: [{ url: 'https://example.com/b.png' }],
    });
    const img = screen.getByRole('img', { name: /attachment preview/i });
    expect(img).toHaveClass('object-cover');
    expect(img).toHaveClass('max-h-32');
  });

  it('adminStrip uses horizontal strip with small fixed tiles', () => {
    const { container } = renderThumbnails({
      variant: 'adminStrip',
      attachments: [
        { url: 'https://example.com/1.png' },
        { url: 'https://example.com/2.png' },
      ],
    });
    const strip = container.querySelector('.overflow-x-auto');
    expect(strip).toBeTruthy();
    const imgs = screen.getAllByRole('img', { name: /attachment preview/i });
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveClass('object-cover');
    expect(imgs[0]).toHaveClass('h-24');
  });

  it('shows a fallback message when the image fails to load', () => {
    renderThumbnails({
      attachments: [{ url: 'https://example.com/broken.png' }],
    });
    const img = screen.getByRole('img', { name: /attachment preview/i });
    fireEvent.error(img);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Image could not be loaded.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /image could not be loaded/i });
    expect(link).toHaveAttribute('href', 'https://example.com/broken.png');
  });
});
