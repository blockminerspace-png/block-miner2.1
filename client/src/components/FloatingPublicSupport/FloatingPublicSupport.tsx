import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X, ArrowLeft, Send, Loader2, Search, ChevronRight, Paperclip, ImageIcon } from 'lucide-react';
import axios from 'axios';

const BASE = '/api/public-support';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Msg = { id: number; authorType: string; content: string; imageUrl?: string | null; createdAt: string };
type Ticket = { id: number; subject: string; status: string; createdAt: string; updatedAt: string; messages?: Msg[] };

type View = 'home' | 'new' | 'lookup' | 'list' | 'thread';

function MsgImage({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2">
      <img src={url} alt="" className="max-w-full rounded-lg max-h-48 object-contain border border-white/10" />
    </a>
  );
}

export default function FloatingPublicSupport() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('home');

  // new ticket form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [newImage, setNewImage] = useState<File | null>(null);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [newSuccess, setNewSuccess] = useState(false);
  const newImageRef = useRef<HTMLInputElement>(null);

  // lookup
  const [lookupEmail, setLookupEmail] = useState('');
  const [looking, setLooking] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [lookupError, setLookupError] = useState('');

  // thread
  const [thread, setThread] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [replyImage, setReplyImage] = useState<File | null>(null);
  const [replyImagePreview, setReplyImagePreview] = useState<string | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [imageError, setImageError] = useState('');
  const replyImageRef = useRef<HTMLInputElement>(null);

  function reset() {
    setView('home');
    setName(''); setEmail(''); setSubject(''); setMessage('');
    setNewImage(null); setNewImagePreview(null);
    setSubmitting(false); setNewSuccess(false);
    setLookupEmail(''); setLooking(false); setTickets([]); setLookupError('');
    setThread(null); setReply(''); setReplyImage(null); setReplyImagePreview(null);
    setSendingReply(false); setImageError('');
  }

  function pickImage(file: File | null | undefined, setFile: (f: File | null) => void, setPreview: (s: string | null) => void) {
    setImageError('');
    if (!file) { setFile(null); setPreview(null); return; }
    if (!ALLOWED_TYPES.includes(file.type)) { setImageError(t('publicSupport.image_invalid_type')); return; }
    if (file.size > MAX_FILE_BYTES) { setImageError(t('publicSupport.image_too_large')); return; }
    setFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadImage(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await axios.post<{ url: string }>(`${BASE}/upload-image`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.url;
    } catch {
      return null;
    }
  }

  async function handleNewTicket(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (newImage) imageUrl = await uploadImage(newImage);
      await axios.post(`${BASE}/ticket`, { name, email, subject, message, imageUrl });
      setNewSuccess(true);
    } catch {
      // silently fail — UI has no per-field server errors here
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setLooking(true);
    setLookupError('');
    try {
      const res = await axios.get<{ tickets: Ticket[] }>(`${BASE}/tickets`, { params: { email: lookupEmail } });
      setTickets(res.data.tickets);
      setView('list');
    } catch {
      setLookupError(t('publicSupport.lookup_error'));
    } finally {
      setLooking(false);
    }
  }

  async function openThread(id: number) {
    setLoadingThread(true);
    try {
      const res = await axios.get<{ ticket: Ticket }>(`${BASE}/ticket/${id}`, { params: { email: lookupEmail } });
      setThread(res.data.ticket);
      setView('thread');
    } catch {
      // silently fail
    } finally {
      setLoadingThread(false);
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!thread || (!reply.trim() && !replyImage)) return;
    setSendingReply(true);
    try {
      let imageUrl: string | null = null;
      if (replyImage) imageUrl = await uploadImage(replyImage);
      const res = await axios.post<{ message: Msg }>(`${BASE}/ticket/${thread.id}/message`, {
        email: lookupEmail,
        message: reply,
        imageUrl,
      });
      setThread((t) => t ? { ...t, messages: [...(t.messages ?? []), res.data.message] } : t);
      setReply('');
      setReplyImage(null);
      setReplyImagePreview(null);
    } catch {
      // silently fail
    } finally {
      setSendingReply(false);
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => { setOpen((o) => !o); if (open) reset(); }}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 shadow-lg flex items-center justify-center text-white transition-colors"
        aria-label={t('publicSupport.open_button')}
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-[#13161e] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              {view !== 'home' && (
                <button
                  onClick={() => setView(view === 'thread' ? 'list' : view === 'list' ? 'lookup' : 'home')}
                  className="text-white/80 hover:text-white mr-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <span className="text-white font-semibold text-sm">{t('publicSupport.header_title')}</span>
            </div>
            <button onClick={() => { setOpen(false); reset(); }} className="text-white/70 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[480px] p-4">

            {/* HOME */}
            {view === 'home' && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-400">{t('publicSupport.home_desc')}</p>
                <button
                  onClick={() => setView('new')}
                  className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between transition-colors"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{t('publicSupport.new_ticket_btn')}</p>
                    <p className="text-xs text-gray-400">{t('publicSupport.new_ticket_sub')}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
                <button
                  onClick={() => setView('lookup')}
                  className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between transition-colors"
                >
                  <div>
                    <p className="text-white text-sm font-medium">{t('publicSupport.find_tickets_btn')}</p>
                    <p className="text-xs text-gray-400">{t('publicSupport.find_tickets_sub')}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            )}

            {/* NEW TICKET */}
            {view === 'new' && !newSuccess && (
              <form onSubmit={handleNewTicket} className="flex flex-col gap-3">
                <p className="text-xs text-gray-400">{t('publicSupport.new_ticket_desc')}</p>
                <input
                  required value={name} onChange={(e) => setName(e.target.value)}
                  placeholder={t('publicSupport.field_name')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('publicSupport.field_email')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  required value={subject} onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('publicSupport.field_subject')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <textarea
                  required value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('publicSupport.field_message')}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                />

                {/* Image attachment */}
                <div>
                  <input
                    ref={newImageRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => pickImage(e.target.files?.[0], setNewImage, setNewImagePreview)}
                  />
                  {newImagePreview ? (
                    <div className="relative">
                      <img src={newImagePreview} alt="" className="w-full max-h-32 object-contain rounded-lg border border-white/10" />
                      <button
                        type="button"
                        onClick={() => { setNewImage(null); setNewImagePreview(null); if (newImageRef.current) newImageRef.current.value = ''; }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => newImageRef.current?.click()}
                      className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {t('publicSupport.attach_image')}
                    </button>
                  )}
                  {imageError && <p className="text-xs text-red-400 mt-1">{imageError}</p>}
                </div>

                <button
                  type="submit" disabled={submitting}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting
                    ? <><Loader2 className="w-4 h-4 animate-spin" />{newImage ? t('publicSupport.uploading_image') : t('publicSupport.sending')}</>
                    : t('publicSupport.send_btn')}
                </button>
              </form>
            )}

            {view === 'new' && newSuccess && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <Send className="w-6 h-6 text-green-400" />
                </div>
                <p className="text-white font-medium">{t('publicSupport.sent_title')}</p>
                <p className="text-sm text-gray-400">{t('publicSupport.sent_desc')}</p>
                <button onClick={reset} className="text-blue-400 text-sm hover:underline">{t('publicSupport.back_home')}</button>
              </div>
            )}

            {/* LOOKUP */}
            {view === 'lookup' && (
              <form onSubmit={handleLookup} className="flex flex-col gap-3">
                <p className="text-sm text-gray-400">{t('publicSupport.lookup_desc')}</p>
                <input
                  required type="email" value={lookupEmail} onChange={(e) => setLookupEmail(e.target.value)}
                  placeholder={t('publicSupport.field_email')}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                {lookupError && <p className="text-xs text-red-400">{lookupError}</p>}
                <button
                  type="submit" disabled={looking}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {looking ? <><Loader2 className="w-4 h-4 animate-spin" />{t('publicSupport.searching')}</> : <><Search className="w-4 h-4" />{t('publicSupport.search_btn')}</>}
                </button>
              </form>
            )}

            {/* LIST */}
            {view === 'list' && (
              <div className="flex flex-col gap-2">
                {tickets.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">{t('publicSupport.no_tickets')}</p>
                )}
                {tickets.map((tk) => (
                  <button
                    key={tk.id}
                    onClick={() => { if (!loadingThread) openThread(tk.id); }}
                    className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-white text-sm font-medium truncate">{tk.subject}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${tk.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                        {tk.status === 'open' ? t('publicSupport.status_open') : t('publicSupport.status_closed')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{fmtDate(tk.updatedAt)}</p>
                  </button>
                ))}
              </div>
            )}

            {/* THREAD */}
            {view === 'thread' && thread && (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-white font-medium text-sm">{thread.subject}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${thread.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {thread.status === 'open' ? t('publicSupport.status_open') : t('publicSupport.status_closed')}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {(thread.messages ?? []).map((m) => (
                    <div key={m.id} className={`rounded-xl px-3 py-2 text-sm max-w-[90%] ${m.authorType === 'guest' ? 'self-end bg-blue-600/30 text-blue-100 ml-auto' : 'self-start bg-white/5 text-gray-200'}`}>
                      {m.authorType === 'admin' && <p className="text-xs text-gray-400 mb-1">{t('publicSupport.admin_label')}</p>}
                      {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                      {m.imageUrl && <MsgImage url={m.imageUrl} />}
                      <p className="text-xs opacity-50 mt-1">{fmtDate(m.createdAt)}</p>
                    </div>
                  ))}
                </div>
                {thread.status === 'open' && (
                  <form onSubmit={handleReply} className="flex flex-col gap-2 mt-1">
                    {replyImagePreview && (
                      <div className="relative">
                        <img src={replyImagePreview} alt="" className="w-full max-h-24 object-contain rounded-lg border border-white/10" />
                        <button
                          type="button"
                          onClick={() => { setReplyImage(null); setReplyImagePreview(null); if (replyImageRef.current) replyImageRef.current.value = ''; }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {imageError && <p className="text-xs text-red-400">{imageError}</p>}
                    <input
                      ref={replyImageRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                      className="hidden"
                      onChange={(e) => pickImage(e.target.files?.[0], setReplyImage, setReplyImagePreview)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => replyImageRef.current?.click()}
                        className="shrink-0 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-2 text-gray-400 hover:text-white transition-colors"
                        title={t('publicSupport.attach_image')}
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>
                      <input
                        value={reply} onChange={(e) => setReply(e.target.value)}
                        placeholder={t('publicSupport.reply_placeholder')}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="submit" disabled={sendingReply || (!reply.trim() && !replyImage)}
                        className="shrink-0 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white rounded-lg px-3 py-2 transition-colors"
                      >
                        {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </form>
                )}
                {thread.status === 'closed' && (
                  <p className="text-xs text-gray-500 text-center">{t('publicSupport.ticket_closed_notice')}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
