const ZERADS_KEYS = ["728x90", "468x60", "300x250"] as const;
type AdSizeKey = (typeof ZERADS_KEYS)[number];

const ZERADS_SRC: Record<AdSizeKey, string> = {
  "728x90": "https://zerads.com/ad/ad.php?width=728&ref=10776",
  "468x60": "https://zerads.com/ad/ad.php?width=468&ref=10776",
  "300x250": "https://zerads.com/ad/ad.php?width=300&ref=10776",
};

const ZERADS_SIZE: Record<AdSizeKey, { width: number; height: number }> = {
  "728x90": { width: 728, height: 90 },
  "468x60": { width: 468, height: 60 },
  "300x250": { width: 300, height: 250 },
};

function resolveAdSize(size: string | undefined): AdSizeKey {
  const s = size ?? "728x90";
  return (ZERADS_KEYS as readonly string[]).includes(s) ? (s as AdSizeKey) : "728x90";
}

export default function AdBanner({ size = "728x90" }: { size?: string }) {
  const key = resolveAdSize(size);
  const { width, height } = ZERADS_SIZE[key];

  return (
    <div className="flex flex-col items-center justify-center gap-2 my-12 animate-in fade-in duration-1000 w-full overflow-hidden">
      <iframe
        src={ZERADS_SRC[key]}
        width={width}
        height={height}
        marginWidth={0}
        marginHeight={0}
        scrolling="no"
        frameBorder={0}
        style={{ border: "none", maxWidth: "100%", display: "block" }}
        title={`ZerAds ${key}`}
      />
    </div>
  );
}
