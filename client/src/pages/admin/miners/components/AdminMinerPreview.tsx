import { Image as ImageIcon } from 'lucide-react';
import AdminMinerImage, { type AdminMinerImageVariant } from './AdminMinerImage';

type AdminMinerPreviewProps = {
  imageUrl?: string | null;
  localObjectUrl?: string | null;
  cacheBust?: string | number | null;
  alt?: string;
  variant?: AdminMinerImageVariant;
  label?: string;
  showLabel?: boolean;
};

export default function AdminMinerPreview({
  imageUrl,
  localObjectUrl = null,
  cacheBust = null,
  alt = '',
  variant = 'form',
  label = 'Preview',
  showLabel = true,
}: AdminMinerPreviewProps) {
  return (
    <div className="space-y-3">
      {showLabel ? (
        <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-500">
          <ImageIcon className="h-4 w-4" /> {label}
        </div>
      ) : null}
      <AdminMinerImage
        imageUrl={imageUrl}
        localObjectUrl={localObjectUrl}
        cacheBust={cacheBust}
        alt={alt}
        variant={variant}
      />
    </div>
  );
}
