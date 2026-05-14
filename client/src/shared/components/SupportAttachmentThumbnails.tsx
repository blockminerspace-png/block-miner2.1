import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type SupportAttachmentPreview = {
  url: string;
  mimeType?: string;
};

type SupportAttachmentItemProps = {
  attachment: SupportAttachmentPreview;
  variant: 'default' | 'compact' | 'adminStrip';
  t: (key: string) => string;
};

/**
 * Single image attachment with load-error fallback.
 */
function SupportAttachmentItem({ attachment, variant, t }: SupportAttachmentItemProps) {
  const [failed, setFailed] = useState(false);
  let imgClass =
    'max-h-[min(70vh,28rem)] w-full max-w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl object-contain bg-black/30';
  if (variant === 'compact') {
    imgClass = 'max-h-32 max-w-[200px] object-cover bg-black/30';
  } else if (variant === 'adminStrip') {
    imgClass = 'h-24 w-28 sm:h-28 sm:w-32 object-cover bg-black/30';
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      title={t('support_tickets.attachment_open_full')}
      className={`block shrink-0 overflow-hidden rounded-lg border border-white/10 transition-colors hover:border-primary/50 ${
        variant === 'adminStrip' ? 'snap-start' : ''
      }`}
    >
      {failed ? (
        <span className="flex max-w-[10rem] items-center justify-center bg-black/40 px-2 py-6 text-center text-xs text-slate-400">
          {t('support_tickets.attachment_failed')}
        </span>
      ) : (
        <img
          src={attachment.url}
          alt={t('support_tickets.attachment_alt')}
          className={imgClass}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </a>
  );
}

type SupportAttachmentThumbnailsProps = {
  attachments?: SupportAttachmentPreview[];
  className?: string;
  variant?: 'default' | 'compact' | 'adminStrip';
};

/**
 * Renders support ticket image attachments as preview tiles.
 */
export default function SupportAttachmentThumbnails({
  attachments,
  className = '',
  variant = 'default',
}: SupportAttachmentThumbnailsProps) {
  const { t } = useTranslation();
  const list = attachments ?? [];
  if (!list.length) return null;

  if (variant === 'adminStrip') {
    return (
      <div
        className={`mt-3 flex max-w-full flex-row flex-nowrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:thin] sm:snap-x sm:snap-mandatory ${className}`}
      >
        {list.map((a) => (
          <SupportAttachmentItem key={a.url} attachment={a} variant="adminStrip" t={t} />
        ))}
      </div>
    );
  }

  return (
    <div className={`mt-3 flex flex-wrap gap-3 ${className}`}>
      {list.map((a) => (
        <SupportAttachmentItem key={a.url} attachment={a} variant={variant} t={t} />
      ))}
    </div>
  );
}
