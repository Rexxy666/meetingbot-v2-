import { useEffect, useRef } from "react";
import { Bot, ChevronDown, ChevronUp, CornerDownLeft, Trash2, X } from "lucide-react";

/**
 * 內嵌 AI 回覆卡片：思考中 / 打字機串流 / 完成
 */
export default function InlineAIBubble({
  question = "",
  answer = "",
  status = "done", // thinking | streaming | done | error
  hidden = false,
  onToggleHide,
  onDelete,
  className = "",
  compact = false,
}) {
  if (hidden) {
    return (
      <button
        type="button"
        onClick={onToggleHide}
        className={`w-full text-left rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 transition-colors ${className}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} />
          已隱藏 AI 回覆（點擊展開）
          {question ? <span className="text-slate-400 truncate">· {question}</span> : null}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`rounded-xl border border-slate-200/80 bg-sky-50/60 border-l-4 border-l-sky-500 shadow-sm overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-sky-100/80 bg-sky-50/90">
        <Bot className="h-3.5 w-3.5 text-sky-600 shrink-0" strokeWidth={2.2} />
        <span className="text-[11px] font-bold text-sky-700">AI 助手</span>
        {status === "thinking" && (
          <span className="text-[10px] font-semibold text-sky-600/80 animate-pulse">思考中…</span>
        )}
        {status === "streaming" && (
          <span className="text-[10px] font-semibold text-sky-600/80">回覆中…</span>
        )}
        {status === "error" && (
          <span className="text-[10px] font-semibold text-coral-500">回覆失敗</span>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {typeof onToggleHide === "function" && (
            <button
              type="button"
              title="隱藏回覆"
              onClick={onToggleHide}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/80 transition-colors"
            >
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          )}
          {typeof onDelete === "function" && (
            <button
              type="button"
              title="刪除回覆"
              onClick={onDelete}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-coral-500 hover:bg-white/80 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      <div className={`px-3 ${compact ? "py-2" : "py-2.5"}`}>
        {status === "thinking" && !answer ? (
          <p className="text-sm text-sky-700/80 font-medium flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
            AI 思考中…
          </p>
        ) : (
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {answer || (status === "error" ? "無法取得回覆，請再試一次。" : "")}
            {(status === "streaming" || status === "thinking") && answer ? (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-sky-500 animate-pulse align-middle" />
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}

/** 提問列：已送出的 @ai（獨立列，非輸入層，可用真實 Badge） */
export function AtAiPromptRow({ question, className = "" }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/80 px-3 py-2.5 ${className}`}
    >
      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700 select-none">
        <Bot className="h-3 w-3" strokeWidth={2.4} />
        Ask AI
      </span>
      <p className="text-sm font-semibold text-navy-800 leading-relaxed min-w-0 flex-1">
        <span className="text-blue-500 font-bold mr-1">Q:</span>
        {question}
      </p>
    </div>
  );
}

/**
 * \u85CD\u8272\u5C08\u5C6C AI \u63D0\u554F\u6B04\u4F4D\uFF08\u5C1A\u672A\u9001\u51FA\u7684\u8349\u7A3F\uFF09
 *
 * \u5F9E mention \u9078\u55AE\u9078\u5230 @ai \u5F8C\uFF0C\u6574\u5217\u8F49\u6210\u9019\u5F35\u5361\u7247\uFF0C\u8B93\u63D0\u554F\u8207\u4E00\u822C\u7B46\u8A18\u5B8C\u5168\u5206\u96E2\u3002
 * \u8349\u7A3F\u53EA\u5B58\u5728\u672C\u6A5F state\u3001\u4E0D\u5BEB\u5165 doc\uFF0C\u6240\u4EE5\u4E0D\u6703\u628A\u534A\u6210\u54C1\u554F\u984C\u540C\u6B65\u7D66\u5176\u4ED6\u4EBA\u3002
 */
export function AskAiComposer({
  value = "",
  onChange,
  onSubmit,
  onCancel,
  autoFocus = true,
  placeholder = "\u60F3\u554F\u4EC0\u9EBC\uFF1F\u4F8B\u5982\uFF1A\u9019\u6BB5\u7D50\u8AD6\u6211\u8981\u600E\u9EBC\u843D\u5730\u57F7\u884C\uFF1F",
  className = "",
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    // IME \u7D44\u5B57\u4E2D\u7684 Enter \u662F\u300C\u9078\u5B57\u78BA\u8A8D\u300D\uFF0C\u7D55\u4E0D\u53EF\u7576\u6210\u9001\u51FA
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
    // \u7A7A\u6B04\u4F4D\u518D\u6309\u9000\u683C \u2192 \u6536\u56DE\u9019\u5F35\u63D0\u554F\u5361\uFF0C\u56DE\u5230\u4E00\u822C\u7B46\u8A18
    if (e.key === "Backspace" && !value) {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <div
      className={`rounded-lg border border-blue-200 bg-blue-50/80 p-3 my-2 shadow-sm ring-1 ring-blue-100 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-700 select-none">
          <Bot className="h-3 w-3" strokeWidth={2.4} />
          Ask AI:
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent text-sm text-navy-800 placeholder-blue-400/70 focus:outline-none"
        />
        <button
          type="button"
          title="\u53D6\u6D88\u63D0\u554F"
          onMouseDown={(e) => {
            e.preventDefault();
            onCancel?.();
          }}
          className="shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-blue-400 hover:text-blue-700 hover:bg-blue-100/80 transition-colors"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.4} />
        </button>
      </div>
      <p className="mt-1.5 pl-0.5 text-[10px] text-blue-500/80 flex items-center gap-1">
        <CornerDownLeft className="h-3 w-3" strokeWidth={2.2} />
        Enter \u9001\u51FA\u63D0\u554F \u00B7 Esc \u53D6\u6D88 \u00B7 \u56DE\u8986\u6703\u63D2\u5728\u4E0B\u65B9
      </p>
    </div>
  );
}
