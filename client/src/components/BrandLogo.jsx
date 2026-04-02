const SIZE = {
  sidebar: 'w-10 h-10',
  auth: 'w-14 h-14',
  header: 'w-9 h-9',
};

export default function BrandLogo({ variant = 'sidebar', className = '', interactive = false }) {
  const size = SIZE[variant] || SIZE.sidebar;

  return (
    <img
      src="/icon.png"
      alt="BlockMiner"
      className={[
        'object-contain',
        size,
        interactive ? 'transition-transform duration-300 group-hover:scale-105' : '',
        className,
      ].join(' ').trim()}
    />
  );
}
