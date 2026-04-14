import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LifeBuoy,
  Plus,
  Send,
  Loader2,
  ChevronLeft,
  ImagePlus,
  X,
  RefreshCw,
  Inbox
} from 'lucide-react';
import { toast } from 'sonner';
import { api, useAuthStore } from '../store/auth';
import { useSupportTicketSocket } from '../hooks/useSupportTicketSocket';
import SupportAttachmentThumbnails from '../components/SupportAttachmentThumbnails';

function mergeReplyUnique(replies, incoming) {
  if (!incoming?.id) return replies;
  if (replies.some((r) => r.id === incoming.id)) return replies;
  return [...replies, incoming];
}

export default function Support() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const [list, setList] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [replyText, setReplyText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [sending, setSending] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newFiles, setNewFiles] = useState([]);
  const [creating, setCreating] = useState(false);

  const fetchList = useCallback(
    async (p = 1, append = false) => {
      try {
        setListLoading(true);
        const res = await api.get('/support', { params: { page: p, limit } });
        if (res.data?.ok) {
          const rows = res.data.messages || [];
          setList((prev) => (append ? [...prev, ...rows] : rows));
          setTotal(res.data.total ?? 0);
          setPage(res.data.page ?? p);
        }
      } catch {
        toast.error(t('support_tickets.error_list'));
      } finally {
        setListLoading(false);
      }
    },
    [limit, t]
  );

  useEffect(() => {
    fetchList(1);
  }, [fetchList]);

  const loadThread = useCallback(
    async (id) => {
      try {
        setThreadLoading(true);
        const res = await api.get(`/support/${id}`);
        if (res.data?.ok) {
          setThread(res.data.message);
        } else {
          toast.error(t('support_tickets.error_thread'));
        }
      } catch {
        toast.error(t('support_tickets.error_thread'));
      } finally {
        setThreadLoading(false);
      }
    },
    [t]
  );

  const onRealtimeReply = useCallback((reply) => {
    setThread((prev) => {
      if (!prev || Number(prev.id) !== Number(reply.supportMessageId)) return prev;
      return {
        ...prev,
        replies: mergeReplyUnique(prev.replies || [], reply)
      };
    });
  }, []);

  useSupportTicketSocket(selectedId, onRealtimeReply);

  const selectTicket = (id) => {
    setSelectedId(id);
    setReplyText('');
    setPendingFiles([]);
    loadThread(id);
  };

  const uploadImages = async (files) => {
    const urls = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append('image', file);
      const res = await api.post('/support/upload-image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.ok && res.data.url) {
        urls.push({ url: res.data.url, mimeType: res.data.mimeType || file.type });
      }
    }
    return urls;
  };

  const handleSendReply = async () => {
    if (!selectedId || (!replyText.trim() && pendingFiles.length === 0)) return;
    setSending(true);
    try {
      let attachments = [];
      if (pendingFiles.length) {
        attachments = await uploadImages(pendingFiles);
      }
      const res = await api.post(`/support/${selectedId}/reply`, {
        message: replyText.trim() || t('support_tickets.reply_image_only'),
        attachments
      });
      if (res.data?.ok && res.data.reply) {
        setThread((prev) =>
          prev
            ? { ...prev, replies: mergeReplyUnique(prev.replies || [], res.data.reply) }
            : prev
        );
        setReplyText('');
        setPendingFiles([]);
        toast.success(t('support_tickets.reply_sent'));
      }
    } catch {
      toast.error(t('support_tickets.error_reply'));
    } finally {
      setSending(false);
    }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newSubject.trim() || !newMessage.trim()) {
      toast.error(t('support_tickets.validation_required'));
      return;
    }
    if (!user?.name || !user?.email) {
      toast.error(t('support_tickets.validation_profile'));
      return;
    }
    setCreating(true);
    try {
      let attachments = [];
      if (newFiles.length) {
        attachments = await uploadImages(newFiles);
      }
      const res = await api.post('/support', {
        name: user.name,
        email: user.email,
        subject: newSubject.trim(),
        message: newMessage.trim(),
        attachments
      });
      if (res.data?.ok) {
        toast.success(t('support_tickets.created'));
        setShowNew(false);
        setNewSubject('');
        setNewMessage('');
        setNewFiles([]);
        await fetchList(1);
        if (res.data.id) selectTicket(res.data.id);
      }
    } catch {
      toast.error(t('support_tickets.error_create'));
    } finally {
      setCreating(false);
    }
  };

  const addFiles = (fileList, setter, max = 5) => {
    const next = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
    setter((prev) => [...prev, ...next].slice(0, max));
  };

  const hasMore = page * limit < total;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <LifeBuoy className="w-8 h-8 text-primary" />
            {t('support_tickets.title')}
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">{t('support_tickets.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fetchList(page)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wider hover:border-primary/40"
          >
            <RefreshCw className={`w-4 h-4 ${listLoading ? 'animate-spin' : ''}`} />
            {t('support_tickets.refresh')}
          </button>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-slate-950 text-xs font-black uppercase tracking-wider hover:opacity-90"
          >
            <Plus className="w-4 h-4" />
            {t('support_tickets.new_ticket')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[480px] lg:min-h-0 lg:h-[calc(100dvh-14rem)] lg:max-h-[calc(100dvh-14rem)]">
        <div className="lg:col-span-4 flex flex-col min-h-0 h-full rounded-2xl border border-slate-800 bg-slate-950/50 overflow-hidden">
          <div className="p-3 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest text-slate-500 shrink-0">
            {t('support_tickets.list_heading')}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-2 space-y-2 max-h-[50vh] lg:max-h-none">
            {listLoading && list.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : list.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm px-4">{t('support_tickets.empty_list')}</div>
            ) : (
              list.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => selectTicket(row.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedId === row.id
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        row.isReplied ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                      }`}
                    >
                      {row.isReplied ? t('support_tickets.status_replied') : t('support_tickets.status_open')}
                    </span>
                    {!row.isRead && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" aria-hidden />
                    )}
                  </div>
                  <p className="text-white font-semibold text-sm truncate">{row.subject}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-mono">
                    {new Date(row.createdAt).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </div>
          {hasMore && (
            <button
              type="button"
              className="m-2 py-2 text-xs font-bold text-primary uppercase"
              onClick={() => fetchList(page + 1, true)}
            >
              {t('support_tickets.load_more')}
            </button>
          )}
        </div>

        <div className="lg:col-span-8 rounded-2xl border border-slate-800 bg-slate-950/50 flex flex-col min-h-[480px] lg:min-h-0 lg:h-full overflow-hidden">
          {threadLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          ) : thread ? (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-start gap-3 shrink-0">
                <button
                  type="button"
                  className="lg:hidden p-2 rounded-lg bg-slate-900 border border-slate-800"
                  onClick={() => {
                    setSelectedId(null);
                    setThread(null);
                  }}
                  aria-label={t('support_tickets.back_list')}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-black text-white uppercase tracking-tight truncate">
                    {thread.subject}
                  </h2>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">
                    {t('support_tickets.protocol', { id: thread.id })} ·{' '}
                    {new Date(thread.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-2">
                    {t('support_tickets.you')}
                  </p>
                  <p className="text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">{thread.body}</p>
                  <SupportAttachmentThumbnails attachments={thread.attachments} />
                </div>

                {(thread.replies || []).map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-2xl border p-4 ${
                      r.isAdmin
                        ? 'border-primary/30 bg-primary/5 ml-0 md:ml-8'
                        : 'border-slate-800 bg-slate-900/30 mr-0 md:mr-8'
                    }`}
                  >
                    <p className="text-[10px] font-black uppercase text-slate-500 mb-2">
                      {r.isAdmin ? t('support_tickets.team') : t('support_tickets.you')}
                      <span className="float-right font-mono normal-case opacity-60">
                        {new Date(r.createdAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="text-slate-200 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
                    <SupportAttachmentThumbnails attachments={r.attachments} />
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-slate-800 space-y-3 shrink-0">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  placeholder={t('support_tickets.reply_placeholder')}
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-primary/40 resize-none"
                />
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingFiles.map((f, i) => (
                      <span
                        key={`${f.name}-${i}`}
                        className="inline-flex items-center gap-1 text-[10px] bg-slate-800 px-2 py-1 rounded-lg"
                      >
                        {f.name}
                        <button
                          type="button"
                          className="p-0.5"
                          onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                          aria-label={t('support_tickets.remove_file')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 cursor-pointer hover:border-primary/40">
                    <ImagePlus className="w-4 h-4" />
                    {t('support_tickets.add_images')}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => addFiles(e.target.files, setPendingFiles)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={sending || (!replyText.trim() && pendingFiles.length === 0)}
                    onClick={handleSendReply}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-slate-950 text-xs font-black uppercase disabled:opacity-40"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {t('support_tickets.send')}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
              <Inbox className="w-16 h-16 mb-4 opacity-40" />
              <p className="text-sm text-center">{t('support_tickets.select_prompt')}</p>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black text-white uppercase">{t('support_tickets.modal_title')}</h3>
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="p-2 rounded-lg hover:bg-slate-800"
                aria-label={t('support_tickets.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  {t('support_tickets.field_subject')}
                </label>
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                  {t('support_tickets.field_message')}
                </label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  rows={5}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
                  maxLength={12000}
                />
              </div>
              <div>
                <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <ImagePlus className="w-4 h-4" />
                  {t('support_tickets.add_images')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => addFiles(e.target.files, setNewFiles)}
                  />
                </label>
                {newFiles.length > 0 && (
                  <p className="text-[10px] text-slate-500 mt-1">{t('support_tickets.files_count', { count: newFiles.length })}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full py-3 rounded-xl bg-primary text-slate-950 font-black text-xs uppercase disabled:opacity-50"
              >
                {creating ? t('support_tickets.submitting') : t('support_tickets.submit')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
