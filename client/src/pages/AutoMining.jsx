import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Cpu, Zap, History, BarChart3, ShieldCheck, Play, Pause, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "../store/auth";
import { validateTrustedEvent, generateSecurityPayload } from "../utils/security";
import AutoMiningModeSelector from "../components/autoMining/AutoMiningModeSelector.jsx";
import AutoMiningCycleTimer from "../components/autoMining/AutoMiningCycleTimer.jsx";
import TurboPartnerBanner from "../components/autoMining/TurboPartnerBanner.jsx";

function errToast(t, err) {
  const code = err.response?.data?.code;
  const msg = err.response?.data?.error || err.message;
  if (code) {
    toast.error(t("autoMiningGpuPage.error_code", { code }));
  } else {
    toast.error(msg || t("autoMiningGpuPage.error_network"));
  }
}

export default function AutoMining() {
  const { t } = useTranslation();
  const [v2, setV2] = useState(null);
  const [selectedMode, setSelectedMode] = useState("NORMAL");
  const [isLoading, setIsLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const [turboImpression, setTurboImpression] = useState(null);
  const [turboBannerLoading, setTurboBannerLoading] = useState(false);
  const [turboBannerError, setTurboBannerError] = useState(false);
  const [bannerTracked, setBannerTracked] = useState(false);

  const normalClaimBusyRef = useRef(false);
  const nextClaimRef = useRef(null);
  const turboFetchedForRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await api.get("/auto-mining-gpu/v2/status");
      if (res.data.success) setV2(res.data);
    } catch (err) {
      console.error("auto-mining v2 status", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/auto-mining-gpu/v2/status");
        if (!cancelled && res.data.success) setV2(res.data);
      } catch (err) {
        console.error("auto-mining v2 status", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const session = v2?.session;
  const isRunning = !!(session && session.isActive);
  const mode = session?.mode || selectedMode;
  const cycleSeconds = v2?.cycleSeconds ?? 60;
  const nextClaimAtIso = session?.nextClaimAt ? new Date(session.nextClaimAt).toISOString() : null;

  useEffect(() => {
    nextClaimRef.current = nextClaimAtIso;
  }, [nextClaimAtIso]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      refreshStatus();
    }, 45000);
    return () => clearInterval(id);
  }, [isRunning, refreshStatus]);

  useEffect(() => {
    if (!isRunning || mode !== "NORMAL") return;
    const id = setInterval(async () => {
      const target = nextClaimRef.current;
      if (!target) return;
      const remain = Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / 1000));
      if (remain > 0 || normalClaimBusyRef.current) return;
      normalClaimBusyRef.current = true;
      try {
        const res = await api.post("/auto-mining-gpu/v2/claim/normal");
        if (res.data.success) {
          toast.success(t("autoMiningGpuPage.claim_success_normal"));
          setV2(res.data);
          const s = res.data.session;
          if (s?.nextClaimAt) {
            nextClaimRef.current = new Date(s.nextClaimAt).toISOString();
          }
        }
      } catch (err) {
        const code = err.response?.data?.code;
        if (code && code !== "CLAIM_NOT_DUE" && code !== "CONCURRENT_CLAIM") {
          errToast(t, err);
        }
      } finally {
        normalClaimBusyRef.current = false;
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, mode, t]);

  useEffect(() => {
    if (!isRunning || mode !== "TURBO") {
      setTurboImpression(null);
      setTurboBannerLoading(false);
      setTurboBannerError(false);
      setBannerTracked(false);
      return;
    }
    if (!nextClaimAtIso) return;
    const remain = Math.max(0, Math.ceil((new Date(nextClaimAtIso).getTime() - Date.now()) / 1000));
    if (remain > 10) {
      turboFetchedForRef.current = null;
      setTurboImpression(null);
      setTurboBannerLoading(false);
      setTurboBannerError(false);
      setBannerTracked(false);
    }
  }, [isRunning, mode, nextClaimAtIso]);

  useEffect(() => {
    if (!isRunning || mode !== "TURBO") return;
    const id = setInterval(async () => {
      const target = nextClaimRef.current;
      if (!target) return;
      const remain = Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / 1000));
      if (remain > 0) return;
      if (turboFetchedForRef.current === target) return;
      turboFetchedForRef.current = target;
      setTurboBannerLoading(true);
      setTurboBannerError(false);
      setBannerTracked(false);
      try {
        const res = await api.get("/auto-mining-gpu/v2/banner");
        if (res.data.success) {
          setTurboImpression(res.data.impression);
          setTurboBannerError(false);
        }
      } catch (err) {
        turboFetchedForRef.current = null;
        setTurboBannerError(true);
        setTurboImpression(null);
        errToast(t, err);
      } finally {
        setTurboBannerLoading(false);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, mode, t]);

  useEffect(() => {
    if (!isRunning) return;
    const sendHeartbeat = async () => {
      try {
        const security = generateSecurityPayload();
        await api.post("/session/heartbeat", { type: "auto-mining", security });
      } catch {
        /* non-fatal */
      }
    };
    let heartbeatInterval = setInterval(sendHeartbeat, 10000);
    const onVisible = () => {
      if (!document.hidden) {
        clearInterval(heartbeatInterval);
        sendHeartbeat();
        heartbeatInterval = setInterval(sendHeartbeat, 10000);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isRunning]);

  const handleStart = async (e) => {
    if (!validateTrustedEvent(e)) return;
    setActionBusy(true);
    try {
      const res = await api.post("/auto-mining-gpu/v2/session/start", { mode: selectedMode });
      if (res.data.success) {
        setV2(res.data);
        toast.success(t("autoMiningGpuPage.toast_started"));
      }
    } catch (err) {
      errToast(t, err);
    } finally {
      setActionBusy(false);
    }
  };

  const handleStop = async (e) => {
    if (!validateTrustedEvent(e)) return;
    setActionBusy(true);
    try {
      const res = await api.post("/auto-mining-gpu/v2/session/stop");
      if (res.data.success) {
        setV2(res.data);
        toast.success(t("autoMiningGpuPage.toast_stopped"));
      }
    } catch (err) {
      errToast(t, err);
    } finally {
      setActionBusy(false);
    }
  };

  const registerBannerClick = async (impressionId) => {
    try {
      await api.post("/auto-mining-gpu/v2/banner/click", { impressionId });
    } catch (err) {
      errToast(t, err);
      throw err;
    }
  };

  const handleClaimTurbo = async (e) => {
    if (!validateTrustedEvent(e)) return;
    if (!turboImpression?.id || !bannerTracked) return;
    setActionBusy(true);
    try {
      const res = await api.post("/auto-mining-gpu/v2/claim/turbo", { impressionId: turboImpression.id });
      if (res.data.success) {
        toast.success(t("autoMiningGpuPage.claim_success_turbo"));
        setV2(res.data);
        setTurboImpression(null);
        setBannerTracked(false);
      }
    } catch (err) {
      errToast(t, err);
    } finally {
      setActionBusy(false);
    }
  };

  const dailyUsed = v2?.dailyUsedHash ?? 0;
  const dailyRemaining = v2?.dailyRemainingHash ?? 0;
  const dailyLimit = v2?.dailyLimitHash ?? 1000;
  const sessionEarnings = v2?.sessionEarningsHash ?? 0;
  const activeGrants = v2?.activeGrants ?? [];
  const recentGrants = v2?.recentGrants ?? [];
  const bannerStats = v2?.bannerStatsToday ?? { impressions: 0, clicks: 0 };
  const nearest = activeGrants[0];
  const dailyPct = dailyLimit > 0 ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0;

  if (isLoading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t("autoMiningGpuPage.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
            <Cpu className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">{t("autoMiningGpuPage.title")}</h1>
          <p className="text-gray-500 font-medium max-w-xl">{t("autoMiningGpuPage.subtitle")}</p>
        </div>
        <div className="bg-slate-900/50 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2 shadow-glow-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-400 font-black text-[10px] uppercase tracking-widest">{t("autoMiningGpuPage.secure_badge")}</span>
        </div>
      </div>

      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{t("autoMiningGpuPage.legacy_note")}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-surface border border-gray-800/50 rounded-[3rem] p-8 md:p-10 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 space-y-8">
              {!isRunning ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">{t("autoMiningGpuPage.mode_title")}</h2>
                    <p className="text-sm text-gray-500 font-medium mt-1">{t("autoMiningGpuPage.mode_hint")}</p>
                  </div>
                  <AutoMiningModeSelector value={selectedMode} onChange={setSelectedMode} disabled={actionBusy} t={t} />
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={actionBusy}
                    className="w-full md:w-auto px-12 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest bg-primary text-white shadow-xl hover:scale-[1.02] active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2"
                  >
                    {actionBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    {t("autoMiningGpuPage.start")}
                  </button>
                </div>
              ) : (
                <div className="space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {mode === "TURBO" ? (
                          <Zap className="w-5 h-5 text-amber-400" />
                        ) : (
                          <Cpu className="w-5 h-5 text-primary" />
                        )}
                        <h2 className="text-xl font-black text-white uppercase italic">{mode}</h2>
                      </div>
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">{t("autoMiningGpuPage.pause_hint")}</p>
                    </div>
                    <AutoMiningCycleTimer
                      nextClaimAtIso={nextClaimAtIso}
                      cycleSeconds={cycleSeconds}
                      isRunning={isRunning}
                      labelReady={t("autoMiningGpuPage.cycle_ready")}
                      labelNext={t("autoMiningGpuPage.next_cycle")}
                    />
                  </div>

                  {mode === "TURBO" ? (
                    <div className="space-y-4">
                      <TurboPartnerBanner
                        impression={turboImpression}
                        loading={turboBannerLoading}
                        error={turboBannerError}
                        disabled={actionBusy}
                        onRegisterClick={registerBannerClick}
                        onTracked={() => setBannerTracked(true)}
                        t={t}
                      />
                      <button
                        type="button"
                        onClick={handleClaimTurbo}
                        disabled={actionBusy || !bannerTracked || !turboImpression}
                        className="w-full py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-30 transition-all"
                      >
                        {t("autoMiningGpuPage.claim_turbo")}
                      </button>
                      <p className="text-[10px] text-gray-600 font-bold uppercase text-center">{t("autoMiningGpuPage.claim_turbo_hint")}</p>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={actionBusy}
                    className="w-full md:w-auto px-10 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 flex items-center justify-center gap-2"
                  >
                    <Pause className="w-4 h-4" />
                    {t("autoMiningGpuPage.stop")}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <BarChart3 className="w-20 h-20 text-primary" />
            </div>
            <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Stats
            </h3>
            <TrackerRow label={t("autoMiningGpuPage.daily_used")} value={`${dailyUsed.toFixed(0)} / ${dailyLimit} H/s`} />
            <TrackerRow label={t("autoMiningGpuPage.daily_remaining")} value={`${dailyRemaining.toFixed(0)} H/s`} />
            <p className="text-[9px] text-gray-600 font-bold uppercase">{t("autoMiningGpuPage.daily_limit_note")}</p>
            <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden border border-white/5">
              <div className="h-full bg-gradient-to-r from-primary to-blue-500 transition-all" style={{ width: `${dailyPct}%` }} />
            </div>
            <TrackerRow label={t("autoMiningGpuPage.session_earnings")} value={`${sessionEarnings.toFixed(0)} H/s`} />
            {mode === "TURBO" && isRunning ? (
              <>
                <TrackerRow label={t("autoMiningGpuPage.stats_impressions")} value={String(bannerStats.impressions)} />
                <TrackerRow label={t("autoMiningGpuPage.stats_clicks")} value={String(bannerStats.clicks)} />
              </>
            ) : null}
            <div className="h-px bg-gray-800" />
            <div>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{t("autoMiningGpuPage.nearest_expiry")}</p>
              {nearest ? (
                <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                  <span className="text-[10px] font-black text-emerald-400">+{nearest.hashRate} H/s</span>
                  <span className="text-[9px] text-gray-500 font-bold">{new Date(nearest.expiresAt).toLocaleString()}</span>
                </div>
              ) : (
                <p className="text-[10px] text-gray-600 font-bold uppercase italic">{t("autoMiningGpuPage.no_active_power")}</p>
              )}
            </div>
          </div>

          <div className="bg-gray-950/50 border border-gray-800 rounded-[2.5rem] p-8 shadow-xl space-y-6">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] flex items-center gap-2">
              <History className="w-3 h-3" /> {t("autoMiningGpuPage.recent_grants")}
            </h3>
            <div className="space-y-3 max-h-[360px] overflow-y-auto scrollbar-hide pr-1">
              {recentGrants.length === 0 ? (
                <p className="text-[10px] text-gray-700 font-black uppercase text-center py-8 italic">—</p>
              ) : (
                recentGrants.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-4 bg-gray-900/50 rounded-2xl border border-gray-800/50"
                  >
                    <div>
                      <p className="text-[9px] font-black text-white italic">{new Date(g.earnedAt).toLocaleString()}</p>
                      <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">{g.mode}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-emerald-400">+{g.hashRate} H/s</span>
                      <span className="text-[7px] font-bold text-gray-700 uppercase flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t("autoMiningGpuPage.verified")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackerRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-black text-white italic tabular-nums">{value}</span>
    </div>
  );
}
