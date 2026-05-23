import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import {
    Settings as SettingsIcon,
    Lock,
    Wallet,
    User,
    ShieldCheck,
    Save,
    Loader2,
    CheckCircle2,
    Mail,
    ShieldOff
} from 'lucide-react';
import { api, useAuthStore } from '../../store/auth';
import { Edit2 } from 'lucide-react';
import { useGameStore } from '../../store/game';

export default function Settings() {
    const { t } = useTranslation();
    const { user, setUser } = useAuthStore();
    const { stats, fetchAll } = useGameStore();
    
    const [isSavingWallet, setIsSavingWallet] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isChangingUsername, setIsChangingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState('');

    const [email2faEnabled, setEmail2faEnabled] = useState(false);
    const [email2faLoading, setEmail2faLoading] = useState(false);
    const [email2faChallenge, setEmail2faChallenge] = useState<{
        challengeToken: string;
        ttlMinutes: number;
        action: 'enable' | 'disable';
    } | null>(null);
    const [email2faCode, setEmail2faCode] = useState('');

    const [walletAddress, setWalletAddress] = useState('');
    const [passwords, setPasswords] = useState({
        current: '',
        new: '',
        confirm: ''
    });

    useEffect(() => {
        if (stats?.miner?.walletAddress) {
            setWalletAddress(stats.miner.walletAddress);
        }
    }, [stats]);

    useEffect(() => {
        api.get('/user/email-2fa/status')
            .then((res) => { if (res.data?.ok) setEmail2faEnabled(Boolean(res.data.enabled)); })
            .catch(() => {});
    }, []);

    const handleEmail2faToggle = async () => {
        if (email2faLoading) return;
        try {
            setEmail2faLoading(true);
            const res = await api.post('/user/email-2fa/challenge');
            if (res.data?.ok) {
                setEmail2faChallenge({
                    challengeToken: res.data.challengeToken,
                    ttlMinutes: res.data.ttlMinutes ?? 10,
                    action: email2faEnabled ? 'disable' : 'enable',
                });
                setEmail2faCode('');
                toast.info('Código enviado para seu e-mail.');
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (err.response?.data as { message?: string })?.message ?? null
                : null;
            toast.error(msg || 'Erro ao enviar código.');
        } finally {
            setEmail2faLoading(false);
        }
    };

    const handleEmail2faCodeSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!email2faChallenge || email2faLoading) return;
        if (!/^\d{6}$/.test(email2faCode.trim())) {
            toast.error('Código deve ter 6 dígitos.');
            return;
        }
        try {
            setEmail2faLoading(true);
            const endpoint = email2faChallenge.action === 'enable' ? '/user/email-2fa/enable' : '/user/email-2fa/disable';
            const res = await api.post(endpoint, {
                code: email2faCode.trim(),
                challengeToken: email2faChallenge.challengeToken,
            });
            if (res.data?.ok) {
                setEmail2faEnabled(email2faChallenge.action === 'enable');
                setEmail2faChallenge(null);
                setEmail2faCode('');
                toast.success(res.data.message || 'Configuração salva.');
            } else {
                toast.error(res.data?.message || 'Erro ao verificar código.');
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (err.response?.data as { message?: string })?.message ?? null
                : null;
            if (msg?.toLowerCase().includes('expirado')) {
                setEmail2faChallenge(null);
                setEmail2faCode('');
            }
            toast.error(msg || 'Código inválido.');
        } finally {
            setEmail2faLoading(false);
        }
    };

    const handleChangeUsername = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmed = newUsername.trim();
        if (!trimmed) return;
        if (trimmed.length < 3) return toast.error('Nome deve ter pelo menos 3 caracteres.');
        if (!/^[a-zA-Z0-9._\- ]+$/.test(trimmed)) return toast.error('Nome só pode conter letras, números, espaço, ponto, underline e hífen.');
        try {
            setIsChangingUsername(true);
            const res = await api.post('/user/change-username', { username: trimmed });
            if (res.data.ok) {
                toast.success('Nome de usuário alterado com sucesso!');
                setUser({ username: trimmed, name: trimmed });
                setNewUsername('');
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (typeof err.response?.data === 'object' &&
                      err.response?.data !== null &&
                      'message' in err.response.data &&
                      typeof (err.response.data as { message?: unknown }).message === 'string'
                      ? (err.response.data as { message: string }).message
                      : null)
                : null;
            toast.error(msg || 'Erro ao alterar o nome de usuário.');
        } finally {
            setIsChangingUsername(false);
        }
    };

    const handleUpdateWallet = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!walletAddress.trim()) return toast.error("Endereço de carteira inválido.");
        
        try {
            setIsSavingWallet(true);
            const res = await api.post('/wallet/address', { walletAddress });
            if (res.data.ok) {
                toast.success("Carteira atualizada com sucesso!");
                fetchAll(); // Refresh stats to get updated address
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (typeof err.response?.data === 'object' &&
                      err.response?.data !== null &&
                      'message' in err.response.data &&
                      typeof (err.response.data as { message?: unknown }).message === 'string'
                      ? (err.response.data as { message: string }).message
                      : null)
                : null;
            toast.error(msg || 'Erro ao atualizar carteira.');
        } finally {
            setIsSavingWallet(false);
        }
    };

    const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (passwords.new !== passwords.confirm) {
            return toast.error("As senhas não coincidem.");
        }
        if (passwords.new.length < 8) {
            return toast.error("A nova senha deve ter pelo menos 8 caracteres.");
        }

        try {
            setIsChangingPassword(true);
            const res = await api.post('/auth/change-password', {
                currentPassword: passwords.current,
                newPassword: passwords.new
            });
            if (res.data.ok) {
                toast.success("Senha alterada com sucesso!");
                setPasswords({ current: '', new: '', confirm: '' });
            }
        } catch (err: unknown) {
            const msg = isAxiosError(err)
                ? (typeof err.response?.data === 'object' &&
                      err.response?.data !== null &&
                      'message' in err.response.data &&
                      typeof (err.response.data as { message?: unknown }).message === 'string'
                      ? (err.response.data as { message: string }).message
                      : null)
                : null;
            toast.error(msg || 'Erro ao alterar senha.');
        } finally {
            setIsChangingPassword(false);
        }
    };

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
                        <SettingsIcon className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight italic uppercase">Configurações</h1>
                    <p className="text-gray-500 font-medium uppercase text-[10px] tracking-[0.2em]">Gerencie sua conta e segurança</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Account Info & Wallet */}
                <div className="space-y-8">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-500/10 rounded-xl">
                                <User className="w-5 h-5 text-blue-400" />
                            </div>
                            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Perfil do Usuário</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-1">Nome de Usuário</span>
                                <span className="text-sm font-bold text-white">
                                    {String(
                                        (typeof user?.username === 'string' && user.username) ||
                                            (typeof user?.name === 'string' && user.name) ||
                                            '',
                                    )}
                                </span>
                            </div>
                            <div className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800">
                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest block mb-1">E-mail</span>
                                <span className="text-sm font-bold text-white truncate">
                                    {String(typeof user?.email === 'string' ? user.email : '')}
                                </span>
                            </div>
                        </div>

                        <form onSubmit={handleChangeUsername} className="space-y-3 pt-4 border-t border-gray-800">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2 block">Novo Nome de Usuário</label>
                            <div className="relative flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1.5 focus-within:border-primary/50 transition-all shadow-inner">
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    placeholder={String(
                                        (typeof user?.username === 'string' && user.username) ||
                                            (typeof user?.name === 'string' && user.name) ||
                                            '',
                                    )}
                                    minLength={3}
                                    maxLength={24}
                                    className="bg-transparent border-none text-sm font-bold text-gray-300 px-4 w-full focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    disabled={isChangingUsername || !newUsername.trim()}
                                    className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
                                >
                                    {isChangingUsername ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit2 className="w-3.5 h-3.5" />}
                                    Salvar
                                </button>
                            </div>
                            <p className="text-[9px] text-gray-600 font-medium px-4">3–24 caracteres. Letras, números, espaço, ponto, underline e hífen.</p>
                        </form>

                        <form onSubmit={handleUpdateWallet} className="space-y-4">
                            <div className="flex items-center gap-4 mb-4 pt-4 border-t border-gray-800">
                                <div className="p-3 bg-purple-500/10 rounded-xl">
                                    <Wallet className="w-5 h-5 text-purple-400" />
                                </div>
                                <h2 className="text-lg font-bold text-white uppercase tracking-wider">Carteira de Pagamento</h2>
                            </div>
                            
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Endereço Polygon (MATIC/USDC)</label>
                                <div className="relative flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1.5 focus-within:border-primary/50 transition-all shadow-inner">
                                    <input 
                                        type="text" 
                                        value={walletAddress}
                                        onChange={(e) => setWalletAddress(e.target.value)}
                                        placeholder="0x..."
                                        className="bg-transparent border-none text-sm font-bold text-gray-300 px-4 w-full focus:outline-none"
                                    />
                                    <button 
                                        type="submit"
                                        disabled={isSavingWallet}
                                        className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest"
                                    >
                                        {isSavingWallet ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                        Salvar
                                    </button>
                                </div>
                                <p className="text-[9px] text-gray-600 font-medium px-4">Utilizado para retiradas automáticas e depósitos.</p>
                            </div>
                        </form>
                    </div>

                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-[2rem] p-6 flex items-start gap-4">
                        <div className="p-3 bg-emerald-500/10 rounded-xl">
                            <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                            <h4 className="text-white font-bold text-sm uppercase tracking-wider">Conta Verificada</h4>
                            <p className="text-[11px] text-gray-500 leading-relaxed mt-1">Sua conta possui todos os protocolos de segurança ativos. Seus dados estão criptografados de ponta a ponta.</p>
                        </div>
                    </div>
                </div>

                {/* Password Change + Email 2FA */}
                <div className="space-y-8">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 bg-amber-500/10 rounded-xl">
                                <Lock className="w-5 h-5 text-amber-400" />
                            </div>
                            <h2 className="text-lg font-bold text-white uppercase tracking-wider">Segurança e Senha</h2>
                        </div>

                        <form onSubmit={handleChangePassword} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Senha Atual</label>
                                <input
                                    type="password"
                                    value={passwords.current}
                                    onChange={(e) => setPasswords({...passwords, current: e.target.value})}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Nova Senha</label>
                                <input
                                    type="password"
                                    value={passwords.new}
                                    onChange={(e) => setPasswords({...passwords, new: e.target.value})}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-2">Confirmar Nova Senha</label>
                                <input
                                    type="password"
                                    value={passwords.confirm}
                                    onChange={(e) => setPasswords({...passwords, confirm: e.target.value})}
                                    className="w-full bg-gray-950 border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isChangingPassword}
                                className="w-full py-5 bg-gray-800 hover:bg-primary hover:text-white text-gray-400 rounded-[2rem] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 font-black text-xs uppercase tracking-[0.2em] italic border border-gray-700 hover:border-primary/50"
                            >
                                {isChangingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                Atualizar Credenciais
                            </button>
                        </form>
                    </div>

                    {/* Email 2FA */}
                    <div className={`relative overflow-hidden rounded-[2.5rem] p-8 shadow-xl border transition-all duration-500 ${
                        email2faEnabled
                            ? 'bg-emerald-950/40 border-emerald-500/25'
                            : 'bg-surface border-gray-800/50'
                    }`}>
                        {/* Glow accent when active */}
                        {email2faEnabled && (
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 via-transparent to-transparent pointer-events-none" />
                        )}

                        {/* Header */}
                        <div className="relative flex items-center gap-4 mb-6">
                            <div className={`relative p-3.5 rounded-2xl transition-all duration-500 ${
                                email2faEnabled ? 'bg-emerald-500/15 shadow-lg shadow-emerald-500/10' : 'bg-gray-800/60'
                            }`}>
                                {email2faEnabled
                                    ? <ShieldCheck className="w-6 h-6 text-emerald-400" />
                                    : <Mail className="w-6 h-6 text-gray-500" />
                                }
                                {email2faEnabled && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full shadow-lg shadow-emerald-400/50" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-base font-black text-white uppercase tracking-wider">
                                    2FA por E-mail
                                </h2>
                                <p className={`text-[10px] font-semibold mt-0.5 transition-colors duration-300 ${
                                    email2faEnabled ? 'text-emerald-400/80' : 'text-gray-500'
                                }`}>
                                    {email2faEnabled
                                        ? 'Ativo — exigido no login e em saques'
                                        : 'Inativo — saques sem verificação de e-mail'}
                                </p>
                            </div>
                            {/* Toggle pill */}
                            <button
                                type="button"
                                onClick={handleEmail2faToggle}
                                disabled={email2faLoading || Boolean(email2faChallenge)}
                                aria-label={email2faEnabled ? 'Desativar 2FA' : 'Ativar 2FA'}
                                className={`relative shrink-0 w-12 h-6 rounded-full transition-all duration-300 focus:outline-none disabled:opacity-50 ${
                                    email2faEnabled ? 'bg-emerald-500' : 'bg-gray-700'
                                }`}
                            >
                                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300 ${
                                    email2faEnabled ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
                                }`} />
                                {email2faLoading && (
                                    <Loader2 className="absolute inset-0 m-auto w-3.5 h-3.5 animate-spin text-white" />
                                )}
                            </button>
                        </div>

                        {/* What this protects */}
                        <div className={`relative grid grid-cols-2 gap-2 mb-5 text-[10px] font-semibold uppercase tracking-widest`}>
                            {[
                                { label: 'Login', active: email2faEnabled },
                                { label: 'Saques', active: email2faEnabled },
                            ].map(({ label, active }) => (
                                <div key={label} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-300 ${
                                    active
                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                        : 'bg-gray-900/40 border-gray-800 text-gray-600'
                                }`}>
                                    <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-400' : 'text-gray-700'}`} />
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* Code verification form (shown after toggle click) */}
                        {email2faChallenge && (
                            <form onSubmit={handleEmail2faCodeSubmit} className="relative space-y-3 pt-5 border-t border-white/5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                                    Código enviado para seu e-mail.<br />
                                    <span className="text-gray-500">Expira em {email2faChallenge.ttlMinutes} min.</span>
                                </p>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{6}"
                                    maxLength={6}
                                    value={email2faCode}
                                    onChange={(e) => setEmail2faCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="• • • • • •"
                                    className="w-full bg-gray-950 border border-gray-700 focus:border-primary/50 rounded-2xl py-4 px-6 text-2xl font-black text-white text-center tracking-[0.5em] focus:outline-none transition-all shadow-inner placeholder:tracking-[0.3em] placeholder:text-gray-700"
                                    autoFocus
                                />
                                <button
                                    type="submit"
                                    disabled={email2faLoading || email2faCode.length !== 6}
                                    className="w-full py-4 bg-primary hover:bg-primary-hover text-white rounded-[2rem] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 font-black text-xs uppercase tracking-[0.2em] italic"
                                >
                                    {email2faLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Confirmar código
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setEmail2faChallenge(null); setEmail2faCode(''); }}
                                    className="w-full py-2 text-gray-600 hover:text-gray-400 text-[10px] font-black uppercase tracking-widest transition-colors"
                                >
                                    Cancelar
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
