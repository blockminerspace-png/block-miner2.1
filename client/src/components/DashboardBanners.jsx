import { useEffect, useState, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';

const isVideo = (url) => url && /\.(mp4|webm|ogg|mov|avi)$/i.test(url);

function resolveBannerAssetUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (/^(https?:|data:|blob:)/i.test(u)) return u;
  if (u.startsWith('/')) return u;
  if (u.startsWith('uploads/')) return `/${u}`;
  return u;
}

function formatCountdownLabel(endsAt, nowMs) {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - nowMs;
  if (!(diff > 0)) return null;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return d > 0 ? `${d}d : ${h}h : ${m}m` : h > 0 ? `${h}h : ${m}m : ${s}s` : `${m}m : ${s}s`;
}

function BannerCard({ banner, nowMs }) {
  const countdown = formatCountdownLabel(banner.endsAt, nowMs);
  const mediaUrl = resolveBannerAssetUrl(banner.imageUrl);
  const [mediaFailed, setMediaFailed] = useState(false);
  const shouldShowMedia = mediaUrl && !mediaFailed;
  const inner = (
    <div className="relative w-full h-full overflow-hidden rounded-2xl bg-slate-900 border border-white/[0.08] group cursor-pointer select-none">
      {/* Mídia */}
      {shouldShowMedia ? (
        isVideo(mediaUrl) ? (
          <video
            src={mediaUrl}
            className="w-full h-full object-cover"
            autoPlay muted loop playsInline
            onError={() => setMediaFailed(true)}
          />
        ) : (
          <img
            src={mediaUrl}
            alt={banner.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            draggable={false}
            loading="lazy"
            onError={() => {
              setMediaFailed(true);
            }}
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
          <p className="text-sm font-bold text-slate-400 px-4 text-center">{banner.title}</p>
        </div>
      )}

      {/* Overlay escuro no hover */}
      <div className="absolute inset-0 bg-black/10 group-hover:bg-black/25 transition-colors duration-300 rounded-2xl" />

      {/* Countdown badge */}
      {countdown && (
        <div className="absolute top-0 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-b-xl text-[11px] font-black text-white tracking-wider">
            <Clock className="w-3 h-3 text-amber-400" />
            <span className="text-amber-300">ENDS</span>
            <span>{countdown}</span>
          </div>
        </div>
      )}
    </div>
  );

  if (banner.link) {
    return (
      <a
        href={banner.link}
        target={banner.link.startsWith('http') ? '_blank' : '_self'}
        rel="noopener noreferrer"
        className="block w-full h-full"
        tabIndex={-1}
      >
        {inner}
      </a>
    );
  }
  return inner;
}

const VISIBLE = { sm: 1, md: 2, lg: 3, xl: 4 };

export default function DashboardBanners() {
  const [banners, setBanners] = useState([]);
  const [idx, setIdx] = useState(0);
  const [perPage, setPerPage] = useState(3);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const trackRef = useRef(null);
  const autoRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/banners', { signal: controller.signal })
      .then(r => r.json())
      .then(data => { if (data.ok) setBanners(Array.isArray(data.banners) ? data.banners : []); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Responsive perPage
  useEffect(() => {
    if (!trackRef.current?.parentElement || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w < 640)       setPerPage(1);
      else if (w < 900)  setPerPage(2);
      else if (w < 1200) setPerPage(3);
      else               setPerPage(4);
    });
    obs.observe(trackRef.current.parentElement);
    return () => obs.disconnect();
  }, [banners.length]);

  const maxIdx = Math.max(0, banners.length - perPage);

  useEffect(() => {
    setIdx((current) => Math.min(current, maxIdx));
  }, [maxIdx]);

  const go = useCallback((dir) => {
    setIdx(i => {
      const next = i + dir;
      if (next < 0) return maxIdx;
      if (next > maxIdx) return 0;
      return next;
    });
  }, [maxIdx]);

  // Auto-advance
  useEffect(() => {
    if (banners.length <= perPage) return;
    autoRef.current = setInterval(() => go(1), 5000);
    return () => clearInterval(autoRef.current);
  }, [banners.length, perPage, go]);

  useEffect(() => {
    if (!banners.some((banner) => banner?.endsAt)) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [banners]);

  const resetAuto = () => {
    clearInterval(autoRef.current);
    autoRef.current = setInterval(() => go(1), 5000);
  };

  if (banners.length === 0) return null;

  const cardW = 100 / perPage;
  const pages = maxIdx + 1;

  return (
    <div className="relative w-full">
      {/* Track */}
      <div className="overflow-hidden w-full" ref={trackRef}>
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${idx * cardW}%)` }}
        >
          {banners.map(b => (
            <div
              key={b.id}
              className="shrink-0 px-1 sm:px-1.5"
              style={{ width: `${cardW}%` }}
            >
              <div className="w-full" style={{ aspectRatio: '16/9' }}>
                <BannerCard banner={b} nowMs={nowMs} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Arrows */}
      {banners.length > perPage && (
        <>
          <button
            type="button"
            onClick={() => { go(-1); resetAuto(); }}
            className="absolute left-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80 sm:left-0 sm:-translate-x-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { go(1); resetAuto(); }}
            className="absolute right-1 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80 sm:right-0 sm:translate-x-2"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}

      {/* Dots */}
      {pages > 1 && (
        <div className="flex justify-center gap-1.5 mt-3">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setIdx(i); resetAuto(); }}
              className={`rounded-full transition-all duration-300 ${i === idx ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

