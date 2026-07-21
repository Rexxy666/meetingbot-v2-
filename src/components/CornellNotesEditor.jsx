import { useRef } from "react";
import { Lock, KeyRound, PenLine, ListChecks } from "lucide-react";
import MeetingNotesEditor from "./MeetingNotesEditor.jsx";
import { flattenNotesDoc } from "../lib/notesDocument.js";

/* ════════════════════════════════════════════════════════════════════════
   CornellNotesEditor —— 私密個人康乃爾筆記
   三欄皆支援 @ai → InlineAIBubble（僅 localStorage／本機 state，不同步）
   ════════════════════════════════════════════════════════════════════════ */

function FieldLabel({ icon: Icon, title, hint }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-300" strokeWidth={2.2} />
      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{title}</span>
      {hint && <span className="text-[10px] text-slate-400 truncate">{hint}</span>}
    </div>
  );
}

function fieldCharCount(raw) {
  return flattenNotesDoc(raw || "").length;
}

export default function CornellNotesEditor({
  value = { cue: "", notes: "", summary: "" },
  onChange,
  readOnly = false,
  className = "",
  /** { transcriptRows, title, topic, mode } — 有值才啟用 @ai */
  aiContext = null,
}) {
  const cueWrap = useRef(null);
  const notesWrap = useRef(null);
  const summaryWrap = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const patch = (key, v) => onChange?.({ ...valueRef.current, [key]: v });

  const focusField = (wrapRef) => {
    const ta = wrapRef.current?.querySelector("textarea");
    ta?.focus();
  };

  const handleTab = (e, field) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const order = ["cue", "notes", "summary"];
    const idx = order.indexOf(field);
    const next = e.shiftKey
      ? order[(idx - 1 + order.length) % order.length]
      : order[(idx + 1) % order.length];
    const map = { cue: cueWrap, notes: notesWrap, summary: summaryWrap };
    focusField(map[next]);
  };

  const total =
    fieldCharCount(value.cue) + fieldCharCount(value.notes) + fieldCharCount(value.summary);

  const editorProps = {
    disabled: readOnly,
    aiContext: readOnly ? null : aiContext,
  };

  return (
    <div
      className={`rounded-2xl border border-violet-200/70 dark:border-violet-400/20 bg-violet-50/40 dark:bg-violet-500/[0.06] overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-100/60 dark:bg-violet-500/10 border-b border-violet-200/70 dark:border-violet-400/20">
        <Lock className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" strokeWidth={2.4} />
        <span className="text-xs font-bold text-violet-700 dark:text-violet-200">個人私密筆記</span>
        <span className="text-[10px] font-semibold text-violet-600/80 dark:text-violet-300/80 bg-white/70 dark:bg-white/10 px-2 py-0.5 rounded-full">
          僅自己可見
        </span>
        <span className="ml-auto text-[10px] text-violet-500/70 dark:text-violet-300/60 tabular-nums hidden sm:inline">
          {total} 字
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(170px,0.34fr)_1fr] divide-y md:divide-y-0 md:divide-x divide-violet-200/60 dark:divide-violet-400/15">
        <div
          ref={cueWrap}
          className="p-4 bg-white/50 dark:bg-white/[0.02]"
          onKeyDown={(e) => handleTab(e, "cue")}
        >
          <FieldLabel icon={KeyRound} title="線索欄" hint="關鍵字 / @ai 疑問" />
          <MeetingNotesEditor
            {...editorProps}
            value={value.cue || ""}
            onChange={(v) => patch("cue", v)}
            placeholder={"關鍵字\n@ai 這題該怎麼拆？\n★ 會後要跟進"}
            className="min-h-[10rem] md:min-h-[240px]"
          />
        </div>

        <div ref={notesWrap} className="p-4" onKeyDown={(e) => handleTab(e, "notes")}>
          <FieldLabel icon={PenLine} title="筆記欄" hint="會議中隨手記錄" />
          <MeetingNotesEditor
            {...editorProps}
            value={value.notes || ""}
            onChange={(v) => patch("notes", v)}
            placeholder={"邊聽邊記。\n私密問 AI：@ai 幫我整理這段\n（Enter 送出，Shift+Enter 換行）"}
            className="min-h-[10rem] md:min-h-[240px]"
          />
        </div>
      </div>

      <div
        ref={summaryWrap}
        className="p-4 border-t border-violet-200/70 dark:border-violet-400/20 bg-white/60 dark:bg-white/[0.03]"
        onKeyDown={(e) => handleTab(e, "summary")}
      >
        <FieldLabel icon={ListChecks} title="摘要欄" hint="總結與個人心得" />
        <MeetingNotesEditor
          {...editorProps}
          value={value.summary || ""}
          onChange={(v) => patch("summary", v)}
          placeholder="用兩三句話總結。也可用 @ai … 然後 Enter。"
          className="min-h-[5.5rem]"
        />
      </div>

      <div className="px-4 py-2 border-t border-violet-200/60 dark:border-violet-400/15 flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400">
          按{" "}
          <kbd className="px-1 py-0.5 rounded bg-white dark:bg-white/10 border border-slate-200 dark:border-white/15 text-[9px]">
            Tab
          </kbd>{" "}
          切換欄位
          {aiContext ? (
            <>
              {" "}
              · 輸入{" "}
              <kbd className="px-1 py-0.5 rounded bg-white dark:bg-white/10 border border-slate-200 dark:border-white/15 text-[9px]">
                @
              </kbd>{" "}
              快捷 @ai
            </>
          ) : null}
        </span>
        {readOnly && <span className="text-[10px] font-semibold text-slate-400">唯讀檢視</span>}
      </div>
    </div>
  );
}
