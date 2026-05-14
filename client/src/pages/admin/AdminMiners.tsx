import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Archive,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Pencil,
  Plus,
  Save,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../../store/auth';
import { formatHashrate } from '../../shared/utils/machine';
import { readAxiosResponseMessage } from './admin.api';

const FALLBACK_IMAGE = '/icon.png';

type MinerFormState = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  baseHashRate: string | number;
  price: string | number;
  slotSize: string;
  imageUrl: string;
  tier: string;
  sourceType: string;
  isActive: boolean;
  showInShop: boolean;
  isArchived: boolean;
  sortOrder: string | number;
  maxPerUser: string | number;
  stockTotal: string | number;
  availableFrom: string;
  availableUntil: string;
  metadata: string;
  stockSold?: number;
};

type AdminMinerApiRow = Record<string, unknown> & { id?: number };

type MinersListResponse = {
  miners?: AdminMinerApiRow[];
  total?: number | string;
};

type MinerMutationResponse = { ok?: boolean };

type UploadImageResponse = { url?: string };

const EMPTY_FORM: MinerFormState = {
  name: '',
  slug: '',
  description: '',
  longDescription: '',
  baseHashRate: '',
  price: '',
  slotSize: '1',
  imageUrl: '',
  tier: 'common',
  sourceType: 'store',
  isActive: true,
  showInShop: true,
  isArchived: false,
  sortOrder: 0,
  maxPerUser: '',
  stockTotal: '',
  availableFrom: '',
  availableUntil: '',
  metadata: '',
};

const CONTROL_CLASS =
  'w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-amber-500/50';

function normalizeMiner(m: AdminMinerApiRow): MinerFormState {
  const id = typeof m.id === 'number' ? m.id : Number(m.id);
  return {
    ...EMPTY_FORM,
    ...m,
    id: Number.isFinite(id) ? id : undefined,
    baseHashRate: m.baseHashRate != null ? String(m.baseHashRate) : '',
    price: m.price != null ? String(m.price) : '',
    slotSize: String(m.slotSize ?? 1),
    isActive: Boolean(m.isActive),
    showInShop: Boolean(m.showInShop ?? m.isStoreVisible),
    isArchived: Boolean(m.isArchived),
    maxPerUser: m.maxPerUser != null && m.maxPerUser !== '' ? String(m.maxPerUser) : '',
    stockTotal: m.stockTotal != null && m.stockTotal !== '' ? String(m.stockTotal) : '',
    availableFrom: m.availableFrom ? String(m.availableFrom).slice(0, 16) : '',
    availableUntil: m.availableUntil ? String(m.availableUntil).slice(0, 16) : '',
    metadata: m.metadata && typeof m.metadata === 'object' ? JSON.stringify(m.metadata, null, 2) : '',
    stockSold: typeof m.stockSold === 'number' ? m.stockSold : Number(m.stockSold) || 0,
  };
}

function copyText(value: string | null | undefined): void {
  if (!value) return;
  void navigator.clipboard?.writeText(String(value));
  toast.success('Copiado');
}

type MinerSavePayload = {
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  baseHashRate: number;
  price: number;
  slotSize: number;
  imageUrl: string | null;
  tier: string;
  sourceType: string;
  isActive: boolean;
  showInShop: boolean;
  isArchived: boolean;
  sortOrder: number;
  maxPerUser: number | null;
  stockTotal: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  metadata: unknown;
};

function makePayload(form: MinerFormState): MinerSavePayload {
  let parsedMeta: unknown = null;
  if (form.metadata?.trim()) {
    parsedMeta = JSON.parse(form.metadata) as unknown;
  }
  return {
    name: form.name,
    slug: form.slug,
    description: form.description,
    longDescription: form.longDescription,
    baseHashRate: Number(form.baseHashRate),
    price: Number(form.price),
    slotSize: Number(form.slotSize),
    imageUrl: form.imageUrl || null,
    tier: form.tier,
    sourceType: form.sourceType,
    isActive: Boolean(form.isActive),
    showInShop: Boolean(form.showInShop),
    isArchived: Boolean(form.isArchived),
    sortOrder: Number(form.sortOrder || 0),
    maxPerUser: form.maxPerUser === '' ? null : Number(form.maxPerUser),
    stockTotal: form.stockTotal === '' ? null : Number(form.stockTotal),
    availableFrom: form.availableFrom || null,
    availableUntil: form.availableUntil || null,
    metadata: parsedMeta,
  };
}

type BadgeTone = 'slate' | 'green' | 'blue' | 'red' | 'amber' | 'purple';

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    slate: 'bg-slate-800 text-slate-300',
    green: 'bg-emerald-500/10 text-emerald-400',
    blue: 'bg-sky-500/10 text-sky-400',
    red: 'bg-red-500/10 text-red-400',
    amber: 'bg-amber-500/10 text-amber-300',
    purple: 'bg-violet-500/10 text-violet-300',
  };
  const cls = tones[tone] ?? tones.slate;
  return <span className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase ${cls}`}>{children}</span>;
}

type DrawerMode = 'create' | 'edit' | null;

export default function AdminMiners() {
  const [miners, setMiners] = useState<MinerFormState[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState<DrawerMode>(null);
  const [form, setForm] = useState<MinerFormState>(EMPTY_FORM);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const limit = 25;

  const fetchMiners = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), filter, sort });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get<MinersListResponse>(`/admin/miners?${params.toString()}`);
      setMiners((res.data.miners || []).map((row) => normalizeMiner(row)));
      setTotal(Number(res.data.total || 0));
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Erro ao carregar mineradoras');
    } finally {
      setLoading(false);
    }
  }, [page, filter, sort, q]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchMiners(), 250);
    return () => clearTimeout(timer);
  }, [fetchMiners]);

  const pageCount = Math.max(1, Math.ceil(total / limit));

  const openCreate = () => {
    setDrawer('create');
    setForm(EMPTY_FORM);
  };

  const openEdit = (miner: MinerFormState) => {
    setDrawer('edit');
    setForm(normalizeMiner(miner));
  };

  const saveMiner = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = makePayload(form);
      const res =
        drawer === 'edit' && form.id != null
          ? await api.patch<MinerMutationResponse>(`/admin/miners/${form.id}`, payload)
          : await api.post<MinerMutationResponse>('/admin/miners', payload);
      if (res.data.ok) {
        toast.success(drawer === 'edit' ? 'Mineradora atualizada' : 'Mineradora criada');
        setDrawer(null);
        void fetchMiners();
      }
    } catch (err: unknown) {
      const msg = readAxiosResponseMessage(err);
      toast.error(msg || (err instanceof Error ? err.message : '') || 'Erro ao salvar mineradora');
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const res = await api.post<UploadImageResponse>('/admin/miners/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.url) setForm((prev) => ({ ...prev, imageUrl: res.data.url as string }));
      toast.success('Imagem enviada');
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Upload recusado');
    }
  };

  type QuickAction = 'duplicate' | 'archive' | 'store' | 'active';

  const quickAction = async (miner: MinerFormState, action: QuickAction) => {
    if (miner.id == null) return;
    try {
      if (action === 'duplicate') await api.post(`/admin/miners/${miner.id}/duplicate`);
      if (action === 'archive') await api.post(`/admin/miners/${miner.id}/archive`);
      if (action === 'store') await api.post(`/admin/miners/${miner.id}/toggle-store`, { showInShop: !miner.showInShop });
      if (action === 'active') await api.post(`/admin/miners/${miner.id}/toggle-active`, { isActive: !miner.isActive });
      toast.success('Ação aplicada');
      void fetchMiners();
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || 'Ação falhou');
    }
  };

  const filters = useMemo(
    () =>
      [
        'all',
        'active',
        'inactive',
        'store',
        'hidden',
        'free',
        'paid',
        'store',
        'reward',
        'shortlink',
        'faucet',
        'admin',
        'event',
        'common',
        'rare',
        'epic',
        'legendary',
        'archived',
      ],
    []
  );

  const sortOptions: [string, string][] = [
    ['recent', 'Recentes'],
    ['name', 'Nome'],
    ['price_asc', 'Menor preço'],
    ['price_desc', 'Maior preço'],
    ['hashrate_asc', 'Menor poder'],
    ['hashrate_desc', 'Maior poder'],
    ['value', 'Custo-benefício'],
    ['sold', 'Mais vendidas'],
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Catálogo de Mineradoras</h2>
          <p className="text-sm font-medium text-slate-500">
            Gerencie máquinas, economia, loja e recompensas sem alterar snapshots já adquiridos.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-950 hover:bg-amber-400"
        >
          <Plus className="h-4 w-4" /> Nova Máquina
        </button>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              maxLength={120}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por ID, nome, slug, tier, preço, poder..."
              className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-3 pl-11 pr-4 text-sm text-white outline-none focus:border-amber-500/50"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300"
          >
            {sortOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {filters.map((id, index) => (
            <button
              key={`${id}-${index}`}
              type="button"
              onClick={() => {
                setFilter(id);
                setPage(1);
              }}
              className={`rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase ${
                filter === id ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-white'
              }`}
            >
              {id.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-800/30 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="px-6 py-4">Preview</th>
                <th className="px-6 py-4">Nome / Slug</th>
                <th className="px-6 py-4">Economia</th>
                <th className="px-6 py-4">Classificação</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Vendas</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : miners.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                    Nenhuma mineradora encontrada.
                  </td>
                </tr>
              ) : (
                miners.map((m) => (
                  <tr key={m.id ?? m.slug} className="align-top hover:bg-slate-800/30">
                    <td className="px-6 py-5">
                      <div className="h-16 w-16 rounded-2xl border border-slate-800 bg-slate-950 p-2">
                        <img
                          src={m.imageUrl || FALLBACK_IMAGE}
                          alt=""
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            e.currentTarget.src = FALLBACK_IMAGE;
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-black text-white">
                        #{m.id} {m.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyText(m.slug)}
                        className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-amber-300"
                      >
                        {m.slug} <Copy className="h-3 w-3" />
                      </button>
                      {m.description ? <p className="mt-2 max-w-xs truncate text-xs text-slate-500">{m.description}</p> : null}
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-black text-amber-300">{Number(m.price || 0).toFixed(4)} POL</p>
                      <p className="text-xs text-slate-500">{formatHashrate(Number(m.baseHashRate || 0))}</p>
                      <p className="text-[11px] text-slate-600">{m.slotSize} slot(s)</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="purple">{m.tier}</Badge>
                        <Badge tone="slate">{m.sourceType}</Badge>
                        {Number(m.price) === 0 ? <Badge tone="green">grátis</Badge> : <Badge tone="amber">paga</Badge>}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={m.isActive ? 'green' : 'red'}>{m.isActive ? 'ativa' : 'inativa'}</Badge>
                        <Badge tone={m.showInShop ? 'blue' : 'slate'}>{m.showInShop ? 'loja' : 'oculta'}</Badge>
                        {m.isArchived ? <Badge tone="red">arquivada</Badge> : null}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="font-bold text-white">{m.stockSold || 0}</p>
                      <p className="text-xs text-slate-500">{m.stockTotal == null || m.stockTotal === '' ? 'estoque livre' : `de ${m.stockTotal}`}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void quickAction(m, 'active')}
                          className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                          title="Ativar/desativar"
                        >
                          <Cpu className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void quickAction(m, 'store')}
                          className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                          title="Mostrar/ocultar loja"
                        >
                          {m.showInShop ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void quickAction(m, 'duplicate')}
                          className="rounded-xl bg-slate-800 p-2 text-slate-300 hover:bg-slate-700"
                          title="Duplicar"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void quickAction(m, 'archive')}
                          className="rounded-xl bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                          title="Arquivar"
                        >
                          <Archive className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 text-xs text-slate-500">
          <span>{total} mineradoras</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg bg-slate-800 px-3 py-2 font-bold text-slate-300 disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="rounded-lg bg-slate-800 px-3 py-2 font-bold text-slate-300 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {drawer
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/80 backdrop-blur-sm">
              <form onSubmit={(ev) => void saveMiner(ev)} className="flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-2xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 p-6">
                  <div>
                    <h3 className="text-xl font-black text-white">{drawer === 'edit' ? 'Editar mineradora' : 'Nova mineradora'}</h3>
                    <p className="text-xs text-slate-500">
                      Alterações de preço/poder afetam compras futuras; máquinas já adquiridas mantêm snapshot.
                    </p>
                  </div>
                  <button type="button" onClick={() => setDrawer(null)} className="rounded-xl bg-slate-800 p-2 text-slate-400 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid gap-5 p-6 md:grid-cols-2">
                  <Field label="Nome">
                    <input
                      required
                      maxLength={120}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field label="Slug">
                    <input
                      required
                      maxLength={80}
                      value={form.slug}
                      onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                      className={`${CONTROL_CLASS} font-mono`}
                      placeholder="elite-miner-v1"
                    />
                  </Field>
                  <Field label="Descrição curta">
                    <input
                      maxLength={500}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field label="Imagem">
                    <div className="flex gap-2">
                      <input
                        value={form.imageUrl || ''}
                        onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                        className={CONTROL_CLASS}
                        placeholder="/uploads/..."
                      />
                      <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl bg-slate-800 px-3 text-slate-300 hover:bg-slate-700">
                        <Upload className="h-4 w-4" />
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          void uploadImage(e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  </Field>
                  <Field label="Preço POL">
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.00000001"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field label="Poder H/s">
                    <input
                      required
                      type="number"
                      min="0"
                      step="any"
                      value={form.baseHashRate}
                      onChange={(e) => setForm({ ...form, baseHashRate: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field label="Slots">
                    <input
                      required
                      type="number"
                      min={1}
                      max={8}
                      value={form.slotSize}
                      onChange={(e) => setForm({ ...form, slotSize: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field label="Ordem">
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field label="Tier">
                    <Select
                      value={form.tier}
                      onChange={(tier) => setForm({ ...form, tier })}
                      options={['common', 'uncommon', 'rare', 'epic', 'legendary', 'special']}
                    />
                  </Field>
                  <Field label="Origem">
                    <Select
                      value={form.sourceType}
                      onChange={(sourceType) => setForm({ ...form, sourceType })}
                      options={['store', 'reward', 'shortlink', 'faucet', 'admin', 'event']}
                    />
                  </Field>
                  <Field label="Limite por usuário">
                    <input
                      type="number"
                      min={1}
                      value={form.maxPerUser}
                      onChange={(e) => setForm({ ...form, maxPerUser: e.target.value })}
                      className={CONTROL_CLASS}
                      placeholder="sem limite"
                    />
                  </Field>
                  <Field label="Estoque total">
                    <input
                      type="number"
                      min={0}
                      value={form.stockTotal}
                      onChange={(e) => setForm({ ...form, stockTotal: e.target.value })}
                      className={CONTROL_CLASS}
                      placeholder="sem estoque"
                    />
                  </Field>
                  <Field label="Disponível de">
                    <input
                      type="datetime-local"
                      value={form.availableFrom}
                      onChange={(e) => setForm({ ...form, availableFrom: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <Field label="Disponível até">
                    <input
                      type="datetime-local"
                      value={form.availableUntil}
                      onChange={(e) => setForm({ ...form, availableUntil: e.target.value })}
                      className={CONTROL_CLASS}
                    />
                  </Field>
                  <div className="md:col-span-2 grid gap-4 md:grid-cols-[160px_1fr]">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase text-slate-500">
                        <ImageIcon className="h-4 w-4" /> Preview loja
                      </div>
                      <img
                        src={form.imageUrl || FALLBACK_IMAGE}
                        alt=""
                        className="mx-auto h-24 w-24 object-contain"
                        onError={(e) => {
                          e.currentTarget.src = FALLBACK_IMAGE;
                        }}
                      />
                      <p className="mt-3 truncate text-center text-sm font-black text-white">{form.name || 'Mineradora'}</p>
                      <p className="text-center text-xs text-amber-300">{Number(form.price || 0).toFixed(4)} POL</p>
                    </div>
                    <Field label="Descrição longa">
                      <textarea
                        value={form.longDescription}
                        maxLength={4000}
                        onChange={(e) => setForm({ ...form, longDescription: e.target.value })}
                        className={`${CONTROL_CLASS} min-h-28`}
                      />
                    </Field>
                  </div>
                  <Field label="Metadata JSON">
                    <textarea
                      value={form.metadata}
                      onChange={(e) => setForm({ ...form, metadata: e.target.value })}
                      className={`${CONTROL_CLASS} min-h-24 font-mono`}
                      placeholder='{"note":"opcional"}'
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-4 self-end">
                    <Toggle label="Ativa" checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })} />
                    <Toggle label="Na loja" checked={form.showInShop} onChange={(showInShop) => setForm({ ...form, showInShop })} />
                    <Toggle label="Arquivada" checked={form.isArchived} onChange={(isArchived) => setForm({ ...form, isArchived })} />
                  </div>
                </div>
                <div className="sticky bottom-0 border-t border-slate-800 bg-slate-950/95 p-6">
                  <button disabled={saving} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 text-sm font-black uppercase tracking-widest text-slate-950 disabled:opacity-50">
                    <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={CONTROL_CLASS}>
      {options.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`rounded-xl px-3 py-2 text-[10px] font-black uppercase ${checked ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-800 text-slate-500'}`}>
      {label}
    </button>
  );
}
