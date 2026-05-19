import { useState, useEffect, useCallback, type Dispatch, type FormEvent, type ReactNode, type SetStateAction, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Activity,
  Ban,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  Fingerprint,
  Loader2,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Terminal,
  UserRound,
  Wallet,
  X,
  type LucideProps,
} from 'lucide-react';
import { api } from '../../../store/auth';
import { formatHashrate } from '../../../shared/utils/machine';
import { readAxiosResponseMessage } from '../admin.api';

type LucideIc = ComponentType<LucideProps>;

type IpIntel = {
  asn?: string | number | null;
  providerType?: string | null;
  proxyDetected?: boolean;
  proxyType?: string | null;
  proxyRiskScore?: number | null;
  proxyCheckedAt?: string | null;
  reverseDns?: string | null;
};

type AdminUsersListRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  status?: string;
  createdAt?: string | Date | null;
  isBanned?: boolean;
  registrationIp?: string | null;
  lastIp?: string | null;
  lastIpIntelligence?: IpIntel | null;
  walletAddress?: string | null;
  polBalance?: number | string | null;
  hashRate?: number | string | null;
  activeMachines?: number | null;
  indicators?: {
    hasWallet?: boolean;
    hasDeposit?: boolean;
    hasWithdrawal?: boolean;
    hasSharedIp?: boolean;
    possibleMultiAccount?: boolean;
  } | null;
  totalTransactions?: number | null;
  totalLogs?: number | null;
};

type PolygonHd = { address?: string | null };

type AdminDossierUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  isBanned?: boolean;
  polBalance?: number | string | null;
  oldBaseHashRate?: number | string | null;
  walletAddress?: string | null;
  polygonHdAddress?: PolygonHd | null;
  registrationIp?: string | null;
  ip?: string | null;
  lastLoginAt?: string | Date | null;
  createdAt?: string | Date | null;
  refCode?: string | null;
  lastIpIntelligence?: IpIntel | null;
};

type AdminDossierMetrics = {
  realHashRate?: number | string | null;
  activeMachines?: number | null;
  referrer?: { id: number; username?: string | null; email?: string | null } | null;
  referredCount?: number | null;
  faucetClaims?: number | null;
  totalDeposited?: number | string | null;
  totalWithdrawn?: number | string | null;
  totalTransactions?: number | null;
  totalLogs?: number | null;
  riskSummary?: string | null;
};

type AdminUserDetailsPayload = {
  ok: boolean;
  user: AdminDossierUser;
  metrics: AdminDossierMetrics;
};

type UsersListApiResponse = { ok: boolean; users?: AdminUsersListRow[]; total?: number | string };

type MinerCatalogRow = { id: number | string; name?: string | null; baseHashRate?: number | string | null };

type MinersCatalogResponse = { ok: boolean; miners?: MinerCatalogRow[] };

type TransactionRow = {
  id: number | string;
  type?: string;
  amount?: number | string;
  status?: string;
  txHash?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  createdAt?: string;
  metadata?: unknown;
};

type LogRow = {
  id: number | string;
  label?: string;
  action?: string;
  description?: string;
  source?: string;
  severity?: string;
  createdAt?: string;
  ip?: string | null;
  relatedEntityId?: string | number | null;
  relatedEntityType?: string | null;
  metadata?: unknown;
};

type TicketRow = { id: number | string; subject?: string; message?: string; isReplied?: boolean; createdAt?: string };

type MachineRow = {
  id: number | string;
  imageUrl?: string | null;
  miner?: { name?: string | null } | null;
  hashRate?: number | string | null;
  slotIndex?: number | string;
  isActive?: boolean;
};

type RelatedUserRow = {
  id: number;
  username?: string | null;
  email?: string | null;
  ip?: string | null;
  registrationIp?: string | null;
};

type RelatedUserWithRel = RelatedUserRow & { rel: string };

type ReferralRow = { id: number; referrerId: number; referredId: number; createdAt: string };

type RelatedDataPayload = {
  sameIp?: RelatedUserRow[];
  sameWallet?: RelatedUserRow[];
  referrals?: ReferralRow[];
};

type TabData = {
  transactions?: TransactionRow[];
  total?: number;
  logs?: LogRow[];
  tickets?: TicketRow[];
  machines?: MachineRow[];
} & RelatedDataPayload;

export type AdminUsersTabSlice = {
  page?: number;
  q?: string;
  type?: string;
  status?: string;
  source?: string;
  severity?: string;
  loading?: boolean;
  error?: boolean;
  data?: TabData;
};

type TabStateMap = Partial<Record<string, AdminUsersTabSlice>>;

const FILTERS: [string, string][] = [
  ['all', 'Todos'],
  ['active', 'Ativos'],
  ['banned', 'Banidos'],
  ['with_balance', 'Com saldo'],
  ['with_active_machines', 'Máquinas ativas'],
  ['wallet_linked', 'Com wallet'],
  ['wallet_missing', 'Sem wallet'],
  ['with_deposits', 'Depósitos'],
  ['with_withdrawals', 'Saques'],
  ['with_faucet', 'Faucet'],
  ['shared_ip', 'IP compartilhado'],
  ['suspected', 'Suspeitos'],
  ['asn_provider', 'ASN/provider'],
  ['today', 'Hoje'],
  ['7d', '7 dias'],
  ['30d', '30 dias'],
];

const SORTS: [string, string][] = [
  ['recent_id', 'ID recente'],
  ['oldest_id', 'ID antigo'],
  ['highest_balance', 'Maior saldo'],
  ['highest_hashrate', 'Maior poder'],
  ['last_login', 'Último login'],
  ['created_recent', 'Cadastro recente'],
  ['transaction_count', 'Mais transações'],
  ['log_count', 'Mais logs'],
  ['risk', 'Risco'],
];

function isEvm(value: unknown): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());
}

function CopyButton({ value, title = 'Copiar' }: { value: string | number | null | undefined; title?: string }) {
  if (value == null || value === '') return null;
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(String(value));
        toast.success('Copiado');
      }}
      className="p-1 text-slate-500 hover:text-emerald-400"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function ExplorerLink({ value }: { value: unknown }) {
  if (!isEvm(value)) return null;
  return (
    <a
      href={`https://polygonscan.com/address/${encodeURIComponent(String(value).trim())}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="p-1 text-sky-500 hover:text-sky-400"
      title="Polygonscan"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function TxHashLink({ hash }: { hash: string | null | undefined }) {
  if (!hash) return <span className="text-slate-600">--</span>;
  return (
    <span className="inline-flex max-w-[220px] items-center gap-1">
      <span className="truncate font-mono text-slate-300">{hash}</span>
      <CopyButton value={hash} title="Copiar hash" />
      <a href={`https://polygonscan.com/tx/${encodeURIComponent(hash)}`} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:text-sky-400">
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}

function MetaBlock({ value }: { value: unknown }) {
  const [open, setOpen] = useState(false);
  if (value == null || value === '') return <span className="text-slate-600">--</span>;
  const text = JSON.stringify(value);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="text-[10px] font-black uppercase text-slate-400 hover:text-white">
        {open ? 'Ocultar metadata' : 'Ver metadata'}
      </button>
      {open ? <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-300">{text}</pre> : null}
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUsersListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent_id');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetailsPayload | null>(null);
  const [detailsTab, setDetailsTab] = useState('perfil');
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [minersList, setMinersList] = useState<MinerCatalogRow[]>([]);
  const [sendMinerId, setSendMinerId] = useState('');
  const [sendQty, setSendQty] = useState(1);
  const [isSending, setIsSending] = useState(false);
  const [tabState, setTabState] = useState<TabStateMap>({});
  const limit = 25;

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams({ page: String(page), limit: String(limit), q: appliedSearch, filter, sort });
      const res = await api.get<UsersListApiResponse>(`/admin/users?${query.toString()}`);
      if (res.data.ok) {
        setUsers(res.data.users || []);
        setTotal(Number(res.data.total || 0));
      }
    } catch (err) {
      console.error('Erro ao buscar usuários', err);
      toast.error('Erro ao buscar usuários');
    } finally {
      setIsLoading(false);
    }
  }, [page, appliedSearch, filter, sort]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setAppliedSearch(search);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const loadUserDetails = async (userId: number) => {
    try {
      setIsDetailsLoading(true);
      setDetailsTab('perfil');
      setTabState({});
      setSendMinerId('');
      setSendQty(1);
      const detailsRes = await api.get<AdminUserDetailsPayload>(`/admin/users/${userId}/details`);
      if (detailsRes.data.ok) setSelectedUser(detailsRes.data);
    } catch {
      toast.error('Erro ao carregar detalhes do usuário.');
    } finally {
      setIsDetailsLoading(false);
    }
    if (minersList.length === 0) {
      try {
        const minersRes = await api.get<MinersCatalogResponse>('/admin/miners?withEvents=1');
        if (minersRes?.data?.ok) setMinersList(minersRes.data.miners || []);
      } catch {
        /* ignore */
      }
    }
  };

  const loadTab = async (tab: string, overrides: Partial<AdminUsersTabSlice> = {}) => {
    if (!selectedUser?.user?.id) return;
    const prev = tabState[tab] || { page: 1, q: '', type: 'all', status: 'all', source: 'all', severity: 'all' };
    const next = { ...prev, ...overrides };
    setTabState((s) => ({ ...s, [tab]: { ...next, loading: true } }));
    try {
      const params = new URLSearchParams({ page: String(next.page || 1), limit: '25' });
      if (next.q) params.set('q', next.q);
      if (next.type) params.set('type', next.type);
      if (next.status) params.set('status', next.status);
      if (next.source) params.set('source', next.source);
      if (next.severity) params.set('severity', next.severity);
      const endpoint = tab === 'transações' ? 'transactions' : tab === 'máquinas' ? 'machines' : tab;
      const res = await api.get<TabData>(`/admin/users/${selectedUser.user.id}/${endpoint}?${params.toString()}`);
      setTabState((s) => ({ ...s, [tab]: { ...next, loading: false, data: res.data } }));
    } catch {
      toast.error('Erro ao carregar aba.');
      setTabState((s) => ({ ...s, [tab]: { ...next, loading: false, error: true } }));
    }
  };

  useEffect(() => {
    if (!selectedUser || detailsTab === 'perfil' || detailsTab === 'enviar máquina') return;
    if (!tabState[detailsTab]?.data) void loadTab(detailsTab);
  }, [detailsTab, selectedUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const handleBanToggle = async (user: AdminUsersListRow | AdminDossierUser) => {
    const isBanned = Boolean(user.isBanned);
    const reason = window.prompt(`Motivo para ${isBanned ? 'desbanir' : 'banir'} este usuário:`);
    if (!reason?.trim()) return;
    try {
      const path = isBanned ? `/admin/users/${user.id}/unban` : `/admin/users/${user.id}/ban`;
      const res = await api.post<{ ok: boolean }>(path, { reason: reason.trim() });
      if (res.data.ok) {
        toast.success(isBanned ? 'Usuário desbanido!' : 'Usuário banido!');
        void fetchUsers();
        if (selectedUser?.user?.id === user.id) void loadUserDetails(user.id);
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao processar banimento.');
    }
  };

  const handleSendMiner = async () => {
    if (isSending || !sendMinerId || !selectedUser) return;
    if (!confirm(`Enviar ${sendQty}x máquina para ${selectedUser.user.username || selectedUser.user.email}?`)) return;
    try {
      setIsSending(true);
      const res = await api.post<{ ok: boolean; message?: string }>(`/admin/users/${selectedUser.user.id}/send-miner`, {
        minerId: sendMinerId,
        quantity: sendQty,
      });
      if (res.data.ok) {
        toast.success(res.data.message != null ? String(res.data.message) : 'Enviado.');
        setSendMinerId('');
        setSendQty(1);
        setTabState((s) => ({ ...s, máquinas: undefined }));
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao enviar máquina.');
    } finally {
      setIsSending(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / limit));
  const standardMiners = minersList.filter((m) => !String(m.id).startsWith('event_'));
  const eventMiners = minersList.filter((m) => String(m.id).startsWith('event_'));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-white">Gestão de Usuários</h2>
            <p className="text-slate-500 text-sm font-medium">
              Pesquisa global por ID, e-mail, username, IP, wallet, hash, referral, transação e sinais de suporte.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void fetchUsers()}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
        <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="#300, gugu, email@gmail.com, 170.79.86.235, wallet, tx hash, referral..."
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-3 pl-12 pr-28 text-sm text-slate-200 focus:border-amber-500/50 focus:outline-none focus:ring-4 focus:ring-amber-500/5"
              autoComplete="off"
              maxLength={140}
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setAppliedSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl px-3 py-1 text-[10px] font-black uppercase text-slate-500 hover:text-white"
              >
                Limpar
              </button>
            ) : null}
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFilter(id);
                  setPage(1);
                }}
                className={`rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest ${
                  filter === id ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="ml-auto rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-bold text-slate-300"
            >
              {SORTS.map(([id, lbl]) => (
                <option key={id} value={id}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-800/30 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">IPs / Provider</th>
                <th className="px-6 py-4">Wallet</th>
                <th className="px-6 py-4">Saldo / Poder</th>
                <th className="px-6 py-4">Indicadores</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-medium">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-8 py-6 bg-slate-800/10" />
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-14 text-center text-slate-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} onClick={() => void loadUserDetails(u.id)} className="cursor-pointer align-top transition-colors hover:bg-slate-800/30">
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs text-amber-200">#{u.id}</span>
                          <CopyButton value={u.id} />
                          <span
                            className={`ml-2 rounded-lg px-2 py-0.5 text-[9px] font-black uppercase ${
                              u.isBanned ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {u.status}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-white">
                          {u.username || u.name || '--'} <CopyButton value={u.username || u.name} />
                        </span>
                        <span className="break-all text-[10px] text-slate-500">
                          {u.email}
                          <CopyButton value={u.email} />
                        </span>
                        <span className="text-[10px] text-slate-600">
                          Criado: {u.createdAt ? new Date(u.createdAt).toLocaleString('pt-BR') : '--'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-[10px]">
                      <div className="space-y-1 font-mono">
                        <p>
                          Reg: {u.registrationIp || '--'} <CopyButton value={u.registrationIp} />
                        </p>
                        <p>
                          Últ: {u.lastIp || '--'} <CopyButton value={u.lastIp} />
                        </p>
                        <p className="font-sans text-slate-500">
                          {u.lastIpIntelligence?.asn ? `AS${u.lastIpIntelligence.asn} · ` : ''}
                          {u.lastIpIntelligence?.providerType || 'provider desconhecido'}
                        </p>
                        {u.lastIpIntelligence?.proxyDetected === true ? (
                          <p className="font-sans text-[10px] font-bold text-red-300">
                            Proxy: {u.lastIpIntelligence.proxyType || 'detectado'}
                            {Number.isInteger(u.lastIpIntelligence.proxyRiskScore) ? ` · risco ${u.lastIpIntelligence.proxyRiskScore}` : ''}
                          </p>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[220px] px-6 py-5 text-xs">
                      <div className="flex items-center gap-1">
                        <span className="truncate font-mono text-slate-300">{u.walletAddress || '--'}</span>
                        <CopyButton value={u.walletAddress} />
                        <ExplorerLink value={u.walletAddress} />
                      </div>
                    </td>
                    <td className="px-6 py-5 text-xs">
                      <p className="font-black text-amber-400">{Number(u.polBalance || 0).toFixed(6)} POL</p>
                      <p className="text-slate-300">{formatHashrate(Number(u.hashRate || 0))}</p>
                      <p className="text-[10px] text-slate-600">{u.activeMachines || 0} máquinas ativas</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {u.indicators?.hasWallet ? <Badge text="wallet" /> : null}
                        {u.indicators?.hasDeposit ? <Badge text="depósito" color="emerald" /> : null}
                        {u.indicators?.hasWithdrawal ? <Badge text="saque" color="amber" /> : null}
                        {u.indicators?.hasSharedIp ? <Badge text="IP compartilhado" color="red" /> : null}
                        {u.indicators?.possibleMultiAccount ? <Badge text="suspeito" color="red" /> : null}
                        <Badge text={`${u.totalTransactions || 0} tx`} />
                        <Badge text={`${u.totalLogs || 0} logs`} />
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void loadUserDetails(u.id);
                          }}
                          className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-white"
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleBanToggle(u);
                          }}
                          className={`rounded-lg p-2 ${u.isBanned ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
                          title={u.isBanned ? 'Desbanir' : 'Banir'}
                        >
                          <Ban className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-800/20 px-8 py-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Total: <span className="text-white">{total}</span> usuários
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg bg-slate-800 p-2 text-slate-400 transition-all hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-black uppercase tracking-widest text-white">
              Página {page} de {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg bg-slate-800 p-2 text-slate-400 transition-all hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {selectedUser &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/80 backdrop-blur-sm">
            <div className="h-full w-full max-w-6xl overflow-y-auto border-l border-slate-800 bg-slate-900 shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/90 p-6 backdrop-blur-md">
                <div>
                  <h3 className="text-xl font-black text-white">Perfil investigativo</h3>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">ID #{selectedUser.user.id}</p>
                </div>
                <button type="button" onClick={() => setSelectedUser(null)} className="rounded-2xl bg-slate-800 p-3 text-slate-400 hover:bg-slate-700 hover:text-white">
                  <X className="h-6 w-6" />
                </button>
              </div>
              {isDetailsLoading ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 border-b border-slate-800 px-6 pt-4">
                    {['perfil', 'transações', 'tickets', 'logs', 'máquinas', 'related', 'enviar máquina'].map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setDetailsTab(tab)}
                        className={`rounded-t-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest ${
                          detailsTab === tab ? 'border-b-2 border-amber-500 bg-amber-500/10 text-amber-400' : 'text-slate-500 hover:text-white'
                        }`}
                      >
                        {tab === 'related' ? 'Relacionados' : tab}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-8 p-6 pb-20">
                    {detailsTab === 'perfil' ? <ProfileTab selectedUser={selectedUser} onBan={() => void handleBanToggle(selectedUser.user)} /> : null}
                    {detailsTab === 'transações' ? <TransactionsTab state={tabState['transações']} onLoad={(o) => void loadTab('transações', o)} /> : null}
                    {detailsTab === 'logs' ? <LogsTab state={tabState.logs} onLoad={(o) => void loadTab('logs', o)} /> : null}
                    {detailsTab === 'tickets' ? <TicketsTab state={tabState.tickets} onLoad={(o) => void loadTab('tickets', o)} /> : null}
                    {detailsTab === 'máquinas' ? <MachinesTab state={tabState['máquinas']} onLoad={(o) => void loadTab('máquinas', o)} /> : null}
                    {detailsTab === 'related' ? <RelatedTab state={tabState.related} onLoad={(o) => void loadTab('related', o)} /> : null}
                    {detailsTab === 'enviar máquina' ? (
                      <SendMinerTab
                        selectedUser={selectedUser}
                        standardMiners={standardMiners}
                        eventMiners={eventMiners}
                        sendMinerId={sendMinerId}
                        setSendMinerId={setSendMinerId}
                        sendQty={sendQty}
                        setSendQty={setSendQty}
                        isSending={isSending}
                        handleSendMiner={handleSendMiner}
                      />
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function Badge({ text, color = 'slate' }: { text: string; color?: 'slate' | 'red' | 'amber' | 'emerald' }) {
  const cls =
    color === 'red'
      ? 'bg-red-500/10 text-red-300'
      : color === 'amber'
        ? 'bg-amber-500/10 text-amber-300'
        : color === 'emerald'
          ? 'bg-emerald-500/10 text-emerald-300'
          : 'bg-slate-800 text-slate-400';
  return <span className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase ${cls}`}>{text}</span>;
}

function DetailCard({
  label,
  value,
  icon: Icon,
  color = 'slate',
  mono = false,
  children,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIc;
  color?: 'slate' | 'amber' | 'emerald' | 'red';
  mono?: boolean;
  children?: ReactNode;
}) {
  const display = value !== null && value !== undefined && value !== '' ? value : '--';
  const c =
    color === 'amber' ? 'text-amber-400' : color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-slate-200';
  return (
    <div className="rounded-2xl border border-slate-800 p-4">
      <div className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`break-all text-sm font-bold ${c} ${mono ? 'font-mono text-xs' : ''}`}>
        {display} {children}
      </div>
    </div>
  );
}

function ProfileTab({ selectedUser, onBan }: { selectedUser: AdminUserDetailsPayload; onBan: () => void }) {
  const { user, metrics } = selectedUser;
  const intel = user.lastIpIntelligence;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetailCard label="Username" value={user.username || user.name} icon={UserRound}>
          <CopyButton value={user.username || user.name} />
        </DetailCard>
        <DetailCard label="E-mail" value={user.email} icon={Search}>
          <CopyButton value={user.email} />
        </DetailCard>
        <DetailCard label="Status" value={user.isBanned ? 'Banido' : 'Ativo'} icon={ShieldCheck} color={user.isBanned ? 'red' : 'emerald'} />
        <DetailCard label="Saldo POL" value={`${Number(user.polBalance || 0).toFixed(6)} POL`} icon={Wallet} color="amber" />
        <DetailCard label="Hashrate" value={formatHashrate(Number(metrics.realHashRate || user.oldBaseHashRate || 0))} icon={Cpu} />
        <DetailCard label="Máquinas ativas" value={metrics.activeMachines || 0} icon={Activity} />
        <DetailCard label="Wallet perfil" value={user.walletAddress || 'Não vinculada'} icon={Wallet} mono>
          <CopyButton value={user.walletAddress} />
          <ExplorerLink value={user.walletAddress} />
        </DetailCard>
        <DetailCard label="Wallet depósito HD" value={user.polygonHdAddress?.address || '--'} icon={Wallet} mono>
          <CopyButton value={user.polygonHdAddress?.address} />
          <ExplorerLink value={user.polygonHdAddress?.address} />
        </DetailCard>
        <DetailCard label="IP cadastro" value={user.registrationIp || '--'} icon={Fingerprint} mono>
          <CopyButton value={user.registrationIp} />
        </DetailCard>
        <DetailCard label="Último IP" value={user.ip || '--'} icon={Fingerprint} mono>
          <CopyButton value={user.ip} />
        </DetailCard>
        <DetailCard label="ASN / Provider" value={intel ? `${intel.asn ? `AS${intel.asn} · ` : ''}${intel.providerType || 'unknown'}` : '--'} icon={Fingerprint} />
        <DetailCard
          label="Anti-proxy"
          value={
            intel
              ? intel.proxyDetected
                ? `${intel.proxyType || 'detectado'}${Number.isInteger(intel.proxyRiskScore) ? ` · risco ${intel.proxyRiskScore}` : ''}`
                : intel.proxyCheckedAt
                  ? 'sem proxy'
                  : 'sem consulta'
              : '--'
          }
          icon={Fingerprint}
          color={intel?.proxyDetected ? 'red' : intel?.proxyCheckedAt ? 'emerald' : 'slate'}
        />
        <DetailCard label="Reverse DNS" value={intel?.reverseDns || '--'} icon={Fingerprint} mono>
          <CopyButton value={intel?.reverseDns} />
        </DetailCard>
        <DetailCard label="Criado em" value={user.createdAt ? new Date(user.createdAt).toLocaleString('pt-BR') : '--'} icon={Activity} />
        <DetailCard label="Último login" value={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('pt-BR') : '--'} icon={Activity} />
        <DetailCard label="Referral" value={user.refCode || '--'} icon={UserRound}>
          <CopyButton value={user.refCode} />
        </DetailCard>
        <DetailCard
          label="Indicado por"
          value={metrics.referrer ? `#${metrics.referrer.id} ${metrics.referrer.username || metrics.referrer.email}` : '--'}
          icon={UserRound}
        />
        <DetailCard label="Indicados" value={metrics.referredCount || 0} icon={UserRound} />
        <DetailCard label="Faucet claims" value={metrics.faucetClaims || 0} icon={Package} />
        <DetailCard label="Total depositado" value={`${Number(metrics.totalDeposited || 0).toFixed(6)} POL`} icon={Wallet} color="emerald" />
        <DetailCard label="Total sacado" value={`${Number(metrics.totalWithdrawn || 0).toFixed(6)} POL`} icon={Wallet} color="amber" />
        <DetailCard label="Transações" value={metrics.totalTransactions || 0} icon={Activity} />
        <DetailCard label="Logs/Eventos" value={metrics.totalLogs || 0} icon={Terminal} />
      </div>
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100">{metrics.riskSummary}</div>
      <button
        type="button"
        onClick={onBan}
        className={`w-full rounded-2xl py-4 text-sm font-black uppercase tracking-widest ${
          user.isBanned ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
        }`}
      >
        {user.isBanned ? 'Revogar banimento' : 'Banir usuário'}
      </button>
    </div>
  );
}

function TabToolbar({
  state,
  onLoad,
  children,
}: {
  state: AdminUsersTabSlice | undefined;
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row">
      <input
        value={state?.q || ''}
        onChange={(e) => onLoad({ q: e.target.value, page: 1 })}
        placeholder="Buscar nesta aba..."
        className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
        maxLength={140}
      />
      {children}
    </div>
  );
}

function Pager({
  state,
  total,
  onLoad,
}: {
  state: AdminUsersTabSlice | undefined;
  total: number | undefined;
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
}) {
  const page = Number(state?.page || 1);
  const hasNext = page * 25 < Number(total || 0);
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button type="button" disabled={page <= 1} onClick={() => onLoad({ page: page - 1 })} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">
        Anterior
      </button>
      <button type="button" disabled={!hasNext} onClick={() => onLoad({ page: page + 1 })} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-40">
        Próxima
      </button>
    </div>
  );
}

function LoadingOrEmpty({
  state,
  rows,
  children,
}: {
  state: AdminUsersTabSlice | undefined;
  rows: unknown[] | undefined;
  children: ReactNode;
}) {
  if (state?.loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-amber-400" />
      </div>
    );
  if (!rows?.length) return <div className="rounded-2xl border border-slate-800 p-12 text-center text-slate-500">Nenhum registro encontrado.</div>;
  return children;
}

function TransactionsTab({
  state = {},
  onLoad,
}: {
  state?: AdminUsersTabSlice;
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
}) {
  const rows: TransactionRow[] = state.data?.transactions || [];
  return (
    <div>
      <TabToolbar state={state} onLoad={onLoad}>
        <select value={state.type || 'all'} onChange={(e) => onLoad({ type: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'deposit', 'withdrawal', 'reward', 'faucet', 'purchase', 'mining', 'referral', 'adjustment'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select value={state.status || 'all'} onChange={(e) => onLoad({ status: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'pending', 'completed', 'failed', 'canceled', 'approved'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </TabToolbar>
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-xs text-slate-400">
            <thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500">
              <tr>
                <th className="p-3">ID</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Valor</th>
                <th className="p-3">Status</th>
                <th className="p-3">Hash</th>
                <th className="p-3">Wallets</th>
                <th className="p-3">Data</th>
                <th className="p-3">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((tx) => (
                <tr key={tx.id}>
                  <td className="p-3 font-mono">
                    #{tx.id}
                    <CopyButton value={tx.id} />
                  </td>
                  <td className="p-3">{tx.type}</td>
                  <td className="p-3 text-amber-300">{Number(tx.amount || 0).toFixed(6)}</td>
                  <td className="p-3">{tx.status}</td>
                  <td className="p-3">
                    <TxHashLink hash={tx.txHash} />
                  </td>
                  <td className="p-3 max-w-[220px]">
                    <p className="truncate font-mono">
                      de: {tx.fromAddress || '--'}
                      <CopyButton value={tx.fromAddress} />
                    </p>
                    <p className="truncate font-mono">
                      para: {tx.toAddress || '--'}
                      <CopyButton value={tx.toAddress} />
                    </p>
                  </td>
                  <td className="p-3">{tx.createdAt ? new Date(tx.createdAt).toLocaleString('pt-BR') : '—'}</td>
                  <td className="p-3">
                    <MetaBlock value={tx.metadata} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LoadingOrEmpty>
      <Pager state={state} total={state?.data?.total} onLoad={onLoad} />
    </div>
  );
}

function LogsTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const rows: LogRow[] = state.data?.logs || [];
  return (
    <div>
      <TabToolbar state={state} onLoad={onLoad}>
        <select value={state.source || 'all'} onChange={(e) => onLoad({ source: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'user', 'admin', 'system', 'fraud', 'transaction', 'mining', 'auth'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select value={state.severity || 'all'} onChange={(e) => onLoad({ severity: e.target.value, page: 1 })} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white">
          {['all', 'info', 'warning', 'danger', 'success'].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </TabToolbar>
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="space-y-3">
          {rows.map((log) => (
            <div key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">{log.label || log.action}</p>
                  <p className="text-xs text-slate-500">{log.description || log.action}</p>
                </div>
                <div className="flex gap-2">
                  <Badge text={String(log.source || '')} />
                  <Badge
                    text={String(log.severity || '')}
                    color={log.severity === 'danger' ? 'red' : log.severity === 'warning' ? 'amber' : log.severity === 'success' ? 'emerald' : 'slate'}
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[10px] text-slate-500">
                <span>{log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : ''}</span>
                {log.ip ? (
                  <span className="font-mono">
                    IP {log.ip}
                    <CopyButton value={log.ip} />
                  </span>
                ) : null}
                {log.relatedEntityId ? (
                  <span className="font-mono">
                    {log.relatedEntityType}: {log.relatedEntityId}
                    <CopyButton value={log.relatedEntityId} />
                  </span>
                ) : null}
              </div>
              <div className="mt-2">
                <MetaBlock value={log.metadata} />
              </div>
            </div>
          ))}
        </div>
      </LoadingOrEmpty>
      <Pager state={state} total={state?.data?.total} onLoad={onLoad} />
    </div>
  );
}

function TicketsTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const rows: TicketRow[] = state.data?.tickets || [];
  return (
    <SimpleList
      state={state}
      rows={rows}
      onLoad={onLoad}
      render={(t) => (
        <div>
          <p className="font-bold text-white">
            #{t.id} {t.subject}
          </p>
          <p className="mt-1 text-xs text-slate-500">{t.message}</p>
          <p className="mt-2 text-[10px] text-slate-600">
            {t.isReplied ? 'Respondido' : 'Pendente'} · {t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : ''}
          </p>
        </div>
      )}
    />
  );
}

function MachinesTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const rows: MachineRow[] = state.data?.machines || [];
  return (
    <SimpleList
      state={state}
      rows={rows}
      onLoad={onLoad}
      render={(m) => (
        <div className="flex items-center gap-3">
          <img src={m.imageUrl || '/machines/reward1.png'} alt="" className="h-10 w-10 object-contain" />
          <div>
            <p className="font-bold text-white">
              #{m.id} {m.miner?.name || 'Máquina'}
            </p>
            <p className="text-xs text-slate-500">
              {formatHashrate(Number(m.hashRate || 0))} · slot {m.slotIndex} · {m.isActive ? 'ativa' : 'inativa'}
            </p>
          </div>
        </div>
      )}
    />
  );
}

function RelatedTab({ state = {}, onLoad }: { state?: AdminUsersTabSlice; onLoad: (o: Partial<AdminUsersTabSlice>) => void }) {
  const data = (state.data || {}) as RelatedDataPayload;
  const rows: RelatedUserWithRel[] = [
    ...(data.sameIp || []).map((x) => ({ ...x, rel: 'Mesmo IP' })),
    ...(data.sameWallet || []).map((x) => ({ ...x, rel: 'Mesma wallet' })),
  ];
  return (
    <div>
      <button type="button" onClick={() => onLoad({ page: 1 })} className="mb-4 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300">
        Recarregar relacionados
      </button>
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((u) => (
            <div key={`${u.rel}-${u.id}`} className="rounded-2xl border border-slate-800 p-4">
              <Badge text={u.rel} color="amber" />
              <p className="mt-2 font-mono text-amber-200">#{u.id}</p>
              <p className="text-sm text-white">{u.username || u.email}</p>
              <p className="break-all text-xs text-slate-500">{u.email}</p>
              <p className="mt-1 font-mono text-[10px] text-slate-500">{u.ip || u.registrationIp || '--'}</p>
            </div>
          ))}
        </div>
      </LoadingOrEmpty>
      {(data.referrals || []).length ? (
        <div className="mt-6">
          <p className="mb-2 text-xs font-black uppercase text-slate-500">Referrals</p>
          {(data.referrals || []).map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 p-3 text-xs text-slate-300">
              #{r.referrerId} indicou #{r.referredId} · {new Date(r.createdAt).toLocaleString('pt-BR')}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SimpleList<T extends { id: string | number }>({
  state,
  rows,
  onLoad,
  render,
}: {
  state: AdminUsersTabSlice | undefined;
  rows: T[];
  onLoad: (o: Partial<AdminUsersTabSlice>) => void;
  render: (row: T) => ReactNode;
}) {
  return (
    <div>
      <TabToolbar state={state} onLoad={onLoad} />
      <LoadingOrEmpty state={state} rows={rows}>
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              {render(row)}
            </div>
          ))}
        </div>
      </LoadingOrEmpty>
      <Pager state={state} total={state?.data?.total} onLoad={onLoad} />
    </div>
  );
}

type SendMinerTabProps = {
  selectedUser: AdminUserDetailsPayload;
  standardMiners: MinerCatalogRow[];
  eventMiners: MinerCatalogRow[];
  sendMinerId: string;
  setSendMinerId: (v: string) => void;
  sendQty: number;
  setSendQty: Dispatch<SetStateAction<number>>;
  isSending: boolean;
  handleSendMiner: () => void | Promise<void>;
};

function SendMinerTab({
  selectedUser,
  standardMiners,
  eventMiners,
  sendMinerId,
  setSendMinerId,
  sendQty,
  setSendQty,
  isSending,
  handleSendMiner,
}: SendMinerTabProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <select value={sendMinerId} onChange={(e) => setSendMinerId(e.target.value)} className="w-full rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white">
          <option value="">Selecione uma máquina...</option>
          {standardMiners.length ? (
            <optgroup label="Mineradoras normais">
              {standardMiners.map((m) => (
                <option key={String(m.id)} value={String(m.id)}>
                  {m.name} - {Number(m.baseHashRate).toFixed(1)} H/s
                </option>
              ))}
            </optgroup>
          ) : null}
          {eventMiners.length ? (
            <optgroup label="Máquinas de evento">
              {eventMiners.map((m) => (
                <option key={String(m.id)} value={String(m.id)}>
                  {m.name} - {Number(m.baseHashRate).toFixed(1)} H/s
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setSendQty((q: number) => Math.max(1, q - 1))} className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-white">
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            min={1}
            max={100}
            value={sendQty}
            onChange={(e) => setSendQty(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
            className="w-24 rounded-xl border border-slate-700 bg-slate-800 p-3 text-center text-lg font-black text-white"
          />
          <button type="button" onClick={() => setSendQty((q: number) => Math.min(100, q + 1))} className="rounded-xl border border-slate-700 bg-slate-800 p-3 text-white">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={() => void handleSendMiner()} disabled={isSending || !sendMinerId} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 disabled:opacity-40">
          {isSending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4" /> Enviar para {selectedUser.user.username || selectedUser.user.email}
            </>
          )}
        </button>
      </div>
      <div className="rounded-3xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-500">
        <Package className="mb-3 h-5 w-5 text-emerald-400" />
        O envio cria itens no inventário do usuário e registra ação administrativa nos logs.
      </div>
    </div>
  );
}
