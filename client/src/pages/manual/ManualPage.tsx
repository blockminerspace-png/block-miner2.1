import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    BookOpen, Cpu, Zap, Wallet, Gift, Youtube, Calendar, Link as LinkIcon,
    Trophy, Gamepad2, ChevronDown, ChevronUp, Shield, Coins, LayoutGrid,
    Server, TrendingUp, ArrowDownCircle, ArrowUpCircle, Hash,
    Star, AlertCircle, Info, CheckCircle2, Lock, Layers, Bolt,
    Crosshair, ListChecks, Globe, Sparkles, Receipt,
} from 'lucide-react';

/* ── helpers ──────────────────────────────────────────────── */
interface SectionProps {
    id: string;
    icon: LucideIcon;
    color?: string;
    badge?: ReactNode;
    title: string;
    subtitle?: string;
    children: ReactNode;
}

function Section({ id, icon: Icon, color = 'text-primary', badge, title, subtitle, children }: SectionProps) {
    return (
        <section id={id} className="space-y-4">
            <div className="flex items-start gap-4">
                <div className="p-3 rounded-2xl bg-gray-900 border border-gray-800/60 shrink-0">
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

interface CardProps { children: ReactNode; className?: string; }
function Card({ children, className = '' }: CardProps) {
    return (
        <div className={`bg-gray-900/60 border border-gray-800/60 rounded-2xl p-4 sm:p-5 ${className}`}>
            {children}
        </div>
    );
}

interface InfoRowProps { label: string; value: ReactNode; valueClass?: string; }
function InfoRow({ label, value, valueClass = 'text-white' }: InfoRowProps) {
    return (
        <div className="flex items-center justify-between py-2 border-b border-gray-800/40 last:border-0">
            <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
            <span className={`text-xs font-black ${valueClass}`}>{value}</span>
        </div>
    );
}

interface PillProps { children: ReactNode; color?: string; }
function Pill({ children, color = 'bg-primary/10 text-primary border-primary/20' }: PillProps) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${color}`}>
            {children}
        </span>
    );
}

interface AccordionProps { title: string; icon?: LucideIcon; children: ReactNode; }
function Accordion({ title, icon: Icon, children }: AccordionProps) {
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

/* ── Índice lateral ───────────────────────────────────────── */
const tocItems = [
    { id: 'intro',       label: 'Visão Geral' },
    { id: 'economia',    label: 'Economia & Tokens' },
    { id: 'infra',       label: 'Infraestrutura' },
    { id: 'maquinas',    label: 'Máquinas' },
    { id: 'renda',       label: 'Fontes de Renda' },
    { id: 'torneios',    label: 'Torneios' },
    { id: 'carteira',    label: 'Carteira' },
    { id: 'ranking',     label: 'Ranking' },
];

/* ── Componente principal ─────────────────────────────────── */
export default function Manual() {
    const [activeId, setActiveId] = useState('intro');

    const scrollTo = (id: string) => {
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
                                    { icon: Cpu,      label: 'Minera tokens',    desc: 'Instale máquinas e produza POL continuamente',          color: 'text-primary' },
                                    { icon: Zap,      label: 'Múltiplas fontes', desc: 'Faucet, YouTube, check-in, jogos, torneios e mais',      color: 'text-amber-400' },
                                    { icon: Wallet,   label: 'Saque real',       desc: 'Transfira POL para sua carteira Polygon',                color: 'text-emerald-400' },
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
                    <Section id="economia" icon={Coins} color="text-amber-400" title="Economia & Tokens" subtitle="Tokens nativos, pagamentos e roadmap de moedas">
                        <div className="space-y-3">
                            <Card>
                                <p className="text-sm text-gray-400 leading-relaxed mb-5">
                                    O BlockMiner opera com dois tokens: o <strong className="text-primary">POL</strong> (Polygon) para pagamentos externos e o <strong className="text-purple-400">BLK</strong> como token interno da plataforma. Novos pares de moedas estão previstos no roadmap.
                                </p>

                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">Status dos tokens</p>
                                <div className="space-y-0 rounded-xl overflow-hidden border border-gray-800/50 mb-5">
                                    {[
                                        { coin: 'POL',  desc: 'Token de saque — Polygon',        hl: 'text-primary',    status: 'Ativo',              statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
                                        { coin: 'BLK',  desc: 'Token interno da plataforma',      hl: 'text-purple-400', status: 'Em Desenvolvimento',  statusColor: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
                                        { coin: 'BTC',  desc: 'Bitcoin',                           hl: 'text-amber-400',  status: 'Futuro',             statusColor: 'bg-gray-700/30 text-gray-500 border-gray-700/40' },
                                        { coin: 'ETH',  desc: 'Ethereum',                          hl: 'text-blue-400',   status: 'Futuro',             statusColor: 'bg-gray-700/30 text-gray-500 border-gray-700/40' },
                                        { coin: 'USDC', desc: 'USD Coin',                          hl: 'text-sky-400',    status: 'Futuro',             statusColor: 'bg-gray-700/30 text-gray-500 border-gray-700/40' },
                                        { coin: '...',  desc: 'Mais moedas em desenvolvimento',    hl: 'text-gray-600',   status: 'Em breve',           statusColor: 'bg-gray-700/20 text-gray-600 border-gray-800/40' },
                                    ].map(({ coin, desc, hl, status, statusColor }) => (
                                        <div key={coin} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/40 last:border-0 bg-gray-900/20 odd:bg-transparent">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`text-xs font-black w-10 shrink-0 ${hl}`}>{coin}</span>
                                                <span className="text-[10px] text-gray-600">{desc}</span>
                                            </div>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest shrink-0 ${statusColor}`}>{status}</span>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">Operações de saque (POL)</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                                    {[
                                        { label: 'Mínimo',        value: '10 POL',        color: 'text-primary',    bg: 'bg-primary/8 border-primary/20' },
                                        { label: 'Rede',          value: 'Polygon',        color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/20' },
                                        { label: 'Processamento', value: 'Manual',         color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20' },
                                        { label: 'Prazo',         value: 'Até 72h úteis',  color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20' },
                                    ].map(({ label, value, color, bg }) => (
                                        <div key={label} className={`flex flex-col items-center text-center p-3 rounded-xl border ${bg}`}>
                                            <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest mb-1.5">{label}</span>
                                            <span className={`text-xs font-black ${color} leading-tight`}>{value}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-2">
                                    <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex gap-2">
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-amber-500/80 leading-relaxed">
                                            <strong className="text-amber-400">Pagamentos são processados manualmente</strong> pela equipe em até 72 horas úteis. Solicite o saque e aguarde — não é necessário abrir chamado.
                                        </p>
                                    </div>
                                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-2">
                                        <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-blue-400/80 leading-relaxed">
                                            Se o prazo for excedido, abra um ticket de suporte informando o valor e a data da solicitação.
                                        </p>
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
                                        { icon: Layers,     label: 'Salas',  value: '4',  sub: 'máx por conta', color: 'text-blue-400' },
                                        { icon: LayoutGrid, label: 'Racks',  value: '24', sub: 'por sala',       color: 'text-primary' },
                                        { icon: Hash,       label: 'Slots',  value: '8',  sub: 'por rack',       color: 'text-emerald-400' },
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
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Renomear rack:</strong> Clique no nome do rack para personalizar.</span></li>
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Remover máquina:</strong> Clique na máquina instalada para removê-la e devolvê-la ao inventário.</span></li>
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Limpar rack:</strong> Remove todas as máquinas do rack de uma vez.</span></li>
                                        <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Novas salas:</strong> Aparecem bloqueadas. Pague em POL para desbloquear e expandir sua capacidade.</span></li>
                                    </ul>
                                </Accordion>
                                <Accordion title="2. Slots duplos (Double-size)" icon={LayoutGrid}>
                                    <p>Mineradoras de alta performance ocupam <strong className="text-white">2 slots consecutivos</strong>. Planeje seus racks levando isso em conta para aproveitar ao máximo os 8 slots disponíveis.</p>
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
                    <Section id="maquinas" icon={Cpu} color="text-primary" title="Máquinas" subtitle="Como funcionam os mineradores e os slots">
                        <div className="space-y-3">
                            <Card>
                                <p className="text-sm text-gray-400 leading-relaxed mb-4">
                                    Cada minerador tem <strong className="text-white">hashrate</strong> e <strong className="text-white">tamanho de slot</strong> definidos pelo administrador na loja. Quanto maior o hashrate, mais POL gerado — mas máquinas maiores podem ocupar <strong className="text-white">2 slots consecutivos</strong> no rack.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <p className="text-xs font-black text-white uppercase tracking-widest">Slot simples (1 slot)</p>
                                        </div>
                                        <p className="text-[11px] text-gray-500 leading-relaxed">Máquinas menores. Cabem 8 unidades por rack.</p>
                                        <div className="grid grid-cols-8 gap-1 mt-2">
                                            {Array.from({ length: 8 }).map((_, i) => (
                                                <div key={i} className="aspect-square rounded bg-primary/30 border border-primary/50" />
                                            ))}
                                        </div>
                                        <p className="text-[9px] text-gray-600 text-center">8 de 8 slots ocupados</p>
                                    </div>
                                    <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30 space-y-2">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                                            <p className="text-xs font-black text-white uppercase tracking-widest">Slot duplo (2 slots)</p>
                                        </div>
                                        <p className="text-[11px] text-gray-500 leading-relaxed">Máquinas maiores (alto hashrate). Cada uma ocupa 2 slots seguidos — cabem 4 por rack.</p>
                                        <div className="grid grid-cols-8 gap-1 mt-2">
                                            {Array.from({ length: 4 }).map((_, i) => (
                                                <div key={i} className="col-span-2 aspect-[2/1] rounded bg-amber-500/30 border border-amber-500/50" />
                                            ))}
                                        </div>
                                        <p className="text-[9px] text-gray-600 text-center">4 máquinas × 2 slots = 8 slots ocupados</p>
                                    </div>
                                </div>
                            </Card>
                            <div className="p-3 bg-gray-800/30 border border-gray-700/30 rounded-xl flex gap-2">
                                <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    Nome, imagem, hashrate e tamanho de slot são configurados pelo administrador por máquina. Verifique as specs na loja antes de comprar.
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
                                            <p>A cada <strong className="text-white">1 hora</strong>, visite o patrocinador e resgate um minerador grátis. Os mineradores da faucet são adicionados diretamente ao seu inventário.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Cooldown:</strong> 60 minutos entre resgates</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Prêmio:</strong> Minerador especial (hashrate definido pelo admin)</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Permanente:</strong> o equipamento fica no inventário como máquina normal (não expira)</span></li>
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
                                            <p>Cole a URL de qualquer vídeo do YouTube e ganhe hashrate enquanto assiste.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Recompensa:</strong> a cada 60 segundos de vídeo em reprodução</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Limite diário:</strong> configurável pelo administrador</span></li>
                                                <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>O player pausa ao trocar de aba — apenas visualizações ativas são contabilizadas.</span></li>
                                                <li className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" /><span><strong className="text-white">Erro 153:</strong> autor bloqueou embed. Use "Abrir no YouTube" normalmente.</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Bolt,
                                    title: '4. Auto Mining',
                                    color: 'text-blue-400',
                                    content: (
                                        <>
                                            <p>Deixe a tela de <strong className="text-white">Auto Mining aberta</strong> e as máquinas são resgatadas automaticamente a cada 5 minutos, sem nenhuma ação sua.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Clique em iniciar, mantenha a aba aberta e o timer de 5 min roda sozinho</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>A GPU disponível é resgatada e vai direto para o inventário</span></li>
                                                <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>Fechar a aba para o timer — mantenha o Auto Mining visível</span></li>
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
                                            <p>Faça check-in diário com verificação por blockchain. O sistema gera uma prova criptográfica para garantir a autenticidade.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span><strong className="text-white">Frequência:</strong> 1 vez por dia</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Prêmios progressivos por streak (dias consecutivos)</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Contribui para pontuação nos <strong className="text-white">Torneios</strong> de Check-in</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: ListChecks,
                                    title: '6. Missões Diárias',
                                    color: 'text-sky-400',
                                    content: (
                                        <>
                                            <p>Todos os dias um conjunto de <strong className="text-white">missões</strong> é gerado. Complete-as para receber recompensas (POL, BLK, mineradores ou boost de hashrate).</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>As missões reiniciam à meia-noite todos os dias</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Cada missão concluída é creditada automaticamente no inventário</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Contam para a métrica dos <strong className="text-white">Torneios de Tarefas</strong></span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Trophy,
                                    title: '7. Mini Pass (Passe de Temporada)',
                                    color: 'text-yellow-400',
                                    content: (
                                        <>
                                            <p>O <strong className="text-white">Mini Pass</strong> é um passe de temporada com recompensas progressivas. Acumule XP usando a plataforma normalmente e desbloqueie prêmios ao atingir cada nível.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>XP é ganho em diversas atividades: check-in, missões, faucet, etc.</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Recompensas de cada nível vão direto para o inventário ao desbloquear</span></li>
                                                <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>Cada temporada tem prazo. XP não transfere para a próxima temporada.</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: LinkIcon,
                                    title: '8. Shortlinks',
                                    color: 'text-purple-400',
                                    content: (
                                        <>
                                            <p>Acesse links encurtados de parceiros e ganhe recompensas. Cada shortlink possui tempo mínimo de permanência antes de liberar a recompensa.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Múltiplos shortlinks disponíveis por dia</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Prêmio: mineradores ou hashrate adicional</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: LayoutGrid,
                                    title: '9. Offerwall Interno',
                                    color: 'text-cyan-400',
                                    content: (
                                        <>
                                            <p>Ofertas criadas diretamente pela plataforma. Complete ações específicas e receba recompensas imediatas no inventário.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Ofertas com prazo e limite de completações</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Recompensas variadas: POL, BLK, máquinas ou hashrate boost</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Contam para ranking de Offerwall nos <strong className="text-white">Torneios</strong></span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Globe,
                                    title: '10. Offerwall Externo',
                                    color: 'text-teal-400',
                                    content: (
                                        <>
                                            <p>Parceiros externos oferecem tarefas (instalar apps, cadastros, pesquisas) que pagam POL ao completar. Os créditos são registrados automaticamente após verificação do anunciante.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Pagamentos creditados automaticamente (pode levar minutos)</span></li>
                                                <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>Use o mesmo dispositivo e não use VPN para evitar recusa do anunciante</span></li>
                                                <li className="flex items-start gap-2"><Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" /><span>Problemas de crédito: abra suporte com print da oferta concluída</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Sparkles,
                                    title: '11. Read & Earn',
                                    color: 'text-violet-400',
                                    content: (
                                        <>
                                            <p>Leia artigos e conteúdos na plataforma e ganhe recompensas por cada leitura completa. Quanto mais você lê, mais acumula.</p>
                                            <ul className="space-y-1.5 mt-2 text-[12px]">
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Recompensa creditada ao finalizar a leitura do artigo</span></li>
                                                <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>Limite diário de artigos por conta</span></li>
                                            </ul>
                                        </>
                                    )
                                },
                                {
                                    icon: Gamepad2,
                                    title: '12. Jogos (GamePower)',
                                    color: 'text-pink-400',
                                    content: (
                                        <>
                                            <p>A arena de mini-jogos gera <strong className="text-white">GamePower</strong> — bônus de hashrate temporário que é somado ao seu hashrate total no ranking. Quanto mais você joga, maior seu hashrate exibido publicamente.</p>
                                        </>
                                    )
                                },
                                {
                                    icon: Star,
                                    title: '13. Ofertas & Eventos Limitados',
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

                    {/* 6. Torneios */}
                    <Section id="torneios" icon={Crosshair} color="text-rose-400" title="Torneios" badge="Novo" subtitle="Competições com prêmios reais — diários, semanais e mensais">
                        <div className="space-y-4">
                            <Card>
                                <p className="text-sm text-gray-400 leading-relaxed mb-5">
                                    Os <strong className="text-white">Torneios</strong> são competições automáticas onde os jogadores disputam entre si em métricas específicas. Ao término, os melhores colocados recebem prêmios diretamente no inventário — sem precisar reivindicar.
                                </p>

                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">Tipos de torneio</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                                    {[
                                        { label: 'Diário',   sub: '24 horas',       color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/20' },
                                        { label: 'Semanal',  sub: '7 dias',         color: 'text-sky-400',     bg: 'bg-sky-500/8 border-sky-500/20' },
                                        { label: 'Mensal',   sub: '30 dias',        color: 'text-violet-400',  bg: 'bg-violet-500/8 border-violet-500/20' },
                                        { label: 'Custom',   sub: 'datas livres',   color: 'text-amber-400',   bg: 'bg-amber-500/8 border-amber-500/20' },
                                    ].map(({ label, sub, color, bg }) => (
                                        <div key={label} className={`flex flex-col items-center text-center p-3 rounded-xl border ${bg}`}>
                                            <span className={`text-sm font-black ${color}`}>{label}</span>
                                            <span className="text-[9px] text-gray-600 mt-0.5">{sub}</span>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">Métricas de pontuação</p>
                                <div className="space-y-0 rounded-xl overflow-hidden border border-gray-800/50 mb-5">
                                    {[
                                        { metric: 'Hashrate',         desc: 'Snapshot do hashrate total atual (máquinas + bônus)',        icon: Zap,         color: 'text-primary' },
                                        { metric: 'Blocos Minerados', desc: 'Total de recompensas de bloco recebidas no período',          icon: Cpu,         color: 'text-blue-400' },
                                        { metric: 'Check-ins',        desc: 'Quantidade de check-ins realizados no período',               icon: Calendar,    color: 'text-emerald-400' },
                                        { metric: 'Missões',          desc: 'Missões diárias completadas no período',                      icon: ListChecks,  color: 'text-sky-400' },
                                        { metric: 'Depósitos (POL)',  desc: 'Soma dos depósitos confirmados em POL no período',            icon: Receipt,     color: 'text-amber-400' },
                                    ].map(({ metric, desc, icon: Icon, color }) => (
                                        <div key={metric} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/40 last:border-0 bg-gray-900/20 odd:bg-transparent">
                                            <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                                            <div className="min-w-0">
                                                <p className={`text-xs font-black ${color}`}>{metric}</p>
                                                <p className="text-[10px] text-gray-600">{desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-3">Tipos de prêmio</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                                    {[
                                        { label: 'POL',           sub: 'Transferido para saldo',                  color: 'text-primary',    bg: 'bg-primary/8 border-primary/20' },
                                        { label: 'BLK',           sub: 'Token interno da plataforma',             color: 'text-purple-400', bg: 'bg-purple-500/8 border-purple-500/20' },
                                        { label: 'Mining Boost',  sub: 'Hashrate temporário por X horas',         color: 'text-amber-400',  bg: 'bg-amber-500/8 border-amber-500/20' },
                                        { label: 'Máquina',       sub: 'Minerador vai para o inventário',         color: 'text-emerald-400',bg: 'bg-emerald-500/8 border-emerald-500/20' },
                                    ].map(({ label, sub, color, bg }) => (
                                        <div key={label} className={`flex flex-col items-center text-center p-3 rounded-xl border ${bg}`}>
                                            <span className={`text-xs font-black ${color}`}>{label}</span>
                                            <span className="text-[9px] text-gray-600 mt-0.5 leading-snug">{sub}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-emerald-400/80 leading-relaxed">
                                            <strong className="text-emerald-300">Participação automática:</strong> qualquer conta que acumule pontuação durante o período é inscrita automaticamente — sem custo de entrada.
                                        </p>
                                    </div>
                                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-2">
                                        <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-blue-400/80 leading-relaxed">
                                            Pontuações são atualizadas a cada 5 minutos. O placar final é consolidado ao término do torneio e os prêmios enviados automaticamente.
                                        </p>
                                    </div>
                                    <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl flex gap-2">
                                        <Lock className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-primary/80 leading-relaxed">
                                            Prêmios são distribuídos por <strong className="text-primary">faixas de colocação</strong> (ex: 1º–3º, 4º–10º). Consulte os prêmios na página do torneio antes do término.
                                        </p>
                                    </div>
                                </div>
                            </Card>

                            <div className="space-y-2">
                                <Accordion title="Como acompanhar sua colocação" icon={Crosshair}>
                                    <p>Na seção <strong className="text-white">Torneios</strong>, cada card exibe o status (Ativo / Agendado / Encerrado), a métrica e um countdown até o término.</p>
                                    <p className="mt-2">Clique no torneio para abrir o <strong className="text-white">leaderboard com os top 100</strong>. Sua posição e pontuação atual aparecem separados caso você não esteja no top 100.</p>
                                </Accordion>
                                <Accordion title="Histórico de torneios" icon={Star}>
                                    <p>Na mesma seção, a aba <strong className="text-white">Meu Histórico</strong> lista todos os torneios em que você participou, sua colocação final e se recebeu prêmio.</p>
                                </Accordion>
                            </div>
                        </div>
                    </Section>

                    {/* 7. Carteira */}
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
                                            <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /><span>O pagamento é processado <strong className="text-white">manualmente</strong> em até <strong className="text-amber-400">72 horas úteis</strong></span></li>
                                            <li className="flex items-start gap-2"><AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" /><span>Verifique o endereço antes de confirmar — transações são irreversíveis</span></li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl flex gap-2">
                                    <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                    <p className="text-[10px] text-blue-400/80 leading-relaxed">
                                        Se o prazo de 72h úteis for excedido, abra um <strong className="text-blue-300">ticket de suporte</strong> na seção Carteira informando o valor e a data da solicitação.
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

                    {/* 8. Ranking */}
                    <Section id="ranking" icon={Trophy} color="text-amber-400" title="Ranking" subtitle="Hall da Fama e Sala Pública">
                        <Card>
                            <p className="text-sm text-gray-400 leading-relaxed mb-4">
                                O <strong className="text-white">Hall da Fama</strong> exibe os 50 operadores com maior hashrate total. O hashrate do ranking é a soma de todas as fontes ativas:
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                {[
                                    { icon: Cpu,      label: 'Máquinas',   desc: 'Hashrate total dos miners instalados',  color: 'text-primary' },
                                    { icon: Gamepad2, label: 'GamePower',  desc: 'Bônus acumulado pelos mini-jogos',       color: 'text-pink-400' },
                                    { icon: Youtube,  label: 'YouTube',    desc: 'Bônus ativo de visualizações',           color: 'text-red-400' },
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
                            <div className="mt-4 p-3 bg-gray-800/20 border border-gray-700/30 rounded-xl flex gap-2">
                                <Info className="w-3.5 h-3.5 text-gray-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-gray-500 leading-relaxed">
                                    Para competir por <strong className="text-white">prêmios de hashrate</strong> especificamente, participe dos <strong className="text-white">Torneios</strong> — eles medem o hashrate em períodos fechados com distribuição automática de recompensas.
                                </p>
                            </div>
                        </Card>
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
