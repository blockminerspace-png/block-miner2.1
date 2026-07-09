import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TFunction } from "i18next";
import { Gamepad2, ThumbsUp, ThumbsDown, ExternalLink, Loader2 } from "lucide-react";
import { api, useAuthStore } from "../../store/auth";

export interface PartnerGame {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  iframeUrl: string;
  fallbackUrl: string | null;
  partnerUrl: string | null;
  launchMode?: "iframe" | "external";
  embedStatus?: string | null;
  embedBlockReason?: string | null;
  likeCount: number;
  dislikeCount: number;
  myVote: 1 | -1 | 0;
}

function normalizePartnerGame(raw: PartnerGame): PartnerGame {
  const launchMode =
    raw.launchMode === "external" || (raw.embedStatus && raw.embedStatus !== "embeddable")
      ? "external"
      : raw.launchMode ?? "iframe";
  return { ...raw, launchMode };
}

function PartnerGameCard({
  game,
  onPlay,
  onVoted,
  t,
}: {
  game: PartnerGame;
  onPlay: (g: PartnerGame) => void;
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
    [game.id, user, voting, onVoted],
  );

  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl transition-all hover:-translate-y-1 hover:border-primary/60">
      <button
        type="button"
        onClick={() => onPlay(game)}
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
            {t("partnerGames.playCta")}
          </span>
        </div>
      </button>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-tight text-white">{game.title}</h3>
          {game.description && (
            <p className="mt-1 text-[11px] leading-snug text-slate-400 line-clamp-2">{game.description}</p>
          )}
        </div>

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
              onClick={(e) => e.stopPropagation()}
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

export default function PartnerGamesTab({ t }: { t: TFunction }) {
  const navigate = useNavigate();
  const [games, setGames] = useState<PartnerGame[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; games: PartnerGame[] }>("/partner-games");
      if (res.data.ok) setGames(res.data.games.map(normalizePartnerGame));
    } catch {
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePlay = useCallback(
    (game: PartnerGame) => {
      navigate(`/games/partner/${game.slug}`);
    },
    [navigate],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }
  if (!games?.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
        <Gamepad2 className="h-10 w-10 opacity-30" />
        <p className="text-sm font-bold">{t("partnerGames.empty")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
      {games.map((g) => (
        <PartnerGameCard
          key={g.id}
          game={g}
          onPlay={handlePlay}
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
                      : row,
                  )
                : prev,
            )
          }
          t={t}
        />
      ))}
    </div>
  );
}
