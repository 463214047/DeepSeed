"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, MessageSquare, RotateCcw, Send } from "lucide-react";
import { sanitizeRichHtml, richTextToPlainText } from "@/lib/rich-text";
import { Spinner } from "@/components/spinner";
import {
  TICKET_STATUS_LABEL,
  type TicketStatus,
} from "@/lib/tickets";

type AdminTicket = {
  id: string;
  user_email: string;
  user_name: string | null;
  user_uid: number | null;
  user_avatar: string | null;
  content: string;
  status: TicketStatus;
  handled_by: string | null;
  created_at: string;
  last_reply_at: string | null;
  reply_count: number;
};

type Reply = {
  id: string;
  sender_email: string;
  is_admin: boolean;
  content: string;
  created_at: string;
};

type Counts = { open: number; processing: number; resolved: number; all: number };

const BADGE: Record<TicketStatus, string> = {
  open: "bg-amber-50 text-amber-700 ring-amber-200/70",
  processing: "bg-brand-50 text-brand-600 ring-brand-200/70",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
};

const FILTERS: { key: TicketStatus | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "open", label: "待处理" },
  { key: "processing", label: "处理中" },
  { key: "resolved", label: "已解决" },
];

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminTicketsClient() {
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [counts, setCounts] = useState<Counts>({ open: 0, processing: 0, resolved: 0, all: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTicket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);

  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/tickets${filter === "all" ? "" : `?status=${filter}`}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        tickets?: AdminTicket[];
        counts?: Counts;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setListError(data.message ?? "加载失败");
        return;
      }
      setListError("");
      setTickets(data.tickets ?? []);
      if (data.counts) setCounts(data.counts);
      setSelectedId((cur) => cur ?? data.tickets?.[0]?.id ?? null);
    } catch {
      setListError("网络错误，请稍后重试");
    } finally {
      setListLoading(false);
    }
  }, [filter]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/tickets/${id}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        ticket?: AdminTicket;
        replies?: Reply[];
        message?: string;
      };
      if (!res.ok || !data.ok || !data.ticket) {
        setActionError(data.message ?? "加载失败");
        return;
      }
      setActionError("");
      setDetail(data.ticket);
      setReplies(data.replies ?? []);
    } catch {
      setActionError("网络错误，请稍后重试");
    }
  }, []);

  useEffect(() => {
    // 列表数据依赖筛选条件，setState 均在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    // 选中工单后拉取详情/回复，setState 均在 await 之后
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) ?? detail,
    [tickets, selectedId, detail],
  );

  const safeHtml = useMemo(
    () => (selected ? sanitizeRichHtml(selected.content) : ""),
    [selected],
  );

  async function changeStatus(status: TicketStatus) {
    if (!selectedId) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/tickets/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setActionError(data.message ?? "操作失败");
        return;
      }
      setDetail((cur) => (cur ? { ...cur, status } : cur));
      await loadList();
    } catch {
      setActionError("网络错误，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selectedId) return;
    const text = reply.trim();
    if (!text) return;
    setBusy(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/tickets/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = (await res.json()) as { ok?: boolean; reply?: Reply; message?: string };
      if (!res.ok || !data.ok || !data.reply) {
        setActionError(data.message ?? "发送失败");
        return;
      }
      setReplies((list) => [...list, data.reply as Reply]);
      setReply("");
      await Promise.all([loadDetail(selectedId), loadList()]);
    } catch {
      setActionError("网络错误，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-5 flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Inbox className="size-4.5" strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">工单收件箱</h1>
          <p className="text-xs text-slate-500">全体管理员共享，回复后工单会自动进入「处理中」</p>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key;
          const count = key === "all" ? counts.all : counts[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "bg-brand-600 text-white shadow-sm shadow-brand-600/20"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
              <span className={active ? "text-white/70" : "text-slate-400"}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        {/* 列表 */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
          {listLoading ? (
            <div className="flex items-center gap-2 px-4 py-10 text-xs text-slate-400">
              <Spinner className="size-3.5" />
              加载中…
            </div>
          ) : listError ? (
            <div className="px-4 py-10 text-center text-xs text-red-500">{listError}</div>
          ) : tickets.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-slate-400">暂无工单</div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {tickets.map((t) => {
                const active = t.id === selectedId;
                const name = t.user_name || t.user_email.split("@")[0];
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(t.id);
                        setReply("");
                        setActionError("");
                      }}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        active ? "bg-brand-50/60" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                          {name}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${BADGE[t.status]}`}
                        >
                          {TICKET_STATUS_LABEL[t.status]}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 break-words text-xs leading-relaxed text-slate-500">
                        {richTextToPlainText(t.content)}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{formatTime(t.created_at)}</span>
                        {t.reply_count > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-slate-400">
                            <MessageSquare className="size-3" strokeWidth={1.8} />
                            {t.reply_count}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 详情 */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-900/[0.03]">
          {!selected ? (
            <div className="py-16 text-center text-xs text-slate-400">选择左侧工单查看详情</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${BADGE[selected.status]}`}
                >
                  {TICKET_STATUS_LABEL[selected.status]}
                </span>
                <span className="text-xs text-slate-500">
                  {selected.user_name || selected.user_email}
                  {selected.user_uid != null && (
                    <span className="ml-1 text-slate-400">UID {selected.user_uid}</span>
                  )}
                </span>
                <span className="ml-auto text-[11px] text-slate-400">
                  #{selected.id} · {formatTime(selected.created_at)}
                </span>
              </div>

              <div
                className="prose prose-sm mt-3 max-w-none break-words text-slate-700 prose-blockquote:border-l-brand-300 prose-blockquote:bg-brand-50/50 prose-blockquote:py-1 prose-blockquote:not-italic prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-img:rounded-xl prose-img:border prose-img:border-slate-200"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />

              {replies.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  {replies.map((r) => (
                    <div key={r.id} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-medium text-slate-500">
                        {r.is_admin ? "管理员回复" : "用户回复"} · {formatTime(r.created_at)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                        {r.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-slate-100 pt-4">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  placeholder="回复用户，纯文本，支持换行"
                  className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />

                {actionError && <p className="mt-2 text-xs text-red-500">{actionError}</p>}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={busy || !reply.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-600/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Send className="size-3.5" strokeWidth={1.8} />
                    )}
                    发送回复
                  </button>

                  {selected.status !== "processing" && selected.status !== "resolved" && (
                    <button
                      type="button"
                      onClick={() => changeStatus("processing")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      标记处理中
                    </button>
                  )}
                  {selected.status !== "resolved" ? (
                    <button
                      type="button"
                      onClick={() => changeStatus("resolved")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                    >
                      标记已解决
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => changeStatus("open")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RotateCcw className="size-3.5" strokeWidth={1.8} />
                      重新打开
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
