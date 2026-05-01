/**
 * AdminTransparency.jsx
 *
 * Admin CRUD panel for the Transparency Portal.
 * Supports two entry types:
 *   - expense: operational costs grouped by category
 *   - income:  revenue, sponsorships, donations, etc.
 *
 * Images (logos, receipts, screenshots) can be uploaded via the
 * existing /admin/upload-image endpoint (max 5 MB).
 *
 * All user-facing strings are internationalised via react-i18next.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Eye, Plus, Pencil, Trash2, Check, X,
  Server, Wrench, Megaphone, Briefcase, Scale, Package,
  ExternalLink, ToggleLeft, ToggleRight,
  TrendingDown, TrendingUp, Upload, ImageIcon,
  Wallet, Link2, ArrowDownLeft, ArrowUpRight, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { csrfHeaderObject } from '../utils/csrfHeader';

// ─── Static data ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'infrastructure', icon: Server    },
  { value: 'tooling',        icon: Wrench    },
  { value: 'marketing',      icon: Megaphone },
  { value: 'payroll',        icon: Briefcase },
  { value: 'legal',          icon: Scale     },
  { value: 'misc',           icon: Package   },
];

const INCOME_CATEGORIES = [
  'revenue',
  'sponsorship',
  'donation',
  'investment_return',
  'other',
];

const PERIODS = ['monthly', 'annual', 'daily', 'one_time'];

const EMPTY_FORM = {
  type:           'expense',
  category:       'infrastructure',
  incomeCategory: 'revenue',
  name:           '',
  description:    '',
  provider:       '',
  providerUrl:    '',
  imageUrl:       '',
  amountUsd:      '',
  amountOriginal: '',
  currencyCode:   'USD',
  fxRateUsd:      '',
  period:         'monthly',
  entryDate:      '',
  direction:      'out',
  blockchain:     'polygon',
  walletAddress:  '',
  txHash:         '',
  referenceUrl:   '',
  isOnChain:      false,
  isPaid:         true,
  isActive:       true,
  notes:          '',
  sortOrder:      0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Labelled form field wrapper */
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'bg-slate-800/60 border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40 transition-colors';

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminTransparency() {
  const { t } = useTranslation();
  const [entries, setEntries]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [editId, setEditId]             = useState(null);
  const [saving, setSaving]             = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [uploading, setUploading]       = useState(false);
  const fileInputRef                    = useRef(null);
  const [walletInput, setWalletInput]   = useState('');
  const [walletSaving, setWalletSaving] = useState(false);
  const [activity, setActivity]         = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [trackedWallets, setTrackedWallets] = useState([]);
  const [trackedWalletActivity, setTrackedWalletActivity] = useState(null);
  const [trackedWalletLoading, setTrackedWalletLoading] = useState(false);
  const [trackedWalletSaving, setTrackedWalletSaving] = useState(false);
  const [trackedWalletForm, setTrackedWalletForm] = useState({
    label: '',
    address: '',
    chain: 'polygon',
    assetSymbol: 'POL',
    explorerBaseUrl: 'https://polygonscan.com/address',
    includeInTotals: true,
    isPublic: true,
    isActive: true,
    sortOrder: 0,
  });

  const jsonHeaders = () => ({
    'Content-Type': 'application/json',
    ...csrfHeaderObject(),
  });

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/transparency', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.ok) setEntries(d.entries);
    } catch {
      toast.error(t('transparency.admin.toast_error'));
    } finally {
      setLoading(false);
    }
  }

  async function loadTrackedWallets() {
    try {
      const r = await fetch('/api/admin/transparency/tracked-wallets', { credentials: 'include' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.ok) setTrackedWallets(d.wallets || []);
    } catch {
      toast.error('Erro ao carregar carteiras rastreadas');
    }
  }

  async function loadWalletSettings() {
    try {
      const r = await fetch('/api/admin/transparency/wallet/settings', { credentials: 'include' });
      if (!r.ok) return;
      const d = await r.json();
      if (d.ok) setWalletInput(typeof d.address === 'string' ? d.address : '');
    } catch {
      /* ignore */
    }
  }

  async function saveWalletSettings() {
    setWalletSaving(true);
    try {
      const r = await fetch('/api/admin/transparency/wallet/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify({ address: walletInput }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success(t('transparency.admin.wallet_saved'));
        setWalletInput(typeof d.address === 'string' ? d.address : '');
      } else {
        toast.error(d.message || t('transparency.admin.toast_error'));
      }
    } catch {
      toast.error(t('transparency.admin.toast_error'));
    } finally {
      setWalletSaving(false);
    }
  }

  async function refreshWalletActivity() {
    setActivityLoading(true);
    try {
      const r = await fetch('/api/admin/transparency/wallet/activity', { credentials: 'include' });
      const d = await r.json();
        if (d.ok) {
        setActivity(d);
        if (!d.apiKeyConfigured) toast.info(t('transparency.admin.wallet_api_key_hint'));
      } else {
        toast.error(d.message || t('transparency.admin.toast_error'));
        setActivity(null);
      }
    } catch {
      toast.error(t('transparency.admin.toast_error'));
      setActivity(null);
    } finally {
      setActivityLoading(false);
    }
  }

  async function refreshTrackedWalletActivity() {
    setTrackedWalletLoading(true);
    try {
      const r = await fetch('/api/admin/transparency/tracked-wallets/activity', { credentials: 'include' });
      const d = await r.json();
      if (d.ok) {
        setTrackedWalletActivity(d);
      } else {
        toast.error(d.message || t('transparency.admin.toast_error'));
        setTrackedWalletActivity(null);
      }
    } catch {
      toast.error(t('transparency.admin.toast_error'));
      setTrackedWalletActivity(null);
    } finally {
      setTrackedWalletLoading(false);
    }
  }

  async function saveTrackedWallet() {
    setTrackedWalletSaving(true);
    try {
      const r = await fetch('/api/admin/transparency/tracked-wallets', {
        method: 'POST',
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify(trackedWalletForm),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success('Carteira rastreada salva');
        setTrackedWalletForm({
          label: '',
          address: '',
          chain: 'polygon',
          assetSymbol: 'POL',
          explorerBaseUrl: 'https://polygonscan.com/address',
          includeInTotals: true,
          isPublic: true,
          isActive: true,
          sortOrder: 0,
        });
        loadTrackedWallets();
        refreshTrackedWalletActivity();
      } else {
        toast.error(d.message || 'Erro ao salvar carteira rastreada');
      }
    } catch {
      toast.error('Erro ao salvar carteira rastreada');
    } finally {
      setTrackedWalletSaving(false);
    }
  }

  async function removeTrackedWallet(id) {
    try {
      const r = await fetch(`/api/admin/transparency/tracked-wallets/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: jsonHeaders(),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success('Carteira removida');
        loadTrackedWallets();
        refreshTrackedWalletActivity();
      } else {
        toast.error(d.message || 'Erro ao remover carteira');
      }
    } catch {
      toast.error('Erro ao remover carteira');
    }
  }

  useEffect(() => {
    load();
    loadWalletSettings();
    loadTrackedWallets();
    refreshTrackedWalletActivity();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(entry) {
    setEditId(entry.id);
    setForm({
      type:           entry.type || 'expense',
      category:       entry.category || 'infrastructure',
      incomeCategory: entry.incomeCategory || 'revenue',
      name:           entry.name,
      description:    entry.description || '',
      provider:       entry.provider || '',
      providerUrl:    entry.providerUrl || '',
      imageUrl:       entry.imageUrl || '',
      amountUsd:      String(entry.amountUsd),
      amountOriginal: entry.amountOriginal != null ? String(entry.amountOriginal) : '',
      currencyCode:   entry.currencyCode || 'USD',
      fxRateUsd:      entry.fxRateUsd != null ? String(entry.fxRateUsd) : '',
      period:         entry.period,
      entryDate:      entry.entryDate ? String(entry.entryDate).slice(0, 10) : '',
      direction:      entry.direction || (entry.type === 'income' ? 'in' : 'out'),
      blockchain:     entry.blockchain || 'polygon',
      walletAddress:  entry.walletAddress || '',
      txHash:         entry.txHash || '',
      referenceUrl:   entry.referenceUrl || '',
      isOnChain:      Boolean(entry.isOnChain),
      isPaid:         entry.isPaid,
      isActive:       entry.isActive,
      notes:          entry.notes || '',
      sortOrder:      entry.sortOrder,
    });
    setShowForm(true);
  }

  // ── Image upload ───────────────────────────────────────────────────────────

  /**
   * Upload an image file to /admin/upload-image.
   * Validates file size client-side before sending (max 5 MB).
   * @param {File} file
   */
  async function handleImageUpload(file) {
    if (!file) return;
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error(t('transparency.admin.toast_image_too_large'));
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await fetch('/api/admin/upload-image', {
        method: 'POST',
        credentials: 'include',
        headers: { ...csrfHeaderObject() },
        body: fd,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.ok && d.url) {
        setForm(f => ({ ...f, imageUrl: d.url }));
        toast.success(t('transparency.admin.toast_image_uploaded'));
      } else {
        toast.error(d.message || t('transparency.admin.toast_image_error'));
      }
    } catch {
      toast.error(t('transparency.admin.toast_image_error'));
    } finally {
      setUploading(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim()) return toast.error(t('transparency.admin.toast_name_required'));
    if (!form.amountUsd || isNaN(parseFloat(form.amountUsd))) return toast.error(t('transparency.admin.toast_invalid_amount'));
    setSaving(true);
    try {
      const url    = editId ? `/api/admin/transparency/${editId}` : '/api/admin/transparency';
      const method = editId ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify({
          ...form,
          amountUsd: parseFloat(form.amountUsd),
          amountOriginal: form.amountOriginal ? parseFloat(form.amountOriginal) : null,
          fxRateUsd: form.fxRateUsd ? parseFloat(form.fxRateUsd) : null,
          entryDate: form.entryDate || null,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success(editId ? t('transparency.admin.toast_updated') : t('transparency.admin.toast_created'));
        setShowForm(false);
        load();
      } else {
        toast.error(d.message || t('transparency.admin.toast_error'));
      }
    } catch {
      toast.error(t('transparency.admin.toast_error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(entry) {
    try {
      const r = await fetch(`/api/admin/transparency/${entry.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: jsonHeaders(),
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      const d = await r.json();
      if (d.ok) load();
      else toast.error(d.message || t('transparency.admin.toast_error'));
    } catch {
      toast.error(t('transparency.admin.toast_error'));
    }
  }

  async function handleDelete(id) {
    try {
      const r = await fetch(`/api/admin/transparency/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: jsonHeaders(),
      });
      const d = await r.json();
      if (d.ok) {
        toast.success(t('transparency.admin.toast_deleted'));
        setConfirmDelete(null);
        load();
      } else {
        toast.error(d.message || t('transparency.admin.toast_error'));
      }
    } catch {
      toast.error(t('transparency.admin.toast_error'));
    }
  }

  // ── Category helpers ───────────────────────────────────────────────────────

  function getCatLabel(entry) {
    if (entry.type === 'income') return t(`transparency.income_category.${entry.incomeCategory}`, entry.incomeCategory || '');
    return t(`transparency.category.${entry.category}`, entry.category || '');
  }

  function getPeriodLabel(v) {
    return t(`transparency.period.${v}`, v);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6" data-testid="admin-transparency">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Eye className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">
              {t('transparency.admin.title')}
            </h1>
            <p className="text-xs text-gray-500">
              {t('transparency.admin.entries_count_other', { count: entries.length })}
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
          data-testid="new-entry-btn"
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> {t('transparency.admin.new_entry')}
        </button>
      </div>

      {/* On-chain wallet (Polygon) — same address shown on public /transparency when set */}
      <div
        className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 space-y-4"
        data-testid="admin-transparency-wallet"
      >
        <div className="flex items-start gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                {t('transparency.admin.wallet_section_title')}
              </h2>
              <p className="text-[11px] text-gray-500 max-w-xl mt-0.5">{t('transparency.admin.wallet_section_subtitle')}</p>
            </div>
          </div>
          <a
            href="https://polygonscan.com/apis"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500/80 hover:text-emerald-400 uppercase tracking-widest"
          >
            <Link2 className="w-3 h-3" aria-hidden="true" /> Polygonscan API
          </a>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
            className={`${inputCls} flex-1 font-mono text-xs`}
            placeholder={t('transparency.admin.wallet_placeholder')}
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            disabled={walletSaving}
            onClick={saveWalletSettings}
            className="px-4 py-2 rounded-xl bg-emerald-600/30 border border-emerald-500/40 hover:bg-emerald-600/40 text-emerald-200 text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            {walletSaving ? t('transparency.admin.saving') : t('transparency.admin.wallet_save')}
          </button>
          <button
            type="button"
            disabled={activityLoading}
            onClick={refreshWalletActivity}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activityLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('transparency.admin.wallet_refresh_chain')}
          </button>
        </div>
        {activity?.summary ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                {t('transparency.admin.wallet_in_pol')}
              </p>
              <p className="text-lg font-black text-white tabular-nums mt-1">
                {Number(activity.summary.totalInPol || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} POL
              </p>
              {activity.summary.totalInUsd != null ? <p className="text-xs text-slate-400 mt-1">~ ${Number(activity.summary.totalInUsd).toFixed(2)}</p> : null}
            </div>
            <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-amber-400" aria-hidden="true" />
                {t('transparency.admin.wallet_out_pol')}
              </p>
              <p className="text-lg font-black text-white tabular-nums mt-1">
                {Number(activity.summary.totalOutPol || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} POL
              </p>
              {activity.summary.totalOutUsd != null ? <p className="text-xs text-slate-400 mt-1">~ ${Number(activity.summary.totalOutUsd).toFixed(2)}</p> : null}
            </div>
            <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                {t('transparency.admin.wallet_rows')}
              </p>
              <p className="text-lg font-black text-white tabular-nums mt-1">{activity.summary.movementCount}</p>
            </div>
          </div>
        ) : null}
        {activity?.summary ? (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-600 leading-relaxed">
              {t('transparency.admin.wallet_history_note')}
            </p>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              {t(
                activity.summary.historyMayBeTruncated
                  ? 'transparency.admin.wallet_history_limit_note'
                  : 'transparency.admin.wallet_history_scope_note'
              )}
            </p>
          </div>
        ) : null}
        {activity?.movements?.length ? (
          <div className="overflow-x-auto rounded-xl border border-white/8 max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-950/95 text-[10px] uppercase text-gray-500 font-black tracking-widest">
                <tr>
                  <th className="px-3 py-2">{t('transparency.admin.wallet_col_time')}</th>
                  <th className="px-3 py-2">{t('transparency.admin.wallet_col_dir')}</th>
                  <th className="px-3 py-2">{t('transparency.admin.wallet_col_counter')}</th>
                  <th className="px-3 py-2 text-right">{t('transparency.admin.wallet_col_amount')}</th>
                  <th className="px-3 py-2">{t('transparency.admin.wallet_col_tx')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {activity.movements.map((m) => (
                  <tr key={`${m.hash}-${m.direction}-${m.timeStamp}-${m.valueWei}`} className="hover:bg-white/5">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {m.timeStamp ? new Date(m.timeStamp * 1000).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={m.direction === 'in' ? 'text-emerald-400' : 'text-amber-400'}>
                        {m.direction === 'in' ? t('transparency.admin.wallet_dir_in') : t('transparency.admin.wallet_dir_out')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 break-all max-w-[140px]">{m.counterparty || '—'}</td>
                    <td className="px-3 py-2 text-right text-white whitespace-nowrap">
                      {Number(m.valuePol || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`https://polygonscan.com/tx/${m.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {String(m.hash).slice(0, 10)}… <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xs font-black text-sky-400 uppercase tracking-widest">Carteiras rastreadas</h2>
            <p className="text-[11px] text-gray-500 max-w-3xl mt-0.5">
              Use várias carteiras para consolidar total depositado, total enviado e a visão pública de tesouraria.
            </p>
          </div>
          <button
            type="button"
            disabled={trackedWalletLoading}
            onClick={refreshTrackedWalletActivity}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase tracking-widest disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${trackedWalletLoading ? 'animate-spin' : ''}`} /> Atualizar totais
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_160px]">
          <input className={inputCls} placeholder="Carteira tesouraria, hot wallet..." value={trackedWalletForm.label} onChange={(e) => setTrackedWalletForm((f) => ({ ...f, label: e.target.value }))} />
          <input className={`${inputCls} font-mono text-xs`} placeholder="0x..." value={trackedWalletForm.address} onChange={(e) => setTrackedWalletForm((f) => ({ ...f, address: e.target.value }))} />
          <input className={inputCls} placeholder="POL" value={trackedWalletForm.assetSymbol} onChange={(e) => setTrackedWalletForm((f) => ({ ...f, assetSymbol: e.target.value }))} />
          <input className={inputCls} type="number" min="0" value={trackedWalletForm.sortOrder} onChange={(e) => setTrackedWalletForm((f) => ({ ...f, sortOrder: e.target.value }))} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={trackedWalletForm.includeInTotals} onChange={(e) => setTrackedWalletForm((f) => ({ ...f, includeInTotals: e.target.checked }))} />
            entra nos totais
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={trackedWalletForm.isPublic} onChange={(e) => setTrackedWalletForm((f) => ({ ...f, isPublic: e.target.checked }))} />
            visível no portal
          </label>
          <button
            type="button"
            disabled={trackedWalletSaving}
            onClick={saveTrackedWallet}
            className="px-4 py-2 rounded-xl bg-sky-600/30 border border-sky-500/40 hover:bg-sky-600/40 text-sky-100 text-xs font-black uppercase tracking-widest disabled:opacity-50"
          >
            {trackedWalletSaving ? 'Salvando...' : 'Adicionar carteira'}
          </button>
        </div>

        {trackedWalletActivity?.summary ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total recebido</p>
                <p className="text-lg font-black text-white mt-1">{Number(trackedWalletActivity.summary.totalInPol || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} POL</p>
                {trackedWalletActivity.summary.totalInUsd != null ? <p className="text-xs text-slate-400 mt-1">~ ${Number(trackedWalletActivity.summary.totalInUsd).toFixed(2)}</p> : null}
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total enviado</p>
                <p className="text-lg font-black text-white mt-1">{Number(trackedWalletActivity.summary.totalOutPol || 0).toLocaleString('en-US', { maximumFractionDigits: 6 })} POL</p>
                {trackedWalletActivity.summary.totalOutUsd != null ? <p className="text-xs text-slate-400 mt-1">~ ${Number(trackedWalletActivity.summary.totalOutUsd).toFixed(2)}</p> : null}
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Carteiras</p>
                <p className="text-lg font-black text-white mt-1">{trackedWalletActivity.summary.walletCount}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Movimentos</p>
                <p className="text-lg font-black text-white mt-1">{trackedWalletActivity.summary.movementCount}</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              {trackedWalletActivity.summary.historyMayBeTruncated
                ? 'Totais consolidados usam o histórico de transações normais até o teto de 10.000 registros da API por carteira.'
                : 'Totais consolidados usam o histórico completo de transações normais de cada carteira rastreada.'}
            </p>
          </div>
        ) : null}

        {trackedWallets.length > 0 ? (
          <div className="space-y-3">
            {trackedWallets.map((wallet) => (
              <div key={wallet.id} className="flex flex-col gap-3 rounded-xl border border-white/8 bg-black/20 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">{wallet.label}</p>
                  <p className="font-mono text-xs text-slate-400 break-all">{wallet.address}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{wallet.chain} · {wallet.assetSymbol} · ordem {wallet.sortOrder}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${wallet.includeInTotals ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>Totais</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${wallet.isPublic ? 'bg-sky-500/10 text-sky-300' : 'bg-slate-800 text-slate-400'}`}>Público</span>
                  <button type="button" onClick={() => removeTrackedWallet(wallet.id)} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 text-[10px] font-bold uppercase tracking-widest">Remover</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border border-primary/20 bg-primary/3 p-6 space-y-4" data-testid="entry-form">
          <h2 className="text-xs font-black text-primary uppercase tracking-widest mb-2">
            {editId ? t('transparency.admin.edit_entry') : t('transparency.admin.new_entry')}
          </h2>

          {/* Type toggle: Expense / Income */}
          <div className="flex gap-2 mb-2" role="group" aria-label={t('transparency.admin.field_type')}>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: 'expense' }))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${
                form.type === 'expense'
                  ? 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'bg-white/5 border-white/8 text-gray-500 hover:text-gray-300'
              }`}
              aria-pressed={form.type === 'expense'}
            >
              <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" /> {t('transparency.admin.expense')}
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, type: 'income' }))}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-colors ${
                form.type === 'income'
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-white/5 border-white/8 text-gray-500 hover:text-gray-300'
              }`}
              aria-pressed={form.type === 'income'}
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> {t('transparency.admin.income')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Category / Income Category selector */}
            {form.type === 'expense' ? (
              <Field label={t('transparency.admin.field_category')}>
                <select
                  className={inputCls}
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>
                      {t(`transparency.category.${c.value}`, c.value)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label={t('transparency.admin.field_income_category')}>
                <select
                  className={inputCls}
                  value={form.incomeCategory}
                  onChange={e => setForm(f => ({ ...f, incomeCategory: e.target.value }))}
                >
                  {INCOME_CATEGORIES.map(v => (
                    <option key={v} value={v}>
                      {t(`transparency.income_category.${v}`, v)}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label={t('transparency.admin.field_name')}>
              <input
                className={inputCls}
                placeholder={form.type === 'expense'
                  ? t('transparency.admin.placeholder_expense_name')
                  : t('transparency.admin.placeholder_income_name')}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                data-testid="input-name"
              />
            </Field>

            <Field label={t('transparency.admin.field_amount')}>
              <input
                className={inputCls}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amountUsd}
                onChange={e => setForm(f => ({ ...f, amountUsd: e.target.value }))}
                data-testid="input-amount"
              />
            </Field>

            <Field label="Valor original">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="0.00000001"
                placeholder="0.00"
                value={form.amountOriginal}
                onChange={e => setForm(f => ({ ...f, amountOriginal: e.target.value }))}
              />
            </Field>

            <Field label="Moeda">
              <input
                className={inputCls}
                placeholder="USD, POL, BRL..."
                value={form.currencyCode}
                onChange={e => setForm(f => ({ ...f, currencyCode: e.target.value.toUpperCase() }))}
              />
            </Field>

            <Field label="Taxa para USD">
              <input
                className={inputCls}
                type="number"
                min="0"
                step="0.00000001"
                placeholder="1.00"
                value={form.fxRateUsd}
                onChange={e => setForm(f => ({ ...f, fxRateUsd: e.target.value }))}
              />
            </Field>

            <Field label={t('transparency.admin.field_period')}>
              <select
                className={inputCls}
                value={form.period}
                onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
              >
                {PERIODS.map(p => (
                  <option key={p} value={p}>{t(`transparency.period.${p}`, p)}</option>
                ))}
              </select>
            </Field>

            <Field label={t('transparency.admin.field_provider')}>
              <input
                className={inputCls}
                placeholder={form.type === 'expense'
                  ? t('transparency.admin.placeholder_provider_expense')
                  : t('transparency.admin.placeholder_provider_income')}
                value={form.provider}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
              />
            </Field>

            <Field label="Data da entrada">
              <input
                className={inputCls}
                type="date"
                value={form.entryDate}
                onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))}
              />
            </Field>

            <Field label={t('transparency.admin.field_provider_url')}>
              <input
                className={inputCls}
                placeholder="https://..."
                value={form.providerUrl}
                onChange={e => setForm(f => ({ ...f, providerUrl: e.target.value }))}
              />
            </Field>

            <Field label={t('transparency.admin.field_description')}>
              <input
                className={inputCls}
                placeholder={t('transparency.admin.placeholder_description')}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </Field>

            <Field label="Link de referência">
              <input
                className={inputCls}
                placeholder="https://..."
                value={form.referenceUrl}
                onChange={e => setForm(f => ({ ...f, referenceUrl: e.target.value }))}
              />
            </Field>

            <Field label={t('transparency.admin.field_notes')}>
              <input
                className={inputCls}
                placeholder={t('transparency.admin.placeholder_notes')}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </Field>

            <Field label="Direção">
              <select className={inputCls} value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
              </select>
            </Field>

            <Field label="Blockchain">
              <select className={inputCls} value={form.blockchain} onChange={e => setForm(f => ({ ...f, blockchain: e.target.value }))}>
                <option value="polygon">Polygon</option>
              </select>
            </Field>

            <Field label="Carteira">
              <input
                className={`${inputCls} font-mono text-xs`}
                placeholder="0x..."
                value={form.walletAddress}
                onChange={e => setForm(f => ({ ...f, walletAddress: e.target.value }))}
              />
            </Field>

            <Field label="Hash da transação">
              <input
                className={`${inputCls} font-mono text-xs`}
                placeholder="0x..."
                value={form.txHash}
                onChange={e => setForm(f => ({ ...f, txHash: e.target.value }))}
              />
            </Field>

            <Field label={t('transparency.admin.field_order')}>
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
              />
            </Field>
          </div>

          {/* Image upload */}
          <Field label={t('transparency.admin.field_image')}>
            <div className="flex gap-2">
              <input
                className={inputCls + ' flex-1'}
                placeholder={t('transparency.admin.field_image_placeholder')}
                value={form.imageUrl}
                onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                data-testid="input-image-url"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/8 border border-white/12 hover:bg-white/15 text-gray-300 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                aria-label={t('transparency.admin.upload')}
              >
                {uploading
                  ? <div className="w-3.5 h-3.5 border border-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                  : <Upload className="w-3.5 h-3.5" aria-hidden="true" />}
                {uploading ? t('transparency.admin.uploading') : t('transparency.admin.upload')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-hidden="true"
                onChange={e => handleImageUpload(e.target.files[0])}
              />
            </div>
            {form.imageUrl && (
              <div className="mt-2 flex items-start gap-2">
                <img
                  src={form.imageUrl}
                  alt="preview"
                  className="h-16 w-auto rounded-lg border border-white/10 object-cover"
                  onError={e => { e.currentTarget.style.display = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, imageUrl: '' }))}
                  className="p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                  aria-label="Remove image"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </Field>

          {/* Checkboxes */}
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary"
                checked={form.isPaid}
                onChange={e => setForm(f => ({ ...f, isPaid: e.target.checked }))}
                data-testid="check-paid"
              />
              <span className="text-xs text-gray-400">{t('transparency.admin.check_paid')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary"
                checked={form.isActive}
                onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
                data-testid="check-active"
              />
              <span className="text-xs text-gray-400">{t('transparency.admin.check_visible')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="accent-primary"
                checked={form.isOnChain}
                onChange={e => setForm(f => ({ ...f, isOnChain: e.target.checked }))}
              />
              <span className="text-xs text-gray-400">Vinculado a carteira / tx</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-primary/20 border border-primary/30 hover:bg-primary/30 text-primary rounded-xl text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
              data-testid="btn-save"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              {saving ? t('transparency.admin.saving') : t('transparency.admin.save')}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/8 hover:bg-white/10 text-gray-400 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" /> {t('transparency.admin.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16" role="status" aria-label="Loading">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/2 p-10 text-center text-gray-500 text-sm">
          {t('transparency.no_entries')}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 overflow-hidden" data-testid="entries-table">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/8 bg-white/2">
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('transparency.admin.col_name')}</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest hidden md:table-cell">{t('transparency.admin.col_provider')}</th>
                <th className="px-4 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('transparency.admin.col_amount')}</th>
                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest hidden lg:table-cell">Moeda / chain</th>
                <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest hidden sm:table-cell">{t('transparency.admin.col_paid')}</th>
                <th className="px-4 py-3 text-center text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('transparency.admin.col_public')}</th>
                <th className="px-4 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">{t('transparency.admin.col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr
                  key={entry.id}
                  className={`border-b border-white/5 hover:bg-white/3 transition-colors ${!entry.isActive ? 'opacity-50' : ''}`}
                  data-testid="entry-row"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {entry.imageUrl
                        ? <img src={entry.imageUrl} alt={entry.name} className="w-7 h-7 rounded-lg object-cover border border-white/10 shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        : <ImageIcon className="w-5 h-5 text-gray-700 shrink-0" aria-hidden="true" />}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-white">{entry.name}</p>
                          {entry.type === 'income'
                            ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 uppercase tracking-wider">{t('transparency.admin.badge_income')}</span>
                            : <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 uppercase tracking-wider">{t('transparency.admin.badge_expense')}</span>}
                        </div>
                        <p className="text-[11px] text-gray-500">{getCatLabel(entry)}{entry.description ? ` — ${entry.description}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {entry.provider ? (
                      entry.providerUrl
                        ? <a href={entry.providerUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                            {entry.provider} <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          </a>
                        : <span className="text-xs text-gray-400">{entry.provider}</span>
                    ) : <span className="text-xs text-gray-600">&#8212;</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-black text-white text-sm">{fmt(entry.amountUsd)}</span>
                    <span className="text-[11px] text-gray-500 ml-1">/{getPeriodLabel(entry.period)}</span>
                    {entry.amountOriginal != null ? (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {Number(entry.amountOriginal).toLocaleString('en-US', { maximumFractionDigits: 8 })} {entry.currencyCode || 'USD'}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="space-y-1 text-[11px]">
                      <div className="text-slate-400">{entry.currencyCode || 'USD'}{entry.fxRateUsd ? ` · fx ${Number(entry.fxRateUsd).toLocaleString('en-US', { maximumFractionDigits: 6 })}` : ''}</div>
                      <div className={entry.isOnChain ? 'text-sky-300' : 'text-slate-600'}>
                        {entry.isOnChain ? `${entry.blockchain || 'polygon'}${entry.direction ? ` · ${entry.direction}` : ''}` : 'manual / off-chain'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className={`text-[11px] font-bold ${entry.isPaid ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {entry.isPaid ? t('transparency.admin.yes') : t('transparency.admin.no')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(entry)}
                      aria-label={entry.isActive ? 'Hide entry' : 'Publish entry'}
                    >
                      {entry.isActive
                        ? <ToggleRight className="w-5 h-5 text-emerald-400 mx-auto" aria-hidden="true" />
                        : <ToggleLeft  className="w-5 h-5 text-gray-600 mx-auto"   aria-hidden="true" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(entry)}
                        aria-label="Edit entry"
                        className="p-1.5 rounded-lg hover:bg-white/8 text-gray-400 hover:text-white transition-colors"
                        data-testid="btn-edit"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      {confirmDelete === entry.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            aria-label="Confirm delete"
                            className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                            data-testid="btn-confirm-delete"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            aria-label="Cancel delete"
                            className="p-1.5 rounded-lg hover:bg-white/8 text-gray-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(entry.id)}
                          aria-label="Delete entry"
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                          data-testid="btn-delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
