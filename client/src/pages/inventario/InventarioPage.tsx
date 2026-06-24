import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Inbox,
  ArrowRight,
  Zap,
  Cpu,
  Coins,
  Clock,
  CheckCircle2,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { useGameStore } from "../../store/game";
import { getMachineDisplayImageUrl } from "../machines/machineDisplayImage";
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import { MachineImage } from "../machines/components/MachineImage";
import { formatHashrate } from "../../shared/utils/machine";
import {
  getRewardInbox,
  collectReward,
  collectAllRewards,
} from "../../api/rewardInboxClient";

type RewardInboxItem = {
  id: number;
  status: string;
  source: string;
  rewardType: string;
  rewardValue: string | number;
  minerId: number | null;
  minerName: string | null;
  minerImageUrl: string | null;
  slotSize: number;
  durationHours: number | null;
  metaJson: Record<string, unknown> | null;
  createdAt: string;
};

const SOCKET_DEBOUNCE_MS = 160;

function useSourceLabel(source: string, t: (key: string) => string): string {
  if (source === "checkin_milestone") return t("inventario.source_checkin");
  if (source === "daily_task") return t("inventario.source_daily_task");
  if (source === "offerwall") return t("inventario.source_offerwall");
  return source;
}

function RewardCard({
  item,
  onCollect,
  busy,
}: {
  item: RewardInboxItem;
  onCollect: (id: number) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const sourceLabel = useSourceLabel(item.source, t);
  const value = Number(item.rewardValue || 0);

  const imageUrl =
    item.rewardType === "machine" && item.minerImageUrl
      ? getMachineDisplayImageUrl({ imageUrl: item.minerImageUrl, imageSource: undefined })
      : null;

  let typeLabel = "";
  let typeColor = "text-gray-400";
  let typeBg = "border-gray-700/50 bg-gray-800/40";
  let icon: React.ReactNode = null;

  if (item.rewardType === "machine") {
    typeLabel = t("inventario.type_machine");
    typeColor = "text-primary";
    typeBg = "border-primary/20 bg-primary/10";
    icon = <Cpu className="h-4 w-4 shrink-0 text-primary" aria-hidden />;
  } else if (item.rewardType === "pol") {
    typeLabel = t("inventario.type_pol");
    typeColor = "text-amber-400";
    typeBg = "border-amber-500/20 bg-amber-500/10";
    icon = <Coins className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />;
  } else if (item.rewardType === "blk") {
    typeLabel = t("inventario.type_blk");
    typeColor = "text-violet-400";
    typeBg = "border-violet-500/20 bg-violet-500/10";
    icon = <Coins className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />;
  } else if (item.rewardType === "temporary_power") {
    typeLabel = t("inventario.type_power");
    typeColor = "text-sky-400";
    typeBg = "border-sky-500/20 bg-sky-500/10";
    icon = <Zap className="h-4 w-4 shrink-0 text-sky-400" aria-hidden />;
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-gray-800/50 bg-surface p-5 shadow-xl">
      <div className="flex items-start gap-4">
        <div className="relative h-16 w-16 shrink-0 rounded-2xl border border-gray-800/50 bg-gray-900/50 p-3 flex items-center justify-center">
          {item.rewardType === "machine" && imageUrl ? (
            <MachineImage
              imageUrl={imageUrl}
              name={item.minerName ?? ""}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-2xl flex items-center justify-center">
              {icon}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${typeBg} ${typeColor}`}>
            {icon}
            {typeLabel}
          </div>
          <div className="text-sm font-bold text-white leading-snug">
            {item.rewardType === "machine"
              ? (item.minerName ?? typeLabel)
              : item.rewardType === "temporary_power"
              ? `${formatHashrate(value)}${item.durationHours != null ? ` · ${item.durationHours}h` : ""}`
              : `${value} ${typeLabel}`}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            {sourceLabel}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800/40 pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onCollect(item.id)}
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("inventario.collect")}
        </button>
      </div>
    </div>
  );
}

export default function InventarioPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState<RewardInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectingId, setCollectingId] = useState<number | null>(null);
  const [collectingAll, setCollectingAll] = useState(false);
  const initSocket = useGameStore((s) => s.initSocket);
  const socket = useGameStore((s) => s.socket);
  const latestFetchIdRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const fetchData = useCallback(async ({ background = false } = {}) => {
    const requestId = ++latestFetchIdRef.current;
    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    try {
      if (!background) setLoading(true);
      const res = await getRewardInbox(ac.signal);
      if (requestId !== latestFetchIdRef.current) return;
      if (res.data?.ok && Array.isArray(res.data.items)) {
        setItems(
          res.data.items.filter(
            (row: unknown): row is RewardInboxItem =>
              row != null &&
              typeof row === "object" &&
              "id" in row &&
              Number.isInteger(Number((row as { id: unknown }).id)) &&
              Number((row as { id: unknown }).id) > 0
          )
        );
      } else if (!axios.isCancel(ac.signal)) {
        toast.error(t("inventario.inbox_load_error"));
      }
    } catch (e) {
      if (!axios.isCancel(e) && requestId === latestFetchIdRef.current) {
        toast.error(t("inventario.inbox_load_error"));
      }
    } finally {
      if (requestId === latestFetchIdRef.current) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    initSocket();
    void fetchData();
    return () => {
      fetchAbortRef.current?.abort();
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchData, initSocket]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchData({ background: true });
    }, SOCKET_DEBOUNCE_MS);
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    socket.on("inventory:update", scheduleRefresh);
    return () => {
      socket.off("inventory:update", scheduleRefresh);
    };
  }, [socket, scheduleRefresh]);

  const handleCollect = useCallback(
    async (id: number) => {
      if (collectingId != null || collectingAll) return;
      setCollectingId(id);
      try {
        const res = await collectReward(id);
        if (res.data?.ok) {
          toast.success(t("inventario.collected_toast"));
          setItems((prev) => prev.filter((item) => item.id !== id));
        } else {
          toast.error(t("inventario.collect_error"));
        }
      } catch {
        toast.error(t("inventario.collect_error"));
      } finally {
        setCollectingId(null);
      }
    },
    [collectingId, collectingAll, t]
  );

  const handleCollectAll = useCallback(async () => {
    if (collectingId != null || collectingAll || items.length === 0) return;
    setCollectingAll(true);
    try {
      const res = await collectAllRewards();
      if (res.data?.ok) {
        const count = res.data.collected ?? items.length;
        toast.success(t("inventario.collect_all_toast", { count }));
        await fetchData({ background: true });
      } else {
        toast.error(t("inventario.collect_error"));
      }
    } catch {
      toast.error(t("inventario.collect_error"));
    } finally {
      setCollectingAll(false);
    }
  }, [collectingId, collectingAll, items.length, fetchData, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const anyBusy = collectingId != null || collectingAll;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t("inventario.inbox_title")}</h1>
          <p className="text-gray-500 font-medium">{t("inventario.inbox_subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-bold text-primary">
            <Inbox className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("inventario.pending_count", { count: items.length })}
          </div>
          {items.length > 0 && (
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => void handleCollectAll()}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
            >
              {collectingAll ? (
                <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              {t("inventario.collect_all")}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/inventory")}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-gray-700 bg-gray-800/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-300 transition-colors hover:bg-gray-700"
          >
            {t("inventario.go_to_machines")}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-800 bg-gray-900/30 px-8 py-20 text-center">
          <PackageOpen className="mb-4 h-12 w-12 text-gray-700" aria-hidden />
          <p className="text-base font-bold text-gray-500">{t("inventario.empty_title")}</p>
          <p className="mt-1 text-sm text-gray-600">{t("inventario.empty_hint")}</p>
          <button
            type="button"
            onClick={() => navigate("/inventory")}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-gray-700 bg-gray-800/50 px-4 py-2 text-xs font-black uppercase tracking-wider text-gray-300 transition-colors hover:bg-gray-700"
          >
            {t("inventario.go_to_machines")}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <RewardCard
              key={item.id}
              item={item}
              onCollect={(id) => void handleCollect(id)}
              busy={anyBusy}
            />
          ))}
        </div>
      )}

      <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="inventario-bottom" />
    </div>
  );
}
