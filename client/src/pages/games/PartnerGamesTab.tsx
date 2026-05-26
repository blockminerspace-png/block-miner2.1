import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { Gamepad2, ThumbsUp, ThumbsDown, Maximize2, ExternalLink, Loader2, X } from "lucide-react";
import { api, useAuthStore } from "../../store/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PartnerGame {
  id: number;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  iframeUrl: string;
  fallbackUrl: string | null;
  partnerUrl: string | null;
  likeCount: number;
  dislikeCount: number;
  myVote: 1 | -1 | 0;
}

// ─── Card ────────────────────────────────────────────────────────────────────

function PartnerGameCard({
  game,
  onOpen,
  onVoted,
  t,
}: {
  game: PartnerGame;
  onOpen: (g: PartnerGame) => void;
  onVoted: (next: Pick<PartnerGame, "id" | "likeCount" | "dislikeCount" | "myVote">) => void;
  t: TFunction;
}) {
  const { user } = useAuthStore();
  const [voting, setVoting] = useState(false);

  const vote = useCallback(
    async (value: 1 | -1) => {
      if (!user || voting) return;
      setVoting(true);
      try {
        const res = await api.post<{
          ok: boolean;
          partnerGameId: number;
          likeCount: number;
          dislikeCount: number;
          myVote: 1 | -1 | 0;
        }>(`/partner-games/${game.id}/vote`, { value });
        if (res.data.ok) {
          onVoted({
            id: game.id,
            likeCount: res.data.likeCount,
            dislikeCount: res.data.dislikeCount,
            myVote: res.data.myVote,
          });
        }
      } catch {
        /* silent */
      } finally {
        setVoting(false);
      }
    },
    [game.id, user, voting, onVoted]
  );

  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/60">
      {/* Cover (clickable → opens iframe modal) */}
      <button
        type="button"
        onClick={() => onOpen(game)}
        className="relative block aspect-video w-full overflow-hidden bg-gradient-to-br from-slate-800 to-slate-950"
        aria-label={t("partnerGames.open_aria", { title: game.title })}
      >
        {game.coverImageUrl ? (
          <img
            src={game.coverImageUrl}
            alt={game.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Gamepad2 className="h-14 w-14 text-slate-700" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/40 group-hover:opacity-100">
          <span className="rounded-full bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-xl">
            {t("partnerGames.play")}
          </span>
        </div>
      </button>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-tight text-white">{game.title}</h3>
          {game.description && (
            <p className="mt-1 text-[11px] leading-snug text-slate-400 line-clamp-2">{game.description}</p>
          )}
        </div>

        {/* Actions row */}
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => vote(1)}
            disabled={!user || voting}
            aria-label={t("partnerGames.like_aria")}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              game.myVote === 1
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"
            }`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            <span>{game.likeCount}</span>
          </button>
          <button
            type="button"
            onClick={() => vote(-1)}
            disabled={!user || voting}
            aria-label={t("partnerGames.dislike_aria")}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              game.myVote === -1
                ? "border-red-500/40 bg-red-500/20 text-red-300"
                : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"
            }`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            <span>{game.dislikeCount}</span>
          </button>
          {game.partnerUrl && (
            <a
              href={game.partnerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-black text-white transition-colors hover:bg-red-500"
              title={t("partnerGames.visit_partner")}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>{t("partnerGames.visit_partner")}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Iframe modal ────────────────────────────────────────────────────────────

function PartnerGameModal({
  game,
  onClose,
  t,
}: {
  game: PartnerGame;
  onClose: () => void;
  t: TFunction;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeFailed, setIframeFailed] = useState(false);

  // Auto-detect blocked iframes: if no load event fires in time, the browser
  // probably blocked it via X-Frame-Options/CSP. We surface a fallback CTA.
  useEffect(() => {
    setIframeFailed(false);
    const timer = setTimeout(() => {
      // If the iframe loaded successfully, it'd have fired onLoad which clears
      // this state. We can't detect cross-origin XFO failures programmatically,
      // so we just wait long enough to be confident and show the fallback.
      setIframeFailed(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [game.id]);

  const requestFullscreen = useCallback(() => {
    const el = iframeRef.current;
    if (!el) return;
    // Browser support varies; try the standard API first.
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  }, []);

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col bg-black/95 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{game.title}</p>
          <p className="truncate text-[10px] text-slate-500">{t("partnerGames.modal_subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={requestFullscreen}
          aria-label={t("partnerGames.fullscreen_aria")}
          title={t("partnerGames.fullscreen")}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black text-gray-300 transition-colors hover:border-white/20 hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("partnerGames.fullscreen")}</span>
        </button>
        {game.partnerUrl && (
          <a
            href={game.partnerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-black text-white transition-colors hover:bg-red-500"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("partnerGames.visit_partner")}</span>
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("partnerGames.close_aria")}
          className="rounded-lg border border-red-500/30 bg-red-500/20 p-2 text-red-400 transition-colors hover:bg-red-500/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Iframe body */}
      <div className="relative flex-1 bg-black">
        <iframe
          ref={iframeRef}
          src={game.iframeUrl}
          title={game.title}
          className="absolute inset-0 h-full w-full border-0"
          // Sandbox: allow scripts + same-origin enough for game logic, plus popups
          // (some games open auth flows). We deliberately omit `allow-top-navigation`
          // so a misbehaving partner can't navigate our top window away.
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-pointer-lock allow-orientation-lock"
          // `allow="fullscreen"` is needed for embed-initiated fullscreen
          // (e.g. games with their own fullscreen button inside).
          allow="autoplay; fullscreen; gamepad; clipboard-write"
          onLoad={() => setIframeFailed(false)}
        />
        {iframeFailed && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="pointer-events-auto max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
              <p className="text-sm font-bold text-white">{t("partnerGames.iframe_failed_title")}</p>
              <p className="mt-2 text-xs text-slate-400">{t("partnerGames.iframe_failed_desc")}</p>
              <a
                href={game.fallbackUrl ?? game.iframeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white transition-colors hover:bg-primary/90"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("partnerGames.open_in_new_tab")}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab root ────────────────────────────────────────────────────────────────

export default function PartnerGamesTab({ t }: { t: TFunction }) {
  const [games, setGames] = useState<PartnerGame[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openGame, setOpenGame] = useState<PartnerGame | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; games: PartnerGame[] }>("/partner-games");
      if (res.data.ok) setGames(res.data.games);
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Lock background scroll while the iframe modal is open.
  useEffect(() => {
    if (!openGame) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [openGame]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  if (!games?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
        <Gamepad2 className="h-10 w-10 opacity-30" />
        <p className="text-sm font-bold">{t("partnerGames.empty")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <PartnerGameCard
            key={g.id}
            game={g}
            onOpen={(game) => setOpenGame(game)}
            onVoted={(next) =>
              setGames((prev) =>
                prev
                  ? prev.map((row) =>
                      row.id === next.id
                        ? {
                            ...row,
                            likeCount: next.likeCount,
                            dislikeCount: next.dislikeCount,
                            myVote: next.myVote,
                          }
                        : row
                    )
                  : prev
              )
            }
            t={t}
          />
        ))}
      </div>
      {openGame && (
        <PartnerGameModal game={openGame} onClose={() => setOpenGame(null)} t={t} />
      )}
    </>
  );
}
