import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2,
  Save,
  Search,
  ChevronUp,
  ChevronDown,
  ListOrdered,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../store/auth';

const PARENT_OPTIONS = [
  { value: '', labelKey: 'admin_user_sidebar.parent_top' },
  { value: 'rewards_group', labelKey: 'admin_user_sidebar.parent_rewards' },
];

const SECTION_ORDER = ['main', 'earn', 'social'];

function sortEntriesForDisplay(entries, itemMeta) {
  const list = [...entries];
  list.sort((a, b) => {
    const sa = itemMeta[a.itemId]?.section || '';
    const sb = itemMeta[b.itemId]?.section || '';
    if (sa !== sb) return sa.localeCompare(sb);
    const pa = a.parentItemId || '';
    const pb = b.parentItemId || '';
    if (pa !== pb) return pa.localeCompare(pb);
    return a.sortOrder - b.sortOrder;
  });
  return list;
}

function groupBySection(rows, itemMeta) {
  /** @type {Map<string, typeof rows>} */
  const map = new Map();
  for (const s of SECTION_ORDER) map.set(s, []);
  for (const row of rows) {
    const sec = itemMeta[row.itemId]?.section || 'main';
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec).push(row);
  }
  return SECTION_ORDER.filter((s) => (map.get(s) || []).length > 0).map((section) => ({
    section,
    rows: map.get(section) || [],
  }));
}

export default function AdminUserSidebar() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [itemMeta, setItemMeta] = useState({});
  const [baselineJson, setBaselineJson] = useState(null);
  const [filterQuery, setFilterQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/sidebar-nav');
      if (!res.data?.ok) {
        toast.error(t('admin_user_sidebar.error_load'));
        return;
      }
      const next = res.data.entries || [];
      setEntries(next);
      setItemMeta(res.data.itemMeta || {});
      setBaselineJson(JSON.stringify(next));
    } catch {
      toast.error(t('admin_user_sidebar.error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedRows = useMemo(
    () => sortEntriesForDisplay(entries, itemMeta),
    [entries, itemMeta],
  );

  const displayRows = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((row) => {
      const meta = itemMeta[row.itemId] || {};
      const labelKey = meta.labelKey || row.itemId;
      const label = t(labelKey).toLowerCase();
      return label.includes(q) || row.itemId.toLowerCase().includes(q);
    });
  }, [sortedRows, filterQuery, itemMeta, t]);

  const sectionGroups = useMemo(
    () => groupBySection(displayRows, itemMeta),
    [displayRows, itemMeta],
  );

  const dirty = useMemo(
    () => baselineJson != null && JSON.stringify(entries) !== baselineJson,
    [entries, baselineJson],
  );

  const updateEntry = (itemId, patch) => {
    setEntries((prev) => prev.map((e) => (e.itemId === itemId ? { ...e, ...patch } : e)));
  };

  const swapSortOrder = (itemIdA, itemIdB) => {
    const a = entries.find((e) => e.itemId === itemIdA);
    const b = entries.find((e) => e.itemId === itemIdB);
    if (!a || !b) return;
    const oa = a.sortOrder;
    const ob = b.sortOrder;
    setEntries((prev) =>
      prev.map((e) => {
        if (e.itemId === itemIdA) return { ...e, sortOrder: ob };
        if (e.itemId === itemIdB) return { ...e, sortOrder: oa };
        return e;
      }),
    );
  };

  const moveInList = (itemId, direction) => {
    const list = displayRows;
    const i = list.findIndex((r) => r.itemId === itemId);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    swapSortOrder(list[i].itemId, list[j].itemId);
  };

  const handleNormalizeOrder = () => {
    const ordered = sortEntriesForDisplay(entries, itemMeta);
    const byId = new Map(
      ordered.map((e, idx) => [e.itemId, { ...e, sortOrder: (idx + 1) * 10 }]),
    );
    setEntries((prev) => prev.map((e) => byId.get(e.itemId) || e));
    toast.success(t('admin_user_sidebar.normalize_ok'));
  };

  const handleDiscard = () => {
    if (!baselineJson) return;
    try {
      setEntries(JSON.parse(baselineJson));
      toast.info(t('admin_user_sidebar.discard_ok'));
    } catch {
      load();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/admin/sidebar-nav', { entries });
      if (!res.data?.ok) {
        toast.error(t('admin_user_sidebar.error_save'));
        return;
      }
      const next = res.data.entries || [];
      setEntries(next);
      setBaselineJson(JSON.stringify(next));
      toast.success(t('admin_user_sidebar.save_ok'));
    } catch (err) {
      const code = err.response?.data?.code;
      if (code) {
        toast.error(t('admin_user_sidebar.validation.generic', { code }));
      } else {
        toast.error(t('admin_user_sidebar.error_save'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400 gap-2">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden />
        <span>{t('admin_user_sidebar.loading')}</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black text-white tracking-tight">
            {t('admin_user_sidebar.title')}
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">{t('admin_user_sidebar.subtitle')}</p>
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
            {dirty ? (
              <span className="inline-flex items-center rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 font-bold text-amber-200">
                {t('admin_user_sidebar.unsaved')}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 font-medium text-slate-500">
                {t('admin_user_sidebar.saved_state')}
              </span>
            )}
            <span className="text-slate-600">
              {t('admin_user_sidebar.showing_count', {
                shown: displayRows.length,
                total: sortedRows.length,
              })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!dirty || saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-200 text-sm font-bold hover:bg-slate-800 disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" aria-hidden />
            {t('admin_user_sidebar.discard')}
          </button>
          <button
            type="button"
            onClick={handleNormalizeOrder}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-200 text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
          >
            <ListOrdered className="w-4 h-4" aria-hidden />
            {t('admin_user_sidebar.normalize')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
            {t('admin_user_sidebar.save')}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder={t('admin_user_sidebar.search_placeholder')}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/80 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          autoComplete="off"
        />
      </div>

      <div className="space-y-6">
        {sectionGroups.map(({ section, rows }) => (
          <div
            key={section}
            className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden shadow-lg shadow-black/20"
          >
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/60 flex items-center justify-between gap-2">
              <h2 className="text-xs font-black uppercase tracking-widest text-amber-400/90">
                {t(`admin_user_sidebar.section_${section}`, section)}
              </h2>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {rows.length} {t('admin_user_sidebar.items')}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-900/80 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  <tr>
                    <th className="px-3 py-2.5 w-10">{t('admin_user_sidebar.col_visible')}</th>
                    <th className="px-3 py-2.5">{t('admin_user_sidebar.col_item')}</th>
                    <th className="px-3 py-2.5 min-w-[140px]">{t('admin_user_sidebar.col_parent')}</th>
                    <th className="px-3 py-2.5 w-36">{t('admin_user_sidebar.col_order')}</th>
                    <th className="px-3 py-2.5 w-24 text-right">{t('admin_user_sidebar.col_move')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {rows.map((row) => {
                    const meta = itemMeta[row.itemId] || {};
                    const labelKey = meta.labelKey || row.itemId;
                    const locked = meta.parentLocked;
                    const canPickParent =
                      meta.section === 'earn' &&
                      !meta.isGroup &&
                      !locked &&
                      meta.defaultParentItemId === 'rewards_group';
                    const nested = row.parentItemId === 'rewards_group';
                    const idx = displayRows.findIndex((r) => r.itemId === row.itemId);
                    const canUp = idx > 0;
                    const canDown = idx >= 0 && idx < displayRows.length - 1;

                    return (
                      <tr
                        key={row.itemId}
                        className={`hover:bg-slate-800/25 ${nested ? 'bg-slate-950/40' : ''}`}
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            type="checkbox"
                            checked={row.visible}
                            onChange={(e) => updateEntry(row.itemId, { visible: e.target.checked })}
                            className="rounded border-slate-600"
                            aria-label={t('admin_user_sidebar.col_visible')}
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className={`flex items-center gap-2 ${nested ? 'pl-6 border-l-2 border-amber-500/25' : ''}`}>
                            <span className="font-medium text-white">{t(labelKey)}</span>
                            {meta.isGroup ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                                {t('admin_user_sidebar.badge_group')}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          {canPickParent ? (
                            <select
                              value={row.parentItemId || ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                updateEntry(row.itemId, {
                                  parentItemId: v === '' ? null : v,
                                });
                              }}
                              className="w-full max-w-[220px] bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                            >
                              {PARENT_OPTIONS.map((opt) => (
                                <option key={opt.value || 'root'} value={opt.value}>
                                  {t(opt.labelKey)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-500 text-xs leading-snug">
                              {row.parentItemId === 'rewards_group'
                                ? t('admin_user_sidebar.parent_rewards')
                                : t('admin_user_sidebar.parent_top')}
                              {locked ? ` · ${t('admin_user_sidebar.locked')}` : ''}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            type="number"
                            value={row.sortOrder}
                            onChange={(e) =>
                              updateEntry(row.itemId, {
                                sortOrder: Number.parseInt(e.target.value, 10) || 0,
                              })
                            }
                            className="w-full max-w-[5.5rem] bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right">
                          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
                            <button
                              type="button"
                              disabled={!canUp}
                              onClick={() => moveInList(row.itemId, 'up')}
                              className="p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
                              aria-label={t('admin_user_sidebar.move_up')}
                              title={t('admin_user_sidebar.move_up')}
                            >
                              <ChevronUp className="w-4 h-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              disabled={!canDown}
                              onClick={() => moveInList(row.itemId, 'down')}
                              className="p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent border-l border-slate-700"
                              aria-label={t('admin_user_sidebar.move_down')}
                              title={t('admin_user_sidebar.move_down')}
                            >
                              <ChevronDown className="w-4 h-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {displayRows.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-8">{t('admin_user_sidebar.empty_filter')}</p>
      ) : null}
    </div>
  );
}
