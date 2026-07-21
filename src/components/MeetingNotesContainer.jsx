import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Lock } from "lucide-react";
import CornellNotesEditor from "./CornellNotesEditor.jsx";
import { flattenNotesDoc } from "../lib/notesDocument.js";

/* ════════════════════════════════════════════════════════════════════════
   MeetingNotesContainer —— 會中筆記雙分頁
     [ 團體共編議程 ]  ← children（筆記區內 absolute 語音 Ask AI + 緊湊底欄）
     [ 個人私密筆記 ]  ← 康乃爾；@ai 僅本機可見（無語音鈕）
   ════════════════════════════════════════════════════════════════════════ */

const EMPTY = { cue: "", notes: "", summary: "" };

export function cornellStorageKey(userId, meetingId) {
  return `meetflow.cornell.${userId || "anon"}.${meetingId || "unknown"}`;
}

export function loadCornell(userId, meetingId) {
  try {
    const raw = localStorage.getItem(cornellStorageKey(userId, meetingId));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      cue: String(parsed?.cue || ""),
      notes: String(parsed?.notes || ""),
      summary: String(parsed?.summary || ""),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveCornell(userId, meetingId, value) {
  try {
    localStorage.setItem(cornellStorageKey(userId, meetingId), JSON.stringify(value || EMPTY));
  } catch {
    /* 忽略配額錯誤 */
  }
}

export default function MeetingNotesContainer({
  meetingId,
  userId,
  children,
  value,
  onChange,
  defaultTab = "group",
  tab: controlledTab,
  onTabChange,
  className = "",
  /** 語音／@ai 共用脈絡（私密康乃爾用） */
  aiEnabled = false,
  transcriptRows = [],
  meetingTitle = "",
  topic = "",
  mode = "enterprise",
}) {
  const controlled = Boolean(value && onChange);
  const [innerTab, setInnerTab] = useState(defaultTab);
  const tab = controlledTab ?? innerTab;
  const setTab = (next) => {
    onTabChange?.(next);
    if (controlledTab == null) setInnerTab(next);
  };
  const [inner, setInner] = useState(() => (controlled ? value : loadCornell(userId, meetingId)));
  const saveTimer = useRef(null);

  useEffect(() => {
    if (controlled) return;
    setInner(loadCornell(userId, meetingId));
  }, [controlled, userId, meetingId]);

  const cornell = controlled ? value : inner;

  const handleChange = useCallback(
    (next) => {
      if (controlled) {
        onChange(next);
        return;
      }
      setInner(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveCornell(userId, meetingId, next), 400);
    },
    [controlled, onChange, userId, meetingId]
  );

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const filled =
    flattenNotesDoc(cornell.cue || "").trim().length +
      flattenNotesDoc(cornell.notes || "").trim().length +
      flattenNotesDoc(cornell.summary || "").trim().length >
    0;

  const TABS = [
    { id: "group", label: "團體共編議程", Icon: Users },
    { id: "private", label: "個人私密筆記", Icon: Lock, dot: filled },
  ];

  return (
    <div className={`relative flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-1.5 shrink-0 border-b border-navy-800/6">
        {TABS.map((t) => {
          const active = tab === t.id;
          const isPrivate = t.id === "private";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors
                ${
                  active
                    ? isPrivate
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"
                      : "bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-100"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
            >
              <t.Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
              {t.label}
              {t.dot && !active && (
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" title="已有私密筆記" />
              )}
            </button>
          );
        })}
      </div>

      {tab === "group" ? (
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          <CornellNotesEditor
            value={cornell}
            onChange={handleChange}
            aiContext={
              aiEnabled
                ? { transcriptRows, title: meetingTitle, topic, mode }
                : null
            }
          />
        </div>
      )}
    </div>
  );
}
