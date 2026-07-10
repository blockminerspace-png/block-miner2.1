import { useState, useEffect } from 'react';
import { User, Key, Monitor, Trash2 } from 'lucide-react';
import { api } from '../../store/auth';
import { toast } from 'sonner';

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActivityAt: string;
  createdAt: string;
  expiresAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminProfile() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [password, setPassword] = useState({ newPassword: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const loadSessions = async () => {
    try {
      const res = await api.get<{ ok: boolean; sessions: Session[]; currentSessionId: string }>('/admin/sessions');
      setSessions(res.data.sessions);
      setCurrentSessionId(res.data.currentSessionId);
    } catch { /* ignore */ }
  };

  useEffect(() => { void loadSessions(); }, []);

  const handleChangePassword = async () => {
    if (password.newPassword !== password.confirm) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/admin/change-password', { newPassword: password.newPassword });
      toast.success('Password changed. Other sessions revoked.');
      setPassword({ newPassword: '', confirm: '' });
      void loadSessions();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed';
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Revoke this session?')) return;
    try {
      await api.delete(`/admin/sessions/${sessionId}`);
      toast.success('Session revoked');
      void loadSessions();
    } catch { toast.error('Failed'); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
          <User className="w-5 h-5 text-blue-400" />
        </div>
        <h1 className="text-lg font-black text-white uppercase tracking-tight">My Profile</h1>
      </div>

      {/* Change Password */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Change Password</h2>
        </div>
        <div className="grid gap-3">
          <input
            type="password"
            placeholder="New password"
            value={password.newPassword}
            onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={password.confirm}
            onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />
        </div>
        <p className="text-[11px] text-gray-500">Must be &ge;12 chars with uppercase, lowercase, number and symbol. All other sessions will be revoked.</p>
        <button
          onClick={() => void handleChangePassword()}
          disabled={loading || !password.newPassword}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </div>

      {/* Active Sessions */}
      <div className="rounded-2xl border border-white/10 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
          <Monitor className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Active Sessions</h2>
          <span className="ml-auto text-xs text-gray-500">{sessions.length} active</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No active sessions</p>
        ) : (
          <div className="divide-y divide-white/5">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white">{s.ipAddress ?? 'Unknown IP'}</p>
                    {s.id === currentSessionId && (
                      <span className="text-[10px] font-black bg-green-500/20 text-green-300 border border-green-500/30 px-1.5 py-0.5 rounded-full uppercase">Current</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 max-w-sm truncate">{s.userAgent ?? '—'}</p>
                  <p className="text-[11px] text-gray-600 mt-0.5">Last active: {formatDate(s.lastActivityAt)}</p>
                </div>
                {s.id !== currentSessionId && (
                  <button
                    onClick={() => void handleRevokeSession(s.id)}
                    className="p-1.5 rounded text-gray-500 hover:text-red-400 transition-colors shrink-0"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
