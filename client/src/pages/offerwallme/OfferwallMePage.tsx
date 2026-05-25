import { useAuthStore } from '../../store/auth';
import { Store, ExternalLink, Info } from 'lucide-react';

const OFFERWALLME_API_KEY = 'yyu8i3jt58by9do1fbdr0fyn60yn5u';

export default function OfferwallMePage() {
  const user = useAuthStore(s => s.user);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    );
  }

  const iframeUrl = `https://offerwall.me/offerwall/${OFFERWALLME_API_KEY}/${user.id}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <Store className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Offerwall.me</h1>
            <p className="text-[10px] text-gray-500">Complete ofertas e ganhe POL</p>
          </div>
        </div>
        <a
          href={iframeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white text-[11px] font-black uppercase transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir em nova aba
        </a>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 bg-violet-950/30 border border-violet-500/20 rounded-xl p-3">
        <Info className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Complete ofertas abaixo para ganhar POL. Cada oferta completa aqui (ou em qualquer offerwall externa) também conta para
          <span className="text-violet-300 font-black"> isenção da taxa de saque</span>{' '}
          — 10 ofertas externas no dia = saque sem taxa.
        </p>
      </div>

      {/* Offerwall iframe */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <iframe
          src={iframeUrl}
          scrolling="yes"
          frameBorder="0"
          title="Offerwall.me"
          style={{ width: '100%', height: '800px', border: 0, display: 'block' }}
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
