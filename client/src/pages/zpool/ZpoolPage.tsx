import { useEffect, useMemo, useState } from 'react';
import { Activity, Coins, Copy, ExternalLink, Pickaxe, RefreshCw, Server, Wallet } from 'lucide-react';
import { toast } from 'sonner';

type ZpoolAlgoStatus = {
  name?: string;
  port?: number;
  coins?: number;
  fees?: number;
  hashrate?: number;
  workers?: number;
  estimate_current?: string;
  estimate_last24h?: string;
  actual_last24h?: string;
};

type ZpoolCurrency = {
  algo?: string;
  port?: number;
  name?: string;
  workers?: number;
  hashrate?: number;
  lastblock?: number;
  timesincelast?: number;
};

type ZpoolWallet = {
  unsold?: number;
  balance?: number;
  unpaid?: number;
  paid24h?: number;
  total?: number;
};

const ZPOOL_API = 'https://www.zpool.ca/api';
const WALLET_STORAGE_KEY = 'blockminer:zpool:wallet';

const ZER_SERVER = 'equihash192.na.mine.zpool.ca';
const ZER_PORT = 2192;
const ZER_ALGO = 'equihash192';

const MINERS = [
  {
    id: 'miniZ',
    label: 'miniZ',
    command: (wallet: string) =>
      `miniZ --algo ${ZER_ALGO} --server ${ZER_SERVER}:${ZER_PORT} --user ${wallet} --pass c=ZER,zap=ZER`,
  },
  {
    id: 'ewbf',
    label: 'EWBF',
    command: (wallet: string) =>
      `ewbf-miner --algo ${ZER_ALGO} --server ${ZER_SERVER} --port ${ZER_PORT} --user ${wallet} --pass c=ZER,zap=ZER`,
  },
  {
    id: 'lolminer',
    label: 'lolMiner',
    command: (wallet: string) =>
      `lolMiner --algo EQUI192_7 --pool stratum+tcp://${ZER_SERVER}:${ZER_PORT} --user ${wallet} --pass c=ZER,zap=ZER`,
  },
  {
    id: 'gminer',
    label: 'GMiner',
    command: (wallet: string) =>
      `miner --algo equihash192_7 --server ${ZER_SERVER} --port ${ZER_PORT} --user ${wallet} --pass c=ZER,zap=ZER`,
  },
] as const;

function formatHashrate(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0 H/s';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GH/s`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} MH/s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)} KH/s`;
  return `${n.toFixed(0)} H/s`;
}

function formatBtc(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00000000 BTC';
  return `${n.toFixed(8)} BTC`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${ZPOOL_API}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`zpool ${path} ${res.status}`);
  return (await res.json()) as T;
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3">{icon}</div>
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

export default function ZpoolPage() {
  const [walletAddress, setWalletAddress] = useState(() => localStorage.getItem(WALLET_STORAGE_KEY) ?? '');
  const [selectedMiner, setSelectedMiner] = useState<string>('miniZ');
  const [zerStatus, setZerStatus] = useState<ZpoolCurrency | null>(null);
  const [algoStatus, setAlgoStatus] = useState<ZpoolAlgoStatus | null>(null);
  const [wallet, setWallet] = useState<ZpoolWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [currResult, statusResult, walletResult] = await Promise.allSettled([
        fetchJson<Record<string, ZpoolCurrency>>('/currencies'),
        fetchJson<Record<string, ZpoolAlgoStatus>>('/status'),
        walletAddress.trim()
          ? fetchJson<ZpoolWallet>(`/wallet?address=${encodeURIComponent(walletAddress.trim())}`)
          : Promise.resolve(null),
      ]);

      if (currResult.status === 'fulfilled') {
        const currencies = currResult.value;
        setZerStatus(currencies['ZER'] ?? null);
      }
      if (statusResult.status === 'fulfilled') {
        const status = statusResult.value;
        const algo = Object.values(status).find((a) => a.name?.toLowerCase() === 'equihash192');
        setAlgoStatus(algo ?? null);
      }
      if (walletResult.status === 'fulfilled') setWallet(walletResult.value);

      setLastUpdated(new Date());
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Falha ao consultar a zpool.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem(WALLET_STORAGE_KEY, walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const miner = MINERS.find((m) => m.id === selectedMiner) ?? MINERS[0];
  const command = useMemo(
    () => miner.command(walletAddress.trim() || 'SUA_CARTEIRA_ZER'),
    [miner, walletAddress]
  );

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado.`);
    } catch {
      toast.error('Nao foi possivel copiar.');
    }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-950">
        <div className="p-5 md:p-7">
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/60 animate-pulse" />
              ZER · zpool.ca
            </span>
            <a
              href="https://www.zpool.ca/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-white"
            >
              zpool.ca <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">Zero <span className="text-emerald-400">ZER</span></h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Mineração de ZER via zpool.ca. Configure sua carteira, escolha o miner e copie o comando para rodar no seu PC.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <StatCard
                  icon={<Activity className="h-5 w-5 text-emerald-300" />}
                  label="Algo"
                  value="equihash192"
                />
                <StatCard
                  icon={<Server className="h-5 w-5 text-sky-300" />}
                  label="Workers ZER"
                  value={zerStatus?.workers?.toLocaleString() ?? '—'}
                />
                <StatCard
                  icon={<Pickaxe className="h-5 w-5 text-amber-300" />}
                  label="Hashrate pool"
                  value={formatHashrate(algoStatus?.hashrate)}
                />
              </div>
            </div>

            {/* Wallet */}
            <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-emerald-300" />
                  <h2 className="text-sm font-black uppercase tracking-widest text-white">Sua Carteira ZER</h2>
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white"
                  title="Atualizar"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <input
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="zs1... (endereço ZER)"
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
              />

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-950/80 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Unpaid</p>
                  <p className="mt-1 font-bold text-white">{formatBtc(wallet?.unpaid)}</p>
                </div>
                <div className="rounded-lg bg-slate-950/80 p-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">Total pago</p>
                  <p className="mt-1 font-bold text-white">{formatBtc(wallet?.total)}</p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Atualizado: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'aguardando'}
              </p>
              {apiError && <p className="mt-2 text-xs text-amber-300">{apiError}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Stratum info */}
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5">
        <h2 className="mb-4 text-lg font-black text-white">Stratum</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            { label: 'Server', value: `stratum+tcp://${ZER_SERVER}:${ZER_PORT}` },
            { label: 'Username', value: walletAddress.trim() || 'SUA_CARTEIRA_ZER' },
            { label: 'Password', value: 'c=ZER,zap=ZER' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">{label}</p>
                  <p className="text-xs font-mono text-emerald-300 break-all">{value}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(value, label)}
                  className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  title={`Copiar ${label}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Command generator */}
      <section className="rounded-2xl border border-white/10 bg-slate-950 p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black text-white">Comando de mineração</h2>
            <p className="text-sm text-slate-500">Escolha seu miner e copie o comando para rodar no PC.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {MINERS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMiner(m.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-widest transition-colors ${
                  selectedMiner === m.id
                    ? 'bg-emerald-500 text-slate-950'
                    : 'border border-white/10 bg-white/5 text-slate-300 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-emerald-200 pr-16">{command}</pre>
          <button
            type="button"
            onClick={() => void copy(command, 'Comando')}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-emerald-400"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-amber-300 mb-1">ZAP ativo</p>
            <p className="text-xs text-slate-400">
              <code className="text-amber-200">zap=ZER</code> força mineração em ZER independente do algoritmo mais lucrativo do momento.
              Remova para minerar automaticamente a moeda mais rentável via equihash192.
            </p>
          </div>
          <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-sky-300 mb-1">Compatibilidade</p>
            <p className="text-xs text-slate-400">
              ZER usa <strong className="text-white">Equihash 192,7</strong>.
              Confirme suporte no seu miner. miniZ e lolMiner têm melhor performance para este algoritmo.
            </p>
          </div>
        </div>
      </section>

      {/* Pool stats */}
      {algoStatus && (
        <section className="rounded-2xl border border-white/10 bg-slate-950 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Coins className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-black text-white">Stats equihash192 · zpool</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {[
              { label: 'Hashrate total', value: formatHashrate(algoStatus.hashrate) },
              { label: 'Workers', value: algoStatus.workers?.toLocaleString() ?? '—' },
              { label: 'Moedas', value: algoStatus.coins?.toString() ?? '—' },
              { label: 'Fee', value: algoStatus.fees ? `${algoStatus.fees}%` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
