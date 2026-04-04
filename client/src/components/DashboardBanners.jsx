import { useEffect, useState } from 'react';
import { X, ExternalLink, Info, AlertTriangle, CheckCircle2, Megaphone } from 'lucide-react';

const TYPE_CFG = {
  info:    { bg: 'bg-blue-500/10',   border: 'border-blue-500/25',  icon: Info,          iconColor: 'text-blue-400',    btn: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300' },
  warning: { bg: 'bg-amber-500/10',  border: 'border-amber-500/25', icon: AlertTriangle,  iconColor: 'text-amber-400',   btn: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300' },
  success: { bg: 'bg-emerald-500/10',border: 'border-emerald-500/25',icon: CheckCircle2,  iconColor: 'text-emerald-400', btn: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300' },
  promo:   { bg: 'bg-violet-500/10', border: 'border-violet-500/25', icon: Megaphone,     iconColor: 'text-violet-400',  btn: 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-300' },
};

function Banner({ banner, onDismiss }) {
  const cfg = TYPE_CFG[banner.type] || TYPE_CFG.info;
  const Icon = cfg.icon;

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-2xl border ${cfg.bg} ${cfg.border} transition-all duration-300`}>
      <div className={`mt-0.5 shrink-0 ${cfg.iconColor}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white leading-snug">{banner.title}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{banner.message}</p>
        {banner.link && (
          <a
            href={banner.link}
            target={banner.link.startsWith('http') ? '_blank' : '_self'}
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-lg text-xs font-bold transition-colors ${cfg.btn}`}
          >
            {banner.linkLabel || 'Saiba mais'}
            {banner.link.startsWith('http') && <ExternalLink className="w-3 h-3" />}
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(banner.id)}
        className="shrink-0 p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
        aria-label="Fechar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function DashboardBanners() {
  const [banners, setBanners] = useState([]);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('dismissedBanners') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    fetch('/api/banners')
      .then(r => r.json())
      .then(data => { if (data.ok) setBanners(data.banners); })
      .catch(() => {});
  }, []);

  const handleDismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { sessionStorage.setItem('dismissedBanners', JSON.stringify(next)); } catch {}
  };

  const visible = banners.filter(b => !dismissed.includes(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visible.map(b => (
        <Banner key={b.id} banner={b} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
