import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import Avatar from "../components/Avatar.jsx";
import PainPointsList from "../components/PainPointsList.jsx";
import { extractReview } from "../lib/extract.js";
import {
  formatTranscriptForAi,
  getCachedSummary,
  setCachedSummary,
} from "../lib/meetingsCache.js";
import * as api from "../lib/api.js";

const uid = () =>
  (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) ||
  `a-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const avatarColor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

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

/** AI 只提議 text；合併舊認領／完成狀態，避免重新分析洗掉 who */
function toStoreShape(payload, prevActions = []) {
  const prevByTask = new Map(
    (prevActions || []).map((a) => [String(a.task || a.text || "").trim(), a])
  );
  const actions = (payload.actionItems || []).map((it) => {
    const text = String(it.text || "").trim();
    const prev = prevByTask.get(text);
    return {
      id: prev?.id || uid(),
      task: text,
      who: prev?.who || "",
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

function ActionSkeleton() {
  return (
    <div className="px-6 py-5 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-5 w-5 animate-pulse rounded-md bg-gray-200/50" />
          <div className="h-4 flex-1 animate-pulse rounded-xl bg-gray-200/50" />
          <div className="h-8 w-28 animate-pulse rounded-xl bg-gray-200/50" />
        </div>
      ))}
    </div>
  );
}

/**
 * 動態認領／指派下拉
 * - 情境 A（isEditRestricted=false）：只能選「未認領」或自己
 * - 情境 B（isEditRestricted=true）：Host 可指派任何人；非 Host 整顆鎖定唯讀
 */
function ClaimSelect({
  value,
  allPeople,
  selectablePeople,
  locked,
  onChange,
  hint,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const claimed = Boolean(value);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const canPick = (name) => selectablePeople.includes(name);

  return (
    <div className="relative min-w-[10.5rem]" ref={rootRef}>
      <button
        type="button"
        disabled={locked}
        title={hint || undefined}
        onClick={() => {
          if (locked) return;
          setOpen((v) => !v);
        }}
        className={`w-full flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left shadow-[0_1px_0_rgba(15,27,45,0.04)] transition-colors ${
          claimed
            ? "border-mint-200/80 bg-gradient-to-b from-white to-mint-50/70 hover:border-mint-300"
            : "border-navy-800/10 bg-gradient-to-b from-white to-slate-50/80 hover:border-mint-300"
        } disabled:opacity-75 disabled:cursor-not-allowed disabled:hover:border-navy-800/10`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={locked}
      >
        {claimed ? (
          <>
            <Avatar name={value} color={avatarColor(value)} size="h-6 w-6" ring={false} />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-navy-700">
              {value}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-xs font-semibold text-navy-400">未認領</span>
        )}
        {locked ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-navy-300" strokeWidth={2.2} />
        ) : (
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-navy-300 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            strokeWidth={2.2}
          />
        )}
      </button>

      {open && !locked && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1.5 w-full min-w-[12rem] max-h-56 overflow-auto rounded-xl border border-navy-800/10 bg-white py-1 shadow-[0_8px_24px_rgba(15,27,45,0.12)]"
        >
          <li>
            <button
              type="button"
              role="option"
              className="w-full px-3 py-2 text-left text-xs font-medium text-navy-400 hover:bg-navy-800/[0.04]"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              未認領
            </button>
          </li>
          {allPeople.map((name) => {
            const enabled = canPick(name);
            return (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  disabled={!enabled}
                  aria-selected={value === name}
                  aria-disabled={!enabled}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    enabled ? "hover:bg-mint-50" : "opacity-75 cursor-not-allowed"
                  } ${value === name ? "bg-mint-50/80" : ""}`}
                  onClick={() => {
                    if (!enabled) return;
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <Avatar name={name} color={avatarColor(name)} size="h-6 w-6" ring={false} />
                  <span className="text-xs font-semibold text-navy-700">{name}</span>
                  {!enabled && (
                    <span className="ml-auto text-[10px] font-medium text-navy-300">不可選</span>
                  )}
                </button>
              </li>
            );
          })}
          {allPeople.length === 0 && (
            <li className="px-3 py-2 text-[11px] text-navy-300">尚無可選成員</li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * 會後 AI 整理：進頁自動呼叫後端 Gemini；待辦依 RBAC 切換「認領／指派」。
 */
export default function MeetingSummary({
  meeting,
  store,
  go,
  mode = "enterprise",
  me = null,
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
  const [copied, setCopied] = useState(null);
  const ranForRef = useRef(null);

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
      Object.entries(meeting.topicNotes || {}).filter(([, v]) => (v || "").trim()),
    [meeting.topicNotes]
  );

  /** 優先使用完整語音逐字稿；無 STT 時才退回手寫筆記 */
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
        });
        setStatusMsg(cached.message || `已使用快取（來源：${aiSourceLabel}）`);
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
      });
      setStatusMsg(result.message || `分析完成（來源：${aiSourceLabel}）`);
    } catch (err) {
      console.error("[MeetingSummary]", err);
      try {
        const fallback = extractReview(notesForAi, allPeople);
        const actions = (fallback.actions || []).map((a) => ({
          ...a,
          who: "",
        }));
        setCachedSummary(meeting.id, notesForAi, {
          review: fallback,
          actions,
          message: "離線備援摘要",
        });
        await store.updateMeeting(meeting.id, {
          review: fallback,
          actions,
        });
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

  useEffect(() => {
    const key = `${meeting.id}::${notesForAi}`;
    if (ranForRef.current === key) return;
    ranForRef.current = key;
    generateSummary();
  }, [generateSummary, meeting.id, notesForAi]);

  const toggleDone = async (aid) => {
    await store.updateMeeting(meeting.id, (m) => ({
      actions: (m.actions || []).map((a) => (a.id === aid ? { ...a, done: !a.done } : a)),
    }));
  };

  const claimAction = async (aid, who) => {
    // 前端雙重保險：共編只能認領自己；嚴格模式非 Host 不可改
    if (isEditRestricted && currentRole !== "host") return;
    if (!isEditRestricted && who && who !== myName) return;
    await store.updateMeeting(meeting.id, (m) => ({
      actions: (m.actions || []).map((a) => (a.id === aid ? { ...a, who } : a)),
    }));
  };

  const copyItem = (a) => {
    const text = `[ ] ${a.task}${a.who ? ` （負責：${a.who}` : ""}${
      a.when ? `${a.who ? "，" : " （"}截止：${a.when}` : ""
    }${a.who || a.when ? "）" : ""}`;
    navigator.clipboard?.writeText(text);
    setCopied(a.id);
    setTimeout(() => setCopied(null), 1400);
  };

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
            <h1 className="text-2xl font-black text-navy-800">會後 AI 整理</h1>
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
            {isLoading && (
              <span className="text-[10px] font-semibold text-mint-600 bg-mint-50 border border-mint-100 px-2 py-0.5 rounded-full animate-pulse">
                分析中…
              </span>
            )}
          </div>
          <p className="text-navy-400 mt-1 text-sm">
            {meeting.title} · 歷時約 {durationMin} 分鐘
            {hostName ? ` · 發起人 ${hostName}` : ""}
          </p>
          {statusMsg && <p className="mt-1 text-[11px] text-navy-400">{statusMsg}</p>}
        </div>

        {/* Host 可在本頁切換共編／嚴格管理，並寫回 meeting.rbac（與 LiveRoom 欄位對齊） */}
        {currentRole === "host" && (
          <label className="inline-flex items-center gap-2 rounded-xl border border-navy-800/10 bg-white px-3 py-2 shadow-sm cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-navy-800/20 text-mint-500 focus:ring-mint-200"
              checked={isEditRestricted}
              onChange={(e) => persistRbac(e.target.checked)}
            />
            <span className="text-[11px] font-semibold text-navy-600">
              {isEditRestricted ? "嚴格管理（上級指派）" : "全員共編（只能認領自己）"}
            </span>
          </label>
        )}
      </div>

      {meeting.pains?.length > 0 && (
        <div className="mt-6">
          <PainPointsList pains={meeting.pains} />
          <p className="mt-2 text-xs text-navy-400">
            會議當初想解決的問題，對照下方 AI 整理結果檢視是否已處理。
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="self-start bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-navy-800/6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-bold text-navy-700">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 text-navy-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" />
              </svg>
              {aiSourceLabel === "語音逐字稿" ? "會議語音逐字稿" : "會議原始口語筆記"}
            </div>
            <span className="text-[10px] font-bold text-mint-700 bg-mint-50 border border-mint-100 px-2 py-0.5 rounded-full">
              AI 來源：{aiSourceLabel}
            </span>
          </div>
          {aiSourceLabel === "語音逐字稿" && notesForAi.trim() ? (
            <pre className="px-5 py-4 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans max-h-[28rem] overflow-y-auto">
              {notesForAi}
            </pre>
          ) : topicEntries.length ? (
            <div className="px-5 py-4 space-y-4">
              {topicEntries.map(([t, text]) => (
                <div key={t}>
                  <p className="text-xs font-bold text-mint-700 bg-mint-50 inline-block px-2 py-0.5 rounded-md">
                    {t}
                  </p>
                  <pre className="mt-1.5 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans">
                    {text}
                  </pre>
                </div>
              ))}
            </div>
          ) : (meeting.notes || "").trim() ? (
            <pre className="px-5 py-4 text-sm text-navy-600 leading-relaxed whitespace-pre-wrap font-sans">
              {meeting.notes}
            </pre>
          ) : (
            <p className="px-5 py-8 text-sm text-navy-300 text-center">這場會議沒有留下筆記。</p>
          )}
          {allPeople.length > 0 && (
            <div className="px-5 py-3 border-t border-navy-800/6 text-xs text-navy-300">
              認領名單（含 Host）：{allPeople.join("、")}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <AICard
            tone="blue"
            icon=""
            title="靈感 / 點子"
            items={review.ideas || []}
            empty="筆記中未偵測到明顯的點子。"
            loading={isLoading}
          />
          <AICard
            tone="green"
            icon=""
            title="決議事項"
            items={review.decisions || []}
            empty="筆記中未偵測到明確決議。"
            loading={isLoading}
          />
          <AICard
            tone="coral"
            icon=""
            title="潛在風險"
            items={review.risks || []}
            empty="太好了，沒有偵測到明顯風險。"
            loading={isLoading}
          />
        </div>
      </div>

      <div className="mt-8 bg-white border border-navy-800/8 rounded-3xl shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-navy-800/6 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-black text-navy-800 flex items-center gap-2">
            <span className="text-mint-500">✓</span> 待辦事項 Action Items
            {!isLoading && (
              <span className="text-xs font-semibold text-navy-400 bg-navy-800/5 px-2 py-0.5 rounded-full">
                {actions.length} 項
              </span>
            )}
          </h2>
          <p className="text-[11px] text-navy-400">{selectHint}</p>
        </div>

        {isLoading ? (
          <ActionSkeleton />
        ) : actions.length === 0 ? (
          <p className="px-6 py-10 text-sm text-navy-300 text-center">
            這次沒有可認領的待辦。若筆記資訊量不足，請回到會議室補充後再進入本頁。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-bold text-navy-400 bg-navy-800/[0.02]">
                  <th className="px-6 py-3 w-8" />
                  <th className="px-2 py-3">待辦內容</th>
                  <th className="px-4 py-3">負責人 Who</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-t border-navy-800/6 transition-colors ${
                      a.done ? "opacity-50" : "hover:bg-mint-50/30"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => toggleDone(a.id)}
                        className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                          a.done
                            ? "bg-mint-500 border-mint-500 text-white"
                            : "border-navy-800/20 hover:border-mint-400"
                        }`}
                      >
                        {a.done && (
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12.5l4 4 10-10" />
                          </svg>
                        )}
                      </button>
                    </td>
                    <td
                      className={`px-2 py-4 font-semibold text-navy-800 ${
                        a.done ? "line-through" : ""
                      }`}
                    >
                      {a.task}
                    </td>
                    <td className="px-4 py-4">
                      <ClaimSelect
                        value={a.who || ""}
                        allPeople={allPeople}
                        selectablePeople={selectablePeople}
                        locked={selectLocked || a.done}
                        hint={a.done ? "已完成項目不可改認領" : selectHint}
                        onChange={(who) => claimAction(a.id, who)}
                      />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => copyItem(a)}
                        className="text-xs font-semibold text-navy-600 border border-navy-800/10 px-2.5 py-1.5 rounded-lg hover:border-mint-300 hover:text-mint-600 transition-colors"
                      >
                        {copied === a.id ? "已複製 ✓" : "複製"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
