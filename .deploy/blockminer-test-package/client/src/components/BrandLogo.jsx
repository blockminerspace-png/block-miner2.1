const VARIANTS = {
  sidebar: { img: 'w-9 h-9', text: 'text-xl', gap: 'gap-2.5' },
  auth:    { img: 'w-12 h-12', text: 'text-3xl', gap: 'gap-3' },
  header:  { img: 'w-8 h-8', text: 'text-lg', gap: 'gap-2' },
};

export default function BrandLogo({ variant = 'sidebar', className = '', interactive = false }) {
  const v = VARIANTS[variant] || VARIANTS.sidebar;

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
