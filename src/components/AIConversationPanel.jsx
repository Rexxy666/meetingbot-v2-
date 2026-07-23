import { useEffect, useRef } from "react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  CornerDownLeft,
  RefreshCw,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════════════
   底部可收折 AI 對話面板（方案 B）
   ════════════════════════════════════════════════════════════════════════ */

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="AI 思考中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

function friendlyAiError(raw) {
  const msg = String(raw || "").trim();
  if (!msg) return "暫時無法取得回覆，請再試一次。";
  if (/404|not found/i.test(msg)) return "AI 服務連線異常，請重試（已可自動改用備用通道）。";
  if (/請先輸入|請先說出|空/.test(msg)) return msg;
  if (/請求失敗\s*\(\d+\)/.test(msg)) return "AI 暫時無法回應，請稍後重試。";
  return msg;
}

/** 單組問答：藍色使用者氣泡 + 白底 AI 氣泡（作為會議紀錄保留，不提供刪除） */
function ChatExchange({ item, onCopyToNotes, onRetry, copiedId }) {
  const streaming = item.status === "thinking" || item.status === "streaming";
  const canCopy = item.status === "done" && String(item.answer || "").trim();
  const canRetry = item.status === "error" && typeof onRetry === "function";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-end">
        <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md bg-blue-50 border border-blue-100 px-3 py-2 dark:bg-sky-500/15 dark:border-sky-500/30">
          <p className="text-[13px] text-navy-800 leading-relaxed whitespace-pre-wrap break-words dark:text-slate-100">
            {item.question}
          </p>
        </div>
      </div>

      <div className="flex justify-start">
        <div className="max-w-[92%] min-w-[min(100%,280px)] rounded-2xl rounded-bl-md bg-white border border-navy-800/8 shadow-sm px-3 py-3 dark:bg-slate-900/60 dark:border-slate-800">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700 dark:bg-cyan-500/20 dark:text-cyan-300">
              <Bot className="h-3 w-3" strokeWidth={2.4} />
              AI
            </span>
            {item.status === "thinking" && (
              <span className="text-[10px] font-semibold text-sky-600/80 dark:text-cyan-400/90">思考中</span>
            )}
            {item.status === "streaming" && (
              <span className="text-[10px] font-semibold text-sky-600/80 dark:text-cyan-400/90">回覆中</span>
            )}
            {item.status === "error" && (
              <span className="text-[10px] font-semibold text-coral-500">回覆失敗</span>
            )}

            <div className="ml-auto flex items-center gap-0.5">
              {canRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(item)}
                  title="重試"
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-bold text-coral-600 hover:bg-coral-50 transition-colors dark:hover:bg-coral-500/10"
                >
                  <RefreshCw className="h-3 w-3" strokeWidth={2.4} />
                  重試
                </button>
              )}
              {canCopy && typeof onCopyToNotes === "function" && (
                <button
                  type="button"
                  onClick={() => onCopyToNotes(item)}
                  title="把這段回覆插入上方筆記"
                  className={`inline-flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                    copiedId === item.id
                      ? "bg-mint-50 text-mint-700 dark:bg-mint-500/15 dark:text-mint-300"
                      : "text-navy-400 hover:text-mint-700 hover:bg-mint-50 dark:text-slate-300 dark:hover:text-cyan-300 dark:hover:bg-slate-800"
                  }`}
                >
                  <ClipboardCheck className="h-3 w-3" strokeWidth={2.4} />
                  {copiedId === item.id ? "已插入" : "複製到筆記"}
                </button>
              )}
            </div>
          </div>

          {item.status === "thinking" && !item.answer ? (
            <TypingDots />
          ) : (
            <p
              className={`text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                item.status === "error" ? "text-coral-600" : "text-navy-700 dark:text-slate-200"
              }`}
            >
              {item.status === "error"
                ? friendlyAiError(item.answer)
                : item.answer || ""}
              {streaming && item.answer ? (
                <span className="inline-block w-1 h-3.5 ml-0.5 bg-sky-500 animate-pulse align-middle dark:bg-cyan-400" />
              ) : null}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIConversationPanel({
  items = [],
  open = false,
  onToggle,
  draft = "",
  onDraftChange,
  onSubmit,
  onCopyToNotes,
  onRetry,
  copiedId = null,
  inputRef,
  disabled = false,
  busy = false,
  voiceSlot = null,
  className = "",
}) {
  const scrollRef = useRef(null);
  const lastCountRef = useRef(items.length);

  /** 新訊息或串流中自動捲到底 */
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    const grew = items.length > lastCountRef.current;
    lastCountRef.current = items.length;
    const streaming = items[items.length - 1]?.status === "streaming";
    if (grew || streaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items, open]);

  const handleKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    // IME 組字中的 Enter 是選字確認，不可當送出
    if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    const q = String(draft || "").trim();
    if (!q || disabled) return;
    onSubmit?.(q);
  };

  const count = items.length;

  return (
    <div
      className={`shrink-0 border-t border-navy-800/8 bg-navy-800/[0.015] dark:border-slate-800/80 dark:bg-slate-950/40 ${className}`}
    >
      {/* Header：收折狀態下就只有這一條 */}
      <div className="flex items-center gap-2 px-4 md:px-5 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 min-w-0 flex-1 text-left group"
        >
          <span className="inline-flex items-center justify-center h-5 w-5 shrink-0 rounded-md bg-sky-100 text-sky-700 dark:bg-cyan-500/20 dark:text-cyan-300">
            <Bot className="h-3 w-3" strokeWidth={2.4} />
          </span>
          <span className="text-[11px] font-bold text-navy-600 group-hover:text-navy-800 transition-colors dark:text-slate-200 dark:group-hover:text-white">
            AI 助手
          </span>
          <span className="text-[11px] font-semibold text-navy-400 dark:text-slate-400">（{count} 則對話）</span>
          {busy && (
            <span className="text-[10px] font-semibold text-sky-600/80 animate-pulse dark:text-cyan-400">回覆中…</span>
          )}
          <span className="ml-1 text-navy-400 group-hover:text-navy-600 transition-colors dark:text-slate-400 dark:group-hover:text-slate-200">
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.4} />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
          </span>
        </button>
        {voiceSlot}
      </div>

      {open && (
        <div className="px-4 md:px-5 pb-2.5">
          {/* 對話歷史 */}
          <div
            ref={scrollRef}
            className="max-h-[220px] overflow-y-auto space-y-3 pr-0.5"
          >
            {count === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[11px] font-semibold text-navy-500 dark:text-slate-300">還沒有任何提問</p>
                <p className="mt-1 text-[10px] text-navy-400 leading-relaxed dark:text-slate-400">
                  在下方直接輸入，或在筆記中打 @ai 加問題後按 Enter。
                  <br />
                  回覆會出現在這裡，不會插進你的筆記正文。
                </p>
              </div>
            ) : (
              items.map((item) => (
                <ChatExchange
                  key={item.id}
                  item={item}
                  onCopyToNotes={onCopyToNotes}
                  onRetry={onRetry}
                  copiedId={copiedId}
                />
              ))
            )}
          </div>

          {/* 輸入列 */}
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-navy-800/10 bg-white px-3 py-2 focus-within:border-sky-300 transition-colors dark:bg-slate-900/90 dark:border-slate-700 dark:focus-within:border-cyan-500/50">
            <Bot className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-cyan-400" strokeWidth={2.2} />
            <input
              ref={inputRef}
              value={draft}
              disabled={disabled}
              onChange={(e) => onDraftChange?.(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? "唯讀狀態，無法提問" : "問 AI…（Enter 送出）"}
              className="flex-1 min-w-0 bg-transparent text-[13px] text-navy-800 placeholder-navy-300 caret-navy-800 focus:outline-none disabled:cursor-not-allowed dark:text-white dark:placeholder-slate-400 dark:caret-cyan-400"
            />
            <button
              type="button"
              disabled={disabled || !String(draft || "").trim()}
              onClick={() => onSubmit?.(String(draft).trim())}
              className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-lg text-[10px] font-bold text-white bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <CornerDownLeft className="h-3 w-3" strokeWidth={2.4} />
              送出
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
