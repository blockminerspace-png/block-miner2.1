import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

const VIEWPORT_MARGIN = 8;
const GAP = 8;
const DEFAULT_TOOLTIP_WIDTH = 224;
const DEFAULT_TOOLTIP_HEIGHT = 88;

/**
 * Positions a fixed tooltip relative to the anchor, flipping above/below and clamping to the viewport.
 * @param {DOMRect} anchor
 * @param {number} tooltipWidth
 * @param {number} tooltipHeight
 * @returns {{ top: number, left: number }}
 */
function computeTooltipPosition(anchor, tooltipWidth, tooltipHeight) {
  let top = anchor.top - GAP - tooltipHeight;
  let left = anchor.left + anchor.width / 2 - tooltipWidth / 2;

  if (top < VIEWPORT_MARGIN) {
    top = anchor.bottom + GAP;
  }

  left = Math.min(
    Math.max(left, VIEWPORT_MARGIN),
    window.innerWidth - VIEWPORT_MARGIN - tooltipWidth
  );

  top = Math.min(
    Math.max(top, VIEWPORT_MARGIN),
    window.innerHeight - VIEWPORT_MARGIN - tooltipHeight
  );

  return { top, left };
}

/**
 * Portal-mounted tooltip for rack machine slots. Escapes ancestor overflow/transform clipping.
 * Marked aria-hidden: screen readers use the slot button aria-label (full i18n string).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {HTMLElement | null} props.anchorEl
 * @param {string} props.displayName
 * @param {string} props.hashrateStr Formatted hashrate (includes unit), already localized by formatter.
 * @param {number} props.slotSize Number of rack slots occupied (e.g. 1 or 2).
 */
export default function RackMachineTooltipPortal({ open, anchorEl, displayName, hashrateStr, slotSize }) {
  const { t } = useTranslation();
  const tooltipRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setVisible(false);
      return;
    }

    const updatePosition = () => {
      if (!anchorEl.isConnected) {
        setVisible(false);
        return;
      }

      const el = tooltipRef.current;
      const anchor = anchorEl.getBoundingClientRect();
      const tw = el?.offsetWidth || DEFAULT_TOOLTIP_WIDTH;
      const th = el?.offsetHeight || DEFAULT_TOOLTIP_HEIGHT;
      const { top, left } = computeTooltipPosition(anchor, tw, th);
      setCoords({ top, left });
      setVisible(true);
    };

    updatePosition();

    const raf = requestAnimationFrame(() => {
      updatePosition();
    });

    let ro;
    if (tooltipRef.current && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => updatePosition());
      ro.observe(tooltipRef.current);
    }

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, anchorEl, displayName, hashrateStr, slotSize]);

  if (typeof document === "undefined" || !open || !anchorEl) {
    return null;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      className={`pointer-events-none fixed z-[10000] w-[min(calc(100vw-16px),14rem)] rounded-xl border border-gray-700/80 bg-gray-950/95 px-3 py-2 text-left shadow-xl shadow-black/40 backdrop-blur-sm transition-opacity duration-150 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{ top: coords.top, left: coords.left }}
      aria-hidden="true"
    >
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
        {t("inventory.rack_machine_tooltip.machine_name_label")}
      </p>
      <p className="truncate text-xs font-bold text-white -mt-0.5">{displayName}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
        {t("inventory.rack_machine_tooltip.power", { value: hashrateStr })}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-300">
        {t("inventory.rack_machine_tooltip.slots_occupied", { count: slotSize })}
      </p>
    </div>,
    document.body
  );
}
