import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../store/auth';

const PARENT_OPTIONS = [
  { value: '', labelKey: 'admin_user_sidebar.parent_top' },
  { value: 'rewards_group', labelKey: 'admin_user_sidebar.parent_rewards' },
];

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

export default function AdminUserSidebar() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entries, setEntries] = useState([]);
  const [itemMeta, setItemMeta] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/sidebar-nav');
      if (!res.data?.ok) {
        toast.error(t('admin_user_sidebar.error_load'));
        return;
      }
      setEntries(res.data.entries || []);
      setItemMeta(res.data.itemMeta || {});
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
    [entries, itemMeta]
  );

  const updateEntry = (itemId, patch) => {
    setEntries((prev) =>
      prev.map((e) => (e.itemId === itemId ? { ...e, ...patch } : e))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/admin/sidebar-nav', { entries });
      if (!res.data?.ok) {
        toast.error(t('admin_user_sidebar.error_save'));
        return;
      }
      setEntries(res.data.entries || []);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {t('admin_user_sidebar.title')}
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-xl">{t('admin_user_sidebar.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
          {t('admin_user_sidebar.save')}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/80 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('admin_user_sidebar.col_visible')}</th>
                <th className="px-4 py-3">{t('admin_user_sidebar.col_item')}</th>
                <th className="px-4 py-3">{t('admin_user_sidebar.col_section')}</th>
                <th className="px-4 py-3">{t('admin_user_sidebar.col_parent')}</th>
                <th className="px-4 py-3 w-28">{t('admin_user_sidebar.col_order')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedRows.map((row) => {
                const meta = itemMeta[row.itemId] || {};
                const labelKey = meta.labelKey || row.itemId;
                const locked = meta.parentLocked;
                const canPickParent =
                  meta.section === 'earn' &&
                  !meta.isGroup &&
                  !locked &&
                  meta.defaultParentItemId === 'rewards_group';

                return (
                  <tr key={row.itemId} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={row.visible}
                        onChange={(e) => updateEntry(row.itemId, { visible: e.target.checked })}
                        className="rounded border-slate-600"
                        aria-label={t('admin_user_sidebar.col_visible')}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {t(labelKey)}
                      {meta.isGroup ? (
                        <span className="ml-2 text-xs text-slate-500">({t('admin_user_sidebar.badge_group')})</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{meta.section || '—'}</td>
                    <td className="px-4 py-3">
                      {canPickParent ? (
                        <select
                          value={row.parentItemId || ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateEntry(row.itemId, {
                              parentItemId: v === '' ? null : v,
                            });
                          }}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs w-full max-w-[200px]"
                        >
                          {PARENT_OPTIONS.map((opt) => (
                            <option key={opt.value || 'root'} value={opt.value}>
                              {t(opt.labelKey)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-slate-500 text-xs">
                          {row.parentItemId === 'rewards_group'
                            ? t('admin_user_sidebar.parent_rewards')
                            : t('admin_user_sidebar.parent_top')}
                          {locked ? ` (${t('admin_user_sidebar.locked')})` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={row.sortOrder}
                        onChange={(e) =>
                          updateEntry(row.itemId, {
                            sortOrder: Number.parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
