import { useState } from "react";
import { safeDisplayLabel, resolveDisplayMachineImageSrc } from "../../../shared/utils/inventoryPageGuards";

type MachineImageProps = {
  imageUrl: string | null;
  name: string;
  className?: string;
  wrapperClassName?: string;
};

function MachinePlaceholder({ name, className }: { name: string; className?: string }) {
  const label = safeDisplayLabel(name) || "Miner";
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex items-center justify-center rounded-xl border border-gray-800/50 bg-gray-900/50 ${className ?? ""}`}
    >
      <span className="select-none text-[10px] font-bold uppercase tracking-wider text-gray-600">GPU</span>
    </div>
  );
}

/**
 * Renders a machine image from DTO snapshot/catalog URL only.
 * Placeholder is visual-only; never mutates payload or global state.
 */
export function MachineImage({ imageUrl, name, className, wrapperClassName }: MachineImageProps) {
  const [failed, setFailed] = useState(false);
  const displaySrc = imageUrl && !failed ? resolveDisplayMachineImageSrc(imageUrl) : null;

  if (!displaySrc) {
    return <MachinePlaceholder name={name} className={wrapperClassName ?? className} />;
  }

  return (
    <img
      src={displaySrc}
      alt={safeDisplayLabel(name) || "Miner"}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
