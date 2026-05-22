import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, RefreshCw, Send, CheckCircle2, Clock, ChevronLeft, Loader2 } from 'lucide-react';
import { api } from '../../store/auth';
import { toast } from 'sonner';

type Msg = { id: number; authorType: string; content: string; createdAt: string };
type Ticket = { id: number; guestName: string; guestEmail: string; subject: string; status: string; createdAt: string; updatedAt: string; messages?: Msg[] };

const STATUS_FILTERS = ['all', 'open', 'closed'] as const;

export default function AdminPublicSupport() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingTicket, setLoadingTicket] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ tickets: Ticket[]; total: number }>('/admin/public-support/tickets', {
        params: { status: filter, page },
      });
      setTickets(res.data.tickets);
      setTotal(res.data.total);
    } catch {
      toast.error('Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  async function openTicket(id: number) {
    setLoadingTicket(true);
    try {
      const res = await api.get<{ ticket: Ticket }>(`/admin/public-support/ticket/${id}`);
      setSelected(res.data.ticket);
    } catch {
      toast.error('Failed to load ticket');
    } finally {
      setLoadingTicket(false);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const res = await api.post<{ message: Msg }>(`/admin/public-support/ticket/${selected.id}/message`, { message: reply });
      setSelected((t) => t ? { ...t, messages: [...(t.messages ?? []), res.data.message] } : t);
      setReply('');
      toast.success('Reply sent');
    } catch {
      toast.error('Failed to send reply');
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: 'open' | 'closed') {
    if (!selected) return;
    try {
      await api.patch(`/admin/public-support/ticket/${selected.id}/status`, { status });
      setSelected((t) => t ? { ...t, status } : t);
      setTickets((ts) => ts.map((t) => t.id === selected.id ? { ...t, status } : t));
      toast.success(`Ticket marked as ${status}`);
    } catch {
      toast.error('Failed to update status');
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (selected) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white mb-4 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to tickets
        </button>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-white font-semibold">{selected.subject}</p>
              <p className="text-sm text-gray-400">{selected.guestName} &lt;{selected.guestEmail}&gt;</p>
              <p className="text-xs text-gray-500 mt-1">{fmtDate(selected.createdAt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full ${selected.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                {selected.status}
              </span>
              <button
                onClick={() => setStatus(selected.status === 'open' ? 'closed' : 'open')}
                className="text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                {selected.status === 'open' ? 'Close ticket' : 'Reopen'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-4">
          {(selected.messages ?? []).map((m) => (
            <div key={m.id} className={`rounded-xl px-4 py-3 text-sm max-w-[85%] ${m.authorType === 'admin' ? 'ml-auto bg-blue-600/20 border border-blue-500/20 text-blue-100' : 'bg-white/5 border border-white/10 text-gray-200'}`}>
              <p className="text-xs text-gray-400 mb-1">{m.authorType === 'admin' ? 'You (admin)' : selected.guestName} · {fmtDate(m.createdAt)}</p>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>

        {selected.status === 'open' && (
          <form onSubmit={sendReply} className="flex gap-2">
            <input
              required value={reply} onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply..."
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button type="submit" disabled={sending} className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Public Support</h1>
            <p className="text-sm text-gray-400">Pre-login tickets from users who need help</p>
          </div>
        </div>
        <button onClick={fetchTickets} className="text-gray-400 hover:text-white transition-colors">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${filter === s ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-400 hover:text-white'}`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-sm text-gray-400 self-center">{total} total</span>
      </div>

      {loading && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

      {!loading && tickets.length === 0 && (
        <p className="text-center text-gray-500 py-12">No tickets found</p>
      )}

      <div className="flex flex-col gap-2">
        {tickets.map((tk) => (
          <button
            key={tk.id}
            onClick={() => openTicket(tk.id)}
            disabled={loadingTicket}
            className="w-full text-left bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{tk.subject}</p>
                <p className="text-xs text-gray-400 mt-0.5">{tk.guestName} · {tk.guestEmail}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${tk.status === 'open' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {tk.status === 'open' ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <Clock className="w-3 h-3 inline mr-1" />}
                  {tk.status}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">{fmtDate(tk.updatedAt)}</p>
          </button>
        ))}
      </div>

      {total > 30 && (
        <div className="flex justify-between items-center mt-4">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="text-sm text-gray-400 hover:text-white disabled:opacity-40 transition-colors">← Prev</button>
          <span className="text-sm text-gray-400">Page {page}</span>
          <button disabled={page * 30 >= total} onClick={() => setPage((p) => p + 1)} className="text-sm text-gray-400 hover:text-white disabled:opacity-40 transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}
