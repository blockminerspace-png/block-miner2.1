import { type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatHashrate, DEFAULT_MINER_IMAGE_URL, getMachineDescriptor } from "../utils/machine";
import { isVaultPlacementStatus } from "../../constants/machinePlacement";
import { safeDisplayLabel, sanitizeMachineImageSrc } from "../utils/inventoryPageGuards";

/** Row or stacked group from vault/inventory (structurally typed as `object` for broad call-site compatibility). */
export type MachineCardMachine = object;

export type MachineCardProps = {
  machine: MachineCardMachine;
  showActions?: boolean;
  onRetrieve?: () => void;
  retrieveLabel?: string;
  isVault?: boolean;
  actionDisabled?: boolean;
  /** When >1, shows an x{count} badge on the artwork (stacked identical machines). */
  stackQuantity?: number;
};

/**
 * Vault / list card for a machine instance.
 * Layout: vertical stack on narrow viewports so actions never overlap identity text (mobile-first).
 */
export default function MachineCard({
  machine,
  showActions = false,
  onRetrieve,
  retrieveLabel,
  isVault = false,
  actionDisabled = false,
  stackQuantity = 1,
}: MachineCardProps) {
  const { t } = useTranslation();

  const row = machine as Record<string, unknown>;
  const descriptor = getMachineDescriptor(machine as Parameters<typeof getMachineDescriptor>[0]);
  const imgSrc = sanitizeMachineImageSrc(descriptor.image);
  const mn = row.minerName;
  const nameFromMiner = safeDisplayLabel(
    typeof mn === "string" || mn === null || mn === undefined ? mn : undefined
  );
  const nameFromDescriptor = safeDisplayLabel(descriptor.name);
  const displayTitle = nameFromMiner || nameFromDescriptor;
  const altText = displayTitle || safeDisplayLabel(descriptor.name);

  const levelNum = Number(row["level"]);
  const levelDisplay = Number.isFinite(levelNum) ? Math.trunc(levelNum) : "—";

  const qtyRaw = Math.floor(Number(stackQuantity));
  const stackBadgeQty =
    Number.isFinite(qtyRaw) && qtyRaw > 1 ? Math.min(99999, qtyRaw) : 0;

  const statusRaw = row["status"];
  const inVault =
    isVault ||
    isVaultPlacementStatus(
      typeof statusRaw === "string" || statusRaw === null || statusRaw === undefined ? statusRaw : undefined
    );

  return (
    <article className="bg-surface border border-gray-800/50 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-4 min-w-0">
      <div className="flex gap-3 min-w-0 items-start">
        <div className="relative w-14 h-14 shrink-0 sm:w-16 sm:h-16">
          <div className="flex h-full w-full items-center justify-center rounded-xl border border-gray-800/50 bg-gray-900/50 p-2">
            <img
              src={imgSrc}
              alt={altText}
              className="max-h-full max-w-full h-full w-full object-contain"
              onError={(e: SyntheticEvent<HTMLImageElement>) => {
                e.currentTarget.src = DEFAULT_MINER_IMAGE_URL;
              }}
            />
          </div>
          {stackBadgeQty > 1 ? (
            <div className="absolute -right-2 -top-2 z-[1] rounded-full border border-primary/20 bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-lg">
              x{stackBadgeQty}
            </div>
          ) : null}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <h4 className="text-sm font-bold text-white leading-snug break-words">
            {displayTitle || nameFromDescriptor}
          </h4>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            <span>
              {t("inventory.modal.level")} {levelDisplay}
            </span>
            <span aria-hidden>·</span>
            <span className="text-primary font-black">{formatHashrate(row["hashRate"])}</span>
          </div>
          {inVault && (
            <span className="inline-flex w-fit items-center rounded-lg border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">
              {t("vault.machine_status_vault")}
            </span>
          )}
        </div>
      </div>

      {showActions && onRetrieve ? (
        <div className="flex flex-col gap-2 border-t border-gray-800/40 pt-3">
          <button
            type="button"
            disabled={actionDisabled}
            onClick={() => {
              if (!actionDisabled) onRetrieve();
            }}
            className="min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-45"
          >
            {retrieveLabel || t("vault.retrieve_from_vault")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
