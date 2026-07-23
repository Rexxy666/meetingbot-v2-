import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Avatar from "../components/Avatar.jsx";
import { attachCitations, buildTranscriptRows } from "../lib/transcriptCite.js";
import ActionItemsTable from "../components/ActionItemsTable.jsx";
import PainPointsList from "../components/PainPointsList.jsx";
import MeetingAnalytics from "../components/MeetingAnalytics.jsx";
import { SummaryTabs } from "./PrivateSummaryTab.jsx";
import { loadCornell } from "../components/MeetingNotesContainer.jsx";
import { extractReview } from "../lib/extract.js";
import {
  formatTranscriptForAi,
  getCachedSummary,
  setCachedSummary,
} from "../lib/meetingsCache.js";
import { flattenNotesDoc } from "../lib/notesDocument.js";
import {
  normalizeAssignees,
  withAssigneesFields,
} from "../lib/assignees.js";
import * as api from "../lib/api.js";

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `a-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** 解析會議創辦人顯示名稱（不可從認領名單漏掉 Host） */
function resolveHostName(meeting, me) {
  if (me?.id && meeting?.ownerId && me.id === meeting.ownerId && me.name) {
    return String(me.name).trim();
  }
  if (meeting?.ownerName) return String(meeting.ownerName).trim();
  if (meeting?.hostName) return String(meeting.hostName).trim();
  const fromAttendees = (meeting?.attendees || []).find(
    (a) => a && typeof a === "object" && a.id && a.id === meeting.ownerId
  );
  if (fromAttendees?.name) return String(fromAttendees.name).trim();
  return "";
}

/** AI 只提議 text；合併舊認領／完成狀態，避免重新分析洗掉 assignees */
function toStoreShape(payload, prevActions = []) {
  const prevByTask = new Map(
    (prevActions || []).map((a) => [String(a.task || a.text || "").trim(), a])
  );
  const actions = (payload.actionItems || []).map((it) => {
    const text = String(it.text || "").trim();
    const prev = prevByTask.get(text);
    const assignees = normalizeAssignees(prev);
    return {
      id: prev?.id || uid(),
      task: text,
      ...withAssigneesFields(assignees),
      when: prev?.when || "",
      done: Boolean(prev?.done),
    };
  });
  return {
    review: {
      ideas: payload.ideas || [],
      decisions: payload.decisions || [],
      risks: payload.risks || [],
      actions,
    },
    actions,
  };
}

/** 🔗 引證膠囊：點擊跳轉至逐字稿對應句 */
function CitationBadge({ citation, onJump }) {
  if (!citation) return null;
  const label = citation.time ? `引自 ${citation.time}` : "查看出處";
  return (
    <button
      type="button"
      onClick={() => onJump?.(citation.anchorId)}
      title={`跳至逐字稿${citation.time ? ` ${citation.time}` : ""}（${citation.speaker}）`}
      className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors
        text-cyan-700 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100
        dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/30 dark:hover:bg-cyan-500/20"
    >
      <Link2 className="h-3 w-3" strokeWidth={2.4} />
      {label}
    </button>
  );
}

/**
 * 完整逐字稿抽屜（右側滑出）。
 * 每列帶 id={row.anchorId} 供 scrollIntoView 精準定位；
 * highlightAnchor 命中的列觸發 2 秒青色微光高亮。
 */
function TranscriptDrawer({ open, rows, onClose, highlightAnchor }) {
  return (
    <div
      className={`fixed inset-0 z-[80] ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* 遮罩 */}
      <div
        className={`absolute inset-0 bg-navy-900/35 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      {/* 抽屜本體 */}
      <aside
        role="dialog"
        aria-label="完整會議逐字稿"
        className={`absolute right-0 top-0 h-full w-full sm:w-[30rem] max-w-full flex flex-col
          bg-white dark:bg-[#111c35] border-l border-gray-100 dark:border-slate-800 shadow-2xl
          transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquareText className="h-4 w-4 text-cyan-600 dark:text-cyan-300" strokeWidth={2} />
            <h3 className="text-sm font-bold text-navy-800 dark:text-slate-100">完整會議逐字稿</h3>
            <span className="text-[11px] font-semibold text-navy-400 dark:text-slate-400">
              {rows.length} 句
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉逐字稿"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-navy-400 hover:text-navy-700 hover:bg-gray-50 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2.5">
          {rows.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-navy-400 dark:text-slate-400">
              本場沒有語音逐字稿紀錄。
            </p>
          ) : (
            rows.map((row) => {
              const hit = highlightAnchor === row.anchorId;
              return (
                <div
                  key={row.anchorId}
                  id={row.anchorId}
                  data-timestamp={row.time}
                  className={`scroll-mt-4 rounded-xl border px-3.5 py-3 transition-all duration-500 ${
                    hit
                      ? "bg-cyan-500/20 ring-2 ring-cyan-400 border-cyan-300 dark:border-cyan-500/40"
                      : "bg-gray-50/60 border-gray-100 dark:bg-slate-800/40 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {row.time && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
                        <Clock className="h-3 w-3" strokeWidth={2.2} />
                        {row.time}
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-navy-600 dark:text-slate-200">{row.speaker}</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-navy-700 dark:text-slate-200 whitespace-pre-wrap break-words">
                    {row.text}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

const AVATAR_BG = [
  "bg-mint-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-teal-500",
];

/** 依名字 hash 穩定挑一個頭像底色（同一人每次同色） */
function pickAvatarColor(name) {
  const s = String(name || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
}

/**
 * 規則式「基礎會議紀錄」——0 Token，純 JS 樣板字串／陣列運算。
 * 只讀既有會議資料（主題、時長、與會名單、待辦完成狀態、筆記）。
 * 待辦透過 Array.filter 區分「完成檢核」與「待處理」。
 * 【嚴禁】任何需要 AI 語意分析的欄位（痛點解決率、決議優先級…）。
 */
function generateBaseSummary({
  meeting,
  allPeople,
  durationMin,
  actions,
  sourceLabel,
  notesText,
  hasTranscript = false,
  hostName,
}) {
  const list = Array.isArray(actions) ? actions : [];
  const doneItems = list.filter((a) => a.done);
  const pendingItems = list.filter((a) => !a.done);
  // 只保留原始換行的手寫筆記；不壓平成單行，維持可讀性
  const note = String(notesText || "").trim();
  const notePreview = note ? (note.length > 400 ? `${note.slice(0, 400)}…` : note) : "";

  return {
    title: meeting.title || "未命名會議",
    durationMin,
    people: allPeople,
    peopleCount: allPeople.length,
    hostName: hostName || meeting.ownerName || "",
    sourceLabel,
    total: list.length,
    doneItems,
    pendingItems,
    notePreview,
    hasNotes: Boolean(note),
    hasTranscript,
  };
}

/** ✨ AI 引導橫幅（漸層微光外框）：Pre-AI 唯一的行動呼籲 */
function AiCtaBanner({ onGenerate, isLoading }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 shadow-[0_8px_30px_rgba(59,130,246,0.18)]">
      <div className="relative rounded-[15px] bg-white dark:bg-[#111c35] px-5 py-5 md:px-6 md:py-6">
        {/* 角落微光 */}
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-blue-400/10 blur-2xl" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 text-white shadow-sm">
                <Sparkles className="h-4 w-4" strokeWidth={2.4} />
              </span>
              <h3 className="text-base font-black text-navy-800 dark:text-slate-100">
                本會議尚未進行 AI 語意分析
              </h3>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-navy-500 dark:text-slate-300">
              以上為前端可百分之百確定的客觀紀錄。生成後將解鎖核心結論、痛點解決率、決議優先級與待辦認領率等量化簡報。
            </p>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-md transition-opacity bg-gradient-to-r from-cyan-600 to-violet-600 hover:opacity-90 disabled:opacity-70 disabled:cursor-wait"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                AI 分析與圖表繪製中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" strokeWidth={2.4} />
                立即生成 AI 深度簡報
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 基礎會議紀錄（Pre-AI Standard Mode，0 Token）。
 * 只顯示前端能「百分之百確定」的客觀資料：
 *   區塊 1：基本資訊 + 與會名單（頭像）
 *   區塊 2：待辦清單（Checkbox 原始狀態，不做 AI 分級）
 * 商務語境：「會議紀錄」「完成檢核」「待處理」。
 */
function BaseSummaryCard({ base, onGenerate, isLoading, onOpenTranscript }) {
  const Row = ({ label, value }) => (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[11px] font-semibold text-navy-400 dark:text-slate-400 w-16">
        {label}
      </span>
      <span className="text-sm font-semibold text-navy-800 dark:text-slate-100">{value}</span>
    </div>
  );

  const cardCls =
    "rounded-2xl border border-gray-100 bg-white shadow-sm p-5 md:p-6 dark:bg-[#111c35] dark:border-slate-800";

  return (
    <div className="space-y-5">
      {/* 核心引導區：漸層微光 CTA */}
      <AiCtaBanner onGenerate={onGenerate} isLoading={isLoading} />

      {/* 區塊 1：基本資訊與與會名單 */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-navy-500 dark:text-slate-300" strokeWidth={2} />
          <h3 className="text-sm font-bold text-navy-800 dark:text-slate-100">基本資訊與與會名單</h3>
          <span className="text-[10px] font-semibold text-navy-400 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-700 px-2 py-0.5 rounded-full">
            客觀紀錄 · 0 Token
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          <Row label="主題" value={base.title} />
          <Row label="歷時" value={`約 ${base.durationMin} 分鐘`} />
          <Row label="與會" value={`${base.peopleCount} 人`} />
          <Row label="資料來源" value={base.sourceLabel} />
        </div>

        {base.people.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Users className="h-3.5 w-3.5 text-navy-400 dark:text-slate-400" strokeWidth={2} />
              <span className="text-[11px] font-bold text-navy-500 dark:text-slate-300">與會者</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {base.people.map((name, i) => {
                const isHost = base.hostName && name === base.hostName;
                return (
                  <span
                    key={`${name}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50/70 pl-1 pr-2.5 py-1 dark:bg-slate-800/60 dark:border-slate-700"
                  >
                    <Avatar name={name} color={pickAvatarColor(name)} size="h-6 w-6" ring={false} />
                    <span className="text-[12px] font-semibold text-navy-700 dark:text-slate-200">{name}</span>
                    {isHost && (
                      <span className="text-[9px] font-bold text-mint-700 dark:text-emerald-400">Host</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 區塊 1.5：會議手寫筆記（只含手動打字內容，嚴禁混入語音逐字稿） */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-navy-500 dark:text-slate-300" strokeWidth={2} />
          <h3 className="text-sm font-bold text-navy-800 dark:text-slate-100">會議手寫筆記</h3>
        </div>
        {base.hasNotes ? (
          <blockquote className="border-l-2 border-gray-200 dark:border-slate-700 pl-3.5 py-0.5 text-[13px] leading-relaxed text-navy-700 dark:text-slate-200 whitespace-pre-wrap">
            {base.notePreview}
          </blockquote>
        ) : (
          <div>
            <p className="text-[13px] text-navy-400 dark:text-slate-400">尚無手動紀錄之筆記</p>
            {base.hasTranscript && typeof onOpenTranscript === "function" && (
              <button
                type="button"
                onClick={onOpenTranscript}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-bold text-cyan-700 dark:text-cyan-300 hover:underline"
              >
                <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2.2} />
                本場有語音逐字稿，開啟完整逐字稿檢視
              </button>
            )}
          </div>
        )}
      </div>

      {/* 區塊 2：原生待辦事項（原始 Checkbox，不做 AI 分級） */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-navy-500 dark:text-slate-300" strokeWidth={2} />
            <h3 className="text-sm font-bold text-navy-800 dark:text-slate-100">原生待辦事項</h3>
          </div>
          <span className="text-[11px] font-semibold text-navy-400 dark:text-slate-400 tabular-nums">
            {base.doneItems.length}/{base.total} 已完成
          </span>
        </div>

        {base.total === 0 ? (
          <p className="text-[13px] text-navy-400 dark:text-slate-400">尚無手動建立之待辦事項。</p>
        ) : (
          <div className="space-y-3">
            {base.doneItems.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-mint-700 dark:text-emerald-400 mb-1.5">已完成</p>
                <ul className="space-y-1.5">
                  {base.doneItems.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-[13px] text-navy-500 dark:text-slate-300">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-mint-500 dark:text-emerald-400" strokeWidth={2.4} />
                      <span className="line-through decoration-navy-300">{a.task || a.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {base.pendingItems.length > 0 && (
              <div>
                <p className="text-[11px] font-bold text-navy-500 dark:text-slate-300 mb-1.5">待處理</p>
                <ul className="space-y-1.5">
                  {base.pendingItems.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-[13px] text-navy-700 dark:text-slate-200">
                      <Circle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-navy-300 dark:text-slate-500" strokeWidth={2} />
                      <span>{a.task || a.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonBlock({ lines = 3 }) {
  return (
    <div className="mt-3 space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded-xl bg-gray-200/50"
          style={{ width: `${88 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

function AICard({ tone, icon, title, items, empty, loading }) {
  const map = {
    blue: "bg-sky-50 border-sky-100",
    green: "bg-mint-50 border-mint-100",
    coral: "bg-coral-50 border-coral-100",
  };
  const dot = { blue: "bg-sky-400", green: "bg-mint-500", coral: "bg-coral-400" }[tone];
  return (
    <div className={`border rounded-3xl p-5 ${map[tone]}`}>
      <p className="font-black text-navy-800 flex items-center gap-2">
        {title}
      </p>
      {loading ? (
        <SkeletonBlock lines={3} />
      ) : items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-navy-600">
              <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
              {it}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-navy-300">{empty}</p>
      )}
    </div>
  );
}

/* 附錄：Notion 風格可摺疊原始紀錄（預設收合，保持頁面乾淨） */
function CollapsibleNotes({ label, sourceLabel, transcriptText, topicEntries = [], notes, people = [] }) {
  const [open, setOpen] = useState(false);
  const hasContent = Boolean(
    String(transcriptText || "").trim() || topicEntries.length || String(notes || "").trim()
  );

  return (
    <div className="bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-navy-800/[0.02] transition-colors"
      >
        <FileText className="h-4 w-4 shrink-0 text-navy-400" strokeWidth={2} />
        <span className="text-sm font-bold text-navy-700">{label}</span>
        <span className="hidden sm:inline text-[10px] font-bold text-mint-700 bg-mint-50 border border-mint-100 px-2 py-0.5 rounded-full">
          AI 來源：{sourceLabel}
        </span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-navy-400">{open ? "收合" : "展開"}</span>
          <ChevronDown
            className={`h-4 w-4 text-navy-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            strokeWidth={2.4}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-navy-800/6">
          {String(transcriptText || "").trim() ? (
            <pre className="px-5 py-4 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans max-h-[28rem] overflow-y-auto">
              {transcriptText}
            </pre>
          ) : topicEntries.length ? (
            <div className="px-5 py-4 space-y-4 max-h-[28rem] overflow-y-auto">
              {topicEntries.map(([t, text]) => (
                <div key={t}>
                  <p className="text-xs font-bold text-mint-700 bg-mint-50 inline-block px-2 py-0.5 rounded-md">{t}</p>
                  <pre className="mt-1.5 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans">
                    {text}
                  </pre>
                </div>
              ))}
            </div>
          ) : String(notes || "").trim() ? (
            <pre className="px-5 py-4 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans">
              {notes}
            </pre>
          ) : (
            <p className="px-5 py-8 text-sm text-navy-300 text-center">這場會議沒有留下筆記。</p>
          )}

          {people.length > 0 && (
            <div className="px-5 py-3 border-t border-navy-800/6 text-xs text-navy-300">
              認領名單（含 Host）：{people.join("、")}
            </div>
          )}
        </div>
      )}

      {!open && !hasContent && (
        <p className="px-5 pb-4 -mt-2 text-[11px] text-navy-300">這場會議沒有留下筆記。</p>
      )}
    </div>
  );
}

/**
 * 會後 AI 整理：進頁自動呼叫後端 Gemini；待辦支援完整 CRUD 與 RBAC 認領。
 */
export default function MeetingSummary({
  meeting,
  store,
  go,
  mode = "enterprise",
  me = null,
}) {
  // 雙軌制：預設不呼叫 AI（0 Token），改由使用者手動觸發深度摘要。
  // ⚠ 解鎖 AI 看板只認「明確旗標」meeting.aiSummaryGenerated，
  //   不再用 hasAiSummary(review) 推斷——避免舊版自動跑 AI 留下的 review
  //   讓使用者「還沒點就看到圖表」。
  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [aiGenerated, setAiGenerated] = useState(() => Boolean(meeting.aiSummaryGenerated));

  // 他人已在此會議生成過 AI 摘要（透過 socket 同步旗標進來）→ 本端也解鎖
  useEffect(() => {
    if (meeting.aiSummaryGenerated) setAiGenerated(true);
  }, [meeting.aiSummaryGenerated]);

  // ── 逐字稿引證導流 ─────────────────────────────────────────────────────
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [highlightAnchor, setHighlightAnchor] = useState(null);
  const pendingAnchorRef = useRef(null);
  const highlightTimerRef = useRef(null);

  const transcriptRows = useMemo(() => buildTranscriptRows(meeting), [meeting]);

  /** 平滑捲動至逐字稿某句並觸發 2 秒微光高亮 */
  const scrollToTranscript = useCallback((anchorId) => {
    const el = document.getElementById(anchorId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightAnchor(anchorId);
    clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightAnchor(null), 2000);
  }, []);

  /** 點引證膠囊：開抽屜（若未開）→ 等 DOM 掛載後捲動高亮 */
  const jumpToCitation = useCallback(
    (anchorId) => {
      if (!anchorId) return;
      if (isTranscriptOpen) {
        scrollToTranscript(anchorId);
      } else {
        pendingAnchorRef.current = anchorId;
        setIsTranscriptOpen(true);
      }
    },
    [isTranscriptOpen, scrollToTranscript]
  );

  // 抽屜開啟後，處理待跳轉的錨點
  useEffect(() => {
    if (!isTranscriptOpen || !pendingAnchorRef.current) return;
    const anchor = pendingAnchorRef.current;
    pendingAnchorRef.current = null;
    const t = setTimeout(() => scrollToTranscript(anchor), 320);
    return () => clearTimeout(t);
  }, [isTranscriptOpen, scrollToTranscript]);

  useEffect(() => () => clearTimeout(highlightTimerRef.current), []);

  /** 與 LiveRoom / 建立會議的「上下級編輯限制」打通（存在 meeting.rbac） */
  const [isEditRestricted, setIsEditRestricted] = useState(() =>
    Boolean(meeting?.rbac?.isEditRestricted ?? meeting?.isEditRestricted)
  );

  useEffect(() => {
    setIsEditRestricted(
      Boolean(meeting?.rbac?.isEditRestricted ?? meeting?.isEditRestricted)
    );
  }, [meeting?.id, meeting?.rbac?.isEditRestricted, meeting?.isEditRestricted]);

  /** 真實身分：會議創辦人 = host，其餘 = attendee */
  const currentRole = useMemo(() => {
    if (me?.id && meeting?.ownerId && me.id === meeting.ownerId) return "host";
    return "attendee";
  }, [me?.id, meeting?.ownerId]);

  const myName = useMemo(() => String(me?.name || "").trim(), [me?.name]);
  const hostName = useMemo(() => resolveHostName(meeting, me), [meeting, me]);

  const review = meeting.review || { ideas: [], decisions: [], risks: [], actions: [] };
  const actions =
    meeting.actions && meeting.actions.length ? meeting.actions : review.actions || [];

  const topicEntries = useMemo(
    () =>
      Object.entries(meeting.topicNotes || {})
        .map(([t, raw]) => [t, flattenNotesDoc(raw || "")])
        .filter(([, v]) => (v || "").trim()),
    [meeting.topicNotes]
  );

  /**
   * 送 AI 分析的資料源：優先完整語音逐字稿，無 STT 才退回手寫筆記。
   * ⚠ 這是「給 AI 吃的」，故可含逐字稿；但【絕不可】拿來當基礎紀錄的「手寫筆記」欄。
   */
  const notesForAi = useMemo(() => {
    const fromSaved =
      String(meeting.transcriptText || "").trim() ||
      formatTranscriptForAi(meeting.transcript || []);
    if (fromSaved) return fromSaved;
    if (topicEntries.length) {
      return topicEntries.map(([t, text]) => `【${t}】\n${text}`).join("\n\n");
    }
    return meeting.notes || "";
  }, [meeting.notes, meeting.transcript, meeting.transcriptText, topicEntries]);

  /**
   * 「手寫筆記」專用文字：只含使用者手動打字的內容（議題共編筆記 + 舊版 meeting.notes），
   * 【嚴禁】混入語音逐字稿（transcript）。無手動輸入時回傳空字串，讓 UI 顯示空狀態。
   */
  const manualNotesText = useMemo(() => {
    const fromTopics = topicEntries
      .map(([t, text]) => `【${t}】\n${text}`)
      .join("\n\n")
      .trim();
    const legacy = String(meeting.notes || "").trim();
    return [fromTopics, legacy].filter(Boolean).join("\n\n");
  }, [topicEntries, meeting.notes]);

  const aiSourceLabel = useMemo(() => {
    if (
      String(meeting.transcriptText || "").trim() ||
      (Array.isArray(meeting.transcript) && meeting.transcript.length)
    ) {
      return "語音逐字稿";
    }
    return "手寫筆記";
  }, [meeting.transcript, meeting.transcriptText]);

  /** 完整候選人：Host + participants + attendees（去重，Host 置頂） */
  const allPeople = useMemo(() => {
    const names = [];
    const push = (n) => {
      const s = String(n || "").trim();
      if (s && !names.includes(s)) names.push(s);
    };
    push(hostName);
    push(myName);
    (meeting.participants || []).forEach(push);
    (meeting.attendees || []).forEach((a) => push(typeof a === "string" ? a : a?.name));
    return names;
  }, [hostName, myName, meeting.participants, meeting.attendees]);

  /**
   * 情境 A：全員共編 → 選單可見全員，但只能點自己（其他人 disabled）
   * 情境 B + Host：可指派任何人
   * 情境 B + 非 Host：整顆鎖定（selectable 空）
   */
  const selectablePeople = useMemo(() => {
    if (isEditRestricted) {
      if (currentRole === "host") return allPeople;
      return [];
    }
    if (!myName) return [];
    return allPeople.includes(myName) ? [myName] : [myName];
  }, [isEditRestricted, currentRole, allPeople, myName]);

  const selectLocked = useMemo(() => {
    if (isEditRestricted && currentRole !== "host") return true;
    return false;
  }, [isEditRestricted, currentRole]);

  const selectHint = useMemo(() => {
    if (isEditRestricted && currentRole !== "host") {
      return "嚴格管理中：僅上級可指派負責人";
    }
    if (!isEditRestricted) {
      return "共編模式：只能認領給自己，不可幫別人選";
    }
    return "上級可指派給任一與會者";
  }, [isEditRestricted, currentRole]);

  const durationMin =
    meeting.endedAt && meeting.startedAt
      ? Math.max(1, Math.round((meeting.endedAt - meeting.startedAt) / 60000))
      : meeting.durationMin;

  const persistRbac = async (nextRestricted) => {
    setIsEditRestricted(nextRestricted);
    await store.updateMeeting(meeting.id, {
        rbac: {
        ...(meeting.rbac || {}),
        isEditRestricted: nextRestricted,
        isHostAssignmentEnabled: meeting.rbac?.isHostAssignmentEnabled ?? true,
      },
      isEditRestricted: nextRestricted,
      ownerName: hostName || meeting.ownerName || myName || undefined,
    });
  };

  const generateSummary = useCallback(async () => {
    setIsLoading(true);
    setStatusMsg("正在將整場會議的語音逐字稿交由 Gemini 進行深度結構化分析…");
    try {
      // 進頁時補寫 Host 名稱，避免之後其他裝置漏掉創辦人
      if (hostName && hostName !== meeting.ownerName) {
        await store.updateMeeting(meeting.id, { ownerName: hostName });
      }

      const cached = getCachedSummary(meeting.id, notesForAi);
      if (cached?.review && cached?.actions) {
        await store.updateMeeting(meeting.id, {
          review: cached.review,
          actions: cached.actions,
          aiSummaryGenerated: true,
        });
        setStatusMsg(cached.message || `已使用快取（來源：${aiSourceLabel}）`);
        setAiGenerated(true);
        return;
      }

      const prevActions = meeting.actions || [];
      const result = await api.summarizeNotes({
        notes: notesForAi,
        participants: allPeople,
        title: meeting.title || "",
        mode,
      });
      const shaped = toStoreShape(result, prevActions);
      setCachedSummary(meeting.id, notesForAi, {
        review: shaped.review,
        actions: shaped.actions,
        message: result.message || "分析完成",
      });
      await store.updateMeeting(meeting.id, {
        review: shaped.review,
        actions: shaped.actions,
        aiSummaryGenerated: true,
      });
      setStatusMsg(result.message || `分析完成（來源：${aiSourceLabel}）`);
      setAiGenerated(true);
    } catch (err) {
      console.error("[MeetingSummary]", err);
      try {
        const fallback = extractReview(notesForAi, allPeople);
        const actions = (fallback.actions || []).map((a) => ({
          ...a,
          ...withAssigneesFields([]),
        }));
        setCachedSummary(meeting.id, notesForAi, {
          review: fallback,
          actions,
          message: "離線備援摘要",
        });
        await store.updateMeeting(meeting.id, {
          review: fallback,
          actions,
          aiSummaryGenerated: true,
        });
        setAiGenerated(true);
      } catch {
        /* ignore */
      }
      setStatusMsg(err?.message || "整理失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  }, [
    aiSourceLabel,
    allPeople,
    hostName,
    meeting.actions,
    meeting.id,
    meeting.ownerName,
    meeting.title,
    mode,
    notesForAi,
    store,
  ]);

  // 雙軌制：不再進頁自動呼叫 AI。基礎紀錄由 generateBaseSummary 即時算出（0 Token），
  // AI 深度摘要改由 handleGenerateAi 手動觸發。
  const baseSummary = useMemo(
    () =>
      generateBaseSummary({
        meeting,
        allPeople,
        durationMin,
        actions,
        sourceLabel: aiSourceLabel,
        notesText: manualNotesText,
        hasTranscript: transcriptRows.length > 0,
        hostName,
      }),
    [meeting, allPeople, durationMin, actions, aiSourceLabel, manualNotesText, transcriptRows.length, hostName]
  );

  const handleGenerateAi = useCallback(() => {
    if (isLoading) return;
    generateSummary();
  }, [isLoading, generateSummary]);

  /** 核心結論／決議 → 逐字稿引證（前端 bigram 對應，源自真實逐字稿） */
  const decisionCitations = useMemo(
    () => attachCitations(review.decisions || [], transcriptRows),
    [review.decisions, transcriptRows]
  );

  const patchActions = async (updater) => {
    await store.updateMeeting(meeting.id, (m) => {
      const prev = Array.isArray(m.actions) ? m.actions : [];
      const next = updater(prev);
      return {
        actions: next,
        review: {
          ...(m.review || {}),
          actions: next,
        },
      };
    });
  };

  const toggleDone = async (aid) => {
    await patchActions((list) =>
      list.map((a) => (a.id === aid ? { ...a, done: !a.done } : a))
    );
  };

  const claimAction = async (aid, assignees) => {
    if (isEditRestricted && currentRole !== "host") return;
    const next = normalizeAssignees(assignees);
    if (!isEditRestricted) {
      const prev = normalizeAssignees(actions.find((a) => a.id === aid));
      const added = next.filter((n) => !prev.includes(n));
      const removed = prev.filter((n) => !next.includes(n));
      if (added.some((n) => n !== myName) || removed.some((n) => n !== myName)) return;
    }
    await patchActions((list) =>
      list.map((a) => (a.id === aid ? { ...a, ...withAssigneesFields(next) } : a))
    );
  };

  const updateTask = async (aid, task) => {
    if (isEditRestricted && currentRole !== "host") return;
    const text = String(task || "").trim();
    if (!text) return;
    await patchActions((list) =>
      list.map((a) => (a.id === aid ? { ...a, task: text } : a))
    );
  };

  const addAction = async ({ task, assignees }) => {
    if (isEditRestricted && currentRole !== "host") return;
    const text = String(task || "").trim();
    if (!text) return;
    const item = {
      id: uid(),
      task: text,
      ...withAssigneesFields(assignees),
      when: "",
      done: false,
    };
    await patchActions((list) => [...list, item]);
  };

  const deleteAction = async (aid) => {
    if (isEditRestricted && currentRole !== "host") return;
    await patchActions((list) => list.filter((a) => a.id !== aid));
  };

  const canMutateTasks = !(isEditRestricted && currentRole !== "host");

  /* ── 個人私密康乃爾筆記 + AI 個人化洞察 ──────────────────────────────────
     ⚠ 隱私：cornell 只從本機 localStorage 讀取，insights 只存在本元件 state。
       兩者【絕不】寫回 meeting，也不經 socket 廣播——meeting 會同步給所有成員。 */
  const cornellUserKey = me?.id || me?.name;
  const myCornell = useMemo(
    () => loadCornell(cornellUserKey, meeting.id),
    [cornellUserKey, meeting.id]
  );
  const [privateState, setPrivateState] = useState({
    loading: false,
    loaded: false,
    privateActions: [],
    insights: [],
    message: "",
  });

  const runPrivateInsights = useCallback(async () => {
    setPrivateState((s) => ({ ...s, loading: true, loaded: true, message: "" }));
    try {
      const r = await api.fetchPrivateInsights(meeting.id, { cornell: myCornell, mode });
      setPrivateState({
        loading: false,
        loaded: true,
        privateActions: r.privateActions || [],
        insights: r.insights || [],
        message: r.message || "",
      });
    } catch (e) {
      setPrivateState({
        loading: false,
        loaded: true,
        privateActions: [],
        insights: [],
        message: `個人化分析失敗：${e?.message || "請稍後再試"}`,
      });
    }
  }, [meeting.id, myCornell, mode]);

  const togglePrivateAction = useCallback((id) => {
    setPrivateState((s) => ({
      ...s,
      privateActions: s.privateActions.map((a) => (a.id === id ? { ...a, done: !a.done } : a)),
    }));
  }, []);

  /** 切到私密分頁才打 API，避免每個人開摘要都燒 Token */
  const handleSummaryTab = useCallback(
    (tab) => {
      if (tab === "private" && !privateState.loaded) runPrivateInsights();
    },
    [privateState.loaded, runPrivateInsights]
  );

  return (
    <div className="fade-in max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
      <button
        type="button"
        onClick={() => go("dashboard")}
        className="text-sm text-navy-400 hover:text-navy-700 transition-colors"
      >
        ← 會議看板
      </button>

      <div className="mt-2 flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black text-navy-800 dark:text-slate-100">會議整理</h1>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                mode === "student"
                  ? "bg-sky-50 text-sky-600 border-sky-100"
                  : "bg-navy-800/5 text-navy-500 border-navy-800/10"
              }`}
            >
              {mode === "student" ? "學生模式" : "企業模式"}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-navy-800/10 bg-white text-navy-500">
              {currentRole === "host" ? "Host" : "Attendee"}
            </span>
            {aiGenerated ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full text-cyan-700 bg-cyan-50 border border-cyan-200 dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-500/30">
                <Sparkles className="h-3 w-3" strokeWidth={2.4} />
                AI 整理版
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-navy-500 bg-gray-50 border border-gray-100 dark:text-slate-300 dark:bg-slate-800/60 dark:border-slate-700">
                基礎紀錄
              </span>
            )}
          </div>
          <p className="text-navy-400 mt-1 text-sm">
            {meeting.title} · 歷時約 {durationMin} 分鐘
            {hostName ? ` · 發起人 ${hostName}` : ""}
          </p>
          {statusMsg && <p className="mt-1 text-[11px] text-navy-400">{statusMsg}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* 💬 完整會議逐字稿入口 */}
          <button
            type="button"
            onClick={() => setIsTranscriptOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold border transition-colors
              text-navy-700 bg-white border-gray-100 hover:border-navy-800/15
              dark:text-slate-200 dark:bg-[#111c35] dark:border-slate-800 dark:hover:border-slate-600"
          >
            <MessageSquareText className="h-4 w-4" strokeWidth={2} />
            完整會議逐字稿
            {transcriptRows.length > 0 && (
              <span className="text-[11px] font-bold text-navy-400 dark:text-slate-400">
                {transcriptRows.length}
              </span>
            )}
          </button>

          {/* ✨ 手動觸發 AI 深度整理（唯一會消耗 Token 的入口） */}
          <button
            type="button"
            onClick={handleGenerateAi}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white shadow-sm transition-opacity bg-cyan-600 dark:bg-cyan-500 hover:opacity-90 disabled:opacity-70 disabled:cursor-wait"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                AI 分析與圖表繪製中…
              </>
            ) : aiGenerated ? (
              <>
                <RefreshCw className="h-4 w-4" strokeWidth={2.4} />
                重新生成 AI 摘要
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" strokeWidth={2.4} />
                生成 AI 深度簡報
              </>
            )}
          </button>

          {/* Host 可在本頁切換共編／嚴格管理，並寫回 meeting.rbac（與 LiveRoom 欄位對齊） */}
          {currentRole === "host" && (
            <label className="inline-flex items-center gap-2 rounded-xl border border-navy-800/10 bg-white px-3 py-2 shadow-sm cursor-pointer select-none dark:bg-[#111c35] dark:border-slate-800">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-navy-800/20 text-mint-500 focus:ring-mint-200"
                checked={isEditRestricted}
                onChange={(e) => persistRbac(e.target.checked)}
              />
              <span className="text-[11px] font-semibold text-navy-600 dark:text-slate-300">
                {isEditRestricted ? "嚴格管理（上級指派）" : "全員共編（只能認領自己）"}
              </span>
            </label>
          )}
        </div>
      </div>

      <SummaryTabs
        className="mt-5"
        onTabChange={handleSummaryTab}
        privateProps={{
          cornell: myCornell,
          privateActions: privateState.privateActions,
          insights: privateState.insights,
          loading: privateState.loading,
          message: privateState.message,
          onRetry: privateState.loading ? undefined : runPrivateInsights,
          onToggleAction: togglePrivateAction,
        }}
      >
      {/* 逐字稿入口卡（Pre / Post 皆置頂）：一鍵開啟完整對照 */}
      <button
        type="button"
        onClick={() => setIsTranscriptOpen(true)}
        className="w-full mb-5 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white shadow-sm px-5 py-4 text-left transition-colors hover:border-cyan-200 dark:bg-[#111c35] dark:border-slate-800 dark:hover:border-cyan-500/40 group"
      >
        <span className="shrink-0 h-9 w-9 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 flex items-center justify-center">
          <MessageSquareText className="h-4 w-4 text-cyan-600 dark:text-cyan-300" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-navy-800 dark:text-slate-100">會議逐字稿與筆記</span>
          <span className="block text-[12px] text-navy-400 dark:text-slate-400">
            {transcriptRows.length > 0
              ? `${transcriptRows.length} 句語音紀錄 · 可與 AI 摘要逐句對照`
              : "本場沒有語音逐字稿；可展開檢視會議原始紀錄"}
          </span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-cyan-700 dark:text-cyan-300 group-hover:gap-1.5 transition-all">
          開啟完整對照
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
      </button>

      {/* Pre-AI：0 Token 客觀紀錄 + 漸層 CTA（嚴禁任何 AI 語意數據） */}
      {!aiGenerated && (
        <div className="fade-in">
          <BaseSummaryCard
            base={baseSummary}
            onGenerate={handleGenerateAi}
            isLoading={isLoading}
            onOpenTranscript={() => setIsTranscriptOpen(true)}
          />
        </div>
      )}

      {/* Post-AI：解鎖完全體「AI 簡報看板」——核心結論 / 4 格指標 / 痛點解決率 / 決議優先級 */}
      {aiGenerated && (
        <div className="fade-in space-y-5">
          {/* 核心結論與出處：每條決議帶可點擊引證，跳轉逐字稿 */}
          {decisionCitations.length > 0 && (
            <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 md:p-6 dark:bg-[#111c35] dark:border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-300" strokeWidth={2.2} />
                <h3 className="text-sm font-bold text-navy-800 dark:text-slate-100">核心結論與出處</h3>
                <span className="text-[10px] font-semibold text-navy-400 dark:text-slate-400">
                  點引證跳轉逐字稿
                </span>
              </div>
              <ul className="space-y-2.5">
                {decisionCitations.map((d, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 dark:border-slate-800 px-3.5 py-2.5"
                  >
                    <span className="flex items-start gap-2 min-w-0">
                      <span className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="text-[13px] leading-relaxed text-navy-700 dark:text-slate-200">{d.text}</span>
                    </span>
                    {d.citation ? (
                      <CitationBadge citation={d.citation} onJump={jumpToCitation} />
                    ) : (
                      <span className="shrink-0 text-[10px] text-navy-300 dark:text-slate-500">無對應原文</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <MeetingAnalytics
            meeting={meeting}
            review={review}
            actions={actions}
            durationMin={durationMin}
          />
        </div>
      )}

      {/* Post-AI 才顯示：痛點對照 / 互動待辦表 / 備選提案 / 可摺疊原始逐字稿。
          Pre-AI 一律不渲染，保持 Standard Mode 版面極簡純粹。 */}
      {aiGenerated && (
        <div className="fade-in">
          {meeting.pains?.length > 0 && (
            <div className="mt-6">
              <PainPointsList pains={meeting.pains} />
              <p className="mt-2 text-xs text-navy-400">
                會議當初想解決的問題，對照下方 AI 整理結果檢視是否已處理。
              </p>
            </div>
          )}

          <ActionItemsTable
            actions={actions}
            loading={isLoading}
            allPeople={allPeople}
            selectablePeople={selectablePeople}
            selectLocked={selectLocked}
            selectHint={selectHint}
            canMutateTasks={canMutateTasks}
            onToggleDone={toggleDone}
            onClaim={claimAction}
            onUpdateTask={updateTask}
            onAdd={addAction}
            onDelete={deleteAction}
          />

          {/* ── 附錄：備選提案 + 可摺疊原始逐字稿 ── */}
          <div className="mt-6 space-y-4">
            <AICard
              tone="blue"
              icon=""
              title="備選方案與未採納提案"
              items={review.ideas || []}
              empty="本場沒有額外的備選提案。"
              loading={isLoading}
            />

            <CollapsibleNotes
              label={aiSourceLabel === "語音逐字稿" ? "會議語音逐字稿" : "會議原始紀錄"}
              sourceLabel={aiSourceLabel}
              transcriptText={aiSourceLabel === "語音逐字稿" ? notesForAi : ""}
              topicEntries={topicEntries}
              notes={meeting.notes}
              people={allPeople}
            />
          </div>
        </div>
      )}
      </SummaryTabs>

      <TranscriptDrawer
        open={isTranscriptOpen}
        rows={transcriptRows}
        onClose={() => setIsTranscriptOpen(false)}
        highlightAnchor={highlightAnchor}
      />
    </div>
  );
}
