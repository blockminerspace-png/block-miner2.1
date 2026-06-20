import { useCallback, useMemo, type ReactNode, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Fingerprint,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  User,
  Wallet,
  Users,
} from "lucide-react";
import type {
  AdminSupportDossierCcpaymentRow,
  AdminSupportDossierDepositRow,
  AdminSupportDossierMachineCardRow,
  AdminSupportDossierMinerRow,
  AdminSupportDossierPaged,
  AdminSupportDossierPayoutRow,
  AdminSupportDossierWithdrawalRow,
  AdminSupportPlayerDossierData,
  AdminSupportPlayerDossierParams,
  AdminSupportPlayerDossierProps,
} from "../admin.types";

export function resolveAdminAssetUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (typeof window !== "undefined" && u.startsWith("/")) {
    return `${window.location.origin}${u}`;
  }
  return u;
}

function translateIpOverlapReasons(t: TFunction, codes: readonly string[]): string {
  if (!codes.length) return "";
  return codes
    .map((c) => {
      const key = `admin_support.dossier.multi_account_reason_${c}`;
      const label = t(key);
      return label === key ? c : label;
    })
    .join(", ");
}

function translateViaCodes(t: TFunction, codes: readonly string[]): string {
  if (!codes.length) return "";
  return codes
    .map((c) => {
      const key = `admin_support.dossier.multi_account_via_${c}`;
      const label = t(key);
      return label === key ? c : label;
    })
    .join(", ");
}

type DossierNumericPageKey =
  | "depositsPage"
  | "ccpaymentPage"
  | "withdrawalsPage"
  | "payoutsPage"
  | "minersPage"
  | "inventoryPage"
  | "vaultPage";

type DossierPagedTablePageKey =
  | "depositsPage"
  | "ccpaymentPage"
  | "withdrawalsPage"
  | "payoutsPage";

type DossierTableColumn = { key: string; label: string };

type DossierMachineKind = "rack" | "inventory" | "vault";

export default function AdminSupportPlayerDossier({
  bundle,
  loading,
  error,
  params,
  onParamsChange,
  onRetry,
  onCreditPol,
}: AdminSupportPlayerDossierProps) {
  const { t } = useTranslation();

  const changePage = useCallback(
    (key: DossierNumericPageKey, delta: number) => {
      const cur = params[key] ?? 1;
      const next = Math.max(1, cur + delta);
      onParamsChange({ [key]: next });
    },
    [onParamsChange, params]
  );

  const notLinked = bundle != null && bundle.linked === false;
  const orphan = bundle != null && bundle.linked === true && bundle.orphanTicket === true;
  const dossier: AdminSupportPlayerDossierData | null | undefined = bundle?.dossier ?? null;

  const summary = dossier?.summary;

  const pageControls = useMemo(
    () => ({
      deposits: { key: "depositsPage" as const, data: dossier?.depositTransactions },
      ccpayment: { key: "ccpaymentPage" as const, data: dossier?.ccpaymentDeposits },
      withdrawals: { key: "withdrawalsPage" as const, data: dossier?.withdrawalTransactions },
      payouts: { key: "payoutsPage" as const, data: dossier?.payouts },
    }),
    [dossier]
  );

  const groupedMiners = useMemo(() => {
    if (!dossier?.miners?.rows?.length) return [];
    const groups = new Map<string, { row: AdminSupportDossierMinerRow; count: number; activeCount: number }>();
    for (const m of dossier.miners.rows) {
      const key = `${m.minerId ?? m.displayName ?? ""}|${m.level ?? ""}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        if (m.isActive) existing.activeCount++;
      } else {
        groups.set(key, { row: m, count: 1, activeCount: m.isActive ? 1 : 0 });
      }
    }
    return Array.from(groups.values());
  }, [dossier?.miners?.rows]);

  if (!bundle) {
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 py-10 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
          <span className="text-sm font-medium">{t("admin_support.dossier.loading")}</span>
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded-2xl border border-red-900/40 bg-red-950/20 p-4 text-center">
          <p className="text-sm text-red-200/90">{t("admin_support.dossier.error_load")}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-200 hover:border-amber-500/40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("admin_support.dossier.retry")}
          </button>
        </div>
      );
    }
    return null;
  }

  if (notLinked) {
    return (
      <section
        className="rounded-2xl border border-amber-900/30 bg-amber-950/10 p-4 sm:p-5"
        aria-label={t("admin_support.dossier.section_title")}
      >
        <h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-500">
          <Fingerprint className="h-4 w-4" />
          {t("admin_support.dossier.section_title")}
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">{t("admin_support.dossier.not_linked")}</p>
      </section>
    );
  }

  if (orphan) {
    return (
      <section
        className="rounded-2xl border border-orange-900/40 bg-orange-950/15 p-4 sm:p-5"
        aria-label={t("admin_support.dossier.section_title")}
      >
        <h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-400">
          <AlertTriangle className="h-4 w-4" />
          {t("admin_support.dossier.section_title")}
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">{t("admin_support.dossier.orphan_user")}</p>
      </section>
    );
  }

  if (!dossier) return null;

  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/30 p-4 sm:p-5"
      aria-label={t("admin_support.dossier.section_title")}
    >
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-800/40 bg-red-950/25 px-3 py-2 text-xs text-red-100/90">
          <span>{t("admin_support.dossier.error_refresh")}</span>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-lg border border-red-800/50 px-2 py-1 font-bold uppercase tracking-wide hover:bg-red-900/30"
          >
            <RefreshCw className="h-3 w-3" />
            {t("admin_support.dossier.retry")}
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-500">
          <Fingerprint className="h-4 w-4" />
          {t("admin_support.dossier.section_title")}
        </h3>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> : null}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4 sm:grid-cols-2">
        <div className="min-w-0 sm:col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("admin_support.dossier.display_name")}</p>
          <p className="truncate text-base font-bold text-white">{summary?.name ?? "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("admin_support.dossier.username")}</p>
          <p className="truncate text-sm text-slate-200">{summary?.username ? `@${summary.username}` : "—"}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("admin_support.dossier.player_id")}</p>
          <p className="font-mono text-sm text-white">{summary?.id ?? "—"}</p>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <Mail className="h-3 w-3" /> {t("admin_support.dossier.email")}
          </p>
          <p className="break-all text-sm text-slate-200">{summary?.email ?? "—"}</p>
        </div>
        {summary?.isBanned ? (
          <div className="sm:col-span-2 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-200">
            {t("admin_support.dossier.banned")}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("admin_support.dossier.pol_balance")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm text-emerald-300/90">{summary?.polBalance ?? "—"}</p>
            {onCreditPol ? (
              <button
                type="button"
                onClick={onCreditPol}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-700/40 bg-emerald-950/30 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-900/40"
              >
                <Plus className="h-3 w-3" />
                {t("admin_support.credit_pol.button")}
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("admin_support.dossier.blk_balance")}</p>
          <p className="font-mono text-sm text-sky-300/90">{summary?.blkBalance ?? "—"}</p>
        </div>
        <div className="min-w-0 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-800/60">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("admin_support.dossier.registration_ip")}</p>
            <p className="break-all font-mono text-xs text-slate-300">{summary?.registrationIp ?? "—"}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("admin_support.dossier.last_ip")}</p>
            <p className="break-all font-mono text-xs text-slate-300">{summary?.lastIp ?? "—"}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Wallet className="h-3.5 w-3.5" />
          {t("admin_support.dossier.wallet_addresses")}
        </p>
        {dossier.walletAddresses?.length ? (
          <ul className="space-y-2">
            {dossier.walletAddresses.map((addr) => (
              <li key={addr} className="break-all font-mono text-xs text-slate-300">
                {addr}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{t("admin_support.dossier.none")}</p>
        )}
      </div>

      {dossier.accountCollisions?.hasRisk ? (
        <section
          className="rounded-xl border border-amber-900/40 bg-amber-950/15 p-4 space-y-3"
          aria-label={t("admin_support.dossier.multi_account_title")}
        >
          <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-400">
            <Users className="h-4 w-4" />
            {t("admin_support.dossier.multi_account_title")}
          </h4>
          <p className="text-[11px] leading-relaxed text-amber-100/90">{t("admin_support.dossier.multi_account_hint")}</p>
          {dossier.accountCollisions.ipOverlapUsers?.length ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                {t("admin_support.dossier.multi_account_ip_overlap")}
              </p>
              <ul className="space-y-2 text-xs text-slate-200">
                {dossier.accountCollisions.ipOverlapUsers.map((u) => (
                  <li key={`ip-${u.id}`} className="font-mono">
                    <span>
                      #{u.id} · {u.email}
                      {u.username ? ` · @${u.username}` : ""}
                    </span>
                    {Array.isArray(u.ipOverlapReasons) && u.ipOverlapReasons.length ? (
                      <span className="mt-0.5 block text-[10px] text-slate-500 normal-case">
                        {t("admin_support.dossier.multi_account_ip_reasons", {
                          reasons: translateIpOverlapReasons(t, u.ipOverlapReasons),
                        })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {dossier.accountCollisions.profileWalletDuplicateUsers?.length ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                {t("admin_support.dossier.multi_account_profile_wallet_dupes")}
              </p>
              <ul className="space-y-1 text-xs text-slate-200">
                {dossier.accountCollisions.profileWalletDuplicateUsers.map((u) => (
                  <li key={`pwd-${u.id}`} className="font-mono">
                    #{u.id} · {u.email}
                    {u.username ? ` · @${u.username}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {dossier.accountCollisions.chainAddressOverlaps?.length ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t("admin_support.dossier.multi_account_chain_overlap")}
              </p>
              {dossier.accountCollisions.chainAddressOverlaps.map((block) => (
                <div key={block.address} className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-2">
                  <p className="break-all font-mono text-[10px] text-amber-200/90 mb-1">{block.address}</p>
                  <ul className="space-y-1 text-[11px] text-slate-300">
                    {block.otherUsers.map((ou) => (
                      <li key={`${block.address}-${ou.id}`} className="font-mono">
                        #{ou.id} · {ou.email}
                        {ou.username ? ` · @${ou.username}` : ""}
                        <span className="block text-[10px] text-slate-500 normal-case">
                          {t("admin_support.dossier.multi_account_via", { via: translateViaCodes(t, ou.via) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <DossierPagedTable<AdminSupportDossierDepositRow>
        t={t}
        title={t("admin_support.dossier.deposits_ledger")}
        sectionKey="depositsPage"
        data={pageControls.deposits.data}
        params={params}
        onPageDelta={(delta) => changePage("depositsPage", delta)}
        columns={[
          { key: "id", label: t("admin_support.dossier.col_id") },
          { key: "amount", label: t("admin_support.dossier.col_amount") },
          { key: "status", label: t("admin_support.dossier.col_status") },
          { key: "createdAt", label: t("admin_support.dossier.col_date") },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{row.id}</td>
            <td className="px-2 py-2 font-mono">{row.amount ?? "—"}</td>
            <td className="px-2 py-2">{row.status}</td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
          </tr>
        )}
      />

      <DossierPagedTable<AdminSupportDossierCcpaymentRow>
        t={t}
        title={t("admin_support.dossier.deposits_ccpayment")}
        sectionKey="ccpaymentPage"
        data={pageControls.ccpayment.data}
        params={params}
        onPageDelta={(delta) => changePage("ccpaymentPage", delta)}
        columns={[
          { key: "id", label: t("admin_support.dossier.col_id") },
          { key: "amountPol", label: t("admin_support.dossier.col_amount_pol") },
          { key: "credited", label: t("admin_support.dossier.col_credited") },
          { key: "createdAt", label: t("admin_support.dossier.col_date") },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{row.id}</td>
            <td className="px-2 py-2 font-mono">{row.amountPol ?? "—"}</td>
            <td className="px-2 py-2">{String(row.credited)}</td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
          </tr>
        )}
      />

      <DossierPagedTable<AdminSupportDossierWithdrawalRow>
        t={t}
        title={t("admin_support.dossier.withdrawals")}
        sectionKey="withdrawalsPage"
        data={pageControls.withdrawals.data}
        params={params}
        onPageDelta={(delta) => changePage("withdrawalsPage", delta)}
        columns={[
          { key: "id", label: t("admin_support.dossier.col_id") },
          { key: "amount", label: t("admin_support.dossier.col_amount") },
          { key: "status", label: t("admin_support.dossier.col_status") },
          { key: "address", label: t("admin_support.dossier.col_to") },
          { key: "createdAt", label: t("admin_support.dossier.col_date") },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{row.id}</td>
            <td className="px-2 py-2 font-mono">{row.amount ?? "—"}</td>
            <td className="px-2 py-2">{row.status}</td>
            <td className="max-w-[120px] truncate px-2 py-2 font-mono" title={row.address ?? undefined}>
              {row.address ?? "—"}
            </td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
          </tr>
        )}
      />

      <DossierPagedTable<AdminSupportDossierPayoutRow>
        t={t}
        title={t("admin_support.dossier.payouts")}
        sectionKey="payoutsPage"
        data={pageControls.payouts.data}
        params={params}
        onPageDelta={(delta) => changePage("payoutsPage", delta)}
        columns={[
          { key: "id", label: t("admin_support.dossier.col_id") },
          { key: "amountPol", label: t("admin_support.dossier.col_amount_pol") },
          { key: "source", label: t("admin_support.dossier.col_source") },
          { key: "createdAt", label: t("admin_support.dossier.col_date") },
        ]}
        rowRender={(row) => (
          <tr key={String(row.id)} className="border-b border-slate-800/50 text-xs text-slate-300">
            <td className="px-2 py-2 font-mono">{row.id}</td>
            <td className="px-2 py-2 font-mono">{row.amountPol ?? "—"}</td>
            <td className="px-2 py-2">{row.source}</td>
            <td className="px-2 py-2 whitespace-nowrap">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
          </tr>
        )}
      />

      <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Cpu className="h-3.5 w-3.5" />
            {t("admin_support.dossier.miners")}
          </p>
          <Pager
            t={t}
            page={params.minersPage ?? 1}
            limit={params.limit ?? 30}
            total={dossier.miners?.total ?? 0}
            onPrev={() => changePage("minersPage", -1)}
            onNext={() => changePage("minersPage", 1)}
          />
        </div>
        {groupedMiners.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groupedMiners.map(({ row: m, count, activeCount }) => {
              const src = resolveAdminAssetUrl(m.imageUrl);
              const grouped = count > 1;
              return (
                <div key={`${String(m.minerId ?? m.displayName)}-${String(m.level)}`} className="flex gap-3 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain"
                        onError={(e: SyntheticEvent<HTMLImageElement>) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-600">
                        <User className="h-6 w-6" />
                      </div>
                    )}
                    {grouped && (
                      <span className="absolute bottom-0 right-0 rounded-tl-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-slate-950 leading-none">
                        {t("admin_support.dossier.miner_count", { count })}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-xs text-slate-300">
                    <p className="font-bold text-white">{m.displayName}</p>
                    {!grouped && (
                      <p className="mt-1 font-mono text-[10px] text-slate-500">ID {m.id}</p>
                    )}
                    <p className="mt-1">
                      {t("admin_support.dossier.miner_level")}: {m.level} · {t("admin_support.dossier.miner_hash")}:{" "}
                      {m.hashRate} · {t("admin_support.dossier.miner_slots")}: {m.slotSize}
                    </p>
                    {grouped ? (
                      <p className="text-slate-500">
                        {t("admin_support.dossier.miner_active")}: {activeCount}/{count}
                      </p>
                    ) : (
                      <p className="text-slate-500">
                        {t("admin_support.dossier.miner_slot_index")}: {m.slotIndex} · {t("admin_support.dossier.miner_active")}:{" "}
                        {m.isActive ? t("admin_support.dossier.yes") : t("admin_support.dossier.no")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t("admin_support.dossier.none")}</p>
        )}
      </div>
    </section>
  );
}

type DossierMachineGridProps = {
  t: TFunction;
  title: string;
  Icon: LucideIcon;
  pageKey: DossierNumericPageKey;
  block: AdminSupportDossierPaged<AdminSupportDossierMachineCardRow> | undefined;
  params: AdminSupportPlayerDossierParams;
  changePage: (key: DossierNumericPageKey, delta: number) => void;
  kind: DossierMachineKind;
};

function DossierMachineGrid({ t, title, Icon, pageKey, block, params, changePage, kind }: DossierMachineGridProps) {
  const rows = block?.rows ?? [];
  const total = block?.total ?? 0;
  const limit = params.limit ?? 30;
  const page = params[pageKey] ?? 1;
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-950/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </p>
        <Pager
          t={t}
          page={page}
          limit={limit}
          total={total}
          onPrev={() => changePage(pageKey, -1)}
          onNext={() => changePage(pageKey, 1)}
        />
      </div>
      {rows.length ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((m) => (
            <DossierMachineCard key={`${kind}-${String(m.id)}`} m={m} t={t} kind={kind} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{t("admin_support.dossier.none")}</p>
      )}
    </div>
  );
}

type DossierMachineCardProps = {
  m: AdminSupportDossierMachineCardRow;
  t: TFunction;
  kind: DossierMachineKind;
};

function DossierMachineCard({ m, t, kind }: DossierMachineCardProps) {
  const src = resolveAdminAssetUrl(m.imageUrl);
  return (
    <div className="flex gap-3 rounded-lg border border-slate-800/80 bg-slate-900/50 p-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-800">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
            onError={(e: SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-600">
            <User className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 text-xs text-slate-300">
        <p className="font-bold text-white">{m.displayName}</p>
        <p className="mt-1 font-mono text-[10px] text-slate-500">ID {m.id}</p>
        <p>
          {t("admin_support.dossier.miner_level")}: {m.level} · {t("admin_support.dossier.miner_hash")}: {m.hashRate} ·{" "}
          {t("admin_support.dossier.miner_slots")}: {m.slotSize}
        </p>
        {kind === "rack" ? (
          <p className="text-slate-500">
            {t("admin_support.dossier.miner_slot_index")}: {m.slotIndex} · {t("admin_support.dossier.miner_active")}:{" "}
            {m.isActive ? t("admin_support.dossier.yes") : t("admin_support.dossier.no")}
          </p>
        ) : null}
        {kind === "inventory" ? (
          <p className="text-slate-500">
            {t("admin_support.dossier.miner_acquired")}: {m.acquiredAt ? new Date(m.acquiredAt).toLocaleString() : "—"}
            {m.expiresAt ? ` · ${t("admin_support.dossier.miner_expires")}: ${new Date(m.expiresAt).toLocaleString()}` : ""}
          </p>
        ) : null}
        {kind === "vault" ? (
          <p className="text-slate-500">
            {t("admin_support.dossier.miner_stored_at")}: {m.storedAt ? new Date(m.storedAt).toLocaleString() : "—"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type PagerProps = {
  t: TFunction;
  page: number;
  limit: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

function Pager({ t, page, limit, total, onPrev, onNext }: PagerProps) {
  const maxPage = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={onPrev}
        className="rounded-lg border border-slate-700 p-1 text-slate-400 hover:text-white disabled:opacity-30"
        aria-label={t("admin_support.dossier.page_prev")}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-2 font-mono text-[10px] text-slate-500">
        {page}/{maxPage}
      </span>
      <button
        type="button"
        disabled={page >= maxPage}
        onClick={onNext}
        className="rounded-lg border border-slate-700 p-1 text-slate-400 hover:text-white disabled:opacity-30"
        aria-label={t("admin_support.dossier.page_next")}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

type DossierPagedTableProps<Row> = {
  t: TFunction;
  title: string;
  sectionKey: DossierPagedTablePageKey;
  data: AdminSupportDossierPaged<Row> | undefined;
  params: AdminSupportPlayerDossierParams;
  onPageDelta: (delta: number) => void;
  columns: DossierTableColumn[];
  rowRender: (row: Row) => ReactNode;
};

function DossierPagedTable<Row>({ t, title, sectionKey, data, params, onPageDelta, columns, rowRender }: DossierPagedTableProps<Row>) {
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const limit = params.limit ?? 30;
  const page = params[sectionKey] ?? 1;

  return (
    <details className="group rounded-xl border border-slate-800/60 bg-slate-950/30 open:bg-slate-950/40">
      <summary className="cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-400 group-open:text-amber-500/90">{title}</span>
          <Pager
            t={t}
            page={page}
            limit={limit}
            total={total}
            onPrev={() => onPageDelta(-1)}
            onNext={() => onPageDelta(1)}
          />
        </div>
      </summary>
      <div className="overflow-x-auto px-2 pb-3">
        {rows.length ? (
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {columns.map((c) => (
                  <th key={c.key} className="px-2 py-2">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map((row) => rowRender(row))}</tbody>
          </table>
        ) : (
          <p className="px-3 pb-2 text-sm text-slate-500">{t("admin_support.dossier.none")}</p>
        )}
      </div>
    </details>
  );
}
