import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Rocket,
  Cpu,
  ShoppingCart,
  Wallet,
  Gift,
  Gamepad2,
  Trophy,
  User,
  Zap,
  Swords,
  Gem,
  TrendingUp,
  Store,
  Gavel,
  Users,
  Link,
  BarChart3,
  Layers,
  Smartphone,
  Star,
  ShieldCheck,
  Youtube,
  Calendar,
  MessageSquare,
  Tag,
  Ticket,
  Bell,
  Flag,
  Flame,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Dados
// ─────────────────────────────────────────────

const S = { LAUNCHED: 'launched', PLANNED: 'planned' };

const MILESTONES = [
  {
    phase: 'Fase 1',
    title: 'Fundação',
    subtitle: 'Core da plataforma',
    status: S.LAUNCHED,
    items: [
      { icon: BarChart3,    label: 'Dashboard em Tempo Real',           status: S.LAUNCHED },
      { icon: Cpu,          label: 'Inventory de Racks & Salas',        status: S.LAUNCHED },
      { icon: ShoppingCart, label: 'Loja de Miners',                    status: S.LAUNCHED },
      { icon: Wallet,       label: 'Depósito On-chain Assíncrono',      status: S.LAUNCHED },
      { icon: TrendingUp,   label: 'Saque de POL',                      status: S.LAUNCHED },
      { icon: ShieldCheck,  label: 'Autenticação 2FA',                  status: S.PLANNED },
      { icon: Bell,         label: 'Notificações em Tempo Real',        status: S.LAUNCHED },
      { icon: Users,        label: 'Sistema de Referral',               status: S.LAUNCHED },
    ],
  },
  {
    phase: 'Fase 2',
    title: 'Earn & Engage',
    subtitle: 'Formas de ganhar',
    status: S.LAUNCHED,
    items: [
      { icon: Calendar,     label: 'Check-in Diário On-chain',          status: S.LAUNCHED },
      { icon: Gift,         label: 'Faucet Diário',                     status: S.LAUNCHED },
      { icon: Link,         label: 'Shortlinks Multi-step',             status: S.LAUNCHED },
      { icon: Zap,          label: 'PTC (Paid-to-Click)',               status: S.PLANNED },
      { icon: Gift,         label: 'Offerwall (Offerwall.me)',          status: S.PLANNED },
      { icon: Youtube,      label: 'YouTube Watch & Earn',              status: S.LAUNCHED },
      { icon: Zap,          label: 'Auto-Mining GPU',                   status: S.LAUNCHED },
      { icon: Tag,          label: 'Eventos & Ofertas Limitadas',       status: S.LAUNCHED },
    ],
  },
  {
    phase: 'Fase 3',
    title: 'Games & Social',
    subtitle: 'Diversão e comunidade',
    status: S.LAUNCHED,
    items: [
      { icon: Gamepad2,     label: 'Memory Game (Crypto Cards)',        status: S.LAUNCHED },
      { icon: Gamepad2,     label: 'Match-3 (Crypto Gems)',             status: S.LAUNCHED },
      { icon: Trophy,       label: 'Ranking Global',                    status: S.LAUNCHED },
      { icon: MessageSquare,label: 'Chat Global & DMs',                 status: S.LAUNCHED },
      { icon: Users,        label: 'Sala Pública do Minerador',         status: S.LAUNCHED },
      { icon: Ticket,       label: 'Tickets de Suporte',                status: S.LAUNCHED },
      { icon: TrendingUp,   label: 'Swap POL ↔ USDC',                  status: S.PLANNED },
    ],
  },
  {
    phase: 'Fase 4',
    title: 'Expansão',
    subtitle: 'Novos conteúdos',
    status: S.PLANNED,
    items: [
      { icon: Gamepad2,     label: 'Breakout & 2048 Crypto',           status: S.PLANNED },
      { icon: Star,         label: 'Missões Diárias / Quests',         status: S.PLANNED },
      { icon: Rocket,       label: 'Battle Pass / Passe de Temporada', status: S.PLANNED },
      { icon: Gem,          label: 'Boosters Temporários na Loja',     status: S.PLANNED },
      { icon: Link,         label: 'Mais Parceiros Offerwall',         status: S.PLANNED },
      { icon: User,         label: 'Perfil Público Personalizável',    status: S.PLANNED },
    ],
  },
  {
    phase: 'Fase 5',
    title: 'Marketplace & Economy',
    subtitle: 'Economia entre jogadores',
    status: S.PLANNED,
    items: [
      { icon: Gavel,        label: 'Leilão de Miners Raros',           status: S.PLANNED },
      { icon: Store,        label: 'Marketplace P2P',                  status: S.PLANNED },
      { icon: Swords,       label: 'Torneios & Competições',           status: S.PLANNED },
    ],
  },
  {
    phase: 'Fase 6',
    title: 'Blockchain & Mobile',
    subtitle: 'Web3 nativo',
    status: S.PLANNED,
    items: [
      { icon: Gem,          label: 'NFT de Miners (mintagem Polygon)', status: S.PLANNED },
      { icon: TrendingUp,   label: 'Staking de POL para boost',        status: S.PLANNED },
      { icon: ShieldCheck,  label: 'Histórico On-chain Verificável',   status: S.PLANNED },
      { icon: Smartphone,   label: 'App Mobile (PWA)',                 status: S.PLANNED },
    ],
  },
];

// ─────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────

const CFG = {
  launched: {
    label: 'Concluído',
    nodeRing: 'border-emerald-500 shadow-emerald-500/40',
    nodeBg:   'bg-emerald-500',
    badge:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    line:     'bg-emerald-500/50',
    cardBg:   'bg-emerald-500/8 border-emerald-500/25',
    phaseText:'text-emerald-400',
    barColor: 'from-emerald-500 to-emerald-400',
  },
  planned: {
    label: 'Planejado',
    nodeRing: 'border-slate-600 shadow-slate-700/20',
    nodeBg:   'bg-slate-800',
    badge:    'bg-violet-500/15 text-violet-400 border-violet-500/30',
    line:     'bg-slate-700/50',
    cardBg:   'bg-slate-900/60 border-slate-700/40',
    phaseText:'text-slate-400',
    barColor: 'from-violet-600 to-violet-400',
  },
};

// ─────────────────────────────────────────────
// Item row
// ─────────────────────────────────────────────

function ItemRow({ item }) {
  const Icon = item.icon;
  const done = item.status === 'launched';
  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-xl ${done ? 'hover:bg-emerald-500/5' : 'hover:bg-slate-800/30'} transition-colors`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <span className={`text-[11px] font-bold flex-1 leading-tight ${done ? 'text-slate-300' : 'text-slate-500'}`}>{item.label}</span>
      {done
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        : <div className="w-3 h-3 rounded-full border border-slate-600 shrink-0 animate-pulse" />
      }
    </div>
  );
}

// ─────────────────────────────────────────────
// Milestone node
// ─────────────────────────────────────────────

function MilestoneNode({ milestone, index, isLast }) {
  const [open, setOpen] = useState(milestone.status === 'launched');
  const cfg = CFG[milestone.status];
  const done = milestone.status === 'launched';
  const completedCount = milestone.items.filter(i => i.status === 'launched').length;
  const total = milestone.items.length;
  const pct = Math.round((completedCount / total) * 100);

  return (
    <div className="flex gap-0 group">
      {/* Trilho */}
      <div className="flex flex-col items-center w-14 shrink-0">
        <button
          onClick={() => setOpen(o => !o)}
          className={`relative w-10 h-10 rounded-full border-2 ${cfg.nodeRing} shadow-lg flex items-center justify-center z-10 transition-all duration-200 hover:scale-110 active:scale-95 ${cfg.nodeBg}`}
        >
          {done
            ? <CheckCircle2 className="w-4 h-4 text-white" />
            : <Clock className="w-4 h-4 text-slate-400" />
          }
          {/* número da fase */}
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-slate-950 border border-slate-700 text-[8px] font-black text-slate-400 flex items-center justify-center">
            {index + 1}
          </span>
        </button>
        {!isLast && (
          <div className={`w-0.5 flex-1 min-h-12 mt-1 rounded-full ${cfg.line}`} />
        )}
      </div>

      {/* Card */}
      <div className="flex-1 mb-10 ml-2 mt-0.5">
        <button onClick={() => setOpen(o => !o)} className="w-full text-left">
          <div className={`p-4 rounded-2xl border ${cfg.cardBg} transition-all hover:brightness-110 active:scale-[0.99]`}>
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[9px] font-black uppercase tracking-[0.25em] ${cfg.phaseText}`}>{milestone.phase}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${cfg.badge}`}>{cfg.label}</span>
                </div>
                <p className="text-sm font-black text-white tracking-tight">{milestone.title}</p>
                <p className="text-[10px] text-slate-500 font-medium">{milestone.subtitle}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-lg font-black leading-none ${cfg.phaseText}`}>{completedCount}<span className="text-slate-600 text-xs font-bold">/{total}</span></p>
                <p className="text-[8px] text-slate-600 font-bold uppercase tracking-wider mt-0.5">{pct}%</p>
              </div>
            </div>
            {/* progress */}
            <div className="mt-3 h-1.5 bg-slate-900 rounded-full overflow-hidden">
              <div className={`h-full rounded-full bg-gradient-to-r ${cfg.barColor} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
            {/* expand hint */}
            <p className="text-[8px] text-slate-600 mt-2 font-bold tracking-widest uppercase text-right">
              {open ? '▲ ocultar' : '▼ ver itens'}
            </p>
          </div>
        </button>

        {/* Items */}
        {open && (
          <div className="mt-2 ml-1 border-l-2 border-slate-800/50 pl-4 space-y-0.5 animate-in slide-in-from-top-2 duration-300">
            {milestone.items.map((item, i) => <ItemRow key={i} item={item} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────

export default function Roadmap() {
  const totalLaunched = MILESTONES.reduce((a, m) => a + m.items.filter(i => i.status === 'launched').length, 0);
  const totalItems    = MILESTONES.reduce((a, m) => a + m.items.length, 0);
  const pct           = Math.round((totalLaunched / totalItems) * 100);

  return (
    <div className="max-w-xl mx-auto space-y-8 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/20 rounded-2xl">
          <Flame className="w-7 h-7 text-primary" />
        </div>
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter italic">
            ROAD<span className="text-primary">MAP</span>
          </h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">
            Evolução da plataforma BlockMiner
          </p>
        </div>
      </div>

      {/* Progresso geral */}
      <div className="p-5 bg-slate-950/80 border border-slate-800/50 rounded-3xl space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Progresso total</p>
            <p className="text-3xl font-black text-white italic">{pct}<span className="text-primary text-2xl">%</span></p>
          </div>
          <div className="text-right space-y-1.5">
            <div className="flex items-center gap-2 justify-end">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{totalLaunched} lançados</span>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
              <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest">{totalItems - totalLaunched} planejados</span>
            </div>
          </div>
        </div>
        <div className="h-2.5 bg-slate-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-primary to-violet-500 rounded-full transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[9px] text-slate-600 font-bold text-center">
          {MILESTONES.filter(m => m.status === 'launched').length} de {MILESTONES.length} fases • Toque em uma fase para expandir
        </p>
      </div>

      {/* Mapa vertical */}
      <div className="pt-2">
        {MILESTONES.map((m, i) => (
          <MilestoneNode
            key={i}
            milestone={m}
            index={i}
            isLast={i === MILESTONES.length - 1}
          />
        ))}

        {/* Fim do mapa */}
        <div className="flex gap-0">
          <div className="w-14 shrink-0 flex justify-center">
            <div className="w-10 h-10 rounded-full bg-slate-900/80 border-2 border-dashed border-slate-700 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-slate-600" />
            </div>
          </div>
          <div className="flex-1 ml-2 mt-2.5">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">
              Mais novidades por vir...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
