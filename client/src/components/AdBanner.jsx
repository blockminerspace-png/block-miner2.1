const ZERADS_SRC = {
  "728x90": "https://zerads.com/ad/ad.php?width=728&ref=10776",
  "468x60": "https://zerads.com/ad/ad.php?width=468&ref=10776",
  "300x250": "https://zerads.com/ad/ad.php?width=300&ref=10776",
};

const ZERADS_SIZE = {
  "728x90": { width: 728, height: 90 },
  "468x60": { width: 468, height: 60 },
  "300x250": { width: 300, height: 250 },
};

export default function AdBanner({ size = "728x90" }) {
  const { width, height } = ZERADS_SIZE[size] || ZERADS_SIZE["728x90"];

  return (
    <div className="flex flex-col items-center justify-center gap-2 my-12 animate-in fade-in duration-1000 w-full overflow-hidden">
      <iframe
        src={ZERADS_SRC[size] || ZERADS_SRC["728x90"]}
        width={width}
        height={height}
        marginWidth={0}
        marginHeight={0}
        scrolling="no"
        frameBorder={0}
        style={{ border: "none", maxWidth: "100%", display: "block" }}
        title={`ZerAds ${size}`}
      />
    </div>
  );
}
