import { useTranslation } from "react-i18next";
import { formatHashrate, DEFAULT_MINER_IMAGE_URL, getMachineDescriptor } from "../utils/machine";
import { isVaultPlacementStatus } from "../constants/machinePlacement";

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
}) {
  const { t } = useTranslation();
  const descriptor = getMachineDescriptor(machine);
  const displayName = machine.minerName || descriptor.name;
  const inVault = isVault || isVaultPlacementStatus(machine?.status);

  return (
    <article className="bg-surface border border-gray-800/50 rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col gap-4 min-w-0">
      <div className="flex gap-3 min-w-0 items-start">
        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gray-900/50 rounded-xl p-2 border border-gray-800/50 shrink-0 flex items-center justify-center">
          <img
            src={descriptor.image}
            alt={displayName}
            className="max-w-full max-h-full w-full h-full object-contain"
            onError={(e) => {
              e.target.src = DEFAULT_MINER_IMAGE_URL;
            }}
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <h4 className="text-sm font-bold text-white leading-snug break-words">{displayName}</h4>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            <span>
              {t("inventory.modal.level")} {machine.level}
            </span>
            <span aria-hidden>·</span>
            <span className="text-primary font-black">{formatHashrate(machine.hashRate)}</span>
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
            onClick={onRetrieve}
            className="min-h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-45"
          >
            {retrieveLabel || t("vault.retrieve_from_vault")}
          </button>
        </div>
      ) : null}
    </article>
  );
}
