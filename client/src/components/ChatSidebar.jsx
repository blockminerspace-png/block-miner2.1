import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Send, Smile, ShieldCheck, X, Reply, CornerDownRight, MessageSquare, User, ArrowLeft, Eye, MoreVertical, AtSign } from 'lucide-react';
import { useGameStore } from '../store/game';
import { useAuthStore, api } from '../store/auth';

const QUICK_EMOJIS = ["😀", "😂", "🤣", "😍", "😎", "🤝", "🔥", "🚀", "💎", "⛏️", "🎉", "✅", "💬", "👏"];

function renderMessageText(text, currentUsername) {
    if (!text) return null;
    const mentionRegex = /@(\w+)/g;
    const parts = text.split(mentionRegex);
    return parts.map((part, index) => {
        if (index % 2 === 1) { 
            const isMe = part === currentUsername;
            return (
                <span key={index} className={`font-black ${isMe ? 'bg-yellow-400/20 text-yellow-200 px-1.5 py-0.5 rounded-md' : 'text-yellow-200'}`}>
                    @{part}
                </span>
            );
        }
        return <span key={index}>{part}</span>;
    });
}

export default function ChatSidebar() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const { 
        messages, privateMessages, conversations, activePrivateUser,
        sendMessage, sendPrivateMessage, initSocket, fetchMessages, 
        fetchPrivateMessages, fetchConversations, setActivePrivateUser, 
        clearActivePrivateUser, isChatOpen, closeChat,
        unreadPms, hasMention, clearMention, clearUnreadPms
    } = useGameStore();

    const [chatMode, setChatOpenMode] = useState('global'); // 'global', 'list', 'private'
    const [newMessage, setNewMessage] = useState('');
    const [showEmojis, setShowEmojis] = useState(false);
    const [activeUsers, setActiveUsers] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [replyingTo, setReplyingTo] = useState(null);
    const [userContextMenu, setUserContextMenu] = useState(null); 
    
    const messagesEndRef = useRef(null);
    const suggestionsRef = useRef(null);
    const inputRef = useRef(null);
    const menuRef = useRef(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const fetchActiveUsers = useCallback(async () => {
        try {
            const res = await api.get('/chat/users');
            if (res.data.ok) setActiveUsers(res.data.usernames);
        } catch (err) { console.error(err); }
    }, []);

    useEffect(() => {
        if (isChatOpen) {
            initSocket();
            fetchMessages();
            fetchConversations();
            fetchActiveUsers();
            scrollToBottom();
            if (chatMode === 'global') clearMention();
            if (chatMode === 'list' || chatMode === 'private') clearUnreadPms();
        }
    }, [isChatOpen, chatMode, clearMention, clearUnreadPms]);

    useEffect(() => {
        if (activePrivateUser) {
            setChatOpenMode('private');
            fetchPrivateMessages(activePrivateUser.id);
        }
    }, [activePrivateUser, fetchPrivateMessages]);

    useEffect(() => {
        scrollToBottom();
    }, [messages, privateMessages, chatMode, scrollToBottom]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) setSuggestions([]);
            if (menuRef.current && !menuRef.current.contains(event.target)) setUserContextMenu(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        const val = e.target.value;
        setNewMessage(val);
        if (chatMode !== 'global') { setSuggestions([]); return; }

        const cursorPosition = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, cursorPosition);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1) {
            const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
            if (!textAfterAt.includes(' ')) {
                const filtered = activeUsers.filter(u => u.toLowerCase().startsWith(textAfterAt.toLowerCase())).slice(0, 5);
                setSuggestions(filtered);
                return;
            }
        }
        setSuggestions([]);
    };

    const handleSend = async (e) => {
        e.preventDefault();
        const msg = newMessage.trim();
        if (!msg) return;

        setNewMessage('');
        setSuggestions([]);
        
        if (chatMode === 'global') {
            const res = await sendMessage(msg, replyingTo?.id);
            if (res.ok) setReplyingTo(null);
            else toast.error(res.message);
        } else if (chatMode === 'private' && activePrivateUser) {
            const res = await sendPrivateMessage(activePrivateUser.id, msg);
            if (!res.ok) toast.error(res.message);
        }
    };

    const openUserMenu = (e, targetUser) => {
        e.preventDefault(); e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        setUserContextMenu({ id: targetUser.id, username: targetUser.username, x: rect.left, y: rect.top - 100 });
    };

    const renderGlobalChat = () => (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-transparent to-slate-900/20">
                {messages.map((msg, i) => {
                    const isOwn = msg.userId === user?.id;
                    const isMentioned = msg.message.includes(`@${user?.username || user?.name}`);
                    return (
                        <div key={i} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'} group`}>
                            <button 
                                onClick={(e) => !isOwn && openUserMenu(e, { id: msg.userId, username: msg.username })}
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs border shadow-lg transition-transform active:scale-90 ${isOwn ? 'bg-primary border-primary/20 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-primary/50'}`}
                            >
                                {msg.username?.charAt(0).toUpperCase()}
                            </button>
                            <div className={`max-w-[80%] space-y-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col relative`}>
                                <div className="flex items-center gap-2 px-1">
                                    <button 
                                        onClick={(e) => !isOwn && openUserMenu(e, { id: msg.userId, username: msg.username })}
                                        className="text-[9px] font-black text-gray-500 uppercase tracking-widest hover:text-primary transition-colors"
                                    >
                                        {msg.username}
                                    </button>
                                    <span className="text-[8px] text-gray-600">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="relative group/bubble">
                                    <div className={`px-4 py-3 rounded-2xl text-[13px] font-medium shadow-sm leading-relaxed whitespace-pre-wrap break-words ${isOwn ? 'bg-primary text-white rounded-br-none' : isMentioned ? 'bg-yellow-500/10 text-yellow-200 border border-yellow-500/30 rounded-bl-none shadow-[0_0_15px_rgba(234,179,8,0.1)]' : 'bg-gray-800/60 text-gray-200 border border-gray-800/50 rounded-bl-none'}`}>
                                        {msg.replyTo && (
                                            <div className={`mb-2 p-2 rounded-lg border-l-4 text-[11px] bg-black/20 ${isOwn ? 'border-white/30 text-white/80' : 'border-primary text-gray-400'}`}>
                                                <p className="font-black uppercase text-[9px] mb-0.5">{msg.replyTo.username}</p>
                                                <p className="truncate italic">"{msg.replyTo.message}"</p>
                                            </div>
                                        )}
                                        {renderMessageText(msg.message, user?.name)}
                                    </div>
                                    <button onClick={() => setReplyingTo({ id: msg.id, username: msg.username, message: msg.message })} className={`absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-800/80 text-white opacity-0 group-hover/bubble:opacity-100 transition-all border border-gray-700 ${isOwn ? '-left-12' : '-right-12'}`}><Reply className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );

    const renderPrivateChat = () => (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/30 border-b border-gray-800/50">
                <div className="flex items-center gap-3">
                    <button onClick={() => { setChatOpenMode('list'); clearActivePrivateUser(); }} className="p-2 text-gray-400 hover:text-white transition-colors"><ArrowLeft className="w-4 h-4" /></button>
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs border border-primary/20">
                        {activePrivateUser?.username?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-black text-white leading-none">{activePrivateUser?.username}</p>
                        <p className="text-[10px] text-emerald-500 font-bold uppercase mt-1">Chat Privado</p>
                    </div>
                </div>
                <button onClick={(e) => openUserMenu(e, activePrivateUser)} className="p-2 text-gray-500 hover:text-white"><MoreVertical className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-transparent to-slate-900/20">
                {privateMessages.map((msg, i) => {
                    const isOwn = msg.senderId === user?.id;
                    return (
                        <div key={i} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                            <div className={`px-4 py-3 rounded-2xl text-[13px] font-medium shadow-sm max-w-[85%] ${isOwn ? 'bg-primary text-white rounded-br-none' : 'bg-gray-800/60 text-gray-200 border border-gray-800/50 rounded-bl-none'}`}>
                                {msg.message}
                                <p className={`text-[8px] mt-1 ${isOwn ? 'text-white/50 text-right' : 'text-gray-500'}`}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );

    const renderConversationList = () => (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-2 mb-4">Suas Conversas</h3>
            {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center px-8 opacity-20">
                    <MessageSquare className="w-12 h-12 mb-4" />
                    <p className="text-sm font-bold">Nenhuma conversa iniciada</p>
                </div>
            ) : conversations.map((conv, i) => (
                <button key={i} onClick={() => { setActivePrivateUser({ id: conv.userId, username: conv.username }); setChatOpenMode('private'); }} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-gray-800/30 hover:bg-gray-800/60 border border-gray-800/50 transition-all group">
                    <div className="w-12 h-12 rounded-xl bg-gray-700 flex items-center justify-center text-lg font-black text-white group-hover:bg-primary transition-colors uppercase">{conv.username.charAt(0)}</div>
                    <div className="flex-1 text-left min-w-0"><p className="font-black text-white truncate">{conv.username}</p><p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter truncate">Abrir conversa privada</p></div>
                    <div className="text-[8px] font-bold text-gray-600 uppercase">{new Date(conv.lastMessageAt).toLocaleDateString()}</div>
                </button>
            ))}
        </div>
    );

    return (
        <div className={`fixed inset-y-0 right-0 z-50 w-full md:w-[400px] bg-slate-950/95 backdrop-blur-xl border-l border-gray-800/80 shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${isChatOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800/50 bg-slate-900/50">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <button onClick={() => setChatOpenMode('global')} className={`p-2 rounded-xl transition-all ${chatMode === 'global' ? 'bg-primary text-white shadow-glow-sm' : 'text-gray-500 hover:text-white'}`}><MessageSquare className="w-5 h-5" /></button>
                        {hasMention && <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full border-2 border-slate-950 flex items-center justify-center animate-bounce"><AtSign className="w-2 h-2 text-black font-black" /></div>}
                    </div>
                    <div className="relative">
                        <button onClick={() => setChatOpenMode('list')} className={`p-2 rounded-xl transition-all ${chatMode === 'list' || chatMode === 'private' ? 'bg-primary text-white shadow-glow-sm' : 'text-gray-500 hover:text-white'}`}><User className="w-5 h-5" /></button>
                        {unreadPms > 0 && <div className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full border-2 border-slate-950 flex items-center justify-center text-[8px] font-black text-white animate-in zoom-in duration-300">{unreadPms}</div>}
                    </div>
                </div>
                <button onClick={closeChat} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-xl transition-all"><X className="w-5 h-5" /></button>
            </div>

            {chatMode === 'global' ? renderGlobalChat() : chatMode === 'list' ? renderConversationList() : renderPrivateChat()}

            {chatMode !== 'list' && (
                <div className="p-4 bg-slate-900/80 border-t border-gray-800/50 space-y-3">
                    {replyingTo && (
                        <div className="flex items-center justify-between p-3 bg-gray-800/50 border border-gray-700/50 rounded-2xl animate-in slide-in-from-bottom-2 duration-300"><div className="flex items-center gap-3 min-w-0"><CornerDownRight className="w-4 h-4 text-primary shrink-0" /><div className="min-w-0"><p className="text-[10px] font-black text-primary uppercase tracking-widest">Respondendo a {replyingTo.username}</p><p className="text-xs text-gray-400 truncate font-medium">"{replyingTo.message}"</p></div></div><button onClick={() => setReplyingTo(null)} className="p-1.5 text-gray-500 hover:text-white transition-colors bg-gray-700/50 rounded-lg"><X className="w-3 h-3" /></button></div>
                    )}
                    <form onSubmit={handleSend} className="relative flex flex-col gap-2">
                        <div className="relative flex items-center bg-gray-900 border border-gray-700/50 rounded-2xl shadow-inner focus-within:border-primary/50 transition-colors"><input ref={inputRef} type="text" value={newMessage} onChange={handleInputChange} placeholder="Digite sua mensagem..." className="w-full bg-transparent py-3.5 pl-4 pr-10 text-gray-200 text-sm focus:outline-none" autoComplete="off" /><button type="button" onClick={() => setShowEmojis(!showEmojis)} className="absolute right-3 text-gray-500 hover:text-amber-400 transition-colors p-1"><Smile className="w-5 h-5" /></button></div>
                        {suggestions.length > 0 && (<div ref={suggestionsRef} className="absolute bottom-full left-0 mb-3 w-full bg-gray-800 border border-gray-700 rounded-2xl p-2 shadow-2xl animate-in slide-in-from-bottom-2 duration-200 z-50 overflow-hidden text-left"><p className="text-[9px] font-black text-gray-500 uppercase tracking-widest px-3 py-1.5 border-b border-gray-700/50 mb-1">Mencionar Usuário</p>{suggestions.map(u => (<button key={u} type="button" onClick={() => { const lastAtIndex = newMessage.lastIndexOf('@'); const beforeAt = newMessage.slice(0, lastAtIndex); setNewMessage(beforeAt + '@' + u + ' '); setSuggestions([]); inputRef.current?.focus(); }} className="w-full text-left px-3 py-2 hover:bg-yellow-400/10 hover:text-yellow-200 rounded-xl transition-all flex items-center gap-2 group"><div className="w-6 h-6 rounded-lg bg-gray-700 flex items-center justify-center text-[10px] font-bold group-hover:bg-yellow-400/20">{u.charAt(0).toUpperCase()}</div><span className="text-sm font-bold">{u}</span></button>))}</div>)}
                        {showEmojis && (<div className="absolute bottom-full right-0 mb-3 bg-gray-800 border border-gray-700 rounded-2xl p-3 shadow-2xl grid grid-cols-7 gap-1.5 animate-in slide-in-from-bottom-2 duration-200 z-50">{QUICK_EMOJIS.map(emoji => (<button key={emoji} type="button" onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojis(false); inputRef.current?.focus(); }} className="text-lg hover:bg-gray-700 rounded-lg p-1 transition-colors">{emoji}</button>))}</div>)}
                        <button type="submit" disabled={!newMessage.trim()} className="bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:hover:bg-primary text-white py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-[0.98] font-black text-sm uppercase italic tracking-widest"><Send className="w-4 h-4" /> Enviar</button>
                    </form>
                </div>
            )}

            {userContextMenu && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setUserContextMenu(null)}><div ref={menuRef} className="bg-gray-900 border border-gray-800 rounded-[2rem] p-6 w-72 shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200 space-y-6" onClick={(e) => e.stopPropagation()}><div className="flex flex-col items-center text-center space-y-3"><div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl font-black text-primary border border-primary/20">{userContextMenu.username.charAt(0).toUpperCase()}</div><div><h3 className="text-white font-black text-lg">{userContextMenu.username}</h3><p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Protocolo Social Ativo</p></div></div><div className="space-y-2"><button onClick={() => { setActivePrivateUser({ id: userContextMenu.id, username: userContextMenu.username }); setChatOpenMode('private'); setUserContextMenu(null); }} className="w-full py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-3 italic"><MessageSquare className="w-4 h-4" /> Enviar Mensagem</button><button onClick={() => { navigate(`/room/${userContextMenu.username}`); closeChat(); setUserContextMenu(null); }} className="w-full py-4 bg-gray-800 text-gray-300 hover:text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-700 transition-all flex items-center justify-center gap-3"><Eye className="w-4 h-4" /> Ver Sala</button></div><button onClick={() => setUserContextMenu(null)} className="w-full py-2 text-[10px] font-black text-gray-600 uppercase hover:text-gray-400 transition-colors">Cancelar</button></div></div>
            )}
        </div>
    );
}
