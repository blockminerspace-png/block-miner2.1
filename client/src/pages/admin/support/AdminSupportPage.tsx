import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { io, type Socket } from "socket.io-client";
import {
  Search,
  Clock,
  User,
  Mail,
  Send,
  Inbox,
  Settings,
  RefreshCw,
  Loader2,
  ImagePlus,
  X,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../store/auth";
import SupportAttachmentThumbnails from "../../../shared/components/SupportAttachmentThumbnails";
import AdminSupportPlayerDossier from "../components/AdminSupportPlayerDossier";
import AdminSupportCreditPolModal from "../components/AdminSupportCreditPolModal";
import {
  isAdminSupportPlayerDossierBundle,
  type AdminSupportAttachment,
  type AdminSupportInboxMessage,
  type AdminSupportListApiResponse,
  type AdminSupportListFilter,
  type AdminSupportMessageApiResponse,
  type AdminSupportMessageDetail,
  type AdminSupportPlayerDossierBundle,
  type AdminSupportPlayerDossierParams,
  type AdminSupportReplyEntry,
  type AdminSupportReplyPostResponse,
  type AdminSupportSocketReplyPayload,
  type AdminSupportSubscribeAck,
  type AdminSupportUploadImageResponse,
} from "../admin.types";

function defaultDossierParams(): AdminSupportPlayerDossierParams {
  return {
    limit: 30,
    depositsPage: 1,
    ccpaymentPage: 1,
    withdrawalsPage: 1,
    payoutsPage: 1,
    minersPage: 1,
    inventoryPage: 1,
    vaultPage: 1,
  };
}

function mergeReplyUnique(
  replies: AdminSupportReplyEntry[] | undefined,
  incoming: AdminSupportReplyEntry | null | undefined
): AdminSupportReplyEntry[] {
  const base = replies ?? [];
  if (!incoming?.id) return base;
  if (base.some((r) => r.id === incoming.id)) return base;
  return [...base, incoming];
}

function isAdminSupportListFilter(v: string): v is AdminSupportListFilter {
  return v === "all" || v === "unread" || v === "pending" || v === "replied";
}

export default function AdminSupport() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<AdminSupportInboxMessage[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<AdminSupportMessageDetail | null>(null);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminSupportListFilter>("all");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [dossierBundle, setDossierBundle] = useState<AdminSupportPlayerDossierBundle | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState(false);
  const [dossierParams, setDossierParams] = useState<AdminSupportPlayerDossierParams>(() => defaultDossierParams());
  const [replyComposerOpen, setReplyComposerOpen] = useState(true);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [creditPolOpen, setCreditPolOpen] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedMessage?.id ?? null;

  const fetchMessages = useCallback(
    async (p = 1, append = false) => {
      try {
        setLoading(true);
        const res = await api.get<AdminSupportListApiResponse>("/admin/support", { params: { page: p, limit } });
        if (res.data.ok) {
          const rows = res.data.messages ?? [];
          setMessages((prev) => (append ? [...prev, ...rows] : rows));
          setTotal(res.data.total ?? 0);
          setPage(res.data.page ?? p);
        }
      } catch {
        toast.error(t("admin_support.error_list"));
      } finally {
        setLoading(false);
      }
    },
    [limit, t]
  );

  useEffect(() => {
    void fetchMessages(1, false);
  }, [fetchMessages]);

  useEffect(() => {
    if (!selectedMessage?.id) {
      setDossierBundle(null);
      setDossierError(false);
      setDossierLoading(false);
      return;
    }
    if (!dossierOpen) return;
    const ticketId = selectedMessage.id;
    let cancelled = false;
    const run = async () => {
      setDossierLoading(true);
      setDossierError(false);
      try {
        const res = await api.get<unknown>(`/admin/support/${ticketId}/player-dossier`, { params: dossierParams });
        if (cancelled) return;
        if (isAdminSupportPlayerDossierBundle(res.data)) {
          setDossierBundle(res.data);
          setDossierError(false);
        } else {
          setDossierError(true);
        }
      } catch {
        if (!cancelled) setDossierError(true);
      } finally {
        if (!cancelled) setDossierLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedMessage?.id, dossierParams, dossierOpen]);

  const selectMessage = async (msg: AdminSupportInboxMessage) => {
    setLoadingDetails(true);
    setReply("");
    setReplyFiles([]);
    setDossierOpen(false);
    setDossierBundle(null);
    setReplyComposerOpen(true);
    try {
      const res = await api.get<AdminSupportMessageApiResponse>(`/admin/support/${msg.id}`);
      if (res.data.ok && res.data.message) {
        setSelectedMessage(res.data.message);
        setDossierParams(defaultDossierParams());
        if (!msg.isRead) {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m)));
        }
      }
    } catch {
      toast.error(t("admin_support.error_details"));
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDossierParamsChange = useCallback((patch: Partial<AdminSupportPlayerDossierParams>) => {
    setDossierParams((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (!selectedMessage?.id) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const s = io("/", { withCredentials: true });
    socketRef.current = s;

    const onSocketReply = (payload: AdminSupportSocketReplyPayload) => {
      const currentId = selectedIdRef.current;
      if (
        payload &&
        currentId != null &&
        Number(payload.supportMessageId) === Number(currentId) &&
        payload.reply
      ) {
        setSelectedMessage((prev) =>
          prev && prev.id === currentId
            ? { ...prev, replies: mergeReplyUnique(prev.replies, payload.reply) }
            : prev
        );
        setMessages((prev) => prev.map((m) => (m.id === currentId ? { ...m, isReplied: true } : m)));
      }
    };

    s.on("support:reply", onSocketReply);
    s.on("connect", () => {
      s.emit("support:subscribeAdmin", { supportMessageId: selectedMessage.id }, (res: AdminSupportSubscribeAck) => {
        if (res && !res.ok && import.meta.env?.DEV) {
          console.warn("support:subscribeAdmin", res);
        }
      });
    });

    if (s.connected) {
      s.emit("support:subscribeAdmin", { supportMessageId: selectedMessage.id }, () => {});
    }

    return () => {
      s.off("support:reply", onSocketReply);
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [selectedMessage?.id]);

  const uploadAdminImages = async (files: File[]): Promise<AdminSupportAttachment[]> => {
    const urls: AdminSupportAttachment[] = [];
    for (const file of files) {
      const fd = new FormData();
      fd.append("image", file);
      const res = await api.post<AdminSupportUploadImageResponse>("/admin/upload-image", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data?.ok && res.data.url) {
        urls.push({ url: res.data.url, mimeType: res.data.mimeType || file.type });
      }
    }
    return urls;
  };

  const handleReply = async () => {
    if (!selectedMessage) return;
    if (!reply.trim() && replyFiles.length === 0) return;
    setSendingReply(true);
    try {
      let attachments: AdminSupportAttachment[] = [];
      if (replyFiles.length) {
        attachments = await uploadAdminImages(replyFiles);
      }
      const res = await api.post<AdminSupportReplyPostResponse>(`/admin/support/${selectedMessage.id}/reply`, {
        reply: reply.trim() || t("admin_support.reply_image_only"),
        attachments,
      });
      if (res.data.ok) {
        toast.success(t("admin_support.reply_sent"));
        const detailsRes = await api.get<AdminSupportMessageApiResponse>(`/admin/support/${selectedMessage.id}`);
        if (detailsRes.data.ok && detailsRes.data.message) {
          const updatedFull = detailsRes.data.message;
          setSelectedMessage(updatedFull);
          setMessages((prev) => prev.map((m) => (m.id === updatedFull.id ? { ...m, isReplied: true } : m)));
        }
        setReply("");
        setReplyFiles([]);
      }
    } catch {
      toast.error(t("admin_support.error_reply"));
    } finally {
      setSendingReply(false);
    }
  };

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch =
      (msg.subject || "").toLowerCase().includes(search.toLowerCase()) ||
      (msg.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (msg.email || "").toLowerCase().includes(search.toLowerCase());

    if (filter === "unread") return matchesSearch && !msg.isRead;
    if (filter === "replied") return matchesSearch && msg.isReplied;
    if (filter === "pending") return matchesSearch && !msg.isReplied;
    return matchesSearch;
  });

  const hasMore = page * limit < total;

  const addReplyFiles = (fileList: FileList | null) => {
    const next = Array.from(fileList ?? []).filter((f) => f.type.startsWith("image/"));
    setReplyFiles((prev) => [...prev, ...next].slice(0, 5));
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
  };

  const handleFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const v = event.target.value;
    if (isAdminSupportListFilter(v)) setFilter(v);
  };

  const handleReplyTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setReply(event.target.value);
  };

  const handleReplyFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    addReplyFiles(event.target.files);
  };

  const handleRemoveReplyFile = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    setReplyFiles((p) => p.filter((_, j) => j !== index));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Inbox className="w-8 h-8 text-amber-500" />
            {t("admin_support.title")}
          </h1>
          <p className="text-slate-500 font-medium">{t("admin_support.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchMessages(1, false)}
          className="flex items-center gap-2 px-6 py-3 bg-slate-900 border border-slate-800 hover:border-amber-500/50 text-slate-300 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {t("admin_support.refresh")}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4 min-h-[min(420px,calc(100dvh-8rem))] h-[calc(100dvh-8rem)] max-h-[calc(100dvh-8rem)] xl:grid-cols-[400px_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:gap-6">
        <div className="flex min-h-0 flex-col space-y-4 overflow-hidden max-xl:max-h-[min(38vh,340px)] max-xl:shrink-0">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder={t("admin_support.search_placeholder")}
                value={search}
                onChange={handleSearchChange}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
              />
            </div>
            <select
              value={filter}
              onChange={handleFilterChange}
              className="h-12 bg-slate-900 border border-slate-800 rounded-xl px-3 text-xs text-slate-300 focus:outline-none"
            >
              <option value="all">{t("admin_support.filter_all")}</option>
              <option value="unread">{t("admin_support.filter_unread")}</option>
              <option value="pending">{t("admin_support.filter_pending")}</option>
              <option value="replied">{t("admin_support.filter_replied")}</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
            {loading && messages.length === 0 ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-slate-900/50 rounded-2xl animate-pulse" />
              ))
            ) : filteredMessages.length === 0 ? (
              <div className="text-center py-10 opacity-50">{t("admin_support.empty")}</div>
            ) : (
              filteredMessages.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => void selectMessage(msg)}
                  className={`w-full text-left p-4 rounded-3xl border transition-all duration-300 ${
                    selectedMessage?.id === msg.id
                      ? "bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5"
                      : "bg-slate-900/50 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                        msg.isReplied ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                      }`}
                    >
                      {msg.isReplied ? t("admin_support.badge_replied") : t("admin_support.badge_pending")}
                    </span>
                    {!msg.isRead && (
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shadow-lg shadow-amber-500/50" />
                    )}
                  </div>
                  <h3 className="text-white font-bold text-sm truncate">{msg.subject}</h3>
                  <div className="flex items-center gap-2 mt-2 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <User className="w-3 h-3" />
                    <span className="truncate">{msg.name}</span>
                    <Clock className="w-3 h-3 ml-auto" />
                    <span>{new Date(msg.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))
            )}
          </div>
          {hasMore && (
            <button
              type="button"
              className="text-xs font-bold text-amber-500 uppercase py-2"
              onClick={() => void fetchMessages(page + 1, true)}
            >
              {t("admin_support.load_more")}
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/50 max-xl:min-h-[min(56vh,620px)]">
          {loadingDetails ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
            </div>
          ) : selectedMessage ? (
            <div className="flex-1 flex flex-col min-h-0 p-5 sm:p-6 xl:p-8 overflow-hidden gap-6">
              <div className="flex flex-col gap-4 border-b border-slate-800 pb-6 shrink-0 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">{selectedMessage.subject}</h2>
                  <div className="flex flex-wrap items-center gap-4 text-slate-400 text-sm">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-amber-500" />
                      <span className="font-bold">{selectedMessage.name}</span>
                      {selectedMessage.user && (
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400">
                          @{selectedMessage.user.username}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-amber-500" />
                      <span>{selectedMessage.email}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {t("admin_support.protocol", { id: selectedMessage.id })}
                  </p>
                  <p className="text-white font-mono text-xs">{new Date(selectedMessage.createdAt).toLocaleString()}</p>
                  {selectedMessage.user ? (
                    <button
                      type="button"
                      onClick={() => setCreditPolOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-700/50 bg-emerald-950/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-300 hover:border-emerald-500/60 hover:bg-emerald-900/40"
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      {t("admin_support.credit_pol.button")}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain space-y-6 pr-2 sm:pr-3 xl:pr-4 scrollbar-thin scrollbar-thumb-slate-800">
                {!dossierOpen ? (
                  <button
                    type="button"
                    onClick={() => setDossierOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm font-bold text-amber-400 hover:border-amber-500/40 hover:bg-slate-900/70 transition-colors"
                  >
                    <Fingerprint className="h-4 w-4" />
                    {t("admin_support.dossier.load_button")}
                  </button>
                ) : (
                  <AdminSupportPlayerDossier
                    bundle={dossierBundle}
                    loading={dossierLoading}
                    error={dossierError}
                    params={dossierParams}
                    onParamsChange={handleDossierParamsChange}
                    onRetry={() => {
                      if (selectedMessage?.id) setDossierParams((p) => ({ ...p }));
                    }}
                    onCreditPol={() => setCreditPolOpen(true)}
                  />
                )}
                <div className="rounded-3xl border border-slate-800/50 bg-slate-900/30 p-4 sm:p-5 xl:p-6">
                  <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                    <User className="h-3 w-3" /> {t("admin_support.label_user")}
                  </div>
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch xl:gap-6">
                    <div className="min-w-0 flex-1 rounded-2xl border border-slate-800/40 bg-slate-950/30 p-4 xl:p-5">
                      <p className="break-words whitespace-pre-wrap text-sm leading-7 text-slate-300 sm:text-base">
                        {selectedMessage.body ?? selectedMessage.message}
                      </p>
                    </div>
                    {selectedMessage.attachments?.length ? (
                      <div className="shrink-0 xl:max-w-[min(100%,28rem)] xl:border-l xl:border-slate-800/50 xl:pl-6">
                        <SupportAttachmentThumbnails
                          attachments={selectedMessage.attachments}
                          variant="adminStrip"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedMessage.reply && (!selectedMessage.replies || selectedMessage.replies.length === 0) && (
                  <div className="bg-amber-500/5 p-4 sm:p-6 rounded-3xl border border-amber-500/20 relative sm:ml-8">
                    <div className="absolute -top-3 left-6 bg-amber-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase italic">
                      {t("admin_support.legacy_reply")}
                    </div>
                    <p className="text-amber-100/80 whitespace-pre-wrap leading-relaxed">{selectedMessage.reply}</p>
                  </div>
                )}

                {selectedMessage.replies?.map((r) => (
                  <div
                    key={r.id}
                    className={`p-4 sm:p-5 xl:p-6 rounded-3xl border relative ${
                      r.isAdmin ? "bg-amber-500/5 border-amber-500/20 sm:ml-8" : "bg-slate-900/30 border-slate-800/50 sm:mr-8"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 mb-2 text-[10px] font-black uppercase ${
                        r.isAdmin ? "text-amber-500" : "text-slate-500"
                      }`}
                    >
                      {r.isAdmin ? <Settings className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {r.isAdmin ? t("admin_support.label_team") : t("admin_support.label_user")}
                      <span className="ml-auto font-mono opacity-50">{new Date(r.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch xl:gap-4">
                      <div className="min-w-0 flex-1 rounded-xl border border-slate-800/30 bg-slate-950/20 p-3 md:p-4">
                        <p
                          className={`whitespace-pre-wrap leading-relaxed ${
                            r.isAdmin ? "text-amber-100/80" : "text-slate-300"
                          }`}
                        >
                          {r.body ?? r.message}
                        </p>
                      </div>
                      {r.attachments?.length ? (
                        <div className="shrink-0 xl:max-w-[min(100%,24rem)] xl:border-l xl:border-slate-700/40 xl:pl-4">
                          <SupportAttachmentThumbnails attachments={r.attachments} variant="adminStrip" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-auto shrink-0 border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setReplyComposerOpen((o) => !o)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-left text-sm font-bold text-slate-200 transition-colors hover:border-amber-500/30 hover:bg-slate-900/70"
                  aria-expanded={replyComposerOpen}
                >
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-amber-500" />
                    {replyComposerOpen ? t("admin_support.reply_compose_collapse") : t("admin_support.reply_compose_expand")}
                  </span>
                  {replyComposerOpen ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                  )}
                </button>
                {replyComposerOpen ? (
                  <div className="mt-4 space-y-4">
                    <textarea
                      placeholder={t("admin_support.reply_placeholder")}
                      value={reply}
                      onChange={handleReplyTextChange}
                      rows={3}
                      className="w-full resize-none rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-white transition-colors focus:border-amber-500/50 focus:outline-none"
                    />
                    {replyFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {replyFiles.map((f, i) => (
                          <span
                            key={`${f.name}-${i}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-300"
                          >
                            {f.name}
                            <button
                              type="button"
                              onClick={(e) => handleRemoveReplyFile(e, i)}
                              aria-label={t("admin_support.remove_file")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 hover:border-amber-500/40">
                        <ImagePlus className="h-4 w-4" />
                        {t("admin_support.add_images")}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          multiple
                          className="hidden"
                          onChange={handleReplyFilesChange}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleReply()}
                        disabled={sendingReply || (!reply.trim() && replyFiles.length === 0)}
                        className="flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 text-xs font-black uppercase tracking-[0.2em] text-white italic transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100 sm:flex-1"
                      >
                        {sendingReply ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            {t("admin_support.send")}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-30">
              <Inbox className="w-20 h-20 mb-4 text-slate-600" />
              <h3 className="text-xl font-bold text-white uppercase tracking-tighter italic">{t("admin_support.select_title")}</h3>
              <p className="text-sm">{t("admin_support.select_hint")}</p>
            </div>
          )}
        </div>
      </div>
      <AdminSupportCreditPolModal
        open={creditPolOpen}
        ticketId={selectedMessage?.id ?? null}
        playerLabel={selectedMessage?.user?.username ?? selectedMessage?.name ?? selectedMessage?.email ?? null}
        onClose={() => setCreditPolOpen(false)}
        onCredited={() => {
          if (selectedMessage?.id) {
            setDossierParams((p) => ({ ...p }));
            void api.get<AdminSupportMessageApiResponse>(`/admin/support/${selectedMessage.id}`).then((detailsRes) => {
              if (detailsRes.data.ok) setSelectedMessage(detailsRes.data.message ?? null);
            }).catch(() => {});
          }
        }}
      />
    </div>
  );
}
