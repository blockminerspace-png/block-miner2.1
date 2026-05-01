import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Save,
  Trash2,
  Calendar,
  LayoutList,
  Gift,
  Target,
  Eye,
  Wand2,
  Settings2,
  Info,
} from "lucide-react";
import { api } from "../store/auth";
import ImageUploader from "../components/ImageUploader";
import {
  buildProgressionTiers,
  countRewardLevels,
  defaultSeasonDateRange,
  summarizeRewardRow,
  validateMissionDraft,
  validateRewardDraft,
  validateSeasonForm,
} from "../utils/adminMiniPassForm.js";

const REWARD_KINDS = ["NONE", "SHOP_MINER", "EVENT_MINER", "HASHRATE_TEMP", "BLK", "POL"];
const CADENCES = ["EVENT", "DAILY", "WEEKLY"];
const MISSION_TYPES = [
  "PLAY_GAMES",
  "MINE_BLK",
  "LOGIN_DAY",
  "WATCH_YOUTUBE",
  "AUTO_MINING_TURBO",
  "INTERNAL_OFFERWALL",
];

const INPUT_BASE =
  "w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40";
const INPUT_MT = `mt-2 ${INPUT_BASE}`;
const TEXTAREA_MT = `mt-2 ${INPUT_BASE} resize-y min-h-[76px]`;

function normalizeRewardCatalogItem(row) {
  const rawId = row?.id;
  const isEvent = typeof rawId === "string" && rawId.startsWith("event_");
  const numericId = Number(isEvent ? String(rawId).slice(6) : rawId);
  return {
    key: String(rawId),
    kind: isEvent ? "EVENT_MINER" : "SHOP_MINER",
    numericId: Number.isFinite(numericId) ? numericId : 0,
    name: String(row?.name || "").trim(),
    hashRate: Number(row?.baseHashRate || 0),
    slotSize: Number(row?.slotSize || 1),
    imageUrl: row?.imageUrl || null,
    isActive: Boolean(row?.isActive),
  };
}

function SectionCard({ icon: Icon, title, description, children, variant = "default" }) {
  const border = variant === "accent" ? "border-amber-500/25" : "border-slate-800";
  return (
    <section className={`rounded-2xl border ${border} bg-slate-900/50 overflow-hidden shadow-lg shadow-black/20`}>
      <header className="px-5 py-4 border-b border-slate-800/90 bg-slate-950/60">
        <div className="flex items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-amber-400">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-black uppercase tracking-wide text-white">{title}</h2>
            {description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p> : null}
          </div>
        </div>
      </header>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ htmlFor, label, hint }) {
  const labelClass = "block text-xs font-bold uppercase tracking-wider text-slate-400";
  return (
    <div className="space-y-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {hint ? <p className="text-[11px] leading-snug text-slate-600">{hint}</p> : null}
    </div>
  );
}

function isGameSlugMissionType(missionType) {
  return missionType === "PLAY_GAMES";
}

function RewardMinerPicker({
  id,
  label,
  hint,
  query,
  onQueryChange,
  options,
  selected,
  onSelect,
  loading,
  t,
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel htmlFor={id} label={label} hint={hint} />
        <input
          id={id}
          className={INPUT_MT}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("adminMiniPass.rewards.search_placeholder")}
        />
      </div>

      {selected ? (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-xs text-emerald-100">
          <div className="font-bold text-emerald-300">{selected.name}</div>
          <div className="mt-1 text-emerald-100/80">
            {t("adminMiniPass.rewards.selection_meta", {
              id: selected.numericId,
              hashRate: selected.hashRate,
              slotSize: selected.slotSize,
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-800 bg-slate-950/60">
        {loading ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("adminMiniPass.rewards.searching")}
          </div>
        ) : options.length > 0 ? (
          <div className="max-h-64 overflow-y-auto">
            {options.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item)}
                className={`flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-800/70 ${
                  selected?.key === item.key ? "bg-amber-500/10" : ""
                }`}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-lg border border-slate-700 object-cover" />
                ) : (
                  <div className="h-10 w-10 rounded-lg border border-slate-700 bg-slate-900" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {t("adminMiniPass.rewards.selection_meta", {
                      id: item.numericId,
                      hashRate: item.hashRate,
                      slotSize: item.slotSize,
                    })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-3 py-3 text-xs text-slate-500">{t("adminMiniPass.rewards.search_empty")}</div>
        )}
      </div>
    </div>
  );
}

function PreviewPanel({ form, rewards, missions, t }) {
  const tiers = useMemo(() => buildProgressionTiers(form.maxLevel, form.xpPerLevel), [form.maxLevel, form.xpPerLevel]);
  const byLevel = useMemo(() => {
    const m = new Map();
    (rewards || []).forEach((r) => m.set(r.level, r));
    return m;
  }, [rewards]);

  return (
    <aside className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-5 shadow-xl lg:sticky lg:top-4">
      <div className="flex items-center gap-2 text-amber-400 mb-3">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        <h3 className="text-xs font-black uppercase tracking-widest">{t("adminMiniPass.preview.title")}</h3>
      </div>
      <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">{t("adminMiniPass.preview.subtitle")}</p>

      {form.bannerImageUrl ? (
        <img
          src={form.bannerImageUrl}
          alt=""
          className="w-full h-24 object-cover rounded-xl border border-slate-700 mb-3"
        />
      ) : null}

      <p className="text-lg font-black text-white leading-tight">{form.titleEn || t("adminMiniPass.preview.untitled")}</p>
      {form.subtitleEn ? <p className="text-xs text-slate-400 mt-1 line-clamp-2">{form.subtitleEn}</p> : null}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.starts")}</dt>
          <dd className="text-slate-200 font-mono truncate">{form.startsAt || "—"}</dd>
        </div>
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.ends")}</dt>
          <dd className="text-slate-200 font-mono truncate">{form.endsAt || "—"}</dd>
        </div>
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.max_level")}</dt>
          <dd className="text-amber-300 font-black">{form.maxLevel}</dd>
        </div>
        <div className="rounded-lg bg-slate-950/80 px-2 py-2 border border-slate-800">
          <dt className="text-slate-500 uppercase tracking-wider">{t("adminMiniPass.preview.xp_step")}</dt>
          <dd className="text-sky-300 font-black">{form.xpPerLevel} XP</dd>
        </div>
      </dl>

      <h4 className="mt-5 text-[10px] font-black uppercase tracking-widest text-slate-500">
        {t("adminMiniPass.preview.track_title")}
      </h4>
      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-800/80">
        <table className="w-full text-left text-[10px]">
          <thead className="sticky top-0 bg-slate-950/95 text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-2 py-2">{t("adminMiniPass.preview.col_level")}</th>
              <th className="px-2 py-2">{t("adminMiniPass.preview.col_xp")}</th>
              <th className="px-2 py-2">{t("adminMiniPass.preview.col_reward")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {tiers.slice(0, 24).map((row) => (
              <tr key={row.level}>
                <td className="px-2 py-1.5 font-mono">{row.level}</td>
                <td className="px-2 py-1.5 font-mono text-sky-400/90">{row.minTotalXp}</td>
                <td className="px-2 py-1.5 text-slate-400 truncate max-w-[120px]" title={summarizeRewardRow(byLevel.get(row.level) || {})}>
                  {byLevel.has(row.level) ? summarizeRewardRow(byLevel.get(row.level)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tiers.length > 24 ? (
          <p className="px-2 py-2 text-[10px] text-slate-600 border-t border-slate-800">{t("adminMiniPass.preview.more_levels", { n: tiers.length - 24 })}</p>
        ) : null}
      </div>

      <h4 className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
        {t("adminMiniPass.preview.missions_title", { count: missions?.length ?? 0 })}
      </h4>
      <ul className="mt-2 space-y-1.5 text-[11px] text-slate-400 max-h-32 overflow-y-auto">
        {(missions || []).slice(0, 8).map((m) => (
          <li key={m.id} className="rounded-lg bg-slate-950/50 px-2 py-1.5 border border-slate-800/60">
            <span className="text-slate-200 font-medium">{m.titleI18n?.en || m.missionType}</span>
            <span className="text-slate-600"> · +{m.xpReward} XP</span>
          </li>
        ))}
        {(missions || []).length === 0 ? <li className="text-slate-600">{t("adminMiniPass.preview.no_missions")}</li> : null}
      </ul>
    </aside>
  );
}

export default function AdminMiniPassSeason() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === "new";

  const range = isNew ? defaultSeasonDateRange() : { startsAt: "", endsAt: "" };

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [seasonId, setSeasonId] = useState(isNew ? null : parseInt(id, 10));

  const [form, setForm] = useState({
    slug: "",
    titleEn: "",
    titlePtBR: "",
    titleEs: "",
    subtitleEn: "",
    subtitlePtBR: "",
    subtitleEs: "",
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    maxLevel: 10,
    xpPerLevel: 100,
    buyLevelPricePol: "1",
    completePassPricePol: "10",
    bannerImageUrl: "",
    isActive: true,
  });

  const [rewards, setRewards] = useState([]);
  const [missions, setMissions] = useState([]);
  const [rewardCatalogQuery, setRewardCatalogQuery] = useState("");
  const [rewardCatalogLoading, setRewardCatalogLoading] = useState(false);
  const [rewardCatalogItems, setRewardCatalogItems] = useState([]);
  const [selectedShopMiner, setSelectedShopMiner] = useState(null);
  const [selectedEventMiner, setSelectedEventMiner] = useState(null);

  const [rewardDraft, setRewardDraft] = useState({
    level: 1,
    rewardKind: "NONE",
    minerId: "",
    eventMinerId: "",
    hashRate: "",
    hashRateDays: "7",
    blkAmount: "",
    polAmount: "",
    titleEn: "",
    titlePtBR: "",
    titleEs: "",
  });

  const [missionDraft, setMissionDraft] = useState({
    cadence: "EVENT",
    missionType: "PLAY_GAMES",
    targetValue: "1",
    xpReward: "50",
    titleEn: "",
    titlePtBR: "",
    titleEs: "",
    descriptionEn: "",
    descriptionPtBR: "",
    descriptionEs: "",
    gameSlug: "",
    sortOrder: "0",
  });

  const progressionRows = useMemo(() => buildProgressionTiers(form.maxLevel, form.xpPerLevel), [form.maxLevel, form.xpPerLevel]);
  const rewardCoverage = useMemo(() => countRewardLevels(rewards, form.maxLevel), [rewards, form.maxLevel]);
  const rewardDraftCheck = useMemo(() => validateRewardDraft(rewardDraft), [rewardDraft]);
  const rewardCatalogKind = rewardDraft.rewardKind === "SHOP_MINER" || rewardDraft.rewardKind === "EVENT_MINER" ? rewardDraft.rewardKind : null;
  const rewardCatalogOptions = useMemo(
    () => rewardCatalogItems.filter((item) => item.kind === rewardCatalogKind),
    [rewardCatalogItems, rewardCatalogKind]
  );

  const load = useCallback(async () => {
    if (isNew || seasonId == null) {
      setLoading(false);
      return;
    }
    if (Number.isNaN(seasonId)) {
      setLoading(false);
      toast.error(t("adminMiniPass.errors.invalid_season_id"));
      navigate("/admin/mini-pass");
      return;
    }
    try {
      setLoading(true);
      const res = await api.get(`/admin/mini-pass/seasons/${seasonId}`);
      if (!res.data.ok || !res.data.season) {
        toast.error(t("adminMiniPass.errors.season_not_found"));
        navigate("/admin/mini-pass");
        return;
      }
      const s = res.data.season;
      const ti = s.titleI18n || {};
      const st = s.subtitleI18n || {};
      setForm({
        slug: s.slug || "",
        titleEn: ti.en || "",
        titlePtBR: ti.ptBR || "",
        titleEs: ti.es || "",
        subtitleEn: st.en || "",
        subtitlePtBR: st.ptBR || "",
        subtitleEs: st.es || "",
        startsAt: s.startsAt ? new Date(s.startsAt).toISOString().slice(0, 16) : "",
        endsAt: s.endsAt ? new Date(s.endsAt).toISOString().slice(0, 16) : "",
        maxLevel: s.maxLevel || 10,
        xpPerLevel: s.xpPerLevel || 100,
        buyLevelPricePol: String(s.buyLevelPricePol ?? "0"),
        completePassPricePol: String(s.completePassPricePol ?? "0"),
        bannerImageUrl: s.bannerImageUrl || "",
        isActive: !!s.isActive,
      });
      setRewards(s.levelRewards || []);
      setMissions(s.missions || []);
    } catch {
      toast.error(t("adminMiniPass.errors.load_failed"));
      navigate("/admin/mini-pass");
    } finally {
      setLoading(false);
    }
  }, [isNew, seasonId, navigate, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!rewardCatalogKind) return undefined;
    let cancelled = false;
    const run = async () => {
      try {
        setRewardCatalogLoading(true);
        const res = await api.get("/admin/miners", {
          params: {
            limit: 20,
            filter: "active",
            withEvents: 1,
            q: rewardCatalogQuery.trim(),
          },
        });
        if (cancelled) return;
        const rows = Array.isArray(res.data?.miners) ? res.data.miners.map(normalizeRewardCatalogItem) : [];
        setRewardCatalogItems(rows);
      } catch {
        if (!cancelled) setRewardCatalogItems([]);
      } finally {
        if (!cancelled) setRewardCatalogLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [rewardCatalogKind, rewardCatalogQuery]);

  useEffect(() => {
    if (rewardDraft.rewardKind !== "SHOP_MINER") {
      setSelectedShopMiner(null);
    }
    if (rewardDraft.rewardKind !== "EVENT_MINER") {
      setSelectedEventMiner(null);
    }
  }, [rewardDraft.rewardKind]);

  useEffect(() => {
    if (rewardDraft.rewardKind === "SHOP_MINER" && selectedShopMiner && rewardCatalogQuery.trim() !== selectedShopMiner.name) {
      setSelectedShopMiner(null);
      setRewardDraft((prev) => ({ ...prev, minerId: "" }));
    }
    if (rewardDraft.rewardKind === "EVENT_MINER" && selectedEventMiner && rewardCatalogQuery.trim() !== selectedEventMiner.name) {
      setSelectedEventMiner(null);
      setRewardDraft((prev) => ({ ...prev, eventMinerId: "" }));
    }
  }, [rewardCatalogQuery, rewardDraft.rewardKind, selectedShopMiner, selectedEventMiner]);

  const saveSeason = async (e) => {
    e?.preventDefault?.();
    const errs = validateSeasonForm(form);
    if (errs.length) {
      toast.error(t(`adminMiniPass.errors.${errs[0]}`, errs[0]));
      return;
    }
    try {
      setSaving(true);
      const titleI18n = { en: form.titleEn, ptBR: form.titlePtBR, es: form.titleEs };
      const subtitleI18n =
        form.subtitleEn || form.subtitlePtBR || form.subtitleEs
          ? { en: form.subtitleEn, ptBR: form.subtitlePtBR, es: form.subtitleEs }
          : null;
      const payload = {
        slug: form.slug.trim().toLowerCase(),
        titleI18n,
        subtitleI18n,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        maxLevel: Number(form.maxLevel),
        xpPerLevel: Number(form.xpPerLevel),
        buyLevelPricePol: form.buyLevelPricePol,
        completePassPricePol: form.completePassPricePol,
        bannerImageUrl: form.bannerImageUrl || null,
        isActive: form.isActive,
      };
      if (isNew) {
        const res = await api.post("/admin/mini-pass/seasons", payload);
        if (res.data.ok && res.data.season?.id) {
          toast.success(t("adminMiniPass.season.created"));
          navigate(`/admin/mini-pass/${res.data.season.id}`);
        }
      } else {
        await api.put(`/admin/mini-pass/seasons/${seasonId}`, payload);
        toast.success(t("adminMiniPass.season.updated"));
        load();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t("adminMiniPass.errors.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const addReward = async () => {
    if (!seasonId) {
      toast.error(t("adminMiniPass.errors.save_season_first"));
      return;
    }
    const chk = validateRewardDraft(rewardDraft);
    if (!chk.ok) {
      toast.error(t(`adminMiniPass.errors.${chk.errorKey}`));
      return;
    }
    const levelNum = Number(rewardDraft.level);
    if (levelNum > Number(form.maxLevel)) {
      toast.error(t("adminMiniPass.errors.reward_level_over_max"));
      return;
    }
    try {
      const titleI18n =
        rewardDraft.titleEn || rewardDraft.titlePtBR || rewardDraft.titleEs
          ? { en: rewardDraft.titleEn, ptBR: rewardDraft.titlePtBR, es: rewardDraft.titleEs }
          : null;
      const body = {
        level: levelNum,
        rewardKind: rewardDraft.rewardKind,
        minerId: rewardDraft.minerId ? Number(rewardDraft.minerId) : null,
        eventMinerId: rewardDraft.eventMinerId ? Number(rewardDraft.eventMinerId) : null,
        hashRate: rewardDraft.hashRate ? Number(rewardDraft.hashRate) : null,
        hashRateDays: rewardDraft.hashRateDays ? Number(rewardDraft.hashRateDays) : null,
        blkAmount: rewardDraft.blkAmount || null,
        polAmount: rewardDraft.polAmount || null,
        titleI18n,
      };
      await api.post(`/admin/mini-pass/seasons/${seasonId}/level-rewards`, body);
      toast.success(t("adminMiniPass.season.reward_added"));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t("adminMiniPass.errors.reward_failed"));
    }
  };

  const deleteReward = async (rid) => {
    if (!window.confirm(t("adminMiniPass.confirm_delete_reward"))) return;
    try {
      await api.delete(`/admin/mini-pass/seasons/${seasonId}/level-rewards/${rid}`);
      toast.success(t("adminMiniPass.deleted"));
      load();
    } catch {
      toast.error(t("adminMiniPass.errors.delete_failed"));
    }
  };

  const addMission = async () => {
    if (!seasonId) {
      toast.error(t("adminMiniPass.errors.save_season_first"));
      return;
    }
    const mv = validateMissionDraft(missionDraft);
    if (!mv.ok) {
      toast.error(t(`adminMiniPass.errors.${mv.errorKey}`));
      return;
    }
    try {
      const descriptionI18n =
        missionDraft.descriptionEn.trim() ||
        missionDraft.descriptionPtBR.trim() ||
        missionDraft.descriptionEs.trim()
          ? {
              en: missionDraft.descriptionEn.trim(),
              ptBR: missionDraft.descriptionPtBR.trim(),
              es: missionDraft.descriptionEs.trim(),
            }
          : null;

      const body = {
        cadence: missionDraft.cadence,
        missionType: missionDraft.missionType,
        targetValue: missionDraft.targetValue,
        xpReward: Number(missionDraft.xpReward),
        titleI18n: {
          en: missionDraft.titleEn,
          ptBR: missionDraft.titlePtBR,
          es: missionDraft.titleEs,
        },
        descriptionI18n,
        gameSlug: missionDraft.gameSlug || null,
        sortOrder: Number(missionDraft.sortOrder) || 0,
      };
      await api.post(`/admin/mini-pass/seasons/${seasonId}/missions`, body);
      toast.success(t("adminMiniPass.season.mission_added"));
      setMissionDraft((d) => ({
        ...d,
        descriptionEn: "",
        descriptionPtBR: "",
        descriptionEs: "",
        titleEn: "",
        titlePtBR: "",
        titleEs: "",
      }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t("adminMiniPass.errors.mission_failed"));
    }
  };

  const deleteMission = async (mid) => {
    if (!window.confirm(t("adminMiniPass.confirm_delete_mission"))) return;
    try {
      await api.delete(`/admin/mini-pass/seasons/${seasonId}/missions/${mid}`);
      toast.success(t("adminMiniPass.deleted"));
      load();
    } catch {
      toast.error(t("adminMiniPass.errors.delete_failed"));
    }
  };

  const applyQuickRewardTemplate = async () => {
    if (!seasonId) return;
    const max = Math.max(1, Math.min(500, parseInt(String(form.maxLevel), 10) || 1));
    const existing = new Set((rewards || []).map((r) => r.level));
    const toAdd = [];
    for (let L = 1; L <= max; L += 1) {
      if (!existing.has(L)) toAdd.push(L);
    }
    if (toAdd.length === 0) {
      toast.info(t("adminMiniPass.season.template_none"));
      return;
    }
    setTemplateBusy(true);
    try {
      for (const level of toAdd) {
        await api.post(`/admin/mini-pass/seasons/${seasonId}/level-rewards`, {
          level,
          rewardKind: "NONE",
          minerId: null,
          eventMinerId: null,
          hashRate: null,
          hashRateDays: null,
          blkAmount: null,
          polAmount: null,
          titleI18n: null,
        });
      }
      toast.success(t("adminMiniPass.season.template_done", { count: toAdd.length }));
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || t("adminMiniPass.errors.template_failed"));
    } finally {
      setTemplateBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
      </div>
    );
  }

  const sortedRewards = [...(rewards || [])].sort((a, b) => a.level - b.level);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      <button
        type="button"
        onClick={() => navigate("/admin/mini-pass")}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
      >
        <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
        {t("adminMiniPass.season.back")}
      </button>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex gap-3">
        <Info className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" aria-hidden />
        <p className="text-xs text-amber-100/90 leading-relaxed">{t("adminMiniPass.workflow_hint")}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
        <div className="space-y-8 min-w-0">
          <form onSubmit={saveSeason} className="space-y-8">
            <SectionCard
              icon={Calendar}
              title={t("adminMiniPass.sections.pass")}
              description={t("adminMiniPass.sections.pass_desc")}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel
                    htmlFor="mp-slug"
                    label={t("adminMiniPass.fields.slug")}
                    hint={t("adminMiniPass.fields.slug_hint")}
                  />
                  <input
                    id="mp-slug"
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-600"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    placeholder={t("adminMiniPass.placeholders.slug")}
                    required
                    disabled={!isNew}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="mp-banner" label={t("adminMiniPass.fields.banner")} hint={t("adminMiniPass.fields.banner_hint")} />
                  <div className="mt-2" id="mp-banner">
                    <ImageUploader value={form.bannerImageUrl} onChange={(url) => setForm({ ...form, bannerImageUrl: url })} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t("adminMiniPass.fields.titles")}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { key: "titleEn", lab: t("adminMiniPass.locale.en") },
                    { key: "titlePtBR", lab: t("adminMiniPass.locale.pt") },
                    { key: "titleEs", lab: t("adminMiniPass.locale.es") },
                  ].map(({ key, lab }) => (
                    <div key={key}>
                      <label className="text-[10px] uppercase text-slate-500">{lab}</label>
                      <input
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        required={key === "titleEn"}
                        placeholder={t("adminMiniPass.placeholders.season_title")}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t("adminMiniPass.fields.subtitles_optional")}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {["subtitleEn", "subtitlePtBR", "subtitleEs"].map((k, i) => (
                    <div key={k}>
                      <label className="text-[10px] uppercase text-slate-500">{[t("adminMiniPass.locale.en"), t("adminMiniPass.locale.pt"), t("adminMiniPass.locale.es")][i]}</label>
                      <input
                        className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                        value={form[k]}
                        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                        placeholder={t("adminMiniPass.placeholders.subtitle")}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="mp-start" label={t("adminMiniPass.fields.starts_at")} hint={t("adminMiniPass.fields.starts_hint")} />
                  <input
                    id="mp-start"
                    type="datetime-local"
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
                    value={form.startsAt}
                    onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="mp-end" label={t("adminMiniPass.fields.ends_at")} hint={t("adminMiniPass.fields.ends_hint")} />
                  <input
                    id="mp-end"
                    type="datetime-local"
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
                    value={form.endsAt}
                    onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                    required
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              icon={LayoutList}
              title={t("adminMiniPass.sections.progression")}
              description={t("adminMiniPass.sections.progression_desc")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="mp-max" label={t("adminMiniPass.fields.max_level")} hint={t("adminMiniPass.fields.max_level_hint")} />
                  <input
                    id="mp-max"
                    type="number"
                    min={1}
                    max={500}
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
                    value={form.maxLevel}
                    onChange={(e) => setForm({ ...form, maxLevel: e.target.value })}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="mp-xp" label={t("adminMiniPass.fields.xp_per_level")} hint={t("adminMiniPass.fields.xp_per_level_hint")} />
                  <input
                    id="mp-xp"
                    type="number"
                    min={1}
                    max={1000000}
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
                    value={form.xpPerLevel}
                    onChange={(e) => setForm({ ...form, xpPerLevel: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{t("adminMiniPass.progression.table_title")}</p>
                <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs min-w-[320px]">
                    <thead className="sticky top-0 bg-slate-950 text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2">{t("adminMiniPass.progression.col_level")}</th>
                        <th className="px-3 py-2">{t("adminMiniPass.progression.col_min_xp")}</th>
                        <th className="px-3 py-2">{t("adminMiniPass.progression.col_xp_to_next")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {progressionRows.slice(0, 40).map((row) => (
                        <tr key={row.level} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2 font-mono font-bold text-amber-400/90">{row.level}</td>
                          <td className="px-3 py-2 font-mono">{row.minTotalXp}</td>
                          <td className="px-3 py-2 font-mono text-sky-400/80">{row.xpToAdvance || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {progressionRows.length > 40 ? (
                  <p className="text-[11px] text-slate-600 mt-2">{t("adminMiniPass.progression.truncated", { shown: 40, total: progressionRows.length })}</p>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard icon={Settings2} title={t("adminMiniPass.sections.settings")} description={t("adminMiniPass.sections.settings_desc")}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="mp-buy" label={t("adminMiniPass.fields.buy_level_pol")} hint={t("adminMiniPass.fields.buy_level_hint")} />
                  <input
                    id="mp-buy"
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
                    value={form.buyLevelPricePol}
                    onChange={(e) => setForm({ ...form, buyLevelPricePol: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="mp-complete"
                    label={t("adminMiniPass.fields.complete_pass_pol")}
                    hint={t("adminMiniPass.fields.complete_pass_hint")}
                  />
                  <input
                    id="mp-complete"
                    className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
                    value={form.completePassPricePol}
                    onChange={(e) => setForm({ ...form, completePassPricePol: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <div>
                  <span className="text-sm font-bold text-white">{t("adminMiniPass.fields.is_active")}</span>
                  <p className="text-[11px] text-slate-500">{t("adminMiniPass.fields.is_active_hint")}</p>
                </div>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider hover:bg-amber-400 disabled:opacity-50"
              >
                <Save className="w-4 h-4 shrink-0" aria-hidden />
                {saving ? t("adminMiniPass.season.saving") : t("adminMiniPass.season.save")}
              </button>
            </SectionCard>
          </form>

          {!isNew && seasonId ? (
            <>
              <SectionCard icon={Gift} title={t("adminMiniPass.sections.rewards")} description={t("adminMiniPass.sections.rewards_desc")} variant="accent">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void applyQuickRewardTemplate()}
                    disabled={templateBusy}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-amber-500/30 text-amber-200 text-xs font-bold uppercase tracking-wide hover:bg-slate-700 disabled:opacity-50"
                  >
                    {templateBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {t("adminMiniPass.season.quick_template")}
                  </button>
                  <p className="text-[11px] text-slate-500 max-w-md">{t("adminMiniPass.season.quick_template_hint")}</p>
                </div>

                {rewardCoverage.missingLevels.length > 0 ? (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
                    {t("adminMiniPass.warnings.missing_reward_levels", {
                      count: rewardCoverage.missingLevels.length,
                    })}
                  </div>
                ) : null}

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 md:p-6 space-y-8">
                  <header className="space-y-1">
                    <h3 className="text-sm font-bold text-white">{t("adminMiniPass.rewards.add_title")}</h3>
                    <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">{t("adminMiniPass.rewards.form_help")}</p>
                  </header>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <FieldLabel
                        htmlFor="mp-rwd-level"
                        label={t("adminMiniPass.rewards.level")}
                        hint={t("adminMiniPass.rewards.level_hint")}
                      />
                      <input
                        id="mp-rwd-level"
                        type="number"
                        min={1}
                        max={500}
                        className={INPUT_MT}
                        value={rewardDraft.level}
                        onChange={(e) => setRewardDraft({ ...rewardDraft, level: e.target.value })}
                      />
                    </div>
                    <div>
                      <FieldLabel
                        htmlFor="mp-rwd-kind"
                        label={t("adminMiniPass.rewards.kind")}
                        hint={t("adminMiniPass.rewards.kind_hint_short")}
                      />
                      <select
                        id="mp-rwd-kind"
                        className={INPUT_MT}
                        value={rewardDraft.rewardKind}
                        onChange={(e) => {
                          const rewardKind = e.target.value;
                          setRewardDraft((prev) => ({
                            ...prev,
                            rewardKind,
                            minerId: rewardKind === "SHOP_MINER" ? prev.minerId : "",
                            eventMinerId: rewardKind === "EVENT_MINER" ? prev.eventMinerId : "",
                          }));
                          setRewardCatalogQuery("");
                        }}
                      >
                        {REWARD_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`adminMiniPass.reward_kinds.${k}`)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-3 text-xs text-slate-400 leading-snug border-l-2 border-amber-500/35 pl-3">
                        {t(`adminMiniPass.reward_kind_hints.${rewardDraft.rewardKind}`)}
                      </p>
                    </div>
                  </div>

                  {rewardDraft.rewardKind !== "NONE" ? (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 md:p-5 space-y-5">
                      <p className="text-xs font-black uppercase tracking-wider text-amber-300/95">
                        {t("adminMiniPass.rewards.payload_heading")}
                      </p>

                      {(rewardDraft.rewardKind === "SHOP_MINER" || rewardDraft.rewardKind === "EVENT_MINER") && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          {rewardDraft.rewardKind === "SHOP_MINER" ? (
                            <div>
                              <RewardMinerPicker
                                id="mp-rwd-shop-miner"
                                label={t("adminMiniPass.rewards.shop_miner_id")}
                                hint={t("adminMiniPass.rewards.shop_miner_hint")}
                                query={rewardCatalogQuery}
                                onQueryChange={setRewardCatalogQuery}
                                options={rewardCatalogOptions}
                                selected={selectedShopMiner}
                                loading={rewardCatalogLoading}
                                t={t}
                                onSelect={(item) => {
                                  setSelectedShopMiner(item);
                                  setRewardCatalogQuery(item.name);
                                  setRewardDraft((prev) => ({ ...prev, minerId: String(item.numericId) }));
                                }}
                              />
                            </div>
                          ) : (
                            <div>
                              <RewardMinerPicker
                                id="mp-rwd-event-miner"
                                label={t("adminMiniPass.rewards.event_miner_id")}
                                hint={t("adminMiniPass.rewards.event_miner_hint")}
                                query={rewardCatalogQuery}
                                onQueryChange={setRewardCatalogQuery}
                                options={rewardCatalogOptions}
                                selected={selectedEventMiner}
                                loading={rewardCatalogLoading}
                                t={t}
                                onSelect={(item) => {
                                  setSelectedEventMiner(item);
                                  setRewardCatalogQuery(item.name);
                                  setRewardDraft((prev) => ({ ...prev, eventMinerId: String(item.numericId) }));
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {rewardDraft.rewardKind === "HASHRATE_TEMP" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div>
                            <FieldLabel
                              htmlFor="mp-rwd-hr"
                              label={t("adminMiniPass.rewards.hash_rate")}
                              hint={t("adminMiniPass.rewards.hash_rate_hint")}
                            />
                            <input
                              id="mp-rwd-hr"
                              className={INPUT_MT}
                              value={rewardDraft.hashRate}
                              onChange={(e) => setRewardDraft({ ...rewardDraft, hashRate: e.target.value })}
                              placeholder="25"
                            />
                          </div>
                          <div>
                            <FieldLabel
                              htmlFor="mp-rwd-hr-days"
                              label={t("adminMiniPass.rewards.hash_days")}
                              hint={t("adminMiniPass.rewards.hash_days_hint")}
                            />
                            <input
                              id="mp-rwd-hr-days"
                              className={INPUT_MT}
                              value={rewardDraft.hashRateDays}
                              onChange={(e) => setRewardDraft({ ...rewardDraft, hashRateDays: e.target.value })}
                              placeholder="7"
                            />
                          </div>
                        </div>
                      )}

                      {(rewardDraft.rewardKind === "BLK" || rewardDraft.rewardKind === "POL") && (
                        <div>
                          <FieldLabel
                            htmlFor="mp-rwd-token-amt"
                            label={
                              rewardDraft.rewardKind === "BLK"
                                ? t("adminMiniPass.rewards.blk_amount")
                                : t("adminMiniPass.rewards.pol_amount")
                            }
                            hint={t("adminMiniPass.rewards.token_amount_hint")}
                          />
                          <input
                            id="mp-rwd-token-amt"
                            className={INPUT_MT}
                            value={rewardDraft.rewardKind === "BLK" ? rewardDraft.blkAmount : rewardDraft.polAmount}
                            onChange={(e) =>
                              setRewardDraft({
                                ...rewardDraft,
                                ...(rewardDraft.rewardKind === "BLK" ? { blkAmount: e.target.value } : { polAmount: e.target.value }),
                              })
                            }
                            placeholder="0.5"
                          />
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <FieldLabel
                      label={t("adminMiniPass.rewards.optional_titles")}
                      hint={t("adminMiniPass.rewards.optional_titles_hint")}
                    />
                    <div className="grid grid-cols-1 gap-4">
                      {[
                        { key: "titleEn", lab: t("adminMiniPass.locale.en"), id: "mp-rwd-title-en" },
                        { key: "titlePtBR", lab: t("adminMiniPass.locale.pt"), id: "mp-rwd-title-pt" },
                        { key: "titleEs", lab: t("adminMiniPass.locale.es"), id: "mp-rwd-title-es" },
                      ].map(({ key, lab, id }) => (
                        <div key={key}>
                          <label htmlFor={id} className="text-xs font-semibold text-slate-400">
                            {lab}
                          </label>
                          <input
                            id={id}
                            className={INPUT_MT}
                            placeholder={t("adminMiniPass.placeholders.reward_title_locale")}
                            value={rewardDraft[key]}
                            onChange={(e) => setRewardDraft({ ...rewardDraft, [key]: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {!rewardDraftCheck.ok ? (
                    <p className="text-xs text-amber-300/90">{t(`adminMiniPass.errors.${rewardDraftCheck.errorKey}`)}</p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void addReward()}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wide hover:bg-amber-400"
                  >
                    <Plus className="w-4 h-4 shrink-0" aria-hidden />
                    {t("adminMiniPass.rewards.add_button")}
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full text-left text-sm min-w-[480px]">
                    <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{t("adminMiniPass.rewards.table_level")}</th>
                        <th className="px-3 py-2">{t("adminMiniPass.rewards.table_kind")}</th>
                        <th className="px-3 py-2">{t("adminMiniPass.rewards.table_amount")}</th>
                        <th className="px-3 py-2 text-right">{t("adminMiniPass.rewards.table_actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {sortedRewards.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/20">
                          <td className="px-3 py-2 font-mono font-bold text-amber-400/90">{r.level}</td>
                          <td className="px-3 py-2 text-slate-300">{t(`adminMiniPass.reward_kinds.${r.rewardKind}`)}</td>
                          <td className="px-3 py-2 text-slate-400 text-xs">{summarizeRewardRow(r)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => void deleteReward(r.id)}
                              className="inline-flex p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                              aria-label={t("adminMiniPass.delete")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sortedRewards.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-sm">{t("adminMiniPass.rewards.empty")}</div>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard icon={Target} title={t("adminMiniPass.sections.missions")} description={t("adminMiniPass.sections.missions_desc")}>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 md:p-6 space-y-8">
                  <header className="space-y-1">
                    <h3 className="text-sm font-bold text-white">{t("adminMiniPass.missions.form_title")}</h3>
                    <p className="text-xs text-slate-500 max-w-3xl leading-relaxed">{t("adminMiniPass.missions.form_help")}</p>
                  </header>

                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-800 pb-2 mb-4">
                      {t("adminMiniPass.missions.group_rules")}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-cadence"
                          label={t("adminMiniPass.missions.cadence")}
                          hint={t("adminMiniPass.missions.cadence_hint")}
                        />
                        <select
                          id="mp-msn-cadence"
                          className={INPUT_MT}
                          value={missionDraft.cadence}
                          onChange={(e) => setMissionDraft({ ...missionDraft, cadence: e.target.value })}
                        >
                          {CADENCES.map((c) => (
                            <option key={c} value={c}>
                              {t(`adminMiniPass.cadences.${c}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-type"
                          label={t("adminMiniPass.missions.type")}
                          hint={t("adminMiniPass.missions.type_hint")}
                        />
                        <select
                          id="mp-msn-type"
                          className={INPUT_MT}
                          value={missionDraft.missionType}
                          onChange={(e) => {
                            const missionType = e.target.value;
                            setMissionDraft((prev) => ({
                              ...prev,
                              missionType,
                              gameSlug: isGameSlugMissionType(missionType) ? prev.gameSlug : "",
                            }));
                          }}
                        >
                          {MISSION_TYPES.map((c) => (
                            <option key={c} value={c}>
                              {t(`adminMiniPass.mission_types.${c}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-800 pb-2 mb-4">
                      {t("adminMiniPass.missions.group_numbers")}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-target"
                          label={t("adminMiniPass.missions.target")}
                          hint={t(`adminMiniPass.missions.target_hint_${missionDraft.missionType}`)}
                        />
                        <input
                          id="mp-msn-target"
                          className={INPUT_MT}
                          value={missionDraft.targetValue}
                          onChange={(e) => setMissionDraft({ ...missionDraft, targetValue: e.target.value })}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-xp"
                          label={t("adminMiniPass.missions.xp_reward")}
                          hint={t("adminMiniPass.missions.xp_hint")}
                        />
                        <input
                          id="mp-msn-xp"
                          className={INPUT_MT}
                          value={missionDraft.xpReward}
                          onChange={(e) => setMissionDraft({ ...missionDraft, xpReward: e.target.value })}
                          placeholder="50"
                        />
                      </div>
                      <div>
                        <FieldLabel
                          htmlFor="mp-msn-sort"
                          label={t("adminMiniPass.missions.sort_order")}
                          hint={t("adminMiniPass.missions.sort_hint")}
                        />
                        <input
                          id="mp-msn-sort"
                          type="number"
                          className={INPUT_MT}
                          value={missionDraft.sortOrder}
                          onChange={(e) => setMissionDraft({ ...missionDraft, sortOrder: e.target.value })}
                        />
                      </div>
                      {isGameSlugMissionType(missionDraft.missionType) ? (
                        <div className="sm:col-span-2 lg:col-span-3">
                          <FieldLabel
                            htmlFor="mp-msn-game"
                            label={t("adminMiniPass.missions.game_slug")}
                            hint={t("adminMiniPass.missions.game_slug_hint")}
                          />
                          <input
                            id="mp-msn-game"
                            className={INPUT_MT}
                            value={missionDraft.gameSlug}
                            onChange={(e) => setMissionDraft({ ...missionDraft, gameSlug: e.target.value })}
                            placeholder="memory-sync"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 border-b border-slate-800 pb-2 mb-4">
                      {t("adminMiniPass.missions.group_copy")}
                    </p>
                    <div className="space-y-4">
                      <FieldLabel label={t("adminMiniPass.missions.titles_required")} hint={t("adminMiniPass.missions.titles_field_hint")} />
                      <div className="grid grid-cols-1 gap-4">
                        {[
                          { key: "titleEn", lab: t("adminMiniPass.locale.en"), id: "mp-msn-title-en" },
                          { key: "titlePtBR", lab: t("adminMiniPass.locale.pt"), id: "mp-msn-title-pt" },
                          { key: "titleEs", lab: t("adminMiniPass.locale.es"), id: "mp-msn-title-es" },
                        ].map(({ key, lab, id }) => (
                          <div key={key}>
                            <label htmlFor={id} className="text-xs font-semibold text-slate-400">
                              {lab}
                            </label>
                            <input
                              id={id}
                              className={INPUT_MT}
                              placeholder={t("adminMiniPass.placeholders.mission_title")}
                              value={missionDraft[key]}
                              onChange={(e) => setMissionDraft({ ...missionDraft, [key]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3 mt-6">
                      <FieldLabel
                        label={t("adminMiniPass.missions.descriptions_optional")}
                        hint={t("adminMiniPass.missions.descriptions_field_hint")}
                      />
                      <div className="grid grid-cols-1 gap-4">
                        {[
                          { key: "descriptionEn", lab: t("adminMiniPass.locale.en"), id: "mp-msn-desc-en" },
                          { key: "descriptionPtBR", lab: t("adminMiniPass.locale.pt"), id: "mp-msn-desc-pt" },
                          { key: "descriptionEs", lab: t("adminMiniPass.locale.es"), id: "mp-msn-desc-es" },
                        ].map(({ key, lab, id }) => (
                          <div key={key}>
                            <label htmlFor={id} className="text-xs font-semibold text-slate-400">
                              {lab}
                            </label>
                            <textarea
                              id={id}
                              rows={3}
                              className={TEXTAREA_MT}
                              placeholder={t("adminMiniPass.placeholders.mission_description")}
                              value={missionDraft[key]}
                              onChange={(e) => setMissionDraft({ ...missionDraft, [key]: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void addMission()}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-100 text-slate-900 text-xs font-black uppercase tracking-wide border border-slate-200 hover:bg-white"
                  >
                    <Plus className="w-4 h-4 shrink-0" aria-hidden />
                    {t("adminMiniPass.missions.add_button")}
                  </button>
                </div>

                {missions.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-6 rounded-xl border border-dashed border-slate-700">{t("adminMiniPass.missions.empty")}</p>
                ) : (
                  <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 overflow-hidden">
                    {missions.map((m) => {
                      const desc = m.descriptionI18n?.en || "";
                      return (
                        <li key={m.id} className="px-4 py-3 flex justify-between gap-3 bg-slate-950/30">
                          <div className="min-w-0">
                            <p className="text-sm text-white font-medium">
                              {m.titleI18n?.en || m.missionType}{" "}
                              <span className="text-slate-500 font-normal text-xs">
                                · {t(`adminMiniPass.cadences.${m.cadence}`)} · {t(`adminMiniPass.mission_types.${m.missionType}`)}
                              </span>
                            </p>
                            <p className="text-xs text-sky-400/90 mt-0.5">
                              {t("adminMiniPass.missions.line_meta", {
                                target: String(m.targetValue),
                                xp: m.xpReward,
                              })}
                            </p>
                            {desc ? <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{desc}</p> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => void deleteMission(m.id)}
                            className="shrink-0 p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                            aria-label={t("adminMiniPass.delete")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>
            </>
          ) : null}
        </div>

        <PreviewPanel form={form} rewards={rewards} missions={missions} t={t} />
      </div>
    </div>
  );
}
