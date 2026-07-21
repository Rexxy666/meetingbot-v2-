import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarOff,
  Check,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { API_BASE, joinMeetingByLink } from "../lib/api.js";
import { getMode } from "../config/meetingConfig.js";
import { useTheme } from "../lib/theme.js";
import PreJoinConfirmModal from "../components/PreJoinConfirmModal.jsx";

const CARD = "bg-white border border-gray-100 shadow-sm rounded-2xl";

const CTRL =
  "h-10 box-border rounded-xl border border-gray-100 bg-white text-sm text-navy-800 shadow-sm transition-colors focus:outline-none focus:border-mint-300 focus:ring-2 focus:ring-mint-100";

function formatShortDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("zh-TW", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return "—";
  }
}

function parseJoinCode(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const join = s.match(/\/join\/([A-Za-z0-9-]+)/i);
  if (join) return join[1].replace(/\D/g, "") || join[1];
  const hash = s.match(/#\/live\/([^/?#]+)/);
  if (hash) return decodeURIComponent(hash[1]);
  const path = s.match(/\/live\/([^/?#]+)/);
  if (path) return decodeURIComponent(path[1]);
  return s.replace(/\s|-/g, "");
}

function StatusBadge({ status, isDark }) {
  if (status === "live") {
    return (
      <span
        className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
          isDark
            ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
            : "text-coral-500 bg-coral-50 border-coral-100"
        }`}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isDark ? "bg-emerald-400/70" : "bg-coral-400"
            }`}
          />
          <span
            className={`relative inline-flex rounded-full h-1.5 w-1.5 animate-pulse ${
              isDark ? "bg-emerald-400" : "bg-coral-500"
            }`}
          />
        </span>
        進行中
      </span>
    );
  }
  const map = {
    ready: {
      t: "已就緒",
      c: isDark
        ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20"
        : "text-mint-700 bg-mint-50 border-mint-100",
    },
    done: {
      t: "已完成",
      c: isDark
        ? "bg-slate-800/60 text-slate-400 border-slate-600/40"
        : "text-navy-500 bg-gray-50 border-gray-100",
    },
  };
  const s = map[status] || map.ready;
  return (
    <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${s.c}`}>
      {s.t}
    </span>
  );
}

function DeleteConfirmModal({ busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={busy ? undefined : onCancel}>
      <div className="absolute inset-0 bg-navy-900/30 backdrop-blur-sm" />
      <div
        className={`relative w-full max-w-md ${CARD} p-6 fade-in`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-meeting-title"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 h-10 w-10 rounded-xl bg-coral-50 text-coral-500 border border-coral-100 flex items-center justify-center">
            <Trash2 className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <h3 id="delete-meeting-title" className="text-base font-bold text-navy-800">
              刪除會議紀錄
            </h3>
            <p className="mt-1.5 text-sm text-navy-500 leading-relaxed">
              確定要刪除此會議紀錄嗎？此操作將永久移除所有筆記與待辦任務，且無法復原。
            </p>
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 font-medium py-2.5 rounded-xl text-navy-500 border border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 font-medium py-2.5 rounded-xl bg-coral-500 text-white hover:bg-coral-600 transition-colors disabled:opacity-60"
          >
            {busy ? "刪除中…" : "確認刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MeetingCard({ m, go, onDelete, me, isDark, onRequestJoin }) {
  const isOwner = !me || m.ownerId === me.id;
  const isLive = m.status === "live";
  const canShowMore = isOwner && !isLive;
  const openDone = (m.actions || []).filter((a) => !a.done).length;

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef(null);

  const primary =
    m.status === "done"
      ? { label: "查看整理", to: "post" }
      : isLive
      ? { label: "回到會議", to: "live" }
      : { label: "進入會議", to: "live" };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const requestDelete = () => {
    setMenuOpen(false);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(m.id);
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const btnCls = isLive
    ? isDark
      ? "bg-slate-800 text-slate-100 border border-slate-600 shadow-none hover:bg-slate-800 hover:border-cyan-500/50 hover:text-white"
      : "bg-coral-500 text-white hover:bg-coral-600 shadow-sm"
    : isDark
    ? "bg-slate-800 text-slate-200 border border-slate-600 hover:border-cyan-500/50 hover:text-white"
    : "border border-gray-100 bg-white text-navy-700 hover:border-navy-800/15";

  return (
    <>
      <article
        className={`group flex items-center gap-3 md:gap-4 p-3.5 md:p-4 transition-all duration-200 hover:shadow-md ${CARD} ${
          isLive ? (isDark ? "ring-1 ring-slate-600/50" : "ring-1 ring-coral-100") : ""
        }`}
      >
        <div
          className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-base border border-gray-100 ${
            isLive
              ? isDark
                ? "bg-slate-800 border-slate-600"
                : "bg-coral-50"
              : m.status === "done"
              ? isDark
                ? "bg-slate-800/60 border-slate-600/50"
                : "bg-gray-50"
              : isDark
              ? "bg-slate-800 border-slate-600/50"
              : "bg-mint-50"
          }`}
        >
          <CalendarDays
            className={`h-5 w-5 ${
              isLive
                ? isDark
                  ? "text-slate-300"
                  : "text-coral-500"
                : m.status === "done"
                ? isDark
                  ? "text-slate-400"
                  : "text-navy-400"
                : isDark
                ? "text-slate-300"
                : "text-mint-600"
            }`}
            strokeWidth={1.8}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className={`font-semibold truncate ${isDark ? "text-white" : "text-navy-800"}`}>
              {m.title}
            </p>
            <StatusBadge status={m.status} isDark={isDark} />
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap min-w-0">
            {m.scenarioLabel && (
              <span
                className={`text-[11px] font-medium border px-1.5 py-0.5 rounded-md ${
                  isDark
                    ? "text-slate-300 border-slate-600/50"
                    : "text-navy-500 border-gray-100"
                }`}
              >
                {m.scenarioLabel}
              </span>
            )}
            {!isOwner && (
              <span
                className={`text-[11px] font-medium border px-1.5 py-0.5 rounded-md ${
                  isDark
                    ? "text-sky-300 bg-sky-950/40 border-sky-500/25"
                    : "text-sky-600 border-sky-100 bg-sky-50"
                }`}
              >
                受邀協作
              </span>
            )}
            <span className={`text-xs truncate ${isDark ? "text-slate-400" : "text-navy-400"}`}>
              {m.durationMin} 分鐘 · 目標 {(m.goals || []).length} 項
              {m.status === "done" && openDone > 0 ? ` · ${openDone} 項待辦` : ""}
            </span>
          </div>
        </div>

        {canShowMore && (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="更多操作"
              onClick={() => setMenuOpen((v) => !v)}
              className={`transition-colors p-1.5 rounded-lg ${
                isDark
                  ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/80"
                  : "text-navy-300 hover:text-navy-600 hover:bg-gray-50"
              }`}
            >
              <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className={`absolute right-0 top-full mt-1.5 z-20 min-w-[168px] py-1 ${CARD}`}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={requestDelete}
                  className={`w-full flex items-center gap-2 text-left px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    isDark
                      ? "text-coral-300 hover:bg-coral-950/40"
                      : "text-coral-500 hover:bg-coral-50"
                  }`}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                  刪除會議紀錄
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (primary.to === "live") onRequestJoin?.(m);
            else go(primary.to, m.id);
          }}
          className={`shrink-0 inline-flex items-center gap-1.5 text-xs md:text-sm font-semibold px-3.5 py-2 rounded-xl transition-all active:scale-95 ${btnCls}`}
        >
          {primary.label}
          {isLive && <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.2} />}
        </button>
      </article>

      {confirmOpen && (
        <DeleteConfirmModal
          busy={deleting}
          onCancel={() => !deleting && setConfirmOpen(false)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}

function EmptyMeetings({ go, onJoined }) {
  return (
    <div className={`${CARD} px-6 py-12 text-center`}>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-gray-100 text-navy-300">
        <CalendarOff className="h-5 w-5" strokeWidth={1.6} />
      </div>
      <p className="mt-4 font-semibold text-navy-800">目前沒有進行中的會議</p>
      <p className="mt-1 text-sm text-navy-400">發起一場，或用上方代碼加入既有會議。</p>
      <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => go("create")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-100 bg-white px-4 py-2 text-sm font-medium text-navy-700 hover:border-mint-200 hover:text-mint-700 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          發起會議
        </button>
        {onJoined && (
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("join-meeting-code");
              el?.focus?.();
              el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-mint-100 bg-mint-50 px-4 py-2 text-sm font-medium text-mint-700 hover:bg-mint-100 transition-colors lg:hidden"
          >
            輸入代碼加入
          </button>
        )}
      </div>
    </div>
  );
}

function RecentRecap({ items, go }) {
  if (!items.length) {
    return (
      <section>
        <h2 className="text-sm font-semibold text-navy-500 tracking-wide">最近回顧</h2>
        <div className={`${CARD} mt-3 px-4 py-6 text-center`}>
          <p className="text-sm text-navy-400">結束會議後，摘要會出現在這裡。</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-navy-500 tracking-wide">最近回顧</h2>
      <div className={`${CARD} mt-3 divide-y divide-gray-100`}>
        {items.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-navy-800 truncate">{m.title}</p>
              <p className="text-[11px] text-navy-400 mt-0.5">
                {formatShortDate(m.endedAt || m.updatedAt || m.createdAt)}
                {m.scenarioLabel ? ` · ${m.scenarioLabel}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => go("post", m.id)}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-mint-700 border border-mint-100 bg-mint-50/60 px-2.5 py-1.5 rounded-lg hover:bg-mint-50 transition-colors"
            >
              <Sparkles className="h-3 w-3" strokeWidth={2} />
              AI 總結
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function todoKey(meetingId, id) {
  return `${meetingId}-${id}`;
}

/**
 * 桌機右側「今日待辦」：打勾兩階段漸隱（填滿淡化 → 300ms → 高度塌陷 → 再持久化）
 */
function TodayTodos({ items, completingKeys, collapsingKeys, onToggle, go }) {
  return (
    <aside className={`${CARD} w-full p-4 md:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-navy-800 leading-none">今日待辦任務</h2>
          <p className="text-[11px] text-navy-400 mt-1.5 leading-none">Action Items</p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => go("todo")}
            className="shrink-0 text-[11px] font-medium text-navy-400 hover:text-mint-600 transition-colors leading-none pt-0.5"
          >
            全部
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-sm text-navy-400 leading-relaxed">
          會議產出的待辦會彙整在此。此刻清單是空的，很好。
        </p>
      ) : (
        <ul className="mt-4">
          {items.map((a) => {
            const k = todoKey(a.meetingId, a.id);
            const completing = completingKeys.has(k);
            const collapsing = collapsingKeys.has(k);
            return (
              <li
                key={k}
                className={`overflow-hidden transition-all duration-300 ease-in-out ${
                  collapsing ? "max-h-0 opacity-0 py-0 my-0" : "max-h-24"
                }`}
              >
                <button
                  type="button"
                  disabled={completing || collapsing}
                  onClick={() => onToggle(a.meetingId, a.id)}
                  className={`w-full flex items-start gap-3 rounded-xl px-0 py-2.5 text-left hover:bg-gray-50/80 transition-colors group disabled:pointer-events-none ${
                    completing ? "opacity-40 transition-opacity duration-200" : "opacity-100 transition-opacity duration-200"
                  }`}
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded-md border flex items-center justify-center transition-colors duration-200 ${
                      completing
                        ? "bg-teal-500 border-teal-500 text-white shadow-[0_0_0_3px_rgba(20,184,166,0.12)]"
                        : "border-gray-200 bg-white group-hover:border-mint-300 group-hover:shadow-[0_0_0_3px_rgba(20,184,166,0.08)]"
                    }`}
                    style={{ width: 18, height: 18 }}
                  >
                    <Check
                      className={`h-3 w-3 transition-opacity duration-200 ${
                        completing ? "opacity-100" : "opacity-0"
                      }`}
                      strokeWidth={3}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm leading-snug transition-all duration-200 ${
                        completing ? "text-navy-400 line-through" : "text-navy-700"
                      }`}
                    >
                      {a.task || a.text || a.title || "未命名待辦"}
                    </span>
                    <span className="block text-[11px] text-navy-400 mt-0.5 truncate">
                      {a.meetingTitle}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/** 手機專用：最多 2 條，動畫邏輯與桌機側欄一致 */
function MobileMiniTodos({ items, completingKeys, collapsingKeys, onToggle, go }) {
  const preview = (items || []).slice(0, 2);

  return (
    <section className="lg:hidden mt-8">
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <h2 className="text-sm font-semibold text-navy-500 tracking-wide">今日待辦</h2>
        <button
          type="button"
          onClick={() => go("todo")}
          className="text-[11px] font-medium text-navy-400 hover:text-mint-600 transition-colors"
        >
          全部
        </button>
      </div>

      <div className={`${CARD} px-3.5 py-2`}>
        {preview.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-navy-400">暫無待辦 · 會議產出後會出現在此</p>
        ) : (
          <ul>
            {preview.map((a) => {
              const k = todoKey(a.meetingId, a.id);
              const completing = completingKeys.has(k);
              const collapsing = collapsingKeys.has(k);
              return (
                <li
                  key={k}
                  className={`overflow-hidden border-b border-gray-100 last:border-b-0 transition-all duration-300 ease-in-out ${
                    collapsing ? "max-h-0 opacity-0 py-0 my-0 border-transparent" : "max-h-16"
                  }`}
                >
                  <button
                    type="button"
                    disabled={completing || collapsing}
                    onClick={() => onToggle(a.meetingId, a.id)}
                    className={`w-full flex items-center gap-2.5 py-2.5 text-left disabled:pointer-events-none ${
                      completing
                        ? "opacity-40 transition-opacity duration-200"
                        : "opacity-100 transition-opacity duration-200"
                    }`}
                  >
                    <span
                      className={`shrink-0 rounded-md border flex items-center justify-center transition-colors duration-200 ${
                        completing
                          ? "bg-teal-500 border-teal-500 text-white"
                          : "border-gray-200 bg-white"
                      }`}
                      style={{ width: 16, height: 16 }}
                    >
                      <Check
                        className={`h-2.5 w-2.5 transition-opacity duration-200 ${
                          completing ? "opacity-100" : "opacity-0"
                        }`}
                        strokeWidth={3}
                      />
                    </span>
                    <span
                      className={`min-w-0 flex-1 text-[13px] leading-snug truncate transition-all duration-200 ${
                        completing ? "text-navy-400 line-through" : "text-navy-700"
                      }`}
                    >
                      {a.task || a.text || a.title || "未命名待辦"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 統一 h-10、中線對齊；寬度吃滿右側欄，與下方卡片右緣切齊 */
function JoinAndCreate({ go, onJoined }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e?.preventDefault?.();
    const ref = parseJoinCode(code);
    if (!ref) {
      setErr("請輸入會議代碼或邀請連結");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      // API 接受 UUID 或 6 碼 code，回傳完整會議（含真正 id）
      const meeting = await joinMeetingByLink(ref);
      const meetingId = meeting?.id;
      if (!meetingId) {
        setErr("加入成功但無法取得會議 ID，請重新整理後再試");
        return;
      }
      setCode("");
      onJoined?.(meetingId, meeting);
    } catch (ex) {
      setErr(ex?.message || "無法加入會議");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={submit} className="flex w-full items-center gap-2">
        <input
          id="join-meeting-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (err) setErr("");
          }}
          placeholder="輸入代碼加入…"
          className={`min-w-0 flex-1 ${CTRL} px-3 placeholder:text-navy-300`}
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className={`shrink-0 ${CTRL} px-3 font-medium text-navy-600 hover:border-navy-800/15 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {busy ? "…" : "加入"}
        </button>
        <button
          type="button"
          onClick={() => go("create")}
          className={`shrink-0 ${CTRL} px-3 inline-flex items-center justify-center gap-1 font-semibold text-navy-800 hover:border-navy-800/15 active:scale-[0.98]`}
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          <span className="hidden xl:inline">發起會議</span>
          <span className="xl:hidden">發起</span>
        </button>
      </form>
      {err ? <p className="mt-1.5 text-[11px] text-coral-500 leading-none">{err}</p> : null}
    </div>
  );
}

export default function Dashboard({ store, go, me, mode = "enterprise" }) {
  const { meetings, deleteMeeting, updateMeeting, refreshMeetings, loading, error, setMeetings } = store;
  const modeInfo = getMode(mode);
  const { resolved: themeResolved } = useTheme();
  const isDark = themeResolved === "dark";
  const [completingKeys, setCompletingKeys] = useState(() => new Set());
  const [collapsingKeys, setCollapsingKeys] = useState(() => new Set());

  useEffect(() => {
    refreshMeetings();
  }, [refreshMeetings]);

  const [kickToast, setKickToast] = useState(() => {
    try {
      return sessionStorage.getItem("meetflow.kickToast") || "";
    } catch {
      return "";
    }
  });
  const [preJoinTarget, setPreJoinTarget] = useState(null);

  useEffect(() => {
    if (!kickToast) return undefined;
    try {
      sessionStorage.removeItem("meetflow.kickToast");
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => setKickToast(""), 4500);
    return () => window.clearTimeout(t);
  }, [kickToast]);

  const requestJoinMeeting = (meetingOrId, meetingObj) => {
    const id = typeof meetingOrId === "object" ? meetingOrId?.id : meetingOrId;
    const meeting =
      typeof meetingOrId === "object"
        ? meetingOrId
        : meetingObj || meetings.find((row) => row.id === id) || { id, title: "會議" };
    if (!id) return;
    setPreJoinTarget(meeting);
  };

  const confirmGoPrepare = () => {
    if (!preJoinTarget?.id) return;
    const id = preJoinTarget.id;
    setPreJoinTarget(null);
    go("prejoin", id);
  };

  const upcoming = useMemo(
    () => meetings.filter((m) => m.status !== "done"),
    [meetings]
  );
  const recentDone = useMemo(() => {
    return meetings
      .filter((m) => m.status === "done")
      .slice()
      .sort(
        (a, b) =>
          (b.endedAt || b.updatedAt || b.createdAt || 0) -
          (a.endedAt || a.updatedAt || a.createdAt || 0)
      )
      .slice(0, 2);
  }, [meetings]);

  const todayTodos = useMemo(() => {
    const list = [];
    for (const m of meetings) {
      for (const a of m.actions || []) {
        if (a.done) continue;
        list.push({
          ...a,
          meetingId: m.id,
          meetingTitle: m.title,
        });
      }
    }
    return list.slice(0, 5);
  }, [meetings]);

  const liveCount = upcoming.filter((m) => m.status === "live").length;

  const persistToggleDone = (meetingId, aid) => {
    updateMeeting(meetingId, (m) => ({
      actions: (m.actions || []).map((a) => (a.id === aid ? { ...a, done: true } : a)),
    }));
  };

  /** 兩階段：立即填滿淡化 → 300ms 塌陷 → 動畫結束後才寫入 done */
  const toggleTodo = (meetingId, aid) => {
    const k = todoKey(meetingId, aid);
    if (completingKeys.has(k) || collapsingKeys.has(k)) return;

    setCompletingKeys((prev) => new Set(prev).add(k));
    window.setTimeout(() => {
      setCollapsingKeys((prev) => new Set(prev).add(k));
      window.setTimeout(() => {
        persistToggleDone(meetingId, aid);
        setCompletingKeys((prev) => {
          const n = new Set(prev);
          n.delete(k);
          return n;
        });
        setCollapsingKeys((prev) => {
          const n = new Set(prev);
          n.delete(k);
          return n;
        });
      }, 320);
    }, 300);
  };

  const handleJoined = async (meetingId, meeting) => {
    // 先把剛加入的會議併入本地列表，避免 refresh 前 active 找不到
    if (meeting?.id && typeof setMeetings === "function") {
      setMeetings((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((m) => m.id === meeting.id)) {
          return list.map((m) => (m.id === meeting.id ? { ...m, ...meeting } : m));
        }
        return [meeting, ...list];
      });
    }
    try {
      await refreshMeetings();
    } catch {
      /* 本地已有 meeting，仍可進房 */
    }
    requestJoinMeeting(meeting || { id: meetingId, title: meeting?.title || "會議" });
  };

  return (
    <div className="fade-in max-w-6xl mx-auto px-5 md:px-8 pt-4 md:pt-8 pb-6">
      {kickToast ? (
        <div className="mb-4 rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3 text-sm font-semibold text-coral-600 shadow-sm">
          {kickToast}
        </div>
      ) : null}
      {error && (
        <p className={`mb-4 text-sm text-coral-500 ${CARD} px-4 py-3`}>
          無法連線後端：{error}
          <br />
          <span className="text-navy-500">連線位址：{API_BASE}</span>
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
          <div className="lg:col-span-2 space-y-3">
            <div className="h-10 w-48 rounded-xl bg-gray-100 animate-pulse" />
            <div className={`h-[120px] ${CARD} animate-pulse bg-gray-50`} />
          </div>
          <div className="hidden lg:block space-y-4">
            <div className="h-10 w-full rounded-xl bg-gray-100 animate-pulse" />
            <div className={`h-48 ${CARD} animate-pulse bg-gray-50`} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8 items-start">
          {/* 左欄／手機主體：只留標題 + 會議卡片 */}
          <div className="lg:col-span-2 min-w-0 space-y-5 md:space-y-6">
            <header className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap min-h-10">
                <h1 className="text-[1.5rem] md:text-[1.65rem] font-black tracking-tight text-navy-800 leading-none">
                  你的會議
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-500 border border-gray-100 bg-white px-2 py-0.5 rounded-full">
                  {modeInfo.label}
                </span>
              </div>
              <p className="mt-2 text-sm text-navy-400">
                {liveCount > 0
                  ? `有 ${liveCount} 場進行中 · 左右滑動切換`
                  : upcoming.length > 0
                  ? `${upcoming.length} 場待進行`
                  : "專注當下 · 輸入代碼加入，或點底部「發起」"}
              </p>
            </header>

            {/* 手機：輸入代碼加入會議（桌機版在右欄） */}
            <div className="lg:hidden">
              <JoinAndCreate go={go} onJoined={handleJoined} />
            </div>

            <section>
              <div className="flex items-center justify-between mb-3 px-0.5">
                <h2 className="text-sm font-semibold text-navy-500 tracking-wide">核心動態</h2>
                <span className="text-[11px] font-medium text-navy-400 tabular-nums">
                  {upcoming.length} 場
                </span>
              </div>

              {upcoming.length === 0 ? (
                <EmptyMeetings go={go} onJoined={handleJoined} />
              ) : (
                <>
                  {/* 手機：橫向卡片滑動流 */}
                  <div className="lg:hidden -mx-5 px-5 flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
                    {upcoming.map((m) => (
                      <div
                        key={m.id}
                        className="min-w-[85%] max-w-[85%] shrink-0 snap-start"
                      >
                        <MeetingCard
                          m={m}
                          go={go}
                          onDelete={deleteMeeting}
                          me={me}
                          isDark={isDark}
                          onRequestJoin={requestJoinMeeting}
                        />
                      </div>
                    ))}
                  </div>

                  {/* 電腦：縱向列表 */}
                  <div className="hidden lg:block space-y-2.5">
                    {upcoming.map((m) => (
                      <MeetingCard
                        key={m.id}
                        m={m}
                        go={go}
                        onDelete={deleteMeeting}
                        me={me}
                        isDark={isDark}
                        onRequestJoin={requestJoinMeeting}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* 手機：精簡 2 條待辦，填補下半部空洞 */}
            <MobileMiniTodos
              items={todayTodos}
              completingKeys={completingKeys}
              collapsingKeys={collapsingKeys}
              onToggle={toggleTodo}
              go={go}
            />

            {/* 手機隱藏最近回顧 */}
            <div className="hidden lg:block">
              <RecentRecap items={recentDone} go={go} />
            </div>
          </div>

          {/* 右欄：僅桌機顯示（加入列 + 今日待辦） */}
          <aside className="hidden lg:block lg:col-span-1 w-full min-w-0">
            <div className="flex w-full flex-col gap-4 lg:sticky lg:top-24">
              <JoinAndCreate go={go} onJoined={handleJoined} />
              <TodayTodos
                items={todayTodos}
                completingKeys={completingKeys}
                collapsingKeys={collapsingKeys}
                onToggle={toggleTodo}
                go={go}
              />
            </div>
          </aside>
        </div>
      )}

      <PreJoinConfirmModal
        open={Boolean(preJoinTarget)}
        meetingTitle={preJoinTarget?.title || "會議"}
        onCancel={() => setPreJoinTarget(null)}
        onConfirm={confirmGoPrepare}
      />
    </div>
  );
}
