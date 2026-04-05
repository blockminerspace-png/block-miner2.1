import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cpu, Zap, ArrowLeft, Shield, Trophy, Gamepad2 } from 'lucide-react';
import { api } from '../store/auth';
import {
    getGlobalSlotIndex,
    getMachineBySlot,
    getMachineDescriptor,
    formatHashrate,
    RACKS_COUNT,
    SLOTS_PER_RACK,
    DEFAULT_MINER_IMAGE_URL
} from '../utils/machine';

export default function PublicRoom() {
    const { t } = useTranslation();
    const { username } = useParams();
    const navigate = useNavigate();
    const [targetUser, setTargetUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchRoomData = async () => {
            try {
                setIsLoading(true);
                const res = await api.get(`/ranking/room/${username}`);
                if (res.data.ok) {
                    setTargetUser(res.data.user);
                } else {
                    navigate('/ranking');
                }
            } catch (err) {
                console.error("Error fetching room data", err);
                navigate('/ranking');
            } finally {
                setIsLoading(false);
            }
        };
        fetchRoomData();
    }, [username, navigate]);

    const machines = targetUser?.miners || [];
    const racks = targetUser?.racks || {};

    const activeMachinesHashRate = useMemo(() => {
        return machines.reduce((sum, machine) => sum + Number(machine.hashRate || machine.hash_rate || 0), 0);
    }, [machines]);

    const gamePower = targetUser?.gamePower || 0;
    const totalHashRate = activeMachinesHashRate + gamePower;
    const installedCount = machines.filter(m => !m.isSecondSlot).length;

    if (isLoading) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="relative w-14 h-14">
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full" />
                    <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <p className="text-gray-600 font-black uppercase tracking-[0.3em] text-[10px]">Sincronizando Hardware...</p>
            </div>
        );
    }

    if (!targetUser) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <p className="text-red-500 font-bold">Erro ao carregar os dados da sala.</p>
                <button onClick={() => navigate('/ranking')} className="px-6 py-2 bg-primary text-white rounded-xl">Voltar ao Ranking</button>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-700">

            {/* ── Header ──────────────────────────────────────────── */}
            <div className="relative rounded-[2.5rem] overflow-hidden border border-slate-800/80 shadow-2xl bg-slate-900/50">
                {/* ambient glows */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -top-20 left-1/3 w-96 h-96 bg-primary/6 rounded-full blur-[120px]" />
                    <div className="absolute -bottom-10 right-0 w-64 h-64 bg-blue-500/4 rounded-full blur-[100px]" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 p-8">
                    {/* identity */}
                    <div className="flex items-center gap-5">
                        <div className="relative shrink-0">
                            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/25 via-slate-800 to-slate-900 flex items-center justify-center text-4xl font-black text-white shadow-2xl border border-primary/20 ring-1 ring-primary/10">
                                {targetUser.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-slate-900 shadow-lg shadow-emerald-500/30" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                <h1 className="text-3xl font-black text-white tracking-tight italic uppercase leading-none">
                                    {targetUser.username}
                                </h1>
                                <span className="px-2.5 py-1 bg-primary/10 rounded-lg border border-primary/20 flex items-center gap-1.5 shrink-0">
                                    <Shield className="w-3 h-3 text-primary" />
                                    <span className="text-[9px] font-black text-primary uppercase tracking-wider">Visitação</span>
                                </span>
                            </div>
                            <p className="text-gray-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                                <Trophy className="w-3 h-3" />
                                Rede de mineração global
                            </p>
                        </div>
                    </div>

                    {/* stats + back */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <div className="px-4 py-3.5 bg-black/40 rounded-2xl border border-gray-800/80 flex flex-col items-center min-w-[100px]">
                                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Hashrate</span>
                                <div className="flex items-center gap-1.5 text-white font-black text-base italic">
                                    <Zap className="w-3.5 h-3.5 text-primary" />
                                    {formatHashrate(totalHashRate)}
                                </div>
                            </div>
                            <div className="px-4 py-3.5 bg-black/40 rounded-2xl border border-gray-800/80 flex flex-col items-center min-w-[100px]">
                                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Jogos</span>
                                <div className="flex items-center gap-1.5 text-primary font-black text-base italic">
                                    <Gamepad2 className="w-3.5 h-3.5" />
                                    {formatHashrate(gamePower)}
                                </div>
                            </div>
                            <div className="px-4 py-3.5 bg-black/40 rounded-2xl border border-gray-800/80 flex flex-col items-center min-w-[100px]">
                                <span className="text-[9px] text-gray-600 font-black uppercase tracking-widest mb-1">Máquinas</span>
                                <div className="flex items-center gap-1.5 text-white font-black text-base italic">
                                    <Cpu className="w-3.5 h-3.5 text-primary" />
                                    {installedCount}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate('/ranking')}
                            className="flex items-center gap-2 px-5 py-3 bg-gray-800/70 hover:bg-gray-700/80 text-gray-300 hover:text-white rounded-2xl transition-all border border-gray-700/50 group font-bold text-xs uppercase tracking-widest"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                            Voltar
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Racks grid ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: RACKS_COUNT }).map((_, i) => {
                    const rackIndex = i + 1;
                    const rackName = racks[rackIndex] || `Rack ${rackIndex}`;

                    const rackMachines = Array.from({ length: SLOTS_PER_RACK }, (_, localI) => {
                        const g = getGlobalSlotIndex(rackIndex, localI);
                        return getMachineBySlot(g, machines);
                    }).filter(m => m && !m.isSecondSlot);

                    const rackOccupied = rackMachines.length;
                    const rackHashRate = rackMachines.reduce((s, m) => s + Number(m?.hashRate || m?.hash_rate || 0), 0);
                    const fillPct = Math.round((rackOccupied / SLOTS_PER_RACK) * 100);
                    const isEmpty = rackOccupied === 0;

                    return (
                        <div
                            key={rackIndex}
                            className={`bg-surface border rounded-[1.75rem] overflow-hidden shadow-lg transition-colors ${
                                isEmpty ? 'border-gray-800/30 opacity-50' : 'border-gray-800/60 hover:border-gray-700/60'
                            }`}
                        >
                            {/* rack header */}
                            <div className="px-5 py-3.5 bg-gray-900/50 border-b border-gray-800/40 flex items-center justify-between relative overflow-hidden">
                                <div className={`absolute left-0 top-0 w-0.5 h-full transition-colors ${isEmpty ? 'bg-gray-700/30' : 'bg-primary/60'}`} />
                                <div className="flex items-center gap-2.5">
                                    <div className={`w-1.5 h-1.5 rounded-full ${rackOccupied > 0 ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse' : 'bg-gray-700'}`} />
                                    <h3 className="text-xs font-black text-white italic uppercase tracking-tight">{rackName}</h3>
                                </div>
                                <div className="flex items-center gap-3">
                                    {rackHashRate > 0 && (
                                        <span className="text-[9px] font-black text-primary italic">{formatHashrate(rackHashRate)}</span>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <div className="w-14 h-1 rounded-full bg-gray-800 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all duration-700"
                                                style={{ width: `${fillPct}%` }}
                                            />
                                        </div>
                                        <span className="text-[9px] font-black text-gray-600 tabular-nums">{rackOccupied}/{SLOTS_PER_RACK}</span>
                                    </div>
                                </div>
                            </div>

                            {/* slots */}
                            <div className="p-4 grid grid-cols-4 gap-2">
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
                                            className={`
                                                relative aspect-square rounded-xl border transition-all duration-300 flex items-center justify-center overflow-hidden
                                                ${isDouble ? 'col-span-2' : ''}
                                                ${isOccupied
                                                    ? 'bg-gradient-to-b from-gray-800/50 to-gray-900/60 border-gray-700/50 hover:border-primary/30 hover:shadow-sm hover:shadow-primary/10 cursor-default'
                                                    : 'bg-gray-950/20 border-dashed border-gray-800/30 opacity-30'}
                                            `}
                                        >
                                            {isOccupied ? (
                                                <div className="relative w-full h-full p-1.5 flex items-center justify-center">
                                                    <img
                                                        src={descriptor.image}
                                                        alt={descriptor.name}
                                                        className="w-4/5 h-4/5 object-contain z-10 drop-shadow-sm"
                                                        onError={(e) => { e.target.src = DEFAULT_MINER_IMAGE_URL; }}
                                                    />
                                                    <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/92 opacity-0 hover:opacity-100 transition-opacity z-20 rounded-xl gap-0.5 p-2 text-center">
                                                        <span className="text-[7px] font-black text-primary uppercase tracking-wide leading-tight">{descriptor.name}</span>
                                                        <span className="text-[10px] font-black text-white italic">{formatHashrate(machine.hashRate || machine.hash_rate || 0)}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-1 h-1 rounded-full bg-gray-800" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Visitor notice ──────────────────────────────────── */}
            <div className="flex items-center justify-center gap-2.5 py-3 px-6 bg-slate-900/30 border border-slate-800/40 rounded-2xl max-w-lg mx-auto">
                <Shield className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                    Modo visitação — configurações bloqueadas para este minerador
                </p>
            </div>
        </div>
    );
}
