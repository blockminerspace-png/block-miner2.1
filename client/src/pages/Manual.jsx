import { useState } from 'react';
import {
    BookOpen, Cpu, Zap, Wallet, Gift, Youtube, Calendar, Link as LinkIcon,
    Trophy, Gamepad2, ChevronDown, ChevronUp, Shield, Coins, LayoutGrid,
    Server, TrendingUp, ArrowDownCircle, ArrowUpCircle, Hash, Package,
    Star, AlertCircle, Info, CheckCircle2, Lock, Unlock, Layers, Bolt,
} from 'lucide-react';

/* ── helpers ──────────────────────────────────────────────── */
function Section({ id, icon: Icon, color = 'text-primary', badge, title, subtitle, children }) {
    return (
        <section id={id} className="space-y-4">
            <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl bg-gray-900 border border-gray-800/60 shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black text-white italic uppercase tracking-tight">{title}</h2>
                        {badge && (
                            <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-md text-[9px] font-black text-primary uppercase tracking-widest">{badge}</span>
                        )}
                    </div>
                    {subtitle && <p className="text-sm text-gray-500 font-medium mt-0.5">{subtitle}</p>}
                </div>
            </div>
            <div className="ml-0 sm:ml-14">{children}</div>
        </section>
    );
}

function Card({ children, className = '' }) {
    return (
        <div className={`bg-gray-900/60 border border-gray-800/60 rounded-2xl p-4 sm:p-5 ${className}`}>
            {children}
        </div>
    );
}

function InfoRow({ label, value, valueClass = 'text-white' }) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-800/40 last:border-0">
            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
            <span className={`text-xs font-black ${valueClass}`}>{value}</span>
        </div>
    );
}

function Pill({ children, color = 'bg-primary/10 text-primary border-primary/20' }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${color}`}>
            {children}
        </span>
    );
}

function Accordion({ title, icon: Icon, children }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-gray-800/50 rounded-2xl overflow-hidden">
            <button
                className="w-full flex items-center justify-between px-5 py-4 bg-gray-900/40 hover:bg-gray-900/70 transition-colors text-left"
                onClick={() => setOpen(o => !o)}
            >
                <div className="flex items-center gap-3">
                    {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
                    <span className="text-sm font-black text-white uppercase tracking-tight">{title}</span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
            </button>
            {open && (
                <div className="px-5 py-4 bg-gray-950/30 border-t border-gray-800/40 space-y-3 text-sm text-gray-400 leading-relaxed">
                    {children}
                </div>
            )}
        </div>
    );
}

function MachineCard({ name, hash, slots, price, tier, image }) {
    const tierColors = {
        basic:    'bg-gray-700/30 text-gray-400 border-gray-700/40',
        standard: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        advanced: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        pro:      'bg-primary/10 text-primary border-primary/20',
        elite:    'bg-purple-500/10 text-purple-400 border-purple-500/20',
        quantum:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return (
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gray-800/60 border border-gray-700/40 flex items-center justify-center shrink-0 overflow-hidden">
                {image
                    ? <img src={image} alt={name} className="w-10 h-10 object-contain" />
                    : <Cpu className="w-6 h-6 text-gray-600" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className="text-sm font-black text-white truncate">{name}</span>
                    <span className={`px-1.5 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest ${tierColors[tier] || tierColors.basic}`}>{tier}</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    <span className="text-[10px] text-gray-500"><span className="text-primary font-black">{hash}</span> H/s</span>
                    <span className="text-[10px] text-gray-500">{slots} slot{slots > 1 ? 's' : ''}</span>
                    {price > 0 && <span className="text-[10px] text-gray-500">{price} POL</span>}
                    {price === 0 && <span className="text-[10px] text-emerald-400 font-black">Grátis</span>}
                </div>
            </div>
        </div>
    );
}

/* ── Índice lateral ───────────────────────────────────────── */
const tocItems = [
    { id: 'intro',     label: 'Visão Geral' },
    { id: 'economia',  label: 'Economia & POL' },
    { id: 'infra',     label: 'Infraestrutura' },
    { id: 'maquinas',  label: 'Máquinas' },
    { id: 'renda',     label: 'Fontes de Renda' },
    { id: 'carteira',  label: 'Carteira' },
    { id: 'ranking',   label: 'Ranking' },
    { id: 'catalogo',  label: 'Catálogo' },
];

/* ── Componente principal ─────────────────────────────────── */
export default function Manual() {
    const [activeId, setActiveId] = useState('intro');

    const scrollTo = (id) => {
        setActiveId(id);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className="pb-24 animate-in fade-in duration-500">

            {/* ── Capa ──────────────────────────────────────────── */}
            <div className="relative rounded-2xl sm:rounded-[2.5rem] overflow-hidden border border-gray-800/60 bg-gray-900/40 mb-8">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute -top-12 left-1/4 w-72 h-72 bg-primary/6 rounded-full blur-[100px]" />
                    <div className="absolute -bottom-8 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-[80px]" />
                </div>
                <div className="relative z-10 p-6 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl shrink-0">
                        <BookOpen className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h1 className="text-2xl sm:text-3xl font-black text-white italic uppercase tracking-tight">Manual do Operador</h1>
                            <Pill>v2.1</Pill>
                        </div>
                        <p className="text-gray-500 font-medium max-w-xl text-sm">
                            Guia de referência técnica, econômica e operacional do protocolo BlockMiner. Tudo que você precisa para maximizar sua operação de mineração.
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex gap-6 items-start">

                {/* ── TOC desktop ───────────────────────────────── */}
                <aside className="hidden lg:flex flex-col gap-1 w-44 shrink-0 sticky top-4">
                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest px-3 mb-1">Seções</p>
                    {tocItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => scrollTo(item.id)}
                            className={`text-left px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all ${
                                activeId === item.id
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/30'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </aside>

                {/* ── Conteúdo ──────────────────────────────────── */}
                <div className="flex-1 min-w-0 space-y-10">

                    {/* 1. Visão Geral */}
                    <Section id="intro" icon={Info} title="Visão Geral" badge="Início" subtitle="O que é o BlockMiner e como funciona">
                        <Card>
                            <p className="text-sm text-gray-400 leading-relaxed mb-4">
                                <strong className="text-white">BlockMiner</strong> é uma plataforma Play-to-Earn onde você monta e gerencia fazendas de mineração virtuais para ganhar <strong className="text-primary">tokens POL</strong> reais na rede Polygon. Instale mineradores em racks, acumule hashrate e converta sua produção em criptomoeda sacável.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {[
                                    { icon: Cpu, label: 'Minera tokens', desc: 'Instale máquinas e produza POL continuamente', color: 'text-primary' },
                                    { icon: Zap, label: 'Múltiplas fontes', desc: 'Faucet, YouTube, check-in, jogos e mais', color: 'text-amber-400' },
                                    { icon: Wallet, label: 'Saque real', desc: 'Transfira POL para sua carteira Polygon', color: 'text-emerald-400' },
                                ].map(({ icon: Icon, label, desc, color }) => (
                                    <div key={label} className="flex items-start gap-3 p-3 bg-gray-800/30 rounded-xl border border-gray-700/30">
                                        <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                                        <div>
                                            <p className="text-xs font-black text-white">{label}</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </Section>

                    {/* 2. Economia */}
                    <Section id="economia" icon={Coins} color="text-amber-400" title="Economia & POL" subtitle="Token nativo, Polygon e saldos multi-moeda">
                        <div className="space-y-3">
                            <Card>
                                <p className="text-sm text-gray-400 leading-relaxed mb-4">
                                    O token nativo da plataforma é o <strong className="text-primary">POL</strong>, operando na rede <strong className="text-white">Polygon</strong>. Todo hashrate gerado pelos seus mineradores é convertido continuamente em saldo POL, que pode ser sacado para qualquer carteira compatível.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-2">Saldos disponíveis</p>
                                        {[
                                            { coin: 'POL', desc: 'Token principal da plataforma', status: 'Ativo', hl: 'text-primary' },
                                            { coin: 'BTC', desc: 'Bitcoin', status: 'Ativo', hl: 'text-amber-400' },
                                            { coin: 'ETH', desc: 'Ethereum', status: 'Ativo', hl: 'text-blue-400' },
                                            { coin: 'USDT', desc: 'Tether USD', status: 'Ativo', hl: 'text-emerald-400' },
                                            { coin: 'USDC', desc: 'USD Coin', status: 'Ativo', hl: 'text-sky-400' },
                                            { coin: 'ZER', desc: 'Token interno', status: 'Ativo', hl: 'text-purple-400' },
                                        ].map(({ coin, desc, status, hl }) => (
                                            <div key={coin} className="flex items-center justify-between py-2 border-b border-gray-800/40 last:border-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs font-black ${hl}`}>{coin}</span>
                                                    <span className="text-[10px] text-gray-600">{desc}</span>
                                                </div>
                                                <Pill color="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">{status}</Pill>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-3">
                                        <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Limites de operação</p>
                                        <InfoRow label="Saque mínimo" value="10 POL" valueClass="text-primary" />
                                        <InfoRow label="Confirmação" value="~5 min (cron)" valueClass="text-gray-300" />
                                        <InfoRow label="Rede" value="Polygon" valueClass="text-purple-400" />
                                        <InfoRow label="Depósito on-chain" value="Endereço único por usuário" valueClass="text-gray-300" />
                                        <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex gap-2">
                                            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                            <p className="text-[10px] text-amber-500/80 leading-relaxed">
                                                Depósitos são processados a cada 5 minutos automaticamente. Guarde sempre o hash da transação para suporte.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </Section>

                    {/* 3. Infraestrutura */}
                    <Section id="infra" icon={Server} color="text-blue-400" title="Infraestrutura" subtitle="Salas, Racks e Slots — como organizar sua fazenda">
                        <div className="space-y-4">
                            <Card>
                                <p className="text-sm text-gray-400 leading-relaxed mb-4">
                                    Sua fazenda é organizada em <strong className="text-white">Salas → Racks → Slots</strong>. Cada sala contém 24 racks, cada rack possui 8 slots para instalar mineradores. Novas salas são desbloqueadas progressivamente com POL.
                                </p>
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                    {[
                                        { icon: Layers, label: 'Salas', value: '4', sub: 'máx por conta', color: 'text-blue-400' },
                                        { icon: LayoutGrid, label: 'Racks', value: '24', sub: 'por sala', color: 'text-primary' },
                                        { icon: Hash, label: 'Slots', value: '8', sub: 'por rack', color: 'text-emerald-400' },
                                    ].map(({ icon: Icon, label, value, sub, color }) => (
                                        <div key={label} className="flex flex-col items-center text-center p-3 bg-gray-800/30 rounded-xl border border-gray-700/30">
                                            <Icon className={`w-5 h-5 ${color} mb-2`} />
                                            <span className={`text-2xl font-black ${color}`}>{value}</span>
                                            <span className="text-[9px] font-black text-white uppercase tracking-wide mt-0.5">{label}</span>
                                            <span className="text-[8px] text-gray-600">{sub}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                                    <p className="text-[10px] text-primary/80 font-bold">
                                        <strong className="text-primary">Capacidade máxima:</strong> 4 salas × 24 racks × 8 slots = <strong className="text-white">768 slots totais</strong> após desbloquear todas as salas.
                                    </p>
                                </div>
                            </Card>

                            <div className="space-y-2">
                                <Accordion title="1. Sala de Mineração (Inventory)" icon={Cpu}>
                                    <p>É o coração da sua operação. Aqui você visualiza e gerencia todos os seus racks.</p>
                                    <ul className="space-y-1.5 mt-2 text-[12px]">
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Instalar minerador:</strong> Clique em um slot vazio de um rack para abrir o inventário e escolher uma máquina.</span></li>
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Renomear rack:</strong> Clique no nome do rack para personalizar (ex: "ASIC Farm 1").</span></li>
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Remover máquina:</strong> Clique na máquina instalada para removê-la e devolvê-la ao inventário.</span></li>
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Limpar rack:</strong> Remove todas as máquinas do rack de uma vez.</span></li>
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Novas salas:</strong> Aparecem bloqueadas. Pague em POL para desbloquear e expandir sua capacidade.</span></li>
                                    </ul>
                                </Accordion>
                                <Accordion title="2. Slots duplos (Double-size)" icon={LayoutGrid}>
                                    <p>Mineradoras de alta performance (hashrate ≥ 100 H/s) ocupam <strong className="text-white">2 slots consecutivos</strong>. Planeje seus racks levando isso em conta para aproveitar ao máximo os 8 slots disponíveis.</p>
                                    <div className="flex gap-2 mt-3 flex-wrap">
                                        <Pill color="bg-blue-500/10 text-blue-400 border-blue-500/20">≥ 1000 H/s = 2 slots (Quantum)</Pill>
                                        <Pill color="bg-purple-500/10 text-purple-400 border-purple-500/20">≥ 500 H/s = 2 slots (Elite)</Pill>
                                        <Pill color="bg-primary/10 text-primary border-primary/20">≥ 100 H/s = 2 slots (Pro)</Pill>
                                        <Pill>{"< 100 H/s = 1 slot"}</Pill>
                                    </div>
                                </Accordion>
                                <Accordion title="3. Sala Pública & Ranking" icon={Trophy}>
                                    <p>Cada operador possui uma <strong className="text-white">Sala Pública</strong> acessível pelo ranking. Visitantes podem ver todos os racks e máquinas instaladas, mas sem permissão de edição.</p>
                                    <p className="mt-2">No ranking, o hashrate total inclui: <strong className="text-white">máquinas instaladas + GamePower (jogos) + Bônus YouTube</strong>.</p>
                                </Accordion>
                            </div>
                        </div>
                    </Section>

                    {/* 4. Máquinas */}
                    <Section id="maquinas" icon={Cpu} color="text-primary" title="Máquinas" subtitle="Categorias, tiers e como interpretar as specs">
                        <div className="space-y-4">
                            <Card>
                                <p className="text-sm text-gray-400 leading-relaxed">
                                    Os mineradores são classificados por tier conforme o hashrate. Quanto maior o tier, mais POL por segundo, mas também mais slots ocupados.
                                </p>
                            </Card>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-gray-800/60">
                                            <th className="text-left py-2.5 px-3 text-[9px] font-black text-gray-600 uppercase tracking-widest">Tier</th>
                                            <th className="text-left py-2.5 px-3 text-[9px] font-black text-gray-600 uppercase tracking-widest">Hashrate</th>
                                            <th className="text-left py-2.5 px-3 text-[9px] font-black text-gray-600 uppercase tracking-widest">Slots</th>
                                            <th className="text-left py-2.5 px-3 text-[9px] font-black text-gray-600 uppercase tracking-widest">Imagem</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/30">
                                        {[
                                            { tier: 'Quantum', range: '≥ 1.000 H/s', slots: '2', img: '/machines/reward3.png', pill: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                                            { tier: 'Elite',   range: '500 – 999 H/s', slots: '2', img: '/machines/reward2.png', pill: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
                                            { tier: 'Pro',     range: '100 – 499 H/s', slots: '2', img: '/machines/reward1.png', pill: 'text-primary bg-primary/10 border-primary/20' },
                                            { tier: 'Advanced',range: '50 – 99 H/s', slots: '1', img: '/machines/3.png', pill: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                                            { tier: 'Standard',range: '10 – 49 H/s', slots: '1', img: '/machines/2.png', pill: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
                                            { tier: 'Basic',   range: '0 – 9 H/s', slots: '1', img: '/machines/1.png', pill: 'text-gray-400 bg-gray-700/30 border-gray-700/40' },
                                        ].map(({ tier, range, slots, img, pill }) => (
                                            <tr key={tier} className="hover:bg-gray-800/20 transition-colors">
                                                <td className="py-3 px-3">
                                                    <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase ${pill}`}>{tier}</span>
                                                </td>
                                                <td className="py-3 px-3 text-gray-400 font-bold">{range}</td>
                                                <td className="py-3 px-3 text-gray-400 font-bold">{slots}</td>
                                                <td className="py-3 px-3">
                                                    <img src={img} alt={tier} className="w-8 h-8 object-contain" onError={e => { e.target.style.display = 'none'; }} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-3 bg-gray-800/30 border border-gray-700/30 rounded-xl flex gap-2">
                                <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    O nome e imagem exibidos na sua sala são definidos pelo administrador ao criar o minerador na loja. O tier é calculado automaticamente com base no hashrate configurado.
                                </p>
                            </div>
                        </div>
                    </Section>

                    {/* 5. Fontes de Renda */}
                    <Section id="renda" icon={TrendingUp} color="text-emerald-400" title="Fontes de Renda" subtitle="Todos os canais para aumentar seu hashrate e saldo">
                        <div className="space-y-3">
                            {[
                                {
                                    icon: Cpu,
                                    title: '1. Mineração Passiva',
                                    color: 'text-primary',
                                    content: (
                                        <>
                                            <p>A fonte principal. Mineradores instalados nos racks produzem POL <strong className="text-white">continuamente</strong>, 24/7. Cada H/s de hashrate é convertido em tokens conforme a taxa definida pelo administrador.</p>
                                            <div className="mt-3 grid grid-cols-2 gap-2">
                                                <div className="p-2 bg-gray-800/40 rounded-lg text-center">
                                                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Processamento</p>
                                                    <p className="text-xs font-black text-white mt-0.5">Automático</p>
                                                </div>
                                                <div className="p-2 bg-gray-800/40 rounded-lg text-center">
                                                    <p className="text-[9px] text-gray-600 uppercase tracking-widest">Frequência</p>
                                                    <p className="text-xs font-black text-white mt-0.5">Contínuo</p>
                                                </div>
                                            </div>
                                        </>
                                    )
                                },
                                {
                                    icon: Gift,
                                    title: '2. Faucet Gratuita',
                                    color: 'text-amber-400',
                                    content: (
                                        <>
                                            <p>A cada <strong className="text-white">1 hora</strong>, visite o patrocinador e resgate um minerador grátis. Os mineradores da faucet são adicionados diretamente ao seu inventário e podem ser instalados nos racks.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Cooldown:</strong> 60 minutos entre resgates</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Prêmio:</strong> Minerador especial (hashrate definido pelo admin)</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Visite o link do parceiro e aguarde o tempo mínimo antes de resgatar</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Youtube,
                                    title: '3. Recompensas YouTube',
                                    color: 'text-red-400',
                                    content: (
                                        <>
                                            <p>Cole a URL de qualquer vídeo do YouTube e ganhe hashrate enquanto assiste. O sistema usa <strong className="text-white">Protocolo de Prova de Visualização</strong> para detectar visualizações reais.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Recompensa:</strong> A cada 60 segundos de vídeo em reprodução</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Limite diário:</strong> Configurável pelo administrador</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Erro 153:</strong> O autor bloqueou embed. Use "Abrir no YouTube" e ganhe normalmente pelo link direto.</span></li>
                                                <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>O player pausa automaticamente quando você troca de aba — apenas visualizações ativas são contabilizadas.</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Bolt,
                                    title: '4. Auto Mining (GPU Automática)',
                                    color: 'text-blue-400',
                                    content: (
                                        <>
                                            <p>GPUs especiais geram hashrate adicional de forma automática, sem precisar instalar em rack. As recompensas são creditadas periodicamente conforme a GPU ativa.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>GPUs Auto Mining não ocupam slots de rack</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Podem ser obtidas via eventos, ofertas e recompensas especiais</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Calendar,
                                    title: '5. Check-in Diário',
                                    color: 'text-emerald-400',
                                    content: (
                                        <>
                                            <p>Faça check-in diário com verificação por blockchain. O sistema gera uma prova criptográfica para garantir a autenticidade do check-in.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Frequência:</strong> 1 vez por dia</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Prêmios progressivos por streak (dias consecutivos)</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: LinkIcon,
                                    title: '6. Shortlinks',
                                    color: 'text-purple-400',
                                    content: (
                                        <>
                                            <p>Acesse links encurtados de parceiros e ganhe recompensas. Cada shortlink possui um tempo mínimo de permanência na página antes de liberar a recompensa.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Múltiplos shortlinks disponíveis por dia</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Prêmio: mineradores ou hashrate adicional</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Gamepad2,
                                    title: '7. Jogos (GamePower)',
                                    color: 'text-pink-400',
                                    content: (
                                        <>
                                            <p>A arena de mini-jogos gera <strong className="text-white">GamePower</strong> — bônus de hashrate temporário que é somado ao seu hashrate total no ranking. Quanto mais você joga, maior seu hashrate exibido publicamente.</p>
                                        </>
                                    )
                                },
                                {
                                    icon: Star,
                                    title: '8. Ofertas & Eventos Limitados',
                                    color: 'text-amber-400',
                                    content: (
                                        <>
                                            <p>Eventos especiais oferecem mineradores exclusivos por tempo limitado. Fique atento à seção <strong className="text-white">Ofertas</strong> para não perder oportunidades únicas de expandir sua fazenda com equipamentos raros.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>As ofertas expiram em datas definidas — sem recorrência garantida</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Podem incluir mineradores com hashrate acima do disponível na loja regular</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                            ].map(({ icon: Icon, title, color, content }) => (
                                <div key={title} className="bg-gray-900/60 border border-gray-800/60 rounded-2xl overflow-hidden">
                                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-800/40 bg-gray-900/40">
                                        <Icon className={`w-4 h-4 ${color} shrink-0`} />
                                        <span className="text-sm font-black text-white uppercase tracking-tight">{title}</span>
                                    </div>
                                    <div className="px-5 py-4 text-sm text-gray-400 leading-relaxed">
                                        {content}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>

                    {/* 6. Carteira */}
                    <Section id="carteira" icon={Wallet} color="text-emerald-400" title="Carteira" subtitle="Depósitos, saques e como conectar sua carteira Web3">
                        <div className="space-y-3">
                            <Card>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <ArrowDownCircle className="w-4 h-4 text-emerald-400" />
                                            <p className="text-xs font-black text-white uppercase tracking-widest">Depositar</p>
                                        </div>
                                        <ul className="space-y-1.5 text-[12px] text-gray-400">
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Acesse <strong className="text-white">Carteira → Depositar</strong></span></li>
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Copie ou escaneie o endereço exclusivo da plataforma</span></li>
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Envie POL pela rede <strong className="text-white">Polygon</strong> para esse endereço</span></li>
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Cole o hash da transação e aguarde até 5 min para confirmação</span></li>
                                            <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>Não envie por outra rede — os fundos serão perdidos</span></li>
                                        </ul>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-3">
                                            <ArrowUpCircle className="w-4 h-4 text-primary" />
                                            <p className="text-xs font-black text-white uppercase tracking-widest">Sacar</p>
                                        </div>
                                        <ul className="space-y-1.5 text-[12px] text-gray-400">
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Conecte sua carteira Web3 (MetaMask, etc.) na rede Polygon</span></li>
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Informe o endereço de destino e o valor (mín. 10 POL)</span></li>
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>O pagamento é processado automaticamente em até 5 min</span></li>
                                            <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>Verifique o endereço antes de confirmar — transações são irreversíveis</span></li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-2">
                                    <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-blue-400/80 leading-relaxed">
                                        Se seu depósito não aparecer após 10 minutos, abra um <strong className="text-blue-300">ticket de suporte</strong> na seção Carteira informando o hash da transação. Nossa equipe verifica manualmente.
                                    </p>
                                </div>
                            </Card>

                            <Accordion title="Conectar carteira Web3" icon={Wallet}>
                                <ol className="space-y-2 text-[12px] list-none">
                                    {[
                                        'Instale MetaMask ou outra carteira EVM-compatível no seu navegador',
                                        'Na carteira, adicione a rede Polygon (Chain ID: 137)',
                                        'Na plataforma, acesse Carteira e clique em "Conectar Carteira"',
                                        'Aprove a conexão na janela da sua carteira',
                                        'Se necessário, clique em "Trocar para Polygon" para mudar a rede automaticamente',
                                    ].map((step, i) => (
                                        <li key={i} className="flex items-start gap-3">
                                            <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/30 text-primary text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                            <span>{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </Accordion>
                        </div>
                    </Section>

                    {/* 7. Ranking */}
                    <Section id="ranking" icon={Trophy} color="text-amber-400" title="Ranking" subtitle="Hall da Fama e Sala Pública">
                        <Card>
                            <p className="text-sm text-gray-400 leading-relaxed mb-4">
                                O <strong className="text-white">Hall da Fama</strong> exibe os 50 operadores com maior hashrate total. O hashrate do ranking é a soma de todas as fontes ativas:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                {[
                                    { icon: Cpu, label: 'Máquinas', desc: 'Hashrate total dos miners instalados', color: 'text-primary' },
                                    { icon: Gamepad2, label: 'GamePower', desc: 'Bônus acumulado pelos mini-jogos', color: 'text-pink-400' },
                                    { icon: Youtube, label: 'YouTube', desc: 'Bônus ativo de visualizações', color: 'text-red-400' },
                                ].map(({ icon: Icon, label, desc, color }) => (
                                    <div key={label} className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/30 text-center">
                                        <Icon className={`w-5 h-5 ${color} mx-auto mb-2`} />
                                        <p className="text-xs font-black text-white">{label}</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
                                    </div>
                                ))}
                            </div>
                            <InfoRow label="Top 3" value="Destaque visual com medalhas" />
                            <InfoRow label="Sala Pública" value="Clique em qualquer usuário para ver seus racks" />
                            <InfoRow label="Salas bloqueadas" value="Exibidas com cadeado na sala pública" />
                        </Card>
                    </Section>

                    {/* 8. Catálogo */}
                    <Section id="catalogo" icon={Package} color="text-purple-400" title="Catálogo de Hardware" subtitle="Máquinas disponíveis na loja">
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <MachineCard name="AntMiner S19" hash={95}   slots={2} price={150}  tier="advanced" image="/machines/3.png" />
                                <MachineCard name="Bitmain T17"  hash={40}   slots={1} price={45}   tier="standard" image="/machines/2.png" />
                                <MachineCard name="MicroBT M30S" hash={88}   slots={2} price={120}  tier="advanced" image="/machines/1.png" />
                                <MachineCard name="Basic USB Miner" hash={2} slots={1} price={5}    tier="basic"    image="/machines/reward3.png" />
                                <MachineCard name="Pulse Mini v1 (Faucet)" hash={1} slots={1} price={0} tier="basic" image="/machines/reward2.png" />
                            </div>
                            <div className="p-3 bg-gray-800/30 border border-gray-700/30 rounded-xl flex gap-2">
                                <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    O catálogo é gerenciado pelo administrador e pode ser atualizado a qualquer momento. Novos modelos podem ser adicionados via painel admin. Eventos especiais podem disponibilizar máquinas exclusivas temporariamente.
                                </p>
                            </div>
                        </div>
                    </Section>

                    {/* Rodapé */}
                    <div className="flex items-center justify-center gap-2 py-3 px-5 bg-gray-900/30 border border-gray-800/30 rounded-2xl max-w-sm mx-auto">
                        <Shield className="w-3 h-3 text-gray-700 shrink-0" />
                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest text-center">
                            BlockMiner v2.1 — Protocolo de Mineração Descentralizada
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
