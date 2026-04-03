import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Building2, Server, Lock, Unlock, Cpu, Plus, X, Zap, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../store/auth';

const DEFAULT_MINER_IMAGE = '/assets/machines/reward1.png';

function formatHashrate(hr) {
  if (!hr && hr !== 0) return '0 H/s';
  if (hr >= 1e6) return `${(hr / 1e6).toFixed(2)} MH/s`;
  if (hr >= 1e3) return `${(hr / 1e3).toFixed(2)} KH/s`;
  return `${hr.toFixed(2)} H/s`;
}

// ---------- Modal de instalação ----------
function InstallModal({ rack, inventory, onInstall, onClose }) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleInstall = async () => {
    if (!selected) return;
    setLoading(true);
    await onInstall(rack.id, selected.id);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h3 className="text-sm font-bold uppercase tracking-widest text-white">
            Instalar no Rack {rack.position + 1}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 max-h-80 overflow-y-auto space-y-2 scrollbar-hide">
          {inventory.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-xs">
              <Cpu className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma máquina no inventário
            </div>
          ) : (
            inventory.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                  selected?.id === item.id
                    ? 'border-primary/50 bg-primary/10 text-white'
                    : 'border-white/5 bg-white/3 text-gray-300 hover:border-white/20 hover:bg-white/5'
                }`}
              >
                <img
                  src={item.imageUrl || DEFAULT_MINER_IMAGE}
                  alt={item.minerName}
                  className="w-9 h-9 rounded-lg object-contain bg-black/20 flex-shrink-0"
                  onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE; }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{item.minerName || 'Máquina'}</p>
                  <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    {formatHashrate(item.hashRate)}
                    {item.level > 1 && (
                      <span className="ml-1 text-primary">Nível {item.level}</span>
                    )}
                  </p>
                </div>
                {selected?.id === item.id && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>

        <div className="p-4 border-t border-white/5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-white/5 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleInstall}
            disabled={!selected || loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                Instalar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Card de um Rack ----------
function RackCard({ rack, onClickEmpty, onClickOccupied }) {
  const occupied = rack.miner !== null;

  if (occupied) {
    return (
      <button
        onClick={() => onClickOccupied(rack)}
        title={`Rack ${rack.position + 1} — ${formatHashrate(rack.miner?.hashRate)} — Clique para remover`}
        className="aspect-square rounded-lg border border-emerald-500/30 bg-emerald-900/10 hover:border-emerald-400/60 hover:bg-emerald-900/20 transition-all flex flex-col items-center justify-center gap-1 p-1 group relative overflow-hidden"
      >
        <img
          src={rack.miner?.imageUrl || DEFAULT_MINER_IMAGE}
          alt="miner"
          className="w-6 h-6 md:w-8 md:h-8 object-contain"
          onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE; }}
        />
        <span className="text-[8px] md:text-[9px] text-emerald-400 font-mono leading-none text-center truncate w-full px-0.5">
          {formatHashrate(rack.miner?.hashRate)}
        </span>
        <div className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
          <X className="w-4 h-4 text-white" />
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => onClickEmpty(rack)}
      title={`Rack ${rack.position + 1} — vazio`}
      className="aspect-square rounded-lg border border-white/5 bg-white/2 hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center justify-center group"
    >
      <Plus className="w-3 h-3 md:w-4 md:h-4 text-gray-600 group-hover:text-primary transition-colors" />
    </button>
  );
}

// ---------- Componente de Sala ----------
function RoomCard({ room, inventory, onBuyRoom, onInstall, onUninstall, buyingRoom }) {
  const [expanded, setExpanded] = useState(room.roomNumber === 1);

  if (!room.unlocked) {
    return (
      <div className="rounded-2xl border border-white/5 bg-slate-900/50 overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center">
              <Lock className="w-4 h-4 text-gray-500" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Sala {room.roomNumber}
              </p>
              <p className="text-[10px] text-gray-600 mt-0.5">
                {room.price === 0 ? 'Grátis' : `${room.price} POL`} • 24 racks
              </p>
            </div>
          </div>
          <button
            onClick={() => onBuyRoom(room.roomNumber, room.price)}
            disabled={buyingRoom}
            className="px-4 py-2 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-wider hover:bg-primary/80 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {buyingRoom ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Unlock className="w-3 h-3" />
            )}
            {room.price === 0 ? 'Desbloquear' : `Comprar (${room.price} POL)`}
          </button>
        </div>
      </div>
    );
  }

  const occupied = room.racks.filter((r) => r.miner).length;
  const total = room.racks.length;

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full p-4 flex items-center justify-between hover:bg-white/2 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-white uppercase tracking-wider">
              Sala {room.roomNumber}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="h-1 w-20 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${total > 0 ? (occupied / total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-500">
                {occupied}/{total} racks
              </span>
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Grid de racks */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-1.5">
            {room.racks.map((rack) => (
              <RackCard
                key={rack.id}
                rack={rack}
                onClickEmpty={(r) => onInstall(r)}
                onClickOccupied={(r) => onUninstall(r)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Página principal ----------
export default function Farm() {
  const [rooms, setRooms] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [summary, setSummary] = useState({ totalRacks: 0, occupiedRacks: 0, freeRacks: 0 });
  const [loading, setLoading] = useState(true);
  const [buyingRoom, setBuyingRoom] = useState(false);
  const [installModal, setInstallModal] = useState(null); // { rack }
  const [uninstallTarget, setUninstallTarget] = useState(null); // rack

  const fetchData = useCallback(async () => {
    try {
      const [roomsRes, invRes] = await Promise.all([
        api.get('/rooms'),
        api.get('/inventory'),
      ]);
      if (roomsRes.data.ok) {
        setRooms(roomsRes.data.rooms);
        setSummary({
          totalRacks: roomsRes.data.totalRacks,
          occupiedRacks: roomsRes.data.occupiedRacks,
          freeRacks: roomsRes.data.freeRacks,
        });
      }
      if (invRes.data.ok) {
        setInventory(invRes.data.inventory || []);
      }
    } catch {
      toast.error('Erro ao carregar a fazenda.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBuyRoom = async (roomNumber, price) => {
    setBuyingRoom(true);
    try {
      const res = await api.post('/rooms/buy');
      if (res.data.ok) {
        toast.success(res.data.message || `Sala ${roomNumber} desbloqueada!`);
        await fetchData();
      } else {
        toast.error(res.data.message || 'Erro ao comprar sala.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Erro ao comprar sala.');
    } finally {
      setBuyingRoom(false);
    }
  };

  const handleInstall = async (rackId, inventoryId) => {
    try {
      const res = await api.post('/rooms/rack/install', { rackId, inventoryId });
      if (res.data.ok) {
        toast.success('Máquina instalada com sucesso!');
        setInstallModal(null);
        await fetchData();
      } else {
        toast.error(res.data.message || 'Erro ao instalar.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Erro ao instalar.');
    }
  };

  const handleUninstall = async (rack) => {
    try {
      const res = await api.post('/rooms/rack/uninstall', { rackId: rack.id });
      if (res.data.ok) {
        toast.success('Máquina removida do rack!');
        setUninstallTarget(null);
        await fetchData();
      } else {
        toast.error(res.data.message || 'Erro ao remover.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Erro ao remover.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            Minha Fazenda
          </h1>
          <p className="text-xs text-gray-500 mt-1">Gerencie suas salas e racks de mineração</p>
        </div>

        {/* Stats rápidos */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Racks</p>
            <p className="text-sm font-black text-white">{summary.totalRacks}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Ocupados</p>
            <p className="text-sm font-black text-emerald-400">{summary.occupiedRacks}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Livres</p>
            <p className="text-sm font-black text-primary">{summary.freeRacks}</p>
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-[10px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-emerald-500/40 bg-emerald-900/20 inline-block" />
          Rack com máquina (clique para remover)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded border border-white/10 bg-white/2 inline-block" />
          Rack vazio (clique para instalar)
        </span>
      </div>

      {/* Lista de salas */}
      <div className="space-y-3">
        {rooms.map((room) => (
          <RoomCard
            key={room.roomNumber}
            room={room}
            inventory={inventory}
            onBuyRoom={handleBuyRoom}
            onInstall={(rack) => setInstallModal({ rack })}
            onUninstall={(rack) => setUninstallTarget(rack)}
            buyingRoom={buyingRoom}
          />
        ))}
      </div>

      {/* Modal de instalação */}
      {installModal && (
        <InstallModal
          rack={installModal.rack}
          inventory={inventory}
          onInstall={handleInstall}
          onClose={() => setInstallModal(null)}
        />
      )}

      {/* Confirm uninstall */}
      {uninstallTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Remover máquina?</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  A máquina voltará para o seu inventário.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setUninstallTarget(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 text-xs font-bold uppercase tracking-wider hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleUninstall(uninstallTarget)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider hover:bg-red-500/30 transition-all"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
