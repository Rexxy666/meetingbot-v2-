import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

/**
 * AI 語音提問：不另開 Web Speech（避免與右側逐字稿搶麥克風）。
 * 改為擷取會議 STT 的 interim / 最新定稿語句，填入輸入框並自動送出。
 */
export default function FloatingAIAssistantButton({
  transcriptRows = [],
  /** 會議 STT 當下 interim（即時半成品） */
  liveInterim = "",
  /** 會議 STT 是否正在聽 */
  sttActive = false,
  /** 把辨識文字寫進面板「問 AI…」輸入框 */
  onVoiceDraftChange,
  /** 送出問題（走面板 askAi） */
  onAsk,
  /** 開始聽時可展開面板等 */
  onListeningChange,
  className = "",
}) {
  const [listening, setListening] = useState(false);
  const [captured, setCaptured] = useState("");
  const [hint, setHint] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | listening | sending

  const baselineLenRef = useRef(0);
  const baselineAtRef = useRef(0);
  const pressTimerRef = useRef(null);

  const rowsRef = useRef(transcriptRows);
  rowsRef.current = transcriptRows;
  const interimRef = useRef(liveInterim);
  interimRef.current = liveInterim;

  const collectQuestion = useCallback(() => {
    const rows = Array.isArray(rowsRef.current) ? rowsRef.current : [];
    const baseline = baselineLenRef.current;
    const sincePress = rows
      .slice(Math.max(0, baseline))
      .map((r) => String(r?.text || "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    if (sincePress) return sincePress;

    const interim = String(interimRef.current || "").trim();
    if (interim) return interim;

    // 寬鬆 fallback：按住期間若 STT 已先定稿，取近 20 秒內最新一句
    const startedAt = baselineAtRef.current || 0;
    const recent = [...rows].reverse().find((r) => {
      const text = String(r?.text || "").trim();
      if (!text) return false;
      const at = Number(r?.at);
      if (Number.isFinite(at) && startedAt) {
        return at >= startedAt - 1500 && at <= Date.now() + 500;
      }
      return true;
    });
    if (recent) return String(recent.text || "").trim();

    // 再退一步：只要有最新一句有效文字就當成問題（不要求問號／喚醒詞）
    const last = [...rows].reverse().find((r) => String(r?.text || "").trim());
    const lastText = String(last?.text || "").trim();
    const lastAt = Number(last?.at);
    if (lastText && Number.isFinite(lastAt) && Date.now() - lastAt < 20000) {
      return lastText;
    }
    return "";
  }, []);

  const beginListen = useCallback(() => {
    const rows = Array.isArray(rowsRef.current) ? rowsRef.current : [];
    baselineLenRef.current = rows.length;
    baselineAtRef.current = Date.now();
    setHint("");
    setCaptured("");
    setListening(true);
    setPhase("listening");
    onListeningChange?.(true);
    onVoiceDraftChange?.("");
  }, [onListeningChange, onVoiceDraftChange]);

  const finishListen = useCallback(() => {
    setListening(false);
    onListeningChange?.(false);
    const q = collectQuestion();
    setCaptured(q);
    if (!q) {
      setPhase("idle");
      setHint(
        sttActive
          ? "沒聽到問題，請再說一次後再放開麥克風"
          : "請先開啟麥克風，讓右側逐字稿開始收音後再問 AI"
      );
      return;
    }
    onVoiceDraftChange?.(q);
    setPhase("sending");
    setHint("已送出問題，AI 思考中…");
    onAsk?.(q);
    window.setTimeout(() => {
      setPhase("idle");
      setCaptured("");
    }, 1200);
  }, [collectQuestion, onAsk, onListeningChange, onVoiceDraftChange, sttActive]);

  const onPressStart = (e) => {
    e.preventDefault();
    if (phase === "sending") return;
    clearTimeout(pressTimerRef.current);
    beginListen();
  };

  const onPressEnd = (e) => {
    e.preventDefault();
    if (!listening && phase !== "listening") return;
    clearTimeout(pressTimerRef.current);
    // 稍等讓 STT 把最後 interim 定稿進 transcript
    pressTimerRef.current = setTimeout(() => finishListen(), 380);
  };

  // 聆聽中：把會議 STT interim／新定稿即時灌進輸入框
  useEffect(() => {
    if (!listening) return;
    const rows = Array.isArray(transcriptRows) ? transcriptRows : [];
    const sincePress = rows
      .slice(Math.max(0, baselineLenRef.current))
      .map((r) => String(r?.text || "").trim())
      .filter(Boolean)
      .join(" ");
    const live = String(liveInterim || "").trim();
    const text = [sincePress, live].filter(Boolean).join(" ").trim();
    setCaptured(text);
    if (text) onVoiceDraftChange?.(text);
  }, [listening, liveInterim, transcriptRows, onVoiceDraftChange]);

  useEffect(
    () => () => {
      clearTimeout(pressTimerRef.current);
    },
    []
  );

  const showBubble = listening || phase === "listening" || (phase === "sending" && captured);
  const liveHeard = (captured || (listening ? liveInterim : "") || "").trim();

  return (
    <div className={`flex flex-col items-end gap-2 ${className}`}>
      {showBubble && (
        <div className="pointer-events-none w-[min(72vw,16rem)] rounded-xl border border-mint-200 bg-navy-900/95 text-white shadow-lg px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                listening ? "bg-mint-400 animate-pulse" : "bg-mint-500"
              }`}
            />
            <span className="text-[10px] font-bold text-mint-300">
              {listening
                ? sttActive
                  ? "聆聽中（共用逐字稿）…"
                  : "等待逐字稿收音…"
                : phase === "sending"
                ? "已送出"
                : "辨識完成"}
            </span>
          </div>
          <p className="text-xs leading-relaxed min-h-[1rem] break-words whitespace-pre-wrap">
            {liveHeard || (
              <span className="text-white/40">
                {sttActive ? "說出問題…" : "請先開麥啟用右側轉寫"}
              </span>
            )}
          </p>
        </div>
      )}

      {hint && (
        <p className="max-w-[14rem] text-[10px] font-semibold text-navy-600 bg-white/95 border border-navy-800/10 rounded-lg px-2 py-1 shadow-sm">
          {hint}
        </p>
      )}

      <button
        type="button"
        disabled={phase === "sending"}
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerCancel={onPressEnd}
        onPointerLeave={() => {
          if (listening) onPressEnd({ preventDefault() {} });
        }}
        title="按住語音提問（沿用會議逐字稿，不另開麥克風）"
        aria-pressed={listening}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition-all active:scale-95 select-none touch-none ${
          listening
            ? "bg-coral-500 border-coral-400 text-white scale-105"
            : phase === "sending"
            ? "bg-navy-300 border-navy-200 text-white cursor-wait"
            : "bg-navy-800 border-navy-700 text-white hover:bg-navy-700"
        }`}
      >
        {listening ? (
          <>
            <span className="absolute inset-0 rounded-full bg-coral-400/50 animate-ping" aria-hidden />
            <Square className="relative h-4 w-4" strokeWidth={2.4} fill="currentColor" />
          </>
        ) : (
          <Mic className="h-4 w-4" strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}
