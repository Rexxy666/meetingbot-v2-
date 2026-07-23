import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import { askLiveSilentAiStream } from "../lib/api.js";
import { buildSilentAskPayload } from "../lib/silentAiAsk.js";
import {
  appendTextToNotes,
  createId,
  extractAiItems,
  parseNotesDoc,
  serializeNotesDoc,
} from "../lib/notesDocument.js";
import MeetingNotesEditor from "./MeetingNotesEditor.jsx";
import AIConversationPanel from "./AIConversationPanel.jsx";

/* ════════════════════════════════════════════════════════════════════════
   方案 B：筆記正文 + 底部可收折 AI 對話面板

   ── 正文（上）：只有純文字段落，不再被藍色問答卡片切割
   ── 面板（下）：所有 AI 問答集中呈現，收折時只剩一條 header

   資料仍存在 notes doc 的 ai block，因此：
     • 會跟著 topicNotes 走既有的 socket 同步 → 全員看得到同一份對話
     • 會後 flattenNotesDoc 也能一併帶進 AI 摘要
   本元件只改變「呈現位置」，沒有新增儲存層。
   ════════════════════════════════════════════════════════════════════════ */

export default function MeetingNotesWithBottomAIPanel({
  value = "",
  onChange,
  disabled = false,
  placeholder = "",
  aiContext = null,
  syncOnStream = false,
  /** 底部面板右上角的語音鈕（由父層決定要不要給） */
  voiceSlot = null,
  editorClassName = "",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const inputRef = useRef(null);
  const abortMap = useRef(new Map());
  const valueRef = useRef(value);
  valueRef.current = value;

  const items = extractAiItems(value);
  const busy = items.some((i) => i.status === "thinking" || i.status === "streaming");

  /** 一有對話就自動展開；使用者仍可手動收合 */
  const prevCount = useRef(items.length);
  useEffect(() => {
    if (items.length > prevCount.current) setOpen(true);
    prevCount.current = items.length;
  }, [items.length]);

  const commit = useCallback(
    (nextDoc, { stream = false } = {}) => {
      const serialized = serializeNotesDoc(nextDoc);
      valueRef.current = serialized;
      onChange?.(serialized, { stream });
    },
    [onChange]
  );

  const updateAiBlock = useCallback(
    (aiId, patch, opts) => {
      const current = parseNotesDoc(valueRef.current);
      commit(
        {
          v: 1,
          blocks: current.blocks.map((b) =>
            b.id === aiId && b.type === "ai" ? { ...b, ...patch } : b
          ),
        },
        opts
      );
    },
    [commit]
  );

  const runAi = useCallback(
    async (aiId, question) => {
      if (!aiContext) return;
      const q = String(question || "").trim();
      if (!q) {
        updateAiBlock(aiId, {
          status: "error",
          answer: "請先輸入或說出問題",
        });
        return;
      }
      abortMap.current.get(aiId)?.abort?.();
      const ac = new AbortController();
      abortMap.current.set(aiId, ac);

      updateAiBlock(aiId, { status: "thinking", answer: "" }, { stream: true });

      const packed = buildSilentAskPayload({
        question: q,
        transcriptRows: aiContext.transcriptRows || [],
        title: aiContext.title || "",
        topic: aiContext.topic || "",
        mode: aiContext.mode || "enterprise",
      });

      try {
        const { answer } = await askLiveSilentAiStream(packed, {
          signal: ac.signal,
          onChunk: (partial) =>
            updateAiBlock(aiId, { status: "streaming", answer: partial }, { stream: syncOnStream }),
        });
        const full = String(answer || "").trim() || "AI 未回傳內容，請稍後再試。";
        updateAiBlock(aiId, { status: "done", answer: full });
        abortMap.current.delete(aiId);
      } catch (e) {
        if (ac.signal.aborted) return;
        updateAiBlock(aiId, { status: "error", answer: e?.message || "詢問失敗" });
        abortMap.current.delete(aiId);
      }
    },
    [aiContext, updateAiBlock, syncOnStream]
  );

  /** 送出提問：ai block 一律附加到 doc 尾端，正文順序不受影響 */
  const askAi = useCallback(
    (question) => {
      const q = String(question || "").trim();
      if (!q || disabled || !aiContext) return;

      const current = parseNotesDoc(valueRef.current);
      const aiBlock = {
        id: createId("a"),
        type: "ai",
        question: q,
        answer: "",
        status: "thinking",
        hidden: false,
      };
      commit({ v: 1, blocks: [...current.blocks, aiBlock] });
      setDraft("");
      setOpen(true);
      runAi(aiBlock.id, q);
    },
    [disabled, aiContext, commit, runAi]
  );

  const retryAi = useCallback(
    (item) => {
      const id = item?.id;
      const q = String(item?.question || "").trim();
      if (!id || !q) return;
      runAi(id, q);
    },
    [runAi]
  );

  /** 從 @ 選單觸發：展開面板並把游標移到面板輸入框 */
  const focusPanelInput = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  /** 一鍵把 AI 回覆插進筆記正文最後 */
  const copyToNotes = useCallback(
    (item) => {
      const text = String(item?.answer || "").trim();
      if (!text || disabled) return;
      const next = appendTextToNotes(valueRef.current, text);
      valueRef.current = next;
      onChange?.(next);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1600);
    },
    [disabled, onChange]
  );

  useEffect(
    () => () => {
      abortMap.current.forEach((ac) => ac.abort());
      abortMap.current.clear();
    },
    []
  );

  const voiceSlotInjected =
    voiceSlot && isValidElement(voiceSlot)
      ? cloneElement(voiceSlot, {
          onAsk: askAi,
          onVoiceDraftChange: (text) => {
            setOpen(true);
            setDraft(String(text || ""));
          },
          onListeningChange: (listening) => {
            if (listening) setOpen(true);
          },
        })
      : voiceSlot;

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* 上：乾淨的筆記正文 */}
      <div className={`flex-1 min-h-0 overflow-y-auto ${editorClassName}`}>
        <MeetingNotesEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          aiContext={aiContext}
          syncOnStream={syncOnStream}
          hideAiBlocks
          onRequestAsk={focusPanelInput}
          onAskFromNotes={askAi}
        />
      </div>

      {/* 下：可收折 AI 對話面板 */}
      <AIConversationPanel
        items={items}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={askAi}
        onCopyToNotes={copyToNotes}
        onRetry={retryAi}
        copiedId={copiedId}
        inputRef={inputRef}
        disabled={disabled || !aiContext}
        busy={busy}
        voiceSlot={voiceSlotInjected}
      />
    </div>
  );
}
