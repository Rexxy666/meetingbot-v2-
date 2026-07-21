import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { askLiveSilentAi } from "../lib/api.js";
import {
  buildSilentAskPayload,
  typewriterStream,
} from "../lib/silentAiAsk.js";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function VoiceWave({ active }) {
  return (
    <div className="flex items-end gap-0.5 h-4" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-0.5 rounded-full bg-mint-400 ${active ? "animate-pulse" : "opacity-40"}`}
          style={{
            height: active ? `${6 + ((i * 4) % 10)}px` : "4px",
            animationDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * 共用筆記卡片內嵌語音 Ask AI（僅麥克風 Icon）
 * 定位由父層 `relative` + `absolute bottom-3 right-3` 控制。
 */
export default function FloatingAIAssistantButton({
  transcriptRows = [],
  title = "",
  topic = "",
  mode = "enterprise",
  onInsertShared,
  className = "",
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalQuestion, setFinalQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const finalBufRef = useRef("");
  const abortRef = useRef(null);
  const pressTimerRef = useRef(null);

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("此瀏覽器不支援語音辨識");
      setPhase("error");
      return false;
    }
    setError("");
    finalBufRef.current = "";
    setInterim("");
    setFinalQuestion("");

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "zh-TW";
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let interimText = "";
      let finals = finalBufRef.current;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result[0]?.transcript || "").trim();
        if (!text) continue;
        if (result.isFinal) {
          finals = `${finals} ${text}`.trim();
          finalBufRef.current = finals;
          setFinalQuestion(finals);
          setInterim("");
        } else {
          interimText += text;
        }
      }
      if (interimText) setInterim(interimText);
    };

    rec.onerror = (event) => {
      if (event?.error === "not-allowed") {
        setError("麥克風權限被拒");
        setPhase("error");
        setListening(false);
      }
    };

    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
      setPhase("listening");
      return true;
    } catch {
      recognitionRef.current = null;
      setError("無法啟動語音辨識");
      setPhase("error");
      return false;
    }
  }, []);

  const runAsk = useCallback(
    async (questionText) => {
      const q = String(questionText || "").trim();
      if (!q) {
        setPhase("idle");
        setError("沒有辨識到問題");
        return;
      }

      abortRef.current?.abort?.();
      const ac = new AbortController();
      abortRef.current = ac;

      const packed = buildSilentAskPayload({
        question: q,
        transcriptRows,
        title,
        topic,
        mode,
      });
      setPhase("thinking");

      const meta = {
        question: q,
        meetingTranscript: packed.meetingTranscript,
        silent: true,
        outputMode: "shared",
      };
      onInsertShared?.("", { ...meta, phase: "start" });

      try {
        let answerText = "";
        try {
          const res = await askLiveSilentAi(packed);
          answerText = String(res?.answer || "").trim();
        } catch {
          answerText = `（離線示意）針對「${q}」：建議先對齊目標與下一步，並寫進共編筆記。`;
        }
        if (!answerText) answerText = "AI 未回傳內容，請稍後再試。";

        setPhase("streaming");

        await typewriterStream(answerText, {
          cps: 42,
          signal: ac.signal,
          onChunk: (partial) => {
            onInsertShared?.(partial, { ...meta, phase: "chunk" });
          },
          onDone: (full) => {
            setPhase("done");
            onInsertShared?.(full, { ...meta, phase: "done" });
          },
        });
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e?.message || "問答失敗");
        setPhase("error");
      }
    },
    [transcriptRows, title, topic, mode, onInsertShared]
  );

  const finishListening = useCallback(() => {
    stopRecognition();
    const q = (finalBufRef.current || interim || "").trim();
    setFinalQuestion(q);
    setInterim("");
    if (q) runAsk(q);
    else {
      setPhase("idle");
      setError("沒有辨識到問題");
    }
  }, [stopRecognition, interim, runAsk]);

  const onPressStart = (e) => {
    e.preventDefault();
    if (phase === "thinking" || phase === "streaming") return;
    clearTimeout(pressTimerRef.current);
    startRecognition();
  };

  const onPressEnd = (e) => {
    e.preventDefault();
    if (!listening && phase !== "listening") return;
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => finishListening(), 280);
  };

  useEffect(
    () => () => {
      stopRecognition();
      abortRef.current?.abort?.();
      clearTimeout(pressTimerRef.current);
    },
    [stopRecognition]
  );

  const showBubble = listening || phase === "listening" || interim;
  const liveHeard = (finalQuestion || interim).trim();
  const busy = phase === "thinking" || phase === "streaming";

  return (
    <div className={`flex flex-col items-end gap-2 ${className}`}>
      {showBubble && (
        <div className="pointer-events-none w-[min(72vw,16rem)] rounded-xl border border-mint-200 bg-navy-900/95 text-white shadow-lg px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <VoiceWave active={listening} />
            <span className="text-[10px] font-bold text-mint-300">
              {listening ? "聆聽中…" : "辨識完成"}
            </span>
          </div>
          <p className="text-xs leading-relaxed min-h-[1rem]">
            {liveHeard || <span className="text-white/40">說出問題…</span>}
          </p>
        </div>
      )}

      {error && (
        <p className="max-w-[12rem] text-[10px] font-semibold text-coral-600 bg-coral-50 border border-coral-100 rounded-lg px-2 py-1">
          {error}
        </p>
      )}

      {busy && (
        <p className="text-[10px] font-semibold text-navy-500 bg-white/95 px-2 py-0.5 rounded-full shadow-sm border border-navy-800/8">
          {phase === "thinking" ? "AI 思考中…" : "寫入筆記中…"}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerCancel={onPressEnd}
        onPointerLeave={() => {
          if (listening) onPressEnd({ preventDefault() {} });
        }}
        title="按住問 AI（語音→文字，無播報）"
        aria-pressed={listening}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full border shadow-md transition-all active:scale-95 select-none touch-none ${
          listening
            ? "bg-coral-500 border-coral-400 text-white scale-105"
            : busy
            ? "bg-navy-300 border-navy-200 text-white cursor-wait"
            : "bg-navy-800 border-navy-700 text-white hover:bg-navy-700"
        }`}
      >
        {listening ? (
          <Square className="h-4 w-4" strokeWidth={2.4} fill="currentColor" />
        ) : (
          <Mic className="h-4 w-4" strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}
