
import { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Mail, 
  User, 
  Type, 
  CheckCircle2,
  AlertCircle,
  Clock,
  List,
  PlusCircle,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import { api } from '../store/auth';
import { toast } from 'sonner';
import { useAuthStore } from '../store/auth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Support() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'tickets'
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [ticketDetails, setTicketDetails] = useState({}); // { [id]: fullDataWithReplies }
  const [loadingDetails, setLoadingDetails] = useState({});

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  useEffect(() => {
    if (user && activeTab === 'tickets') {
      fetchTickets();
    }
  }, [user, activeTab]);

  const fetchTickets = async () => {
    setLoadingTickets(true);
    try {
      const res = await api.get('/support');
      if (res.data.ok) {
        setTickets(res.data.messages);
      }
    } catch (error) {
      toast.error('Erro ao carregar seus chamados');
    } finally {
      setLoadingTickets(false);
    }
  };

  const fetchTicketDetails = async (id) => {
    if (ticketDetails[id]) return; // Already loaded

    setLoadingDetails(prev => ({ ...prev, [id]: true }));
    try {
      const res = await api.get(`/support/${id}`);
      if (res.data.ok) {
        setTicketDetails(prev => ({ ...prev, [id]: res.data.message }));
      }
    } catch (error) {
      toast.error('Erro ao carregar detalhes do chamado');
    } finally {
      setLoadingDetails(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/support', formData);
      if (res.data.ok) {
        setSubmitted(true);
        toast.success('Mensagem enviada com sucesso!');
        setFormData(prev => ({ ...prev, subject: '', message: '' }));
        if (user) {
          fetchTickets();
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Erro ao enviar mensagem');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async (ticketId) => {
    if (!replyMessage.trim()) return;

    setSendingReply(true);
    try {
      const res = await api.post(`/support/${ticketId}/reply`, { message: replyMessage });
      if (res.data.ok) {
        toast.success('Resposta enviada!');
        setReplyMessage('');
        // Refresh details
        const detailsRes = await api.get(`/support/${ticketId}`);
        if (detailsRes.data.ok) {
          setTicketDetails(prev => ({ ...prev, [ticketId]: detailsRes.data.message }));
        }
      }
    } catch (error) {
      toast.error('Erro ao enviar resposta');
    } finally {
      setSendingReply(false);
    }
  };

  const toggleTicket = (id) => {
    if (expandedTicketId === id) {
      setExpandedTicketId(null);
    } else {
      setExpandedTicketId(id);
      fetchTicketDetails(id);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-6 animate-in zoom-in duration-500">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-500/10">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase">MENSAGEM ENVIADA!</h1>
        <p className="text-slate-400 text-lg">
          {user ? 'Sua solicitação foi registrada. Você pode acompanhar pelo painel de chamados.' : 'Recebemos sua solicitação. Caso queira acompanhar seus chamados, faça login.'}
        </p>
        <div className="flex justify-center gap-4 mt-8">
          <button 
            onClick={() => setSubmitted(false)}
            className="px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-700 transition-colors"
          >
            Enviar outra mensagem
          </button>
          {user && (
            <button 
              onClick={() => {
                setSubmitted(false);
                setActiveTab('tickets');
              }}
              className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors"
            >
              Ver meus chamados
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase flex items-center justify-center gap-4">
          <MessageSquare className="w-10 h-10 text-primary" />
          SUPORTE <span className="text-primary/50">CENTRAL</span>
        </h1>
        <p className="text-slate-500 font-medium">Precisa de ajuda? Envie-nos uma mensagem e responderemos o mais rápido possível.</p>
      </div>

      {user && (
        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
              activeTab === 'new' 
                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            Novo Chamado
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
              activeTab === 'tickets' 
                ? 'bg-primary text-white shadow-lg shadow-primary/20' 
                : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <List className="w-5 h-5" />
            Meus Chamados
          </button>
        </div>
      )}

      {activeTab === 'new' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
          {/* Info Cards */}
          <div className="space-y-4">
            <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl group hover:border-primary/30 transition-all">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-white font-bold mb-1">Tempo de Resposta</h3>
              <p className="text-xs text-slate-500">Geralmente respondemos em até 24 horas úteis.</p>
            </div>
            <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-3xl group hover:border-primary/30 transition-all">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AlertCircle className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-white font-bold mb-1">FAQ</h3>
              <p className="text-xs text-slate-500">Verifique os canais de comunidade para dúvidas rápidas.</p>
            </div>
          </div>

          {/* Contact Form */}
          <div className="md:col-span-2 bg-slate-950/50 border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] -z-10" />
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nome Completo</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input 
                      type="text" 
                      required
                      placeholder="Seu nome"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={!!user}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">E-mail de Contato</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input 
                      type="email" 
                      required
                      placeholder="seu@email.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      disabled={!!user}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Assunto</label>
                <div className="relative">
                  <Type className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input 
                    type="text" 
                    required
                    placeholder="Do que se trata seu contato?"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mensagem</label>
                <textarea 
                  required
                  rows={5}
                  placeholder="Descreva seu problema ou dúvida em detalhes..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 bg-gradient-to-r from-primary to-blue-600 text-white font-black text-sm uppercase tracking-[0.2em] rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 italic"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    ENVIAR MENSAGEM
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'tickets' && user && (
        <div className="bg-slate-950/50 border border-slate-800 rounded-[2.5rem] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[100px] -z-10" />
          
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <MessageCircle className="w-6 h-6 text-primary" />
            Histórico de Chamados
          </h2>

          {loadingTickets ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-slate-800 border-dashed">
              <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-300">Nenhum chamado encontrado</h3>
              <p className="text-sm text-slate-500">Você ainda não abriu nenhum ticket de suporte.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden transition-all hover:border-slate-700">
                  <div 
                    className="p-4 sm:p-6 cursor-pointer flex items-center justify-between gap-4"
                    onClick={() => toggleTicket(ticket.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        {ticket.isReplied ? (
                          <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-emerald-500/20">
                            Respondido
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-amber-500/10 text-amber-500 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-amber-500/20">
                            Aguardando
                          </span>
                        )}
                        <span className="text-xs text-slate-500 font-medium">
                          {format(new Date(ticket.createdAt), "dd 'de' MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <h3 className="text-white font-bold truncate text-base sm:text-lg">{ticket.subject}</h3>
                    </div>
                    <div className="flex-shrink-0 text-slate-500">
                      {expandedTicketId === ticket.id ? <ChevronUp /> : <ChevronDown />}
                    </div>
                  </div>

                  {expandedTicketId === ticket.id && (
                    <div className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0 border-t border-slate-800 mt-2">
                      {loadingDetails[ticket.id] ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-6 h-6 text-primary animate-spin" />
                        </div>
                      ) : (
                        <div className="space-y-6 pt-6">
                          {/* Main Message */}
                          <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-800/50">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                <User className="w-4 h-4 text-slate-400" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-300">Você</p>
                                <p className="text-[10px] text-slate-500">
                                  {format(new Date(ticket.createdAt), "dd/MM/yyyy HH:mm")}
                                </p>
                              </div>
                            </div>
                            <p className="text-sm text-slate-300 whitespace-pre-wrap">{ticket.message}</p>
                          </div>

                          {/* Historical Reply (compatibility for old tickets) */}
                          {ticket.reply && (!ticketDetails[ticket.id]?.replies || ticketDetails[ticket.id].replies.length === 0) && (
                             <div className="bg-primary/5 p-4 rounded-2xl border border-primary/20 ml-4 sm:ml-8 relative">
                               <div className="absolute -left-3 sm:-left-4 top-8 w-3 sm:w-4 h-[1px] bg-primary/20"></div>
                               <div className="absolute -left-3 sm:-left-4 top-0 w-[1px] h-8 bg-primary/20 rounded-bl-xl"></div>
                               
                               <div className="flex items-center gap-2 mb-3">
                                 <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                   <span className="text-primary font-black text-xs">BM</span>
                                 </div>
                                 <div>
                                   <p className="text-xs font-bold text-primary">Equipe Block Miner</p>
                                   <p className="text-[10px] text-slate-500">Resposta do Suporte</p>
                                 </div>
                               </div>
                               <p className="text-sm text-slate-300 whitespace-pre-wrap">{ticket.reply}</p>
                             </div>
                          )}

                          {/* Modern Replies List */}
                          {ticketDetails[ticket.id]?.replies?.map((reply) => (
                            <div 
                              key={reply.id} 
                              className={`p-4 rounded-2xl border relative ${
                                reply.isAdmin 
                                  ? 'bg-primary/5 border-primary/20 ml-4 sm:ml-8' 
                                  : 'bg-slate-800/30 border-slate-800/50 mr-4 sm:mr-8'
                              }`}
                            >
                              {reply.isAdmin && (
                                <>
                                  <div className="absolute -left-3 sm:-left-4 top-8 w-3 sm:w-4 h-[1px] bg-primary/20"></div>
                                  <div className="absolute -left-3 sm:-left-4 top-0 w-[1px] h-8 bg-primary/20 rounded-bl-xl"></div>
                                </>
                              )}
                              <div className="flex items-center gap-2 mb-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  reply.isAdmin ? 'bg-primary/20' : 'bg-slate-700'
                                }`}>
                                  {reply.isAdmin ? (
                                    <span className="text-primary font-black text-[10px]">BM</span>
                                  ) : (
                                    <User className="w-4 h-4 text-slate-400" />
                                  )}
                                </div>
                                <div>
                                  <p className={`text-xs font-bold ${reply.isAdmin ? 'text-primary' : 'text-slate-300'}`}>
                                    {reply.isAdmin ? 'Equipe Block Miner' : 'Você'}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {format(new Date(reply.createdAt), "dd/MM/yyyy HH:mm")}
                                  </p>
                                </div>
                              </div>
                              <p className="text-sm text-slate-300 whitespace-pre-wrap">{reply.message}</p>
                            </div>
                          ))}

                          {/* Reply Form */}
                          <div className="pt-4 border-t border-slate-800 mt-4">
                            <div className="relative">
                              <textarea
                                rows={2}
                                value={replyMessage}
                                onChange={(e) => setReplyMessage(e.target.value)}
                                placeholder="Responda para o suporte..."
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 pr-14 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors resize-none"
                              />
                              <button
                                onClick={() => handleReply(ticket.id)}
                                disabled={sendingReply || !replyMessage.trim()}
                                className="absolute right-3 bottom-3 p-3 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all"
                              >
                                {sendingReply ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
