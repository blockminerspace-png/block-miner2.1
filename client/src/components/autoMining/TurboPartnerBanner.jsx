import { ImageOff } from "lucide-react";
import { validateTrustedEvent } from "../../utils/security";

/** ZerAds placement URL (display banner; PTC callback API is separate). */
export const TURBO_ZERADS_IFRAME_SRC =
  "https://zerads.com/ad/ad.php?width=300&ref=10776";

/**
 * Turbo mode: ZerAds iframe with a single full-area control (no separate CTA).
 * Click is tracked server-side via `onRegisterClick(impression.id)` before opening a new tab.
 *
 * @param {{
 *   impression: { id: string, title?: string } | null,
 *   loading?: boolean,
 *   error?: boolean,
 *   disabled?: boolean,
 *   onRegisterClick: (impressionId: string) => Promise<void>,
 *   onTracked?: () => void,
 *   t: (k: string) => string
 * }} props
 */
export default function TurboPartnerBanner({
  impression,
  loading,
  error,
  disabled,
  onRegisterClick,
  onTracked,
  t,
}) {
  if (loading) {
    return (
      <div className="rounded-[2rem] border border-dashed border-gray-700 bg-gray-950/50 p-10 text-center">
        <div className="mx-auto mb-4 h-[250px] w-[300px] max-w-full border border-gray-800 bg-black/40 rounded-xl overflow-hidden">
          <iframe
            src={TURBO_ZERADS_IFRAME_SRC}
            marginWidth={0}
            marginHeight={0}
            width={300}
            height={250}
            scrolling="no"
            frameBorder="0"
            style={{ border: 0, display: "block", maxWidth: "100%" }}
            title={t("autoMiningGpuPage.turbo_zerads_iframe_title")}
          />
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">
          {t("autoMiningGpuPage.banner_loading")}
        </p>
      </div>
    );
  }

  if (error || !impression) {
    return (
      <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/5 p-8 flex items-center gap-4">
        <ImageOff className="w-10 h-10 text-amber-500 shrink-0" />
        <div>
          <h4 className="text-amber-500 font-black uppercase text-xs tracking-widest">
            {t("autoMiningGpuPage.banner_error")}
          </h4>
          <p className="text-[10px] text-amber-200/60 font-bold uppercase mt-1">
            {t("autoMiningGpuPage.banner_subtitle")}
          </p>
        </div>
      </div>
    );
  }

  const title = impression.title?.trim() || t("autoMiningGpuPage.banner_fallback");

  async function handleOpen(e) {
    if (!validateTrustedEvent(e)) return;
    e.preventDefault();
    await onRegisterClick(impression.id);
    window.open(TURBO_ZERADS_IFRAME_SRC, "_blank", "noopener,noreferrer");
    onTracked?.();
  }

  return (
    <div className="rounded-[2rem] border border-gray-800 bg-surface overflow-hidden shadow-xl">
      <div className="p-6 space-y-4">
        <div>
          <h4 className="text-xs font-black text-white uppercase tracking-widest italic">
            {t("autoMiningGpuPage.banner_title")}
          </h4>
          <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 leading-relaxed">
            {t("autoMiningGpuPage.banner_subtitle")}
          </p>
        </div>
        <div className="flex justify-center">
          <div className="relative w-[300px] max-w-full h-[250px] rounded-xl overflow-hidden border border-gray-800">
            <iframe
              src={TURBO_ZERADS_IFRAME_SRC}
              marginWidth={0}
              marginHeight={0}
              width={300}
              height={250}
              scrolling="no"
              frameBorder="0"
              style={{ border: 0, display: "block", maxWidth: "100%" }}
              title={t("autoMiningGpuPage.turbo_zerads_iframe_title")}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={handleOpen}
              aria-label={t("autoMiningGpuPage.banner_open")}
              className="absolute inset-0 z-10 w-full h-full cursor-pointer bg-transparent disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
        </div>
        <p className="text-[9px] text-gray-600 font-bold uppercase text-center tracking-tighter">{title}</p>
      </div>
    </div>
  );
}
