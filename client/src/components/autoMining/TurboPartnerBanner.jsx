import { ExternalLink, ImageOff } from "lucide-react";
import { validateTrustedEvent } from "../../utils/security";

/**
 * Partner banner area: registers click server-side then opens the target URL.
 *
 * @param {{
 *   impression: { id: string, title?: string, imageUrl?: string | null, targetUrl: string } | null,
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
  t
}) {
  if (loading) {
    return (
      <div className="rounded-[2rem] border border-dashed border-gray-700 bg-gray-950/50 p-10 text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t("autoMiningGpuPage.banner_loading")}</p>
      </div>
    );
  }

  if (error || !impression) {
    return (
      <div className="rounded-[2rem] border border-amber-500/20 bg-amber-500/5 p-8 flex items-center gap-4">
        <ImageOff className="w-10 h-10 text-amber-500 shrink-0" />
        <div>
          <h4 className="text-amber-500 font-black uppercase text-xs tracking-widest">{t("autoMiningGpuPage.banner_error")}</h4>
          <p className="text-[10px] text-amber-200/60 font-bold uppercase mt-1">{t("autoMiningGpuPage.banner_subtitle")}</p>
        </div>
      </div>
    );
  }

  const title = impression.title?.trim() || t("autoMiningGpuPage.banner_fallback");

  async function handleOpen(e) {
    if (!validateTrustedEvent(e)) return;
    e.preventDefault();
    await onRegisterClick(impression.id);
    window.open(impression.targetUrl, "_blank", "noopener,noreferrer");
    onTracked?.();
  }

  return (
    <div className="rounded-[2rem] border border-gray-800 bg-surface overflow-hidden shadow-xl">
      <div className="p-6 space-y-4">
        <div>
          <h4 className="text-xs font-black text-white uppercase tracking-widest italic">{t("autoMiningGpuPage.banner_title")}</h4>
          <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 leading-relaxed">{t("autoMiningGpuPage.banner_subtitle")}</p>
        </div>
        {impression.imageUrl ? (
          <button
            type="button"
            disabled={disabled}
            onClick={handleOpen}
            className="block w-full rounded-2xl overflow-hidden border border-gray-800 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
          >
            <img src={impression.imageUrl} alt="" className="w-full h-40 object-cover" />
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={handleOpen}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-white font-black text-[10px] uppercase tracking-widest hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-40"
        >
          <ExternalLink className="w-4 h-4" />
          {t("autoMiningGpuPage.banner_open")}
        </button>
        <p className="text-[9px] text-gray-600 font-bold uppercase text-center tracking-tighter">{title}</p>
      </div>
    </div>
  );
}
