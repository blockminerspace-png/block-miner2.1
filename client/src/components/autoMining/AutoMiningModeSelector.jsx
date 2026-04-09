import { Cpu, Zap } from "lucide-react";

/**
 * @param {{ value: 'NORMAL' | 'TURBO', onChange: (m: 'NORMAL' | 'TURBO') => void, disabled?: boolean, t: (k: string) => string }} props
 */
export default function AutoMiningModeSelector({ value, onChange, disabled, t }) {
  const modes = [
    {
      id: "NORMAL",
      title: t("autoMiningGpuPage.mode_normal_title"),
      desc: t("autoMiningGpuPage.mode_normal_desc"),
      icon: Cpu
    },
    {
      id: "TURBO",
      title: t("autoMiningGpuPage.mode_turbo_title"),
      desc: t("autoMiningGpuPage.mode_turbo_desc"),
      icon: Zap
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {modes.map((m) => {
        const Icon = m.icon;
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.id)}
            className={`text-left p-6 rounded-[2rem] border transition-all ${
              active
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                : "border-gray-800 bg-gray-950/40 hover:border-gray-700"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`p-3 rounded-2xl ${active ? "bg-primary/20 text-primary" : "bg-gray-900 text-gray-500"}`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-black text-white uppercase italic tracking-tight">{m.title}</h3>
                <p className="text-[11px] text-gray-500 font-medium leading-relaxed">{m.desc}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
