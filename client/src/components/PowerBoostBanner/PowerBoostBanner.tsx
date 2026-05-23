import { useState, useEffect, useCallback } from 'react';
import { Zap, CheckCircle2, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../store/auth';

interface BoostStatus {
  active: boolean;
  dayKey: string;
  costPol: number;
}

export default function PowerBoostBanner() {
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/power-boost/status');
      setStatus(res.data);
    } catch {
      // silent — banner just won't show
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleActivate = async () => {
    setActivating(true);
    try {
      const res = await api.post('/power-boost/activate');
      if (res.data.ok) {
        setStatus(prev => prev ? { ...prev, active: true } : null);
        toast.success('Power Boost ativado! Coletas de hoje duram 7 dias.');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao ativar Power Boost.';
      toast.error(msg);
    } finally {
      setActivating(false);
    }
  };

  if (loading || !status) return null;

  if (status.active) {
    return (
      <div className="flex items-center gap-3 px-5 py-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-sm font-semibold text-emerald-400">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Power Boost ativo hoje — coletas duram <strong>7 dias</strong></span>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-5 py-4 bg-primary/5 border border-primary/20 rounded-2xl">
      <div className="flex items-start gap-3">
        <Rocket className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-white leading-tight">Power Boost — 7 dias por coleta</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Pague {status.costPol} POL hoje e tudo que você coletar (faucet, shortlink, YouTube, auto mining) dura 7 dias em vez de 24h.
          </p>
        </div>
      </div>
      <button
        onClick={handleActivate}
        disabled={activating}
        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary text-black text-xs font-black uppercase tracking-wider rounded-xl hover:brightness-110 transition-all disabled:opacity-60"
      >
        {activating
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Ativando…</>
          : <><Zap className="w-3.5 h-3.5" />Ativar por {status.costPol} POL</>
        }
      </button>
    </div>
  );
}
