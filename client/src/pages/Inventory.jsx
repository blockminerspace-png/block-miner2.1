import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Lock, Plus, Zap, Trash2, Box, AlertCircle } from "lucide-react";
import { api } from "../store/auth";
import { formatHashrate, DEFAULT_MINER_IMAGE_URL, getMachineDescriptor } from "../utils/machine";

const SLOTS_PER_VISUAL_RACK = 8;

function groupIntoRacks(racks) {
  const groups = [];
  for (let r = 0; r < Math.ceil(racks.length / SLOTS_PER_VISUAL_RACK); r++) {
    groups.push({
      rackNumber: r + 1,
      slots: racks.slice(r * SLOTS_PER_VISUAL_RACK, (r + 1) * SLOTS_PER_VISUAL_RACK),
    });
  }
  return groups;
}

function SlotModal({ slot, inventory, onInstall, onRemove, onClose }) {
  const { t } = useTranslation();
  const machine = slot.miner || null;

  const groupedInventory = useMemo(() => {
    const groups = {};
    for (const item of inventory) {
      const key = `${item.minerName}_${item.level}_${item.hashRate}`;
      if (!groups[key]) groups[key] = { ...item, quantity: 1, items: [item] };
      else { groups[key].quantity += 1; groups[key].items.push(item); }
    }
    return Object.values(groups);
  }, [inventory]);

  const descriptor = machine ? getMachineDescriptor(machine) : null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-surface border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="px-8 pt-8 pb-6 flex items-center justify-between border-b border-gray-800/50">
          <div>
            <h3 className="text-xl font-bold text-white">
              {machine ? t("inventory.modal.details_title") : t("inventory.modal.install_title")}
            </h3>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">
              {t("inventory.modal.rack_slot", { rack: slot.visualRackNumber, slot: slot.slotInRack + 1 })}
            </p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-xl bg-gray-800/50 text-gray-400 flex items-center justify-center hover:text-white transition-colors">
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>
        <div className="p-8">
          {machine ? (
            <div className="space-y-6">
              <div className="flex items-center gap-6 p-4 bg-gray-800/20 rounded-2xl border border-gray-800/50">
                <div className="w-20 h-20 bg-gray-900/50 rounded-2xl p-3 border border-gray-800/50">
                  <img src={descriptor.image} className="w-full h-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">{machine.minerName || descriptor.name}</h4>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-gray-600 uppercase">{t("inventory.modal.level")}</span>
                      <span className="text-sm font-bold text-gray-300">{machine.level}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-gray-600 uppercase">{t("inventory.modal.hashrate")}</span>
                      <span className="text-sm font-bold text-primary uppercase">{formatHashrate(machine.hashRate)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <button onClick={() => onRemove(slot.rack.id)} className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl font-bold text-sm transition-all border border-red-500/20 flex items-center justify-center gap-2">
                <Trash2 className="w-4 h-4" /> {t("inventory.modal.remove_to_inventory")}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedInventory.length === 0 ? (
                <div className="p-8 text-center bg-gray-800/20 rounded-2xl border border-dashed border-gray-800">
                  <p className="text-gray-500 text-sm">{t("inventory.modal.no_machines_avail")}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {groupedInventory.map((group) => {
                    const desc = getMachineDescriptor({ hashRate: group.hashRate, slotSize: group.slotSize, imageUrl: group.imageUrl });
                    return (
                      <button key={group.id} onClick={() => onInstall(slot.rack.id, group.items[0].id)}
                        className="w-full p-4 bg-gray-800/30 hover:bg-primary/10 border border-gray-800 hover:border-primary/30 rounded-2xl flex items-center justify-between transition-all">
                        <div className="flex items-center gap-3 text-left">
                          <div className="w-10 h-10 bg-gray-900 rounded-lg p-2 shrink-0 relative">
                            <img src={desc.image} className="w-full h-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                            <div className="absolute -top-2 -right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-primary/20">x{group.quantity}</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{group.minerName}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">{formatHashrate(group.hashRate)}</div>
                          </div>
                        </div>
                        <Plus className="w-5 h-5 text-gray-600" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function RackCard({ rackNumber, slots, onSlotClick }) {
  return (
    <div className="bg-surface border border-gray-800/50 rounded-3xl overflow-hidden shadow-xl">
      <div className="px-6 py-4 bg-gray-800/20 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-glow" />
          <h3 className="text-sm font-bold text-gray-300">Rack {rackNumber}</h3>
        </div>
      </div>
      <div className="p-4 grid grid-cols-4 gap-3">
        {slots.map((rack, slotInRack) => {
          const machine = rack ? rack.miner : null;
          const descriptor = machine ? getMachineDescriptor(machine) : null;
          const isOccupied = !!machine;
          return (
            <button
              key={rack ? rack.id : slotInRack}
              onClick={() => onSlotClick({ rack, miner: machine, visualRackNumber: rackNumber, slotInRack })}
              className={`relative aspect-square rounded-2xl border transition-all duration-300 group flex items-center justify-center ${
                isOccupied
                  ? "bg-gray-800/40 border-gray-700/50 hover:border-primary/40 hover:bg-primary/5"
                  : "bg-gray-900/40 border-dashed border-gray-800 hover:border-gray-700 hover:bg-gray-800/30"
              }`}
            >
              {isOccupied ? (
                <>
                  <img src={descriptor.image} alt={descriptor.name} className="w-4/5 h-4/5 object-contain p-2 group-hover:scale-110 transition-transform pointer-events-none" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary pointer-events-none" />
                </>
              ) : (
                <Plus className="w-5 h-5 text-gray-700 group-hover:text-gray-500 transition-colors" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Inventory() {
  const { t } = useTranslation();
  const [rooms, setRooms] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [summary, setSummary] = useState({ totalRacks: 0, occupiedRacks: 0, freeRacks: 0 });
  const [loading, setLoading] = useState(true);
  const [buyingRoom, setBuyingRoom] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [activeRoom, setActiveRoom] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      const [roomsRes, invRes] = await Promise.all([api.get("/rooms"), api.get("/inventory")]);
      if (roomsRes.data.ok) {
        setRooms(roomsRes.data.rooms);
        setSummary({ totalRacks: roomsRes.data.totalRacks, occupiedRacks: roomsRes.data.occupiedRacks, freeRacks: roomsRes.data.freeRacks });
      }
      if (invRes.data.ok) setInventory(invRes.data.inventory || []);
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBuyRoom = async (roomNumber) => {
    setBuyingRoom(true);
    try {
      const res = await api.post("/rooms/buy");
      if (res.data.ok) {
        toast.success(res.data.message || `Sala ${roomNumber} desbloqueada!`);
        setActiveRoom(roomNumber);
        await fetchData();
      } else {
        toast.error(res.data.message || t("common.error"));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t("common.error"));
    } finally {
      setBuyingRoom(false);
    }
  };

  const handleInstall = async (rackId, inventoryId) => {
    try {
      const res = await api.post("/rooms/rack/install", { rackId, inventoryId });
      if (res.data.ok) { toast.success(t("inventory.modal.install_success")); setSelectedSlot(null); await fetchData(); }
      else toast.error(res.data.message || t("common.error"));
    } catch (err) { toast.error(err?.response?.data?.message || t("common.error")); }
  };

  const handleRemove = async (rackId) => {
    try {
      const res = await api.post("/rooms/rack/uninstall", { rackId });
      if (res.data.ok) { toast.success(t("inventory.modal.remove_success")); setSelectedSlot(null); await fetchData(); }
      else toast.error(res.data.message || t("common.error"));
    } catch (err) { toast.error(err?.response?.data?.message || t("common.error")); }
  };

  const groupedInventory = useMemo(() => {
    const groups = {};
    for (const item of inventory) {
      const key = `${item.minerName}_${item.level}_${item.hashRate}`;
      if (!groups[key]) groups[key] = { ...item, quantity: 1, items: [item] };
      else { groups[key].quantity += 1; groups[key].items.push(item); }
    }
    return Object.values(groups);
  }, [inventory]);

  const activeMachinesHashRate = useMemo(() =>
    rooms.flatMap(r => r.racks || []).filter(rack => rack.miner).reduce((sum, rack) => sum + Number(rack.miner?.hashRate || 0), 0),
    [rooms]
  );

  const currentRoom = rooms.find(r => r.roomNumber === activeRoom) || null;
  const visualRacksOfCurrent = currentRoom?.unlocked ? groupIntoRacks(currentRoom.racks || []) : [];
  const rackOffset = currentRoom ? (currentRoom.roomNumber - 1) * (visualRacksOfCurrent.length || 10) : 0;

  if (loading) return (
    <div className="flex items-center justify-center min-h-64">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t("inventory.title")}</h1>
          <p className="text-gray-500 font-medium">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs font-bold text-purple-400 flex items-center gap-1.5 shadow-glow-sm">
            <Zap className="w-3.5 h-3.5" />
            {formatHashrate(activeMachinesHashRate)}
          </div>
          <div className="px-4 py-2 bg-gray-800/50 border border-gray-700/50 rounded-xl text-xs font-bold text-gray-400">
            {summary.occupiedRacks} {t("inventory.active_machines")}
          </div>
          <div className="px-4 py-2 bg-primary/10 border border-primary/20 rounded-xl text-xs font-bold text-primary">
            {inventory.length} {t("inventory.in_inventory")}
          </div>
        </div>
      </div>

      {/* Tabs das salas */}
      <div className="flex items-center gap-2 flex-wrap">
        {rooms.map((room) => {
          const isActive = room.roomNumber === activeRoom;
          const isUnlocked = room.unlocked;
          return (
            <button
              key={room.roomNumber}
              onClick={() => setActiveRoom(room.roomNumber)}
              className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                isActive
                  ? "bg-primary text-white shadow-lg shadow-primary/20"
                  : isUnlocked
                  ? "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 hover:text-white border border-gray-700/50"
                  : "bg-gray-900/40 text-gray-600 border border-dashed border-gray-700/40 hover:border-gray-600/60 hover:text-gray-500"
              }`}
            >
              {!isUnlocked && <Lock className="w-3 h-3" />}
              Sala {room.roomNumber}
              {isUnlocked && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo + sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        {/* Racks da sala ativa */}
        <div className="xl:col-span-2">
          {currentRoom ? (
            currentRoom.unlocked ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {visualRacksOfCurrent.map((vr) => (
                  <RackCard
                    key={vr.rackNumber}
                    rackNumber={rackOffset + vr.rackNumber}
                    slots={vr.slots}
                    onSlotClick={setSelectedSlot}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-surface border border-gray-800/30 rounded-3xl p-10 flex flex-col items-center justify-center gap-6 text-center min-h-64">
                <div className="w-16 h-16 rounded-2xl bg-gray-800/40 border border-gray-800/50 flex items-center justify-center">
                  <Lock className="w-7 h-7 text-gray-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-gray-400">Sala {currentRoom.roomNumber} bloqueada</p>
                  <p className="text-xs text-gray-600 mt-1">10 racks · 80 slots disponíveis após desbloqueio</p>
                </div>
                <button
                  onClick={() => handleBuyRoom(currentRoom.roomNumber)}
                  disabled={buyingRoom}
                  className="px-8 py-3 rounded-2xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary/80 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {buyingRoom
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><Zap className="w-3.5 h-3.5" />{currentRoom.price === 0 ? "Desbloquear grátis" : `Comprar por ${currentRoom.price} POL`}</>
                  }
                </button>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center min-h-64">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Sidebar: Minhas Máquinas */}
        <div className="space-y-6">
          <div className="bg-surface border border-gray-800/50 rounded-3xl p-6 shadow-xl sticky top-28">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Box className="w-5 h-5 text-primary" /> {t("sidebar.machines")}
              </h2>
              <span className="text-xs font-bold text-gray-500">{inventory.length} ITENS</span>
            </div>
            {inventory.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-gray-800/20 rounded-2xl border border-dashed border-gray-800">
                <AlertCircle className="w-10 h-10 text-gray-700 mb-3" />
                <p className="text-gray-500 text-sm font-medium">{t("inventory.empty_inventory")}</p>
                <p className="text-gray-600 text-xs mt-1">{t("inventory.buy_miners_msg")}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
                {groupedInventory.map((group) => {
                  const descriptor = getMachineDescriptor({ hashRate: group.hashRate, slotSize: group.slotSize, imageUrl: group.imageUrl });
                  return (
                    <div key={group.id} className="bg-gray-800/30 border border-gray-800/50 rounded-2xl p-4 flex items-center gap-4 hover:border-gray-700 transition-all">
                      <div className="w-14 h-14 bg-gray-900/50 rounded-xl p-2 border border-gray-800/50 shrink-0 relative">
                        <img src={descriptor.image} className="w-full h-full object-contain" onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }} />
                        <div className="absolute -top-2 -right-2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-primary/20">x{group.quantity}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{group.minerName}</h4>
                        <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          <span>{t("inventory.modal.level")} {group.level}</span>
                          <span>·</span>
                          <span className="text-primary font-black">{formatHashrate(group.hashRate)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          inventory={inventory}
          onInstall={handleInstall}
          onRemove={handleRemove}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </div>
  );
}
