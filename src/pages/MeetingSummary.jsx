import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
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
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
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
      Object.entries(meeting.topicNotes || {})
        .map(([t, raw]) => [t, flattenNotesDoc(raw || "")])
        .filter(([, v]) => (v || "").trim()),
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
      {/* 簡報式量化摘要：核心結論 / KPI / 發言比重 / 議題分布 / 痛點→決策 / 風險矩陣 */}
      <MeetingAnalytics
        meeting={meeting}
        review={review}
        actions={actions}
        durationMin={durationMin}
      />

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

      {/* ── 附錄：備選提案 + 可摺疊原始紀錄 ── */}
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
      </SummaryTabs>

    </div>
  );
}
