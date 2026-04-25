import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Users,
  BookOpen
} from 'lucide-react';
import { api } from '../store/auth';

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s) {
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function errMessage(errLike, t, fallbackKey) {
  const d = errLike?.response?.data ?? errLike?.data;
  if (d?.code === 'READ_EARN_DB_PENDING') return t('adminReadEarn.migration_pending');
  if (d?.message) return d.message;
  return t(fallbackKey);
}

function defaultForm() {
  const now = new Date();
  const later = new Date(now.getTime() + 30 * 86400000);
  return {
    title: '',
    partnerUrl: 'https://',
    rewardCode: '',
    rewardType: 'blk',
    rewardAmount: 1,
    rewardMinerId: '',
    hashrateValidityDays: 7,
    startsAt: toLocalInput(now.toISOString()),
    expiresAt: toLocalInput(later.toISOString()),
    maxRedemptions: '',
    sortOrder: 0,
    isActive: true
  };
}

export default function AdminReadEarn() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [miners, setMiners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [redemptionsCampaign, setRedemptionsCampaign] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionsTotal, setRedemptionsTotal] = useState(0);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, mRes] = await Promise.all([
        api.get('/admin/read-earn/campaigns'),
        api.get('/admin/miners')
      ]);
      if (cRes.data?.ok) setRows(cRes.data.campaigns || []);
      else toast.error(errMessage({ data: cRes.data }, t, 'adminReadEarn.load_error'));
      if (mRes.data?.ok) setMiners(mRes.data.miners || []);
    } catch (e) {
      toast.error(errMessage(e, t, 'adminReadEarn.load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const startCreate = () => {
    setEditingId('new');
    setForm(defaultForm());
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      partnerUrl: row.partnerUrl,
      rewardCode: '',
      rewardType: row.rewardType || 'blk',
      rewardAmount: Number(row.rewardAmount || 0),
      rewardMinerId: row.rewardMinerId != null ? String(row.rewardMinerId) : '',
      hashrateValidityDays: row.hashrateValidityDays ?? 7,
      startsAt: toLocalInput(row.startsAt),
      expiresAt: toLocalInput(row.expiresAt),
      maxRedemptions: row.maxRedemptions != null ? String(row.maxRedemptions) : '',
      sortOrder: row.sortOrder ?? 0,
      isActive: row.isActive !== false
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(defaultForm());
  };

  const loadRedemptions = async (c) => {
    setRedemptionsCampaign(c);
    setRedemptionsLoading(true);
    try {
      const res = await api.get(`/admin/read-earn/campaigns/${c.id}/redemptions?take=50`);
      if (res.data?.ok) {
        setRedemptions(res.data.redemptions || []);
        setRedemptionsTotal(res.data.total ?? 0);
      } else {
        toast.error(errMessage({ data: res.data }, t, 'adminReadEarn.redemptions_load_error'));
      }
    } catch (e) {
      toast.error(errMessage(e, t, 'adminReadEarn.redemptions_load_error'));
    } finally {
      setRedemptionsLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        partnerUrl: form.partnerUrl.trim(),
        rewardType: form.rewardType,
        rewardAmount: Number(form.rewardAmount),
        hashrateValidityDays: Number(form.hashrateValidityDays),
        startsAt: fromLocalInput(form.startsAt),
        expiresAt: fromLocalInput(form.expiresAt),
        sortOrder: Number(form.sortOrder),
        isActive: form.isActive
      };
      if (form.maxRedemptions !== '' && form.maxRedemptions != null) {
        body.maxRedemptions = Number(form.maxRedemptions);
      } else {
        body.maxRedemptions = null;
      }
      if (form.rewardType === 'machine' && form.rewardMinerId) {
        body.rewardMinerId = Number(form.rewardMinerId);
      } else if (form.rewardType === 'machine') {
        toast.error(t('adminReadEarn.field_miner'));
        setSaving(false);
        return;
      } else {
        body.rewardMinerId = null;
      }

      if (editingId === 'new') {
        if (!form.rewardCode || form.rewardCode.length < 6) {
          toast.error(t('adminReadEarn.field_reward_code_hint'));
          setSaving(false);
          return;
        }
        body.rewardCode = form.rewardCode;
        const res = await api.post('/admin/read-earn/campaigns', body);
        if (!res.data?.ok) {
          toast.error(errMessage({ data: res.data }, t, 'adminReadEarn.toast_save_error'));
          return;
        }
        toast.success(t('adminReadEarn.toast_created'));
      } else {
        if (form.rewardCode && form.rewardCode.length >= 6) {
          body.rewardCode = form.rewardCode;
        }
        const res = await api.put(`/admin/read-earn/campaigns/${editingId}`, body);
        if (!res.data?.ok) {
          toast.error(errMessage({ data: res.data }, t, 'adminReadEarn.toast_save_error'));
          return;
        }
        toast.success(t('adminReadEarn.toast_updated'));
      }
      cancelEdit();
      await load();
    } catch (e) {
      toast.error(errMessage(e, t, 'adminReadEarn.toast_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('adminReadEarn.confirm_delete'))) return;
    try {
      await api.delete(`/admin/read-earn/campaigns/${id}`);
      toast.success(t('adminReadEarn.toast_deleted'));
      if (editingId === id) cancelEdit();
      if (redemptionsCampaign?.id === id) {
        setRedemptionsCampaign(null);
        setRedemptions([]);
      }
      await load();
    } catch (e) {
      toast.error(errMessage(e, t, 'adminReadEarn.toast_delete_error'));
    }
  };

  return (
    <div className="space-y-8 text-slate-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <BookOpen className="w-10 h-10 text-amber-500 shrink-0" />
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">{t('adminReadEarn.title')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('adminReadEarn.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400"
        >
          <Plus className="w-4 h-4" />
          {t('adminReadEarn.create')}
        </button>
      </div>

      {editingId && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">
              {editingId === 'new' ? t('adminReadEarn.create') : t('adminReadEarn.edit')}
            </h2>
            <button type="button" onClick={cancelEdit} className="p-1 text-slate-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 uppercase font-bold">{t('adminReadEarn.field_title')}</span>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
              />
            </label>
            <label className="block space-y-1 md:col-span-2">
              <span className="text-xs text-slate-500 uppercase font-bold">
                {t('adminReadEarn.field_partner_url')}
              </span>
              <input
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.partnerUrl}
                onChange={(e) => setField('partnerUrl', e.target.value)}
              />
            </label>
            <label className="block space-y-1 md:col-span-2">
              <span className="text-xs text-slate-500 uppercase font-bold">
                {t('adminReadEarn.field_reward_code')}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.rewardCode}
                onChange={(e) => setField('rewardCode', e.target.value)}
                placeholder={
                  editingId === 'new'
                    ? t('adminReadEarn.code_new_placeholder')
                    : t('adminReadEarn.code_optional_placeholder')
                }
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 uppercase font-bold">
                {t('adminReadEarn.field_reward_type')}
              </span>
              <select
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.rewardType}
                onChange={(e) => setField('rewardType', e.target.value)}
              >
                <option value="hashrate">{t('adminReadEarn.type_hashrate')}</option>
                <option value="blk">{t('adminReadEarn.type_blk')}</option>
                <option value="machine">{t('adminReadEarn.type_machine')}</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 uppercase font-bold">
                {t('adminReadEarn.field_reward_amount')}
              </span>
              <input
                type="number"
                step="any"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.rewardAmount}
                onChange={(e) => setField('rewardAmount', e.target.value)}
              />
              <span className="text-[10px] text-slate-600">
                {form.rewardType === 'hashrate' && t('adminReadEarn.amount_hashrate_hint')}
                {form.rewardType === 'blk' && t('adminReadEarn.amount_blk_hint')}
                {form.rewardType === 'machine' && t('adminReadEarn.amount_machine_hint')}
              </span>
            </label>
            {form.rewardType === 'machine' && (
              <label className="block space-y-1 md:col-span-2">
                <span className="text-xs text-slate-500 uppercase font-bold">
                  {t('adminReadEarn.field_miner')}
                </span>
                <select
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                  value={form.rewardMinerId}
                  onChange={(e) => setField('rewardMinerId', e.target.value)}
                >
                  <option value="">—</option>
                  {miners
                    .filter((m) => typeof m.id === 'number')
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.id} — {m.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {form.rewardType === 'hashrate' && (
              <label className="block space-y-1">
                <span className="text-xs text-slate-500 uppercase font-bold">
                  {t('adminReadEarn.field_validity_days')}
                </span>
                <input
                  type="number"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                  value={form.hashrateValidityDays}
                  onChange={(e) => setField('hashrateValidityDays', e.target.value)}
                />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 uppercase font-bold">{t('adminReadEarn.field_starts')}</span>
              <input
                type="datetime-local"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.startsAt}
                onChange={(e) => setField('startsAt', e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 uppercase font-bold">{t('adminReadEarn.field_expires')}</span>
              <input
                type="datetime-local"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.expiresAt}
                onChange={(e) => setField('expiresAt', e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 uppercase font-bold">
                {t('adminReadEarn.field_max_redemptions')}
              </span>
              <input
                type="number"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.maxRedemptions}
                onChange={(e) => setField('maxRedemptions', e.target.value)}
                placeholder={t('adminReadEarn.field_max_placeholder')}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-500 uppercase font-bold">{t('adminReadEarn.field_sort')}</span>
              <input
                type="number"
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
                value={form.sortOrder}
                onChange={(e) => setField('sortOrder', e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 md:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setField('isActive', e.target.checked)}
              />
              <span className="text-sm">{t('adminReadEarn.field_active')}</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm"
            >
              {t('adminReadEarn.cancel')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('adminReadEarn.save')}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-500 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">{t('adminReadEarn.table_title')}</th>
                <th className="px-4 py-3">{t('adminReadEarn.table_dates')}</th>
                <th className="px-4 py-3">{t('adminReadEarn.table_type')}</th>
                <th className="px-4 py-3">{t('adminReadEarn.table_redemptions')}</th>
                <th className="px-4 py-3">{t('adminReadEarn.table_active')}</th>
                <th className="px-4 py-3 text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3 font-medium text-white max-w-[200px] truncate">{r.title}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(r.startsAt).toLocaleDateString()} → {new Date(r.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{r.rewardType}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => loadRedemptions(r)}
                      className="inline-flex items-center gap-1 text-amber-500 hover:text-amber-400 text-xs font-bold"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {r.redemptionCount ?? 0}
                    </button>
                  </td>
                  <td className="px-4 py-3">{r.isActive ? '✓' : '—'}</td>
                  <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {redemptionsCampaign && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-500" />
              {t('adminReadEarn.redemptions')}: {redemptionsCampaign.title}
              <span className="text-slate-500 font-normal text-sm">({redemptionsTotal})</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setRedemptionsCampaign(null);
                setRedemptions([]);
              }}
              className="text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {redemptionsLoading ? (
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
          ) : redemptions.length === 0 ? (
            <p className="text-slate-500 text-sm">{t('adminReadEarn.redemptions_empty')}</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto text-sm">
              {redemptions.map((x) => (
                <li
                  key={x.id}
                  className="flex flex-wrap justify-between gap-2 border border-slate-800 rounded-lg px-3 py-2"
                >
                  <span className="text-slate-300">
                    {t('adminReadEarn.user')}: {x.username || x.email || `#${x.userId}`}
                  </span>
                  <span className="text-slate-500 text-xs">
                    {t('adminReadEarn.redeemed_at')}: {new Date(x.redeemedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
