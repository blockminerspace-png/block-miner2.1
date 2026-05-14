const VARIANT_KEYS = ['sidebar', 'auth', 'header'] as const;
type BrandVariantKey = (typeof VARIANT_KEYS)[number];

const VARIANTS: Record<BrandVariantKey, { img: string; text: string; gap: string }> = {
  sidebar: { img: 'w-9 h-9', text: 'text-xl', gap: 'gap-2.5' },
  auth:    { img: 'w-12 h-12', text: 'text-3xl', gap: 'gap-3' },
  header:  { img: 'w-8 h-8', text: 'text-lg', gap: 'gap-2' },
};

function resolveBrandVariant(variant: string | undefined): BrandVariantKey {
  const v = variant ?? 'sidebar';
  return (VARIANT_KEYS as readonly string[]).includes(v) ? (v as BrandVariantKey) : 'sidebar';
}

export default function BrandLogo({
  variant = 'sidebar',
  className = '',
  interactive = false,
}: {
  variant?: string;
  className?: string;
  interactive?: boolean;
}) {
  const v = VARIANTS[resolveBrandVariant(variant)];

  return (
    <div
      className={[
        'flex items-center',
        v.gap,
        interactive ? 'transition-transform duration-200 group-hover:scale-[1.03]' : '',
        className,
      ].join(' ').trim()}
    >
      <img src="/icon.png" alt="" className={`${v.img} object-contain shrink-0`} />
      <span className={`font-black tracking-tight italic leading-none select-none ${v.text}`}>
        <span className="text-white">BLOCK</span>
        <span className="text-primary">MINER</span>
      </span>
    </div>
  );
}
