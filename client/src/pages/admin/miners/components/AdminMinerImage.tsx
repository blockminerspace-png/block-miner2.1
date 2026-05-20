import { useEffect, useState } from 'react';
import {
  ADMIN_MINER_IMAGE_PLACEHOLDER,
  resolveAdminMinerPreviewSrc,
} from '../adminMiners.image';

export type AdminMinerImageVariant = 'form' | 'table' | 'shop';

const FRAME_CLASS: Record<AdminMinerImageVariant, string> = {
  form: 'flex min-h-[180px] h-[200px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/80 p-3',
  table: 'flex h-full w-full min-h-[56px] items-center justify-center overflow-hidden rounded-xl bg-slate-950/60 p-2',
  shop: 'flex h-full w-full min-h-[120px] items-center justify-center overflow-hidden rounded-2xl bg-slate-950/60 p-3',
};

const REAL_IMAGE_CLASS: Record<AdminMinerImageVariant, string> = {
  form: 'h-full w-full max-h-full max-w-full object-contain object-center',
  table: 'h-full w-full max-h-full max-w-full object-contain object-center',
  shop: 'h-full w-full max-h-full max-w-full object-contain object-center',
};

const PLACEHOLDER_ICON_CLASS: Record<AdminMinerImageVariant, string> = {
  form: 'h-14 w-14 opacity-35',
  table: 'h-8 w-8 opacity-35',
  shop: 'h-12 w-12 opacity-35',
};

export type AdminMinerImageProps = {
  imageUrl?: string | null;
  localObjectUrl?: string | null;
  cacheBust?: string | number | null;
  alt?: string;
  variant?: AdminMinerImageVariant;
  className?: string;
  frameClassName?: string;
  showLoadError?: boolean;
};

export default function AdminMinerImage({
  imageUrl,
  localObjectUrl = null,
  cacheBust = null,
  alt = '',
  variant = 'form',
  className = '',
  frameClassName = '',
  showLoadError = true,
}: AdminMinerImageProps) {
  const [broken, setBroken] = useState(false);
  const src = resolveAdminMinerPreviewSrc(imageUrl, localObjectUrl, cacheBust);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const frame = `${FRAME_CLASS[variant]} ${frameClassName} ${className}`.trim();

  if (src && broken && !localObjectUrl && showLoadError) {
    return (
      <div className={frame}>
        <p className="px-3 text-center text-[10px] font-bold uppercase tracking-wide text-red-400">
          Imagem não carregou
        </p>
      </div>
    );
  }

  if (!src || broken) {
    return (
      <div className={frame} aria-hidden>
        <img
          src={ADMIN_MINER_IMAGE_PLACEHOLDER}
          alt=""
          className={`${PLACEHOLDER_ICON_CLASS[variant]} object-contain`}
        />
      </div>
    );
  }

  return (
    <div className={frame}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={REAL_IMAGE_CLASS[variant]}
        onLoad={() => setBroken(false)}
        onError={() => setBroken(true)}
      />
    </div>
  );
}
