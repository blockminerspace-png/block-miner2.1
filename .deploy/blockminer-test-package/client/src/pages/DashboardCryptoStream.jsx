import { useTranslation } from "react-i18next";

/**
 * Public route (same pattern as /liveserver): SPA serves this page; the heavy HTML board lives
 * at /crypto-broadcast/ to avoid Express vs React path conflicts and proxy redirect loops.
 */
export default function DashboardCryptoStream() {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[100] bg-[#0b0e14]">
      <iframe
        title={t("dashboard_crypto_stream.title")}
        src="/crypto-broadcast/"
        className="h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
