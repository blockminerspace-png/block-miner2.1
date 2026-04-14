import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Plus, Radio, Square, Trash2, Video } from 'lucide-react';
import { api } from '../store/auth';

const walletOrigin = (import.meta.env.VITE_PUBLIC_WALLET_APP_URL || 'https://blockminer.space').replace(
  /\/$/,
  ''
);
const DEFAULT_CAPTURE = `${walletOrigin}/crypto-broadcast/`;

/**
 * @param {(k: string) => string} t
 * @param {unknown} errLike axios error or { response?: { status?: number, data?: { message?: string } } }
 */
function toastStreamingFailure(t, errLike) {
  const ax = /** @type {{ response?: { status?: number, data?: { message?: string } } }} */ (errLike);
  const status = ax?.response?.status;
  const msg = String(ax?.response?.data?.message || '');
  if (status === 503 || /STREAM_ENCRYPTION_KEY/i.test(msg)) {
    toast.error(t('admin_streaming.error_encryption_key'));
    return;
  }
  toast.error(msg || t('admin_streaming.load_error'));
}

function emptyCreateForm() {
  return {
    label: '',
    captureUrl: DEFAULT_CAPTURE,
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: '',
    youtubeDataApiKey: '',
    videoWidth: '1280',
    videoHeight: '720',
    videoBitrateK: '2500',
    audioBitrateK: '128'
  };
}

function statusTone(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'ONLINE' || s === 'LIVE') return 'text-emerald-400 bg-emerald-500/15';
  if (s === 'STARTING') return 'text-amber-400 bg-amber-500/15';
  if (s === 'ERROR') return 'text-rose-400 bg-rose-500/15';
  return 'text-slate-400 bg-slate-800';
}

/** @param {{ workerAlive?: boolean, lastWorkerStatus?: string, desiredRunning?: boolean }} r */
function rowDisplayStatus(r) {
  if (r.workerAlive) return 'LIVE';
  return String(r.lastWorkerStatus || 'OFFLINE');
}

/** @param {{ workerAlive?: boolean, lastWorkerStatus?: string, desiredRunning?: boolean }} r */
function rowIsStarting(r) {
  return Boolean(
    r.desiredRunning &&
      String(r.lastWorkerStatus || '').toUpperCase() === 'STARTING' &&
      !r.workerAlive
  );
}

export default function AdminStreaming() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(/** @type {number | null} */ (null));

  const load = useCallback(
    async (opts = {}) => {
      const silent = Boolean(opts.silent);
      if (!silent) setLoading(true);
      try {
        const res = await api.get('/admin/streaming/destinations');
        if (res.data?.ok) setRows(res.data.destinations || []);
        else if (!silent) toast.error(t('admin_streaming.load_error'));
      } catch {
        if (!silent) toast.error(t('admin_streaming.load_error'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void load({ silent: false });
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => {
      void load({ silent: true });
    }, 8000);
    return () => clearInterval(id);
  }, [load]);

  const onCreate = async () => {
    setSaving(true);
    try {
      const body = {
        label: form.label.trim(),
        captureUrl: form.captureUrl.trim(),
        rtmpUrl: form.rtmpUrl.trim() || undefined,
        streamKey: form.streamKey.trim(),
        videoWidth: parseInt(form.videoWidth, 10),
        videoHeight: parseInt(form.videoHeight, 10),
        videoBitrateK: parseInt(form.videoBitrateK, 10),
        audioBitrateK: parseInt(form.audioBitrateK, 10)
      };
      if (form.youtubeDataApiKey.trim()) {
        body.youtubeDataApiKey = form.youtubeDataApiKey.trim();
      }
      const res = await api.post('/admin/streaming/destinations', body);
      if (res.data?.ok) {
        toast.success(t('admin_streaming.save_ok'));
        setShowForm(false);
        setForm(emptyCreateForm());
        await load({ silent: true });
      } else {
        toastStreamingFailure(t, { response: { status: res.status, data: res.data } });
      }
    } catch (e) {
      toastStreamingFailure(t, e);
    } finally {
      setSaving(false);
    }
  };

  const start = async (id) => {
    setBusyId(id);
    try {
      const res = await api.post(`/admin/streaming/destinations/${id}/start`);
      if (res.data?.ok) {
        toast.success(t('admin_streaming.start_ok'));
        await load({ silent: true });
      } else {
        toast.error(res.data?.message || t('admin_streaming.load_error'));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || t('admin_streaming.load_error'));
    } finally {
      setBusyId(null);
    }
  };

  const stop = async (id) => {
    setBusyId(id);
    try {
      const res = await api.post(`/admin/streaming/destinations/${id}/stop`);
      if (res.data?.ok) {
        toast.success(t('admin_streaming.stop_ok'));
        await load({ silent: true });
      } else {
        toast.error(res.data?.message || t('admin_streaming.load_error'));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || t('admin_streaming.load_error'));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    if (!window.confirm(t('admin_streaming.confirm_delete'))) return;
    setBusyId(id);
    try {
      const res = await api.delete(`/admin/streaming/destinations/${id}`);
      if (res.data?.ok) {
        toast.success(t('admin_streaming.delete_ok'));
        await load({ silent: true });
      } else {
        toast.error(res.data?.message || t('admin_streaming.load_error'));
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || t('admin_streaming.load_error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-rose-500/10 p-3 text-rose-400">
          <Video className="h-8 w-8" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-black tracking-tight text-white">{t('admin_streaming.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('admin_streaming.subtitle')}</p>
          <p className="mt-2 max-w-3xl text-xs text-slate-500">{t('admin_streaming.hint_linux')}</p>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">{t('admin_streaming.hint_kiosk')}</p>
          <p className="mt-1 max-w-3xl text-xs text-slate-500">{t('admin_streaming.hint_auto_resume')}</p>
          <p className="mt-1 max-w-3xl text-xs text-amber-200/80">{t('admin_streaming.hint_encryption')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setForm(emptyCreateForm());
            setShowForm((v) => !v);
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-bold uppercase tracking-wide text-rose-200 hover:bg-rose-500/20"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t('admin_streaming.add_destination')}
        </button>
      </div>

      {showForm ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4">
          <h2 className="text-lg font-bold text-white">{t('admin_streaming.form_new_title')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_label')}</span>
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_capture_url')}</span>
              <input
                value={form.captureUrl}
                onChange={(e) => setForm((f) => ({ ...f, captureUrl: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_rtmp')}</span>
              <input
                value={form.rtmpUrl}
                onChange={(e) => setForm((f) => ({ ...f, rtmpUrl: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_stream_key')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.streamKey}
                onChange={(e) => setForm((f) => ({ ...f, streamKey: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_data_api_key')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.youtubeDataApiKey}
                onChange={(e) => setForm((f) => ({ ...f, youtubeDataApiKey: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_width')}</span>
              <input
                type="number"
                value={form.videoWidth}
                onChange={(e) => setForm((f) => ({ ...f, videoWidth: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_height')}</span>
              <input
                type="number"
                value={form.videoHeight}
                onChange={(e) => setForm((f) => ({ ...f, videoHeight: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_v_bitrate')}</span>
              <input
                type="number"
                value={form.videoBitrateK}
                onChange={(e) => setForm((f) => ({ ...f, videoBitrateK: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">{t('admin_streaming.form_a_bitrate')}</span>
              <input
                type="number"
                value={form.audioBitrateK}
                onChange={(e) => setForm((f) => ({ ...f, audioBitrateK: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={saving || !form.label.trim() || !form.streamKey.trim()}
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-600 px-6 py-2.5 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t('admin_streaming.create')}
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span>{t('admin_streaming.loading')}</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-slate-500 text-sm">{t('admin_streaming.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const alive = Boolean(r.workerAlive);
            const starting = rowIsStarting(r);
            const badge = rowDisplayStatus(r);
            const badgeLabel =
              alive && badge === 'LIVE' ? t('admin_streaming.badge_capturing') : badge;
            const startDisabled =
              busyId === r.id || !r.hasStreamKey || !r.enabled || alive || starting;
            return (
            <li key={r.id} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-white">{r.label}</h3>
                  <p className="text-xs font-mono text-slate-500 mt-1 break-all">{r.captureUrl}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t('admin_streaming.rtmp')}: <span className="font-mono">{r.rtmpUrl}</span>
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md ${statusTone(
                    alive ? 'LIVE' : r.lastWorkerStatus
                  )}`}
                >
                  {badgeLabel}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span>
                  {t('admin_streaming.has_key')}: {r.hasStreamKey ? t('admin_streaming.yes') : t('admin_streaming.no')}
                </span>
                <span>·</span>
                <span>
                  {r.videoWidth}x{r.videoHeight} @ {r.videoBitrateK}k / {r.audioBitrateK}k aac
                </span>
              </div>
              {r.lastError ? <p className="text-xs text-rose-400/90 whitespace-pre-wrap break-words">{r.lastError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={startDisabled}
                  onClick={() => start(r.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {busyId === r.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Radio className="h-4 w-4" aria-hidden />
                  )}
                  {starting ? t('admin_streaming.button_starting') : t('admin_streaming.start')}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => stop(r.id)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${
                    alive || starting
                      ? 'border-rose-500/50 bg-rose-600/20 text-rose-100 hover:bg-rose-600/30'
                      : 'border-slate-600 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Square className="h-4 w-4" aria-hidden />
                  {t('admin_streaming.stop')}
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => remove(r.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-900/60 px-4 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-950/40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  {t('admin_streaming.delete')}
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
