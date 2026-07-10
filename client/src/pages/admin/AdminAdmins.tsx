import { useState, useEffect } from 'react';
import { Shield, Plus, RefreshCw, CheckCircle, XCircle, Key, RotateCcw } from 'lucide-react';
import { api } from '../../store/auth';
import { toast } from 'sonner';

type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'finance' | 'support' | 'readonly';

interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  permissions: string[];
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-500/20 text-red-300 border-red-500/30',
  admin: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  moderator: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  finance: 'bg-green-500/20 text-green-300 border-green-500/30',
  support: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  readonly: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

const ROLES: AdminRole[] = ['super_admin', 'admin', 'moderator', 'finance', 'support', 'readonly'];

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${ROLE_COLORS[role] ?? 'bg-gray-500/20 text-gray-300 border-gray-500/30'}`}>
      {role.replace('_', ' ')}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAdmins() {
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; admins: AdminUserRow[] }>('/admin/admins');
      setAdmins(res.data.admins);
    } catch { toast.error('Failed to load admins'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleDeactivate = async (a: AdminUserRow) => {
    if (!confirm(`${a.isActive ? 'Deactivate' : 'Activate'} ${a.name}?`)) return;
    try {
      await api.patch(`/admin/admins/${a.id}`, { isActive: !a.isActive });
      toast.success(`Admin ${a.isActive ? 'deactivated' : 'activated'}`);
      void load();
    } catch { toast.error('Failed to update admin'); }
  };

  const handleRevokeAllSessions = async (a: AdminUserRow) => {
    if (!confirm(`Revoke all sessions for ${a.name}?`)) return;
    try {
      await api.delete(`/admin/admins/${a.id}/sessions`);
      toast.success('Sessions revoked');
    } catch { toast.error('Failed to revoke sessions'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Admin Users</h1>
            <p className="text-[11px] text-gray-500">{admins.length} registered administrators</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Admin
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-white/5">
                  <th className="text-left px-5 py-3">Name</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Last Login</th>
                  <th className="text-right px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-5 py-3 text-white font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-gray-400">{a.email}</td>
                    <td className="px-4 py-3"><RoleBadge role={a.role} /></td>
                    <td className="px-4 py-3">
                      {a.isActive
                        ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle className="w-3 h-3" /> Active</span>
                        : <span className="flex items-center gap-1 text-gray-500 text-xs"><XCircle className="w-3 h-3" /> Inactive</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(a.lastLoginAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditTarget(a)}
                          className="px-2.5 py-1 rounded text-[11px] font-medium bg-white/5 hover:bg-white/10 text-gray-300 transition-colors"
                        >Edit</button>
                        <button
                          onClick={() => setResetTarget(a)}
                          title="Reset Password"
                          className="p-1.5 rounded text-gray-400 hover:text-yellow-400 transition-colors"
                        ><Key className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => void handleRevokeAllSessions(a)}
                          title="Revoke all sessions"
                          className="p-1.5 rounded text-gray-400 hover:text-red-400 transition-colors"
                        ><RotateCcw className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => void handleDeactivate(a)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${a.isActive ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-green-500/10 hover:bg-green-500/20 text-green-400'}`}
                        >{a.isActive ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && <CreateAdminModal onClose={() => { setShowCreate(false); void load(); }} />}
      {editTarget && <EditAdminModal admin={editTarget} onClose={() => { setEditTarget(null); void load(); }} />}
      {resetTarget && <ResetPasswordModal admin={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  );
}

function CreateAdminModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'admin' as AdminRole });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post('/admin/admins', form);
      toast.success('Admin created');
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create admin';
      toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-white font-bold">Create Admin</h2>
        {(['name', 'email', 'password'] as const).map((field) => (
          <div key={field}>
            <label className="text-xs text-gray-400 mb-1 block capitalize">{field}</label>
            <input
              type={field === 'password' ? 'password' : 'text'}
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>
        ))}
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Role</label>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
            className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-500">Password must be &ge;12 chars with uppercase, lowercase, number and symbol.</p>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-white/5 text-gray-400 text-sm hover:text-white transition-colors">Cancel</button>
          <button onClick={() => void submit()} disabled={loading} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditAdminModal({ admin, onClose }: { admin: AdminUserRow; onClose: () => void }) {
  const [form, setForm] = useState({ name: admin.name, role: admin.role });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.patch(`/admin/admins/${admin.id}`, form);
      toast.success('Admin updated');
      onClose();
    } catch { toast.error('Failed to update'); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-white font-bold">Edit Admin &mdash; {admin.email}</h2>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Name</label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Role</label>
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))} className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
            {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-white/5 text-gray-400 text-sm hover:text-white transition-colors">Cancel</button>
          <button onClick={() => void submit()} disabled={loading} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordModal({ admin, onClose }: { admin: AdminUserRow; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post(`/admin/admins/${admin.id}/reset-password`, { newPassword: password });
      toast.success('Password reset — all sessions revoked');
      onClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed';
      toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-white font-bold">Reset Password &mdash; {admin.email}</h2>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">New Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <p className="text-[11px] text-yellow-400/80">This will revoke ALL active sessions for this admin.</p>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-white/5 text-gray-400 text-sm hover:text-white transition-colors">Cancel</button>
          <button onClick={() => void submit()} disabled={loading} className="flex-1 py-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
            {loading ? 'Resetting...' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}
