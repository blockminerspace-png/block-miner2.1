import { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, X, Save, CalendarRange, Loader2 } from 'lucide-react';
import { api } from '../../store/auth';

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
  rewardType: string;
  rewardValue: number | string;
  validityDays: number | string;
  displayTitle: string;
  description: string;
  active: boolean;
  sortOrder: number | string;
};

const EMPTY: CheckinMilestoneForm = {
  dayThreshold: 7,
  rewardType: 'pol',
  rewardValue: 0,
  validityDays: 7,
  displayTitle: '',
  description: '',
  active: true,
  sortOrder: 0,
};

type CheckinMilestoneRow = {
  id: number;
  dayThreshold: number;
  rewardType?: string | null;
  rewardValue?: unknown;
  validityDays?: number | null;
  displayTitle?: string | null;
  description?: string | null;
  active?: boolean;
  sortOrder?: number | null;
};

type CheckinMilestonesListResponse = { ok: true; milestones?: CheckinMilestoneRow[] } | { ok: false; message?: string };

export default function AdminCheckinMilestones() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<CheckinMilestoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<CheckinMilestoneForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<CheckinMilestonesListResponse>('/admin/checkin-milestones');
      if (res.data.ok) setRows(res.data.milestones || []);
    } catch (e: unknown) {
      toast.error(milestoneErrMessage(e, t, 'adminCheckinMilestones.toast_load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (k: keyof CheckinMilestoneForm, v: string | number | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const startCreate = () => {
    setEditingId('new');
    setForm(EMPTY);
  };

  const startEdit = (m: CheckinMilestoneRow) => {
    setEditingId(m.id);
    setForm({
      dayThreshold: m.dayThreshold,
      rewardType: m.rewardType || 'none',
      rewardValue: Number(m.rewardValue || 0),
      validityDays: m.validityDays ?? 7,
      displayTitle: m.displayTitle || '',
      description: m.description || '',
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
      const body = {
        ...form,
        dayThreshold: Number(form.dayThreshold),
        rewardValue: Number(form.rewardValue),
        validityDays: Number(form.validityDays),
        sortOrder: Number(form.sortOrder),
      };
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

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 flex items-center justify-center">
            <CalendarRange className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Check-in — Marcos de sequência</h1>
            <p className="text-sm text-slate-500">
              Recompensas por dias consecutivos; o servidor aplica após check-in confirmado (uma vez por marco).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={editingId === 'new'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> Novo marco
        </button>
      </div>

      {editingId && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white">{editingId === 'new' ? 'Novo marco' : 'Editar marco'}</h2>
            <button type="button" onClick={cancelEdit} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Dia (limiar) *</span>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                value={form.dayThreshold}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setField('dayThreshold', e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Tipo *</span>
              <select
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                value={form.rewardType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setField('rewardType', e.target.value)}
              >
                <option value="pol">POL</option>
                <option value="hashrate">Hashrate (H/s temporário)</option>
                <option value="none">Nenhum (só marco)</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Valor</span>
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
              <span className="text-[10px] font-bold text-slate-500 uppercase">Validade (dias) — hashrate</span>
              <input
                type="number"
                min={1}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                value={form.validityDays}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setField('validityDays', e.target.value)}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Título (UI)</span>
              <input
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                value={form.displayTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setField('displayTitle', e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Descrição</span>
              <textarea
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white resize-none"
                value={form.description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setField('description', e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Ordem</span>
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
              <span className="text-sm text-slate-300">Ativo</span>
            </label>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      )}

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" /> A carregar…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-slate-500">Sem marcos. Cria um ou corre o seed da base de dados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[10px] uppercase tracking-widest text-slate-500">
                <th className="p-4">Dia</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Título</th>
                <th className="p-4">Ativo</th>
                <th className="p-4 w-28">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/80 hover:bg-slate-800/30">
                  <td className="p-4 font-mono text-amber-400">{m.dayThreshold}</td>
                  <td className="p-4 text-slate-300">{m.rewardType}</td>
                  <td className="p-4 text-slate-400">{Number(m.rewardValue)}</td>
                  <td className="p-4 text-slate-300 truncate max-w-[200px]">{m.displayTitle || '—'}</td>
                  <td className="p-4">{m.active ? 'Sim' : 'Não'}</td>
                  <td className="p-4 flex gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-amber-400"
                      title="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(m.id)}
                      className="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-red-400"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
