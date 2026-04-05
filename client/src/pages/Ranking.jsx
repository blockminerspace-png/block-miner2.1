import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, Zap, Cpu, Gamepad2, RefreshCw, ExternalLink, Crown, Medal, Loader2, ChevronRight } from 'lucide-react';
import { api } from '../store/auth';
import {
  formatHashrate,
  getGlobalSlotIndex,
  getMachineBySlot,
  getMachineDescriptor,
  RACKS_COUNT,
  SLOTS_PER_RACK,
  DEFAULT_MINER_IMAGE_URL,
} from '../utils/machine';

function YtBadge({ youtubeUrl, className = '' }) {
  const inner = (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-red-600 shadow-lg shadow-red-900/50 ${className}`}
      title="Criador de ConteÃºdo"
    >
      <svg viewBox="0 0 24 24" className="w-full h-full p-[20%]" fill="white">
        <path d="M23.5 6.2a3.01 3.01 0 0 0-2.12-2.13C19.54 3.6 12 3.6 12 3.6s-7.54 0-9.38.47A3.01 3.01 0 0 0 .5 6.2C.05 8.05 0 12 0 12s.05 3.95.5 5.8a3.01 3.01 0 0 0 2.12 2.13C4.46 20.4 12 20.4 12 20.4s7.54 0 9.38-.47a3.01 3.01 0 0 0 2.12-2.13C23.95 15.95 24 12 24 12s-.05-3.95-.5-5.8zM9.6 15.6V8.4l6.4 3.6-6.4 3.6z" />
      </svg>
    </span>
  );
  if (youtubeUrl) {
    return (
      <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
        {inner}
      </a>
    );
  }
  return inner;
}

function MiniRacks({ username, navigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    api.get(`/ranking/room/${username}`)
      .then(r => { if (r.data.ok) setData(r.data.user); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 gap-3 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest">Carregando sala...</span>
      </div>
    );
  }

  if (!data) {
    return <div className="py-8 text-center text-sm text-slate-600">NÃ£o foi possÃ­vel carregar a sala.</div>;
  }

  const machines = data.miners || [];
  const racks = data.racks || {};

  return (
    <div className="px-6 pb-6 pt-2 space-y-4 bg-slate-950/50">
      {/* Mini header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
            {machines.length} mÃ¡quina(s) ativa(s) Â· {formatHashrate(machines.reduce((s, m) => s + (m.hashRate || 0), 0))}
          </span>
        </div>
        <button
          onClick={() => navigate(`/room/${username}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-xs font-black transition-colors border border-primary/20"
        >
          <ExternalLink className="w-3 h-3" />
          Abrir Sala
        </button>
      </div>

      {/* Racks grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: RACKS_COUNT }).map((_, i) => {
          const rackIndex = i + 1;
          const rackName = racks[rackIndex] || `Rack ${rackIndex}`;
          const hasAnyMachine = Array.from({ length: SLOTS_PER_RACK }).some((_, localI) => {
            const globalI = getGlobalSlotIndex(rackIndex, localI);
            return !!getMachineBySlot(globalI, machines);
          });

          return (
            <div key={rackIndex} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${hasAnyMachine ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                <span className="text-xs font-black text-white uppercase tracking-wider">{rackName}</span>
              </div>
              <div className="p-3 grid grid-cols-4 gap-2">
                {Array.from({ length: SLOTS_PER_RACK }).map((_, localI) => {
                  const globalI = getGlobalSlotIndex(rackIndex, localI);
                  const machine = getMachineBySlot(globalI, machines);
                  if (machine && machine.isSecondSlot) return null;
                  const descriptor = machine ? getMachineDescriptor(machine) : null;
                  const isOccupied = !!machine;
                  const isDouble = descriptor?.size === 2;

                  return (
                    <div
                      key={localI}
                      className={`relative rounded-xl border transition-all flex items-center justify-center overflow-hidden
                        ${isDouble ? 'col-span-2' : ''}
                        ${isOccupied
                          ? 'bg-slate-800/60 border-slate-700/50 aspect-square'
                          : 'bg-slate-950/60 border-dashed border-slate-800 aspect-square opacity-25'}`}
                    >
                      {isOccupied && (
                        <div className="relative w-full h-full p-1.5 flex items-center justify-center group/slot">
                          <img
                            src={descriptor.image}
                            alt={descriptor.name}
                            className="w-4/5 h-4/5 object-contain"
                            onError={e => { e.target.src = DEFAULT_MINER_IMAGE_URL; }}
                          />
                          <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          <div className="absolute inset-0 bg-slate-950/90 opacity-0 group-hover/slot:opacity-100 transition-opacity flex flex-col items-center justify-center p-1 text-center">
                            <span className="text-[7px] font-black text-primary uppercase leading-tight">{descriptor.name}</span>
                            <span className="text-[9px] font-black text-white">{formatHashrate(machine.hashRate || 0)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Ranking() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ranking, setRanking] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRanking = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/ranking?limit=50');
      if (res.data.ok) setRanking(res.data.ranking);
    } catch (err) {
      console.error("Erro ao buscar ranking", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchRanking(); }, [fetchRanking]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl">
            <Trophy className="w-6 h-6 text-amber-500" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">Hall da Fama</h1>
          <p className="text-gray-500 font-medium">Os mineradores mais poderosos da rede global.</p>
        </div>
        <button
          onClick={fetchRanking}
          className="p-3 bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Top 3 Spotlight */}
      {!isLoading && ranking.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
          {/* Rank 2 */}
          <div
            onClick={() => navigate(`/room/${ranking[1].username}`)}
            className="order-2 md:order-1 bg-surface border border-gray-800/50 rounded-[2.5rem] overflow-hidden text-center h-auto flex flex-col relative group cursor-pointer hover:border-slate-400/30 transition-all"
          >
            <div className="p-8 space-y-4 flex flex-col justify-center items-center min-h-[300px]">
              <div className="absolute top-0 inset-x-0 h-1 bg-slate-400 opacity-20" />
              <div className="absolute top-4 left-4">
                {ranking[1].isCreator
                  ? <YtBadge youtubeUrl={ranking[1].youtubeUrl} className="w-8 h-8 animate-pulse" />
                  : <span className="w-8 h-8 bg-slate-400 text-slate-950 rounded-lg flex items-center justify-center font-black text-xs shadow-lg">2</span>}
              </div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-slate-400/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-slate-400/20 group-hover:scale-110 transition-transform">
                  <Medal className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-xl font-black text-white truncate px-4 group-hover:text-primary transition-colors">{ranking[1].username}</h3>
                <p className="text-primary font-bold text-lg">{formatHashrate(ranking[1].totalHashRate)}</p>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">2º LUGAR</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black text-slate-600 uppercase tracking-widest transition-colors group-hover:text-slate-400">
                <ChevronRight className="w-3 h-3" />
                Ver Sala
              </div>
            </div>
          </div>

          {/* Rank 1 */}
          <div
            onClick={() => navigate(`/room/${ranking[0].username}`)}
            className="order-1 md:order-2 bg-gradient-to-b from-amber-500/10 to-surface border border-amber-500/30 rounded-[3rem] overflow-hidden text-center h-auto flex flex-col relative shadow-2xl shadow-amber-500/5 group cursor-pointer hover:border-amber-500/50 transition-all"
          >
            <div className="p-10 space-y-6 flex flex-col justify-center items-center min-h-[360px]">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-amber-500 shadow-glow" />
              <div className="absolute top-6 left-6">
                {ranking[0].isCreator
                  ? <YtBadge youtubeUrl={ranking[0].youtubeUrl} className="w-10 h-10 animate-pulse" />
                  : <span className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-black text-base shadow-xl animate-bounce">1</span>}
              </div>
              <div className="relative z-10">
                <div className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-500/20 shadow-xl group-hover:scale-110 transition-transform duration-500">
                  <Crown className="w-12 h-12 text-slate-950" />
                </div>
                <h3 className="text-2xl font-black text-white truncate px-4 group-hover:tracking-wider transition-all">{ranking[0].username}</h3>
                <p className="text-amber-500 font-black text-2xl">{formatHashrate(ranking[0].totalHashRate)}</p>
                <span className="text-xs font-black text-amber-500/50 uppercase tracking-[0.3em]">REI DO BLOCO</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black text-amber-700 uppercase tracking-widest transition-colors group-hover:text-amber-500">
                <ChevronRight className="w-3 h-3" />
                Ver Sala
              </div>
            </div>
          </div>

          {/* Rank 3 */}
          <div
            onClick={() => navigate(`/room/${ranking[2].username}`)}
            className="order-3 md:order-3 bg-surface border border-gray-800/50 rounded-[2.5rem] overflow-hidden text-center h-auto flex flex-col relative group cursor-pointer hover:border-orange-700/30 transition-all"
          >
            <div className="p-8 space-y-4 flex flex-col justify-center items-center min-h-[300px]">
              <div className="absolute top-0 inset-x-0 h-1 bg-orange-700/20" />
              <div className="absolute top-4 left-4">
                {ranking[2].isCreator
                  ? <YtBadge youtubeUrl={ranking[2].youtubeUrl} className="w-8 h-8 animate-pulse" />
                  : <span className="w-8 h-8 bg-orange-700 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-lg">3</span>}
              </div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-orange-700/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-orange-700/20 group-hover:scale-110 transition-transform">
                  <Medal className="w-8 h-8 text-orange-700" />
                </div>
                <h3 className="text-xl font-black text-white truncate px-4 group-hover:text-primary transition-colors">{ranking[2].username}</h3>
                <p className="text-primary font-bold text-lg">{formatHashrate(ranking[2].totalHashRate)}</p>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">3º LUGAR</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-black text-slate-600 uppercase tracking-widest transition-colors group-hover:text-slate-400">
                <ChevronRight className="w-3 h-3" />
                Ver Sala
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List Table */}
      <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-gray-800/30 text-[10px] uppercase font-bold tracking-widest text-gray-500">
              <tr>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 w-12 sm:w-20">Rank</th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6">Minerador</th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6">Hash</th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 hidden md:table-cell">Sala</th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 hidden md:table-cell">Games</th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 text-right">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50 font-medium">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan="6" className="px-8 py-6 bg-gray-800/10" />
                  </tr>
                ))
              ) : ranking.map((entry, i) => (
                <tr
                  key={entry.id}
                  onClick={() => navigate(`/room/${entry.username}`)}
                  className={`cursor-pointer hover:bg-primary/5 transition-colors group ${i < 3 ? 'bg-primary/5' : ''}`}
                >
                  <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5">
                    {entry.isCreator
                      ? <YtBadge youtubeUrl={entry.youtubeUrl} className={`w-8 h-8 ${i < 3 ? 'animate-pulse' : ''}`} />
                      : <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${
                          i === 0 ? 'bg-amber-500 text-slate-950' :
                          i === 1 ? 'bg-slate-400 text-slate-950' :
                          i === 2 ? 'bg-orange-700 text-white' :
                                    'bg-gray-800 text-gray-500'
                        }`}>{entry.rank}</span>
                    }
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-800 flex items-center justify-center text-[10px] font-bold text-white border border-gray-700 shrink-0">
                        {entry.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-white font-bold truncate max-w-[80px] sm:max-w-none">{entry.username}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-primary font-black text-xs sm:text-sm">
                    {formatHashrate(entry.totalHashRate)}
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 hidden md:table-cell text-[10px] uppercase font-bold tracking-tighter">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-3 h-3 text-slate-500" />
                      {formatHashrate(entry.baseHashRate)}
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 hidden md:table-cell text-[10px] uppercase font-bold tracking-tighter">
                    <div className="flex items-center gap-2">
                      <Gamepad2 className="w-3 h-3 text-slate-500" />
                      {formatHashrate(entry.gameHashRate)}
                    </div>
                  </td>
                  <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-right">
                    <div className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border bg-gray-800/50 border-gray-700/50 text-gray-500 group-hover:border-primary/30 group-hover:text-primary">
                      <ChevronRight className="w-3 h-3" />
                      <span className="hidden sm:inline">Ver</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
