import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';
import { Loader2, ListChecks, Plus, Trash2 } from 'lucide-react';
import { api } from '../store/auth';

const TASK_TYPES = ['LOGIN_DAY', 'MINE_BLK', 'PLAY_GAMES', 'WATCH_YOUTUBE', 'INTERNAL_OFFERWALL'];
const REWARD_KINDS = ['BLK', 'POL', 'HASHRATE_TEMP', 'SHOP_MINER', 'EVENT_MINER'];
const RESET_CADENCES = ['DAILY', 'WEEKLY', 'MONTHLY'];

function defaultCreateForm() {
  return {
    slug: '',
    taskType: 'MINE_BLK',
    resetCadence: 'DAILY',
    targetValue: '0.05',
    translationKey: 'dailyTasks.tasks.custom',
    rewardKind: 'BLK',
    rewardBlkAmount: '0.01',
    rewardPolAmount: '0.01',
    rewardHashRate: '5',
    rewardHashRateDays: '1',
    rewardMinerId: '',
    rewardEventMinerId: '',
    gameSlug: '',
    internalOfferwallOfferId: '',
    sortOrder: '',
    autoSortOrder: true
  };
}

/** @param {Record<string, string>} f */
function buildCreateBody(f) {
  const body = {
    slug: f.slug.trim(),
    taskType: f.taskType,
    resetCadence: f.resetCadence,
    targetValue: parseFloat(String(f.targetValue).replace(',', '.')),
    translationKey: f.translationKey.trim(),
    rewardKind: f.rewardKind,
    autoSortOrder: Boolean(f.autoSortOrder)
  };
  if (!f.autoSortOrder && String(f.sortOrder).trim() !== '') {
    body.sortOrder = parseInt(String(f.sortOrder), 10);
  }
  if (String(f.gameSlug).trim()) body.gameSlug = f.gameSlug.trim();
  if (String(f.internalOfferwallOfferId).trim()) {
    const oid = parseInt(String(f.internalOfferwallOfferId).trim(), 10);
    if (Number.isInteger(oid) && oid >= 1) body.internalOfferwallOfferId = oid;
  }
  if (f.rewardKind === 'BLK') body.rewardBlkAmount = parseFloat(String(f.rewardBlkAmount).replace(',', '.'));
  if (f.rewardKind === 'POL') body.rewardPolAmount = parseFloat(String(f.rewardPolAmount).replace(',', '.'));
  if (f.rewardKind === 'HASHRATE_TEMP') {
    body.rewardHashRate = parseFloat(String(f.rewardHashRate).replace(',', '.'));
    body.rewardHashRateDays = parseInt(String(f.rewardHashRateDays), 10);
  }
  if (f.rewardKind === 'SHOP_MINER') body.rewardMinerId = parseInt(String(f.rewardMinerId), 10);
  if (f.rewardKind === 'EVENT_MINER') body.rewardEventMinerId = parseInt(String(f.rewardEventMinerId), 10);
  return body;
}

export default function AdminDailyTasks() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [orderDraft, setOrderDraft] = useState(/** @type {Record<number, string>} */ ({}));
  const [patching, setPatching] = useState(/** @type {Record<number, boolean>} */ ({}));
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(/** @type {number | null} */ (null));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await api.get('/admin/daily-tasks/definitions');
      if (res.data?.ok) {
        const list = res.data.definitions || [];
        setRows(list);
        setLoadFailed(false);
        const next = {};
        for (const r of list) {
          next[r.id] = String(r.sortOrder ?? 0);
        }
        setOrderDraft(next);
      } else {
        setRows([]);
        setLoadFailed(true);
        toast.error(t('admin_daily_tasks.load_error'));
      }
    } catch (e) {
      setRows([]);
      setLoadFailed(true);
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        if (status === 401) toast.error(t('admin_daily_tasks.error_unauthorized'));
        else if (status != null && status >= 500) toast.error(t('admin_daily_tasks.error_server'));
        else if (!e.response) toast.error(t('admin_daily_tasks.error_network'));
        else toast.error(t('admin_daily_tasks.load_error'));
      } else {
        toast.error(t('admin_daily_tasks.load_error'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const setRowPatching = (id, v) => {
    setPatching((p) => ({ ...p, [id]: v }));
  };

  const patchDefinition = async (id, body) => {
    setRowPatching(id, true);
    try {
      const res = await api.patch(`/admin/daily-tasks/definitions/${id}`, body);
      if (res.data?.ok) {
        toast.success(t('admin_daily_tasks.saved'));
        await load();
      } else {
        toast.error(res.data?.message || t('admin_daily_tasks.save_error'));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('admin_daily_tasks.save_error'));
    } finally {
      setRowPatching(id, false);
    }
  };

  const onToggleActive = (id, isActive) => {
    patchDefinition(id, { isActive });
  };

  const onCadenceChange = (id, nextCadence, previousCadence) => {
    const next = String(nextCadence || 'DAILY').toUpperCase();
    const prev = String(previousCadence || 'DAILY').toUpperCase();
    if (next === prev) return;
    patchDefinition(id, { resetCadence: next });
  };

  const onSaveOrder = (id) => {
    const raw = orderDraft[id];
    const n = parseInt(String(raw), 10);
    if (!Number.isInteger(n) || n < 0) {
      toast.error(t('admin_daily_tasks.save_error'));
      return;
    }
    patchDefinition(id, { sortOrder: n });
  };

  const onCreate = async () => {
    setCreating(true);
    try {
      const body = buildCreateBody(createForm);
      const res = await api.post('/admin/daily-tasks/definitions', body);
      if (res.data?.ok) {
        toast.success(t('admin_daily_tasks.create_success'));
        setCreateForm(defaultCreateForm());
        setShowCreate(false);
        await load();
      } else {
        toast.error(res.data?.message || t('admin_daily_tasks.create_error'));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('admin_daily_tasks.create_error'));
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id, slug) => {
    if (!window.confirm(t('admin_daily_tasks.delete_confirm', { slug }))) return;
    setDeletingId(id);
    try {
      const res = await api.delete(`/admin/daily-tasks/definitions/${id}`);
      if (res.data?.ok) {
        toast.success(t('admin_daily_tasks.delete_success'));
        await load();
      } else {
        toast.error(res.data?.message || t('admin_daily_tasks.delete_error'));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('admin_daily_tasks.delete_error'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-amber-500/10 p-3 text-amber-500">
          <ListChecks className="h-8 w-8" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black tracking-tight text-white">{t('admin_daily_tasks.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{t('admin_daily_tasks.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{t('admin_daily_tasks.crud_hint')}</p>
        <button
          type="button"
          onClick={() => setShowCreate((s) => !s)}
          className="inline-flex shrink-0 min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-bold uppercase tracking-wide text-amber-400 hover:bg-amber-500/20"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('admin_daily_tasks.create_task')}
        </button>
      </div>

      {showCreate ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">{t('admin_daily_tasks.create_title')}</h2>
          <p className="text-xs text-slate-500">{t('admin_daily_tasks.create_hint')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_slug')}</span>
              <input
                value={createForm.slug}
                onChange={(e) => setCreateForm((f) => ({ ...f, slug: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                placeholder="daily-my-task"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_type')}</span>
              <select
                value={createForm.taskType}
                onChange={(e) => {
                  const v = e.target.value;
                  setCreateForm((f) => ({
                    ...f,
                    taskType: v,
                    translationKey:
                      v === 'INTERNAL_OFFERWALL' ? 'dailyTasks.tasks.internal_offerwall' : f.translationKey
                  }));
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {TASK_TYPES.map((tt) => (
                  <option key={tt} value={tt}>
                    {t(`admin_daily_tasks.type_${tt}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_target')}</span>
              <input
                value={createForm.targetValue}
                onChange={(e) => setCreateForm((f) => ({ ...f, targetValue: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reset_cadence')}</span>
              <select
                value={createForm.resetCadence}
                onChange={(e) => setCreateForm((f) => ({ ...f, resetCadence: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {RESET_CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {t(`admin_daily_tasks.cadence_${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_i18n_key')}</span>
              <input
                value={createForm.translationKey}
                onChange={(e) => setCreateForm((f) => ({ ...f, translationKey: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reward_kind')}</span>
              <select
                value={createForm.rewardKind}
                onChange={(e) => setCreateForm((f) => ({ ...f, rewardKind: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                {REWARD_KINDS.map((rk) => (
                  <option key={rk} value={rk}>
                    {t(`admin_daily_tasks.reward_${rk}`)}
                  </option>
                ))}
              </select>
            </label>
            {createForm.rewardKind === 'BLK' ? (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reward_blk')}</span>
                <input
                  value={createForm.rewardBlkAmount}
                  onChange={(e) => setCreateForm((f) => ({ ...f, rewardBlkAmount: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
            ) : null}
            {createForm.rewardKind === 'POL' ? (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reward_pol')}</span>
                <input
                  value={createForm.rewardPolAmount}
                  onChange={(e) => setCreateForm((f) => ({ ...f, rewardPolAmount: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
            ) : null}
            {createForm.rewardKind === 'HASHRATE_TEMP' ? (
              <>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reward_hash')}</span>
                  <input
                    value={createForm.rewardHashRate}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rewardHashRate: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reward_days')}</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={createForm.rewardHashRateDays}
                    onChange={(e) => setCreateForm((f) => ({ ...f, rewardHashRateDays: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                  />
                </label>
              </>
            ) : null}
            {createForm.rewardKind === 'SHOP_MINER' ? (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reward_miner_id')}</span>
                <input
                  type="number"
                  min={1}
                  value={createForm.rewardMinerId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, rewardMinerId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
            ) : null}
            {createForm.rewardKind === 'EVENT_MINER' ? (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_reward_event_miner_id')}</span>
                <input
                  type="number"
                  min={1}
                  value={createForm.rewardEventMinerId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, rewardEventMinerId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
            ) : null}
            {createForm.taskType === 'PLAY_GAMES' ? (
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_game_slug')}</span>
                <input
                  value={createForm.gameSlug}
                  onChange={(e) => setCreateForm((f) => ({ ...f, gameSlug: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                  placeholder="memory"
                />
              </label>
            ) : null}
            {createForm.taskType === 'INTERNAL_OFFERWALL' ? (
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_internal_offerwall_offer_id')}</span>
                <input
                  type="number"
                  min={1}
                  value={createForm.internalOfferwallOfferId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, internalOfferwallOfferId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                  placeholder="1"
                />
              </label>
            ) : null}
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={createForm.autoSortOrder}
                onChange={(e) => setCreateForm((f) => ({ ...f, autoSortOrder: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-600 accent-amber-500"
              />
              <span className="text-sm text-slate-300">{t('admin_daily_tasks.create_auto_order')}</span>
            </label>
            {!createForm.autoSortOrder ? (
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-400">{t('admin_daily_tasks.create_sort_order')}</span>
                <input
                  type="number"
                  min={0}
                  max={99999}
                  value={createForm.sortOrder}
                  onChange={(e) => setCreateForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={creating}
              onClick={onCreate}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t('admin_daily_tasks.create_submit')}
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => {
                setShowCreate(false);
                setCreateForm(defaultCreateForm());
              }}
              className="rounded-xl border border-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              {t('admin_daily_tasks.create_cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span>{t('admin_daily_tasks.loading')}</span>
        </div>
      ) : loadFailed ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-950/20 p-6 space-y-4 max-w-2xl">
          <p className="text-sm text-red-100/95 leading-relaxed">{t('admin_daily_tasks.load_failed_body')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center rounded-xl border border-red-400/40 bg-red-500/15 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-red-200 hover:bg-red-500/25"
          >
            {t('admin_daily_tasks.retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-slate-500">{t('admin_daily_tasks.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_slug')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_type')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_cadence')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_target')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_i18n_key')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_io_offer')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_reward')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_active')}</th>
                <th className="px-4 py-3 font-semibold">{t('admin_daily_tasks.col_order')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{t('admin_daily_tasks.col_save_order')}</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">{t('admin_daily_tasks.col_delete')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-mono text-xs text-amber-500/90">{r.slug}</td>
                  <td className="px-4 py-3">{r.taskType}</td>
                  <td className="px-4 py-3">
                    <select
                      value={String(r.resetCadence || 'DAILY').toUpperCase()}
                      disabled={patching[r.id]}
                      aria-label={t('admin_daily_tasks.cadence_select_aria')}
                      onChange={(e) => onCadenceChange(r.id, e.target.value, r.resetCadence)}
                      className="max-w-[9.5rem] rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white disabled:opacity-40"
                    >
                      {RESET_CADENCES.map((c) => (
                        <option key={c} value={c}>
                          {t(`admin_daily_tasks.cadence_${c}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{String(r.targetValue)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.translationKey}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {r.internalOfferwallOfferId != null ? String(r.internalOfferwallOfferId) : '—'}
                  </td>
                  <td className="px-4 py-3">{r.rewardKind}</td>
                  <td className="px-4 py-3">
                    <label className="inline-flex cursor-pointer select-none items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(r.isActive)}
                        disabled={patching[r.id]}
                        aria-label={t('admin_daily_tasks.toggle_aria')}
                        onChange={(e) => onToggleActive(r.id, e.target.checked)}
                        className="h-5 w-5 rounded border-slate-600 bg-slate-950 accent-emerald-500 focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-40"
                      />
                      <span className="text-xs text-slate-400">{r.isActive ? t('admin_daily_tasks.yes') : t('admin_daily_tasks.no')}</span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-white disabled:opacity-40"
                      value={orderDraft[r.id] ?? ''}
                      disabled={patching[r.id]}
                      aria-label={t('admin_daily_tasks.order_placeholder')}
                      onChange={(e) => setOrderDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <button
                      type="button"
                      disabled={patching[r.id]}
                      onClick={() => onSaveOrder(r.id)}
                      className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-400 hover:bg-amber-500/25 disabled:opacity-40"
                    >
                      {patching[r.id] ? (
                        <Loader2 className="inline h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        t('admin_daily_tasks.save_order')
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <button
                      type="button"
                      disabled={deletingId === r.id || patching[r.id]}
                      onClick={() => onDelete(r.id, r.slug)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-400 hover:bg-red-500/20 disabled:opacity-40"
                      aria-label={t('admin_daily_tasks.delete_task')}
                    >
                      {deletingId === r.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      {t('admin_daily_tasks.delete_task')}
                    </button>
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
