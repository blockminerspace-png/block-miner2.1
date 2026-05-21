import { useState, useEffect, useCallback, useMemo, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, X, Save, CalendarRange, Loader2 } from 'lucide-react';
import { api } from '../../store/auth';
import {
  normalizeCheckinRewardType,
  type CheckinRewardType,
} from '../checkin/checkinMilestoneI18n';

const ALLOWED_REWARD_TYPES: CheckinRewardType[] = ['pol', 'temporary_power', 'machine'];

function milestoneErrMessage(errLike: unknown, t: TFunction, fallbackKey: string): string {
  const o =
    typeof errLike === 'object' && errLike !== null
      ? (errLike as Record<string, unknown>)
      : null;
  const response = o && 'response' in o ? (o.response as Record<string, unknown> | undefined) : undefined;
  const data =
    (response && typeof response === 'object' && response !== null && 'data' in response
      ? (response.data as Record<string, unknown> | undefined)
      : undefined) ??
    (o && 'data' in o ? (o.data as Record<string, unknown> | undefined) : undefined);
  if (data && typeof data === 'object') {
    if (data.code === 'MILESTONE_DB_PENDING') return t('adminCheckinMilestones.toast_migration_pending');
    if (typeof data.message === 'string') return data.message;
  }
  return t(fallbackKey);
}

type CheckinMilestoneForm = {
  dayThreshold: number | string;
  rewardType: CheckinRewardType;
  rewardValue: number | string;
  durationHours: number | string;
  minerId: number | string;
  active: boolean;
  sortOrder: number | string;
};

const EMPTY: CheckinMilestoneForm = {
  dayThreshold: 7,
  rewardType: 'pol',
  rewardValue: 0.05,
  durationHours: 24,
  minerId: '',
  active: true,
  sortOrder: 0,
};

type CatalogMiner = {
  id: number;
  name: string;
  baseHashRate: number;
  isActive: boolean;
  isArchived: boolean;
};

type CheckinMilestoneRow = {
  id: number;
  dayThreshold: number;
  rewardType?: string | null;
  rewardValue?: unknown;
  validityDays?: number | null;
  minerId?: number | null;
  minerName?: string | null;
  metadataJson?: { durationHours?: number } | null;
  active?: boolean;
  sortOrder?: number | null;
};

type CheckinMilestonesListResponse = { ok: true; milestones?: CheckinMilestoneRow[] } | { ok: false; message?: string };

type MinersListResponse = {
  ok?: boolean;
  miners?: CatalogMiner[];
};

function isInvalidAdminRewardType(raw: string | null | undefined): boolean {
  const n = normalizeCheckinRewardType(raw);
  return n === 'unavailable' || n === 'unknown';
}

function readDurationHours(row: CheckinMilestoneRow): number {
  const meta = row.metadataJson;
  const h = Number(meta?.durationHours);
  if (Number.isFinite(h) && h > 0) return h;
  return Math.max(1, Number(row.validityDays || 1)) * 24;
}

function formatAdminSummary(row: CheckinMilestoneRow, t: TFunction): string {
  const day = row.dayThreshold;
  const raw = String(row.rewardType || '');
  if (isInvalidAdminRewardType(raw)) {
    return t('adminCheckinMilestones.summary.invalid', { day, type: raw || '?' });
  }
  const type = normalizeCheckinRewardType(raw);
  if (type === 'pol') {
    return t('adminCheckinMilestones.summary.pol', {
      day,
      amount: Number(row.rewardValue || 0),
    });
  }
  if (type === 'temporary_power') {
    return t('adminCheckinMilestones.summary.temporaryPower', {
      day,
      power: Number(row.rewardValue || 0),
      hours: readDurationHours(row),
    });
  }
  return t('adminCheckinMilestones.summary.machine', {
    day,
    name: row.minerName || `#${row.minerId ?? '?'}`,
  });
}

function rewardTypeLabel(type: CheckinRewardType, t: TFunction): string {
  if (type === 'pol') return t('adminCheckinMilestones.rewardTypes.pol');
  if (type === 'temporary_power') return t('adminCheckinMilestones.rewardTypes.temporaryPower');
  return t('adminCheckinMilestones.rewardTypes.machine');
}

export default function AdminCheckinMilestones() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<CheckinMilestoneRow[]>([]);
  const [miners, setMiners] = useState<CatalogMiner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<CheckinMilestoneForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const activeMiners = useMemo(
    () => miners.filter((m) => m.isActive && !m.isArchived),
    [miners],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [milestonesRes, minersRes] = await Promise.all([
        api.get<CheckinMilestonesListResponse>('/admin/checkin-milestones'),
        api.get<MinersListResponse>('/admin/miners', { params: { filter: 'active', limit: 200, page: 1 } }),
      ]);
      if (milestonesRes.data.ok) setRows(milestonesRes.data.milestones || []);
      if (minersRes.data?.ok !== false && minersRes.data.miners) {
        setMiners(minersRes.data.miners);
      }
    } catch (e: unknown) {
      toast.error(milestoneErrMessage(e, t, 'adminCheckinMilestones.toast_load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = <K extends keyof CheckinMilestoneForm>(k: K, v: CheckinMilestoneForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const startCreate = () => {
    setEditingId('new');
    setForm(EMPTY);
  };

  const startEdit = (m: CheckinMilestoneRow) => {
    const normalized = normalizeCheckinRewardType(m.rewardType);
    const rewardType: CheckinRewardType = ALLOWED_REWARD_TYPES.includes(normalized as CheckinRewardType)
      ? (normalized as CheckinRewardType)
      : 'pol';
    setEditingId(m.id);
    setForm({
      dayThreshold: m.dayThreshold,
      rewardType,
      rewardValue: Number(m.rewardValue || 0),
      durationHours: readDurationHours(m),
      minerId: m.minerId ?? '',
      active: m.active !== false,
      sortOrder: m.sortOrder ?? 0,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        dayThreshold: Number(form.dayThreshold),
        rewardType: form.rewardType,
        rewardValue: Number(form.rewardValue),
        active: form.active,
        sortOrder: Number(form.sortOrder),
      };
      if (form.rewardType === 'temporary_power') {
        body.durationHours = Number(form.durationHours);
      }
      if (form.rewardType === 'machine') {
        body.minerId = Number(form.minerId);
      }
      if (editingId === 'new') {
        const res = await api.post<{ ok?: boolean }>('/admin/checkin-milestones', body);
        if (!res.data?.ok) {
          toast.error(milestoneErrMessage({ data: res.data }, t, 'adminCheckinMilestones.toast_save_error'));
          return;
        }
        toast.success(t('adminCheckinMilestones.toast_created'));
      } else if (editingId != null) {
        const res = await api.put<{ ok?: boolean }>(`/admin/checkin-milestones/${editingId}`, body);
        if (!res.data?.ok) {
          toast.error(milestoneErrMessage({ data: res.data }, t, 'adminCheckinMilestones.toast_save_error'));
          return;
        }
        toast.success(t('adminCheckinMilestones.toast_updated'));
      }
      cancelEdit();
      await load();
    } catch (e: unknown) {
      toast.error(milestoneErrMessage(e, t, 'adminCheckinMilestones.toast_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('adminCheckinMilestones.confirm_delete'))) return;
    try {
      await api.delete(`/admin/checkin-milestones/${id}`);
      toast.success(t('adminCheckinMilestones.toast_deleted'));
      if (editingId === id) cancelEdit();
      await load();
    } catch (e: unknown) {
      toast.error(milestoneErrMessage(e, t, 'adminCheckinMilestones.toast_save_error'));
    }
  };

  const showPol = form.rewardType === 'pol';
  const showPower = form.rewardType === 'temporary_power';
  const showMachine = form.rewardType === 'machine';

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center">
            <CalendarRange className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">{t('adminCheckinMilestones.title')}</h1>
            <p className="text-sm text-slate-500">{t('adminCheckinMilestones.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={editingId === 'new'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> {t('adminCheckinMilestones.new')}
        </button>
      </div>

      {editingId ? (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">
              {editingId === 'new' ? t('adminCheckinMilestones.new') : t('adminCheckinMilestones.edit')}
            </h2>
            <button type="button" onClick={cancelEdit} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">{t('adminCheckinMilestones.fields.dayThreshold')} *</span>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                value={form.dayThreshold}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setField('dayThreshold', e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">{t('adminCheckinMilestones.fields.rewardType')} *</span>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                value={form.rewardType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setField('rewardType', e.target.value as CheckinRewardType)
                }
              >
                {ALLOWED_REWARD_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {rewardTypeLabel(rt, t)}
                  </option>
                ))}
              </select>
            </label>
            {showPol ? (
              <label className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">{t('adminCheckinMilestones.fields.polAmount')} *</span>
                <input
                  type="number"
                  step="any"
                  min={0}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  value={form.rewardValue}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setField('rewardValue', e.target.value)}
                />
              </label>
            ) : null}
            {showPower ? (
              <>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{t('adminCheckinMilestones.fields.powerAmount')} *</span>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    value={form.rewardValue}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setField('rewardValue', e.target.value)}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{t('adminCheckinMilestones.fields.durationHours')} *</span>
                  <input
                    type="number"
                    min={1}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    value={form.durationHours}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setField('durationHours', e.target.value)}
                  />
                </label>
              </>
            ) : null}
            {showMachine ? (
              <label className="space-y-1 md:col-span-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase">{t('adminCheckinMilestones.fields.machine')} *</span>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  value={form.minerId}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setField('minerId', e.target.value)}
                >
                  <option value="">{t('adminCheckinMilestones.fields.selectMachine')}</option>
                  {activeMiners.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {Number(m.baseHashRate).toLocaleString()} H/s
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">{t('adminCheckinMilestones.fields.sortOrder')}</span>
              <input
                type="number"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                value={form.sortOrder}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setField('sortOrder', e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setField('active', e.target.checked)}
              />
              <span className="text-sm text-slate-300">{t('adminCheckinMilestones.fields.active')}</span>
            </label>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('adminCheckinMilestones.save')}
          </button>
        </div>
      ) : null}

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" /> {t('adminCheckinMilestones.loading')}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-slate-500">{t('adminCheckinMilestones.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-widest text-slate-500">
                <th className="p-4">{t('adminCheckinMilestones.col_day')}</th>
                <th className="p-4">{t('adminCheckinMilestones.col_type')}</th>
                <th className="p-4">{t('adminCheckinMilestones.col_summary')}</th>
                <th className="p-4">{t('adminCheckinMilestones.col_active')}</th>
                <th className="p-4 w-28">{t('adminCheckinMilestones.col_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const invalid = isInvalidAdminRewardType(m.rewardType);
                const typeNorm = normalizeCheckinRewardType(m.rewardType);
                return (
                  <tr key={m.id} className="border-b border-slate-800/80 hover:bg-slate-800/30">
                    <td className="p-4 font-mono text-amber-400">{m.dayThreshold}</td>
                    <td className="p-4 text-slate-300">
                      {invalid
                        ? t('adminCheckinMilestones.invalid_type')
                        : rewardTypeLabel(
                            ALLOWED_REWARD_TYPES.includes(typeNorm as CheckinRewardType)
                              ? (typeNorm as CheckinRewardType)
                              : 'pol',
                            t,
                          )}
                    </td>
                    <td className="p-4 text-slate-300 max-w-[320px] truncate">{formatAdminSummary(m, t)}</td>
                    <td className="p-4">{m.active ? t('adminCheckinMilestones.yes') : t('adminCheckinMilestones.no')}</td>
                    <td className="p-4 flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-amber-400"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(m.id)}
                        className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
