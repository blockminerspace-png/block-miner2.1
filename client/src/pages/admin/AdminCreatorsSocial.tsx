import { useState } from 'react';
import { Youtube, Users } from 'lucide-react';
import AdminCreators from './AdminCreators';
import AdminSocial from './AdminSocial';

type TabKey = 'creators' | 'social';

const TABS: { key: TabKey; label: string; icon: typeof Youtube }[] = [
  { key: 'creators', label: 'Criadores', icon: Users },
  { key: 'social', label: 'Social YouTube', icon: Youtube },
];

export default function AdminCreatorsSocial() {
  const [tab, setTab] = useState<TabKey>('creators');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap border-b border-slate-800 pb-2">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                active ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === 'creators' ? <AdminCreators /> : <AdminSocial />}
    </div>
  );
}
