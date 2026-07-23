import { useEffect, useRef } from "react";
import { Bot, ChevronDown, ChevronUp, CornerDownLeft, X } from "lucide-react";

/**
 * 內嵌 AI 回覆卡片：思考中 / 打字機串流 / 完成
 * AI 訊息作為會議紀錄保留，不提供刪除按鈕。
 */
export default function InlineAIBubble({
  question = "",
  answer = "",
  status = "done", // thinking | streaming | done | error
  hidden = false,
  onToggleHide,
  className = "",
  compact = false,
}) {
  if (hidden) {
    return (
      <button
        type="button"
        onClick={onToggleHide}
        className={`w-full text-left rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800 ${className}`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
          <span className="truncate">
            已隱藏 AI 回覆（點擊展開）
            {question ? ` · ${question}` : ""}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div
      className={`w-full min-w-0 rounded-xl border border-slate-200/80 bg-sky-50/60 border-l-4 border-l-sky-500 shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/60 dark:border-l-cyan-400 ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-sky-100/80 bg-sky-50/90 dark:border-slate-800 dark:bg-slate-900/80">
        <Bot className="h-3.5 w-3.5 text-sky-600 shrink-0 dark:text-cyan-400" strokeWidth={2.2} />
        <span className="text-[11px] font-bold text-sky-700 dark:text-cyan-300">AI 助手</span>
        {status === "thinking" && (
          <span className="text-[10px] font-semibold text-sky-600/80 animate-pulse dark:text-cyan-400/90">思考中…</span>
        )}
        {status === "streaming" && (
          <span className="text-[10px] font-semibold text-sky-600/80 dark:text-cyan-400/90">回覆中…</span>
        )}
        {status === "error" && (
          <span className="text-[10px] font-semibold text-coral-500">回覆失敗</span>
        )}
        {typeof onToggleHide === "function" && (
          <button
            type="button"
            title="隱藏回覆"
            onClick={onToggleHide}
            className="ml-auto h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-colors dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
          >
            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        )}
      </div>

      <div className={`px-3 ${compact ? "py-2" : "py-3"}`}>
        {status === "thinking" && !answer ? (
          <p className="text-sm text-sky-700/80 font-medium flex items-center gap-2 leading-relaxed dark:text-cyan-300/90">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse dark:bg-cyan-400" />
            AI 思考中…
          </p>
        ) : (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words dark:text-slate-200">
            {answer || (status === "error" ? "無法取得回覆，請再試一次。" : "")}
            {(status === "streaming" || status === "thinking") && answer ? (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-sky-500 animate-pulse align-middle dark:bg-cyan-400" />
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

/** 提問列：已送出的 @ai（獨立列，非輸入層） */
export function AtAiPromptRow({ question, className = "" }) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2.5 min-w-0 ${className}`}
    >
      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700 select-none w-fit">
        <Bot className="h-3 w-3" strokeWidth={2.4} />
        Ask AI
      </span>
      <p className="text-sm font-semibold text-navy-800 leading-relaxed min-w-0 flex-1 break-words whitespace-pre-wrap">
        <span className="text-blue-500 font-bold mr-1">Q:</span>
        {question}
      </p>
    </div>
  );
}

/**
 * 藍色專用 AI 提問欄位（尚未送出的草稿）
 * 從 mention 選單選到 @ai 後，整列轉成這張卡片。
 */
export function AskAiComposer({
  value = "",
  onChange,
  onSubmit,
  onCancel,
  autoFocus = true,
  placeholder = "想問什麼？例如：這段結論我要怎麼落地執行？",
  className = "",
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    // IME 組字中的 Enter 是「選字確認」，絕不可當成送出
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const q = String(value || "").trim();
      if (q) onSubmit?.(q);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
      return;
    }
    // 空欄位再按退格 → 收回這張提問卡
    if (e.key === "Backspace" && !value) {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <div
      className={`w-full min-w-[min(100%,280px)] rounded-lg border border-blue-200 bg-blue-50/80 p-3 my-2 shadow-sm ring-1 ring-blue-100 ${className}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700 select-none w-fit">
          <Bot className="h-3 w-3" strokeWidth={2.4} />
          Ask AI
        </span>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm text-navy-800 placeholder-blue-400/70 focus:outline-none caret-navy-800 dark:text-slate-100 dark:placeholder-slate-400 dark:caret-cyan-400"
          />
          <button
            type="button"
            title="取消提問"
            onMouseDown={(e) => {
              e.preventDefault();
              onCancel?.();
            }}
            className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-blue-400 hover:text-blue-700 hover:bg-blue-100/80 transition-colors"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.4} />
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-blue-500/80 flex items-center gap-1 leading-relaxed">
        <CornerDownLeft className="h-3 w-3 shrink-0" strokeWidth={2.2} />
        按 Enter 送出問題 · Esc 取消 · 回覆會插在下方
      </p>
    </div>
  );
}
