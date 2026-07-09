import { useEffect, useState } from "react";

function readVisible(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

function readOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

/** Tracks tab visibility, network, and page lifecycle for reward eligibility. */
export function usePartnerPageActivity() {
  const [pageVisible, setPageVisible] = useState(readVisible);
  const [online, setOnline] = useState(readOnline);

  useEffect(() => {
    const onVisibility = () => setPageVisible(readVisible());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pagehide", onVisibility);
    window.addEventListener("focus", onVisibility);
    window.addEventListener("blur", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pagehide", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("blur", onVisibility);
    };
  }, []);

  return {
    pageVisible,
    online,
    /** Rewards accrue only when tab is visible and network is up. */
    playActive: pageVisible && online,
  };
}
