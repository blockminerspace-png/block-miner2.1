/**
 * Animated BLOCKMINER mark: pulsing icon frame, floating glyph, shimmer on "MINER".
 * Respects prefers-reduced-motion via motion-reduce:*.
 */
const VARIANTS = {
  sidebar: {
    wrap: 'w-10 h-10 rounded-xl shadow-lg shadow-primary/20',
    img: 'w-6 h-6',
    text: 'text-2xl',
    gap: 'gap-3',
  },
  auth: {
    wrap: 'w-12 h-12 rounded-2xl shadow-xl shadow-primary/20',
    img: 'w-7 h-7',
    text: 'text-3xl',
    gap: 'gap-3',
  },
  header: {
    wrap: 'w-9 h-9 rounded-xl shadow-lg shadow-primary/15',
    img: 'w-[22px] h-[22px]',
    text: 'text-lg',
    gap: 'gap-2.5',
  },
};

export default function BrandLogo({ variant = 'sidebar', className = '', interactive = false }) {
  const v = VARIANTS[variant] || VARIANTS.sidebar;

  return (
    <div className={`flex items-center ${v.gap} ${className}`}>
      <div
        className={[
          'relative shrink-0 flex items-center justify-center overflow-hidden',
          'bg-gradient-to-tr from-primary to-blue-600',
          v.wrap,
          'animate-logo-ring motion-reduce:animate-none',
          interactive ? 'transition-transform duration-300 group-hover:scale-[1.04]' : '',
        ].join(' ')}
      >
        <span
          className="pointer-events-none absolute inset-[18%] rounded-md bg-[#5c2140]/75 motion-reduce:opacity-60 animate-pulse motion-reduce:animate-none"
          aria-hidden
        />
        <img
          src="/icon.png"
          alt=""
          className={`relative z-10 object-contain drop-shadow-sm ${v.img} animate-logo-float motion-reduce:animate-none`}
        />
      </div>
      <span className={`font-black tracking-tighter italic leading-none select-none ${v.text}`}>
        <span className="text-white inline-block animate-logo-block-pulse motion-reduce:animate-none">
          BLOCK
        </span>
        <span
          className="brand-logo-miner bg-gradient-to-r from-primary via-sky-200 to-primary bg-[length:220%_auto] bg-clip-text text-transparent inline-block animate-logo-shimmer"
          style={{ WebkitBackgroundClip: 'text' }}
        >
          MINER
        </span>
      </span>
    </div>
  );
}
