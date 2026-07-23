import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bot } from "lucide-react";
import { askLiveSilentAiStream } from "../lib/api.js";
import { buildSilentAskPayload } from "../lib/silentAiAsk.js";
import {
  createId,
  extractAtAiLine,
  highlightAtAiHtml,
  parseNotesDoc,
  serializeNotesDoc,
  splitTextBlockOnAtAi,
} from "../lib/notesDocument.js";
import InlineAIBubble, { AskAiComposer, AtAiPromptRow } from "./InlineAIBubble.jsx";
import { clampMenuPosition, getCaretCoordinates } from "../lib/caretCoords.js";

const MENU_WIDTH = 232;
const MENU_HEIGHT = 104;

const MENTIONS = [
  {
    id: "ai",
    label: "@ai",
    hint: "詢問 AI 助手（Enter 送出，回覆插在下方）",
    /** ask = 選取後轉成藍色提問卡，而不是插入純文字 */
    action: "ask",
  },
];

/** 游標前是否正在輸入 @mention（export 供單元測試） */
export function getAtMentionState(text, cursor) {
  const before = String(text || "").slice(0, cursor ?? 0);
  const m = before.match(/(?:^|[\s\n])@([^\s@]*)$/);
  if (!m) return null;
  const query = m[1] || "";
  return { query, atIndex: before.length - query.length - 1, end: cursor };
}

function filterMentions(query) {
  const q = String(query || "").toLowerCase();
  if (!q) return MENTIONS;
  return MENTIONS.filter(
    (item) => item.id.startsWith(q) || item.label.toLowerCase().includes(q)
  );
}

/**
 * 帶 @ai 高亮 + 輸入 @ 時跳出 mention 快捷選單
 */
function AtAiTextBlock({
  value,
  onChange,
  onAtAiSubmit,
  onOpenAsk,
  disabled = false,
  placeholder = "",
  enableMention = false,
}) {
  const taRef = useRef(null);
  const wrapRef = useRef(null);
  const backdropRef = useRef(null);
  const hasText = Boolean(value);
  const [mention, setMention] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [activeIdx, setActiveIdx] = useState(0);
  const pendingCaret = useRef(null);
  /** IME 組字中：期間所有 Enter 都屬於輸入法，不可攔截 */
  const composingRef = useRef(false);

  const closeMention = () => {
    setMention(null);
    setActiveIdx(0);
  };

  const syncScroll = () => {
    const ta = taRef.current;
    const bg = backdropRef.current;
    if (!ta || !bg) return;
    bg.scrollTop = ta.scrollTop;
    bg.scrollLeft = ta.scrollLeft;
  };

  const syncMentionFromValue = (text, cursor) => {
    if (!enableMention || disabled) {
      closeMention();
      return;
    }
    const state = getAtMentionState(text, cursor);
    if (!state) {
      closeMention();
      return;
    }
    const items = filterMentions(state.query);
    if (!items.length) {
      closeMention();
      return;
    }
    setMention((prev) => {
      if (!prev) setActiveIdx(0);
      return { ...state, items };
    });
  };

  const applyMention = (item) => {
    if (!mention) return;
    const start = mention.atIndex;
    const end = mention.end;

    if (item.action === "ask") {
      // 把使用者打的 "@" 或 "@a" 從筆記中移除，改開藍色提問卡
      const next = `${value.slice(0, start)}${value.slice(end)}`;
      onChange?.(next);
      closeMention();
      onOpenAsk?.();
      return;
    }

    const insert = item.insert || `${item.label} `;
    const next = `${value.slice(0, start)}${insert}${value.slice(end)}`;
    pendingCaret.current = start + insert.length;
    onChange?.(next);
    closeMention();
  };

  useLayoutEffect(() => {
    syncScroll();
  }, [value]);

  useLayoutEffect(() => {
    if (pendingCaret.current == null || !taRef.current) return;
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    taRef.current.focus();
    taRef.current.setSelectionRange(pos, pos);
  }, [value]);

  /** 依游標實際座標定位下拉選單（座標相對 textarea，即相對 wrapper） */
  useLayoutEffect(() => {
    if (!mention || !taRef.current || !wrapRef.current) return;
    const ta = taRef.current;
    const caret = getCaretCoordinates(ta, mention.end);
    const { top, left } = clampMenuPosition({
      top: caret.top + caret.height + 4,
      left: caret.left,
      menuWidth: MENU_WIDTH,
      menuHeight: MENU_HEIGHT,
      containerWidth: wrapRef.current.clientWidth,
      containerHeight: wrapRef.current.clientHeight,
    });
    setMenuPos({ top, left });
  }, [mention, value]);

  const handleChange = (e) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    onChange?.(text);
    syncMentionFromValue(text, cursor);
  };

  const isComposing = (e) =>
    composingRef.current || e.nativeEvent?.isComposing || e.keyCode === 229;

  const handleKeyDown = (e) => {
    // 中文選字期間，Enter／方向鍵都屬於輸入法，一律放行
    if (isComposing(e)) return;

    const items = mention?.items || [];
    if (items.length) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMention();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        applyMention(items[Math.min(activeIdx, items.length - 1)]);
        return;
      }
    }

    // 相容路徑：手動打完整的「@ai 問題」再按 Enter 也能送出
    if (e.key !== "Enter" || e.shiftKey || disabled) return;
    const el = e.target;
    const hit = extractAtAiLine(el.value, el.selectionStart);
    if (!hit?.question) return;
    e.preventDefault();
    closeMention();
    onAtAiSubmit?.(hit);
  };

  const handleSelect = () => {
    const el = taRef.current;
    if (!el) return;
    syncMentionFromValue(el.value, el.selectionStart);
  };

  return (
    <div ref={wrapRef} className="relative min-h-[4.5rem]">
      {hasText ? (
        <pre
          ref={backdropRef}
          aria-hidden
          className="mf-notes-layer absolute inset-0 overflow-hidden text-navy-800 dark:text-slate-100 pointer-events-none"
          dangerouslySetInnerHTML={{
            __html: highlightAtAiHtml(value) + (value.endsWith("\n") ? "\u200B" : ""),
          }}
        />
      ) : null}
      <textarea
        ref={taRef}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          composingRef.current = false;
          // 選字完成後才重新判斷是否仍在 @mention 情境
          syncMentionFromValue(e.target.value, e.target.selectionStart);
        }}
        onClick={handleSelect}
        onKeyUp={handleSelect}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        className={`mf-notes-layer relative w-full min-h-[4.5rem] resize-y bg-transparent caret-navy-800 dark:caret-cyan-400 placeholder-navy-300 dark:placeholder-slate-400 focus:outline-none ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
        style={
          hasText
            ? { color: "transparent", WebkitTextFillColor: "transparent" }
            : undefined
        }
      />

      {mention ? (
        <div
          role="listbox"
          aria-label="快捷提及"
          className="absolute z-30 rounded-xl border border-blue-200 bg-white shadow-xl ring-1 ring-blue-100/80 overflow-hidden fade-in dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-800"
          style={{ top: menuPos.top, left: menuPos.left, width: MENU_WIDTH }}
        >
          <p className="px-2.5 py-1.5 text-[10px] font-semibold text-navy-400 border-b border-navy-800/5">
            快捷提及
          </p>
          {mention.items.map((item, i) => {
            const active = i === Math.min(activeIdx, mention.items.length - 1);
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-start gap-2 px-2.5 py-2 text-left transition-colors ${
                  active ? "bg-blue-50" : "hover:bg-blue-50/60"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(item);
                }}
              >
                <span className="mt-0.5 h-6 w-6 shrink-0 rounded-lg bg-blue-500 text-white inline-flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5" strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-navy-800">
                    {item.label}
                    <span className="ml-1 font-semibold text-navy-400">詢問 AI 助手</span>
                  </span>
                  <span className="block text-[10px] text-navy-400 leading-snug">{item.hint}</span>
                </span>
              </button>
            );
          })}
          <p className="px-2.5 py-1 text-[9px] text-navy-300 border-t border-navy-800/5">
            ↑↓ 選擇 · Enter / Tab 確定 · Esc 關閉
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 共用／私密皆可用的筆記編輯器：文字區塊 + @ai 內嵌回覆卡
 */
export default function MeetingNotesEditor({
  value = "",
  onChange,
  disabled = false,
  placeholder = "",
  aiContext = null,
  className = "",
  syncOnStream = false,
  /** 方案 B：AI 問答改由底部面板呈現，正文只留純文字 */
  hideAiBlocks = false,
  /** 從 @ 選單選到 @ai —— 通知父層 focus 底部面板輸入框 */
  onRequestAsk,
  /** 正文手打「@ai 問題」+ Enter —— 交給父層送進底部面板 */
  onAskFromNotes,
}) {
  const doc = parseNotesDoc(value);
  const abortMap = useRef(new Map());
  const valueRef = useRef(value);
  valueRef.current = value;

  /**
   * 草稿提問卡：{ blockId, text }
   * 刻意只放本機 state —— 半成品問題不該同步給其他與會者，
   * 送出的瞬間才寫進 doc 變成正式的 ai block。
   */
  const [draftAsk, setDraftAsk] = useState(null);

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
      const blocks = current.blocks.map((b) =>
        b.id === aiId && b.type === "ai" ? { ...b, ...patch } : b
      );
      commit({ v: 1, blocks }, opts);
    },
    [commit]
  );

  const runAi = useCallback(
    async (aiId, question) => {
      if (!aiContext) return;
      const q = String(question || "").trim();
      if (!q) {
        updateAiBlock(aiId, { status: "error", answer: "請先輸入或說出問題" });
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
          onChunk: (partial) => {
            updateAiBlock(
              aiId,
              { status: "streaming", answer: partial },
              { stream: syncOnStream }
            );
          },
        });
        const full = String(answer || "").trim() || "AI 未回傳內容，請稍後再試。";
        updateAiBlock(aiId, { status: "done", answer: full });
        abortMap.current.delete(aiId);
      } catch (e) {
        if (ac.signal.aborted) return;
        updateAiBlock(aiId, {
          status: "error",
          answer: e?.message || "詢問失敗",
        });
        abortMap.current.delete(aiId);
      }
    },
    [aiContext, updateAiBlock, syncOnStream]
  );

  const handleAtAiSubmit = (blockId, hit) => {
    if (disabled || !aiContext) return;
    const current = parseNotesDoc(valueRef.current);
    const idx = current.blocks.findIndex((b) => b.id === blockId);
    if (idx < 0) return;
    const block = current.blocks[idx];
    if (block.type !== "text") return;

    /* 方案 B：把「@ai 問題」整行從正文移除，問題交給底部面板，
       正文因此維持乾淨的純文字段落。 */
    if (hideAiBlocks) {
      const cleaned = `${hit.before}${hit.after}`.replace(/\n{3,}/g, "\n\n");
      commit({
        v: 1,
        blocks: current.blocks.map((b) =>
          b.id === blockId ? { ...b, text: cleaned } : b
        ),
      });
      onAskFromNotes?.(hit.question);
      return;
    }

    const { blocks: split, aiId } = splitTextBlockOnAtAi(block, hit);
    const nextBlocks = [
      ...current.blocks.slice(0, idx),
      ...split,
      ...current.blocks.slice(idx + 1),
    ];
    commit({ v: 1, blocks: nextBlocks });
    runAi(aiId, hit.question);
  };

  /** 藍色提問卡送出：在該文字區塊後插入 ai block，並立刻開始詢問 */
  const handleDraftSubmit = (question) => {
    if (disabled || !aiContext || !draftAsk) return;
    const current = parseNotesDoc(valueRef.current);
    const idx = current.blocks.findIndex((b) => b.id === draftAsk.blockId);
    const insertAt = idx < 0 ? current.blocks.length : idx + 1;

    const aiBlock = {
      id: createId("a"),
      type: "ai",
      question,
      answer: "",
      status: "thinking",
      hidden: false,
    };
    const nextBlocks = [
      ...current.blocks.slice(0, insertAt),
      aiBlock,
      ...current.blocks.slice(insertAt),
    ];
    // 問答卡後面補一個空文字區塊，讓使用者可以接著寫
    if (nextBlocks[insertAt + 1]?.type !== "text") {
      nextBlocks.splice(insertAt + 1, 0, { id: createId("t"), type: "text", text: "" });
    }

    setDraftAsk(null);
    commit({ v: 1, blocks: nextBlocks });
    runAi(aiBlock.id, question);
  };

  const handleTextChange = (blockId, text) => {
    const current = parseNotesDoc(valueRef.current);
    commit({
      v: 1,
      blocks: current.blocks.map((b) => (b.id === blockId ? { ...b, text } : b)),
    });
  };

  useEffect(
    () => () => {
      abortMap.current.forEach((ac) => ac.abort());
      abortMap.current.clear();
    },
    []
  );

  const allBlocks =
    doc.blocks.length === 0
      ? [{ id: createId("t"), type: "text", text: "" }]
      : doc.blocks;

  /* 方案 B：正文只渲染文字區塊，AI 問答交給底部面板。
     若過濾後一個區塊都不剩，補一個空文字區塊，避免無處可打字。 */
  const blocks = hideAiBlocks
    ? (() => {
        const texts = allBlocks.filter((b) => b.type === "text");
        return texts.length ? texts : [{ id: createId("t"), type: "text", text: "" }];
      })()
    : allBlocks;

  return (
    <div className={`flex flex-col gap-3 min-h-0 ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === "ai") {
          return (
            <div key={block.id} className="space-y-1.5 min-w-0 w-full">
              <AtAiPromptRow question={block.question} />
              <InlineAIBubble
                question={block.question}
                answer={block.answer}
                status={block.status}
                hidden={block.hidden}
                onToggleHide={() =>
                  updateAiBlock(block.id, { hidden: !block.hidden })
                }
              />
            </div>
          );
        }

        return (
          <div key={block.id}>
            <AtAiTextBlock
              value={block.text || ""}
              disabled={disabled}
              enableMention={Boolean(aiContext) && !disabled}
              placeholder={
                i === 0
                  ? placeholder ||
                    (aiContext
                      ? "寫下討論重點。輸入 @ 叫出快捷選單，可詢問 AI。"
                      : "寫下討論重點…")
                  : "繼續輸入…"
              }
              onChange={(text) => handleTextChange(block.id, text)}
              onAtAiSubmit={(hit) => handleAtAiSubmit(block.id, hit)}
              onOpenAsk={() =>
                hideAiBlocks
                  ? onRequestAsk?.()
                  : setDraftAsk({ blockId: block.id, text: "" })
              }
            />

            {!hideAiBlocks && draftAsk?.blockId === block.id ? (
              <AskAiComposer
                value={draftAsk.text}
                onChange={(text) => setDraftAsk((d) => (d ? { ...d, text } : d))}
                onSubmit={handleDraftSubmit}
                onCancel={() => setDraftAsk(null)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** 供語音 FAB 等外部插入一筆 AI 問答區塊 */
export function appendAiBlockToNotes(raw, { question, answer = "", status = "thinking" }) {
  const doc = parseNotesDoc(raw);
  const ai = {
    id: createId("a"),
    type: "ai",
    question: String(question || "").trim() || "語音提問",
    answer: String(answer || ""),
    status,
    hidden: false,
  };
  const blocks = [...doc.blocks];
  const last = blocks[blocks.length - 1];
  if (last?.type === "text" && !(last.text || "").trim()) {
    blocks.splice(blocks.length - 1, 0, ai);
  } else {
    blocks.push(ai);
    blocks.push({ id: createId("t"), type: "text", text: "" });
  }
  return { serialized: serializeNotesDoc({ v: 1, blocks }), aiId: ai.id };
}

export function patchAiBlockInNotes(raw, aiId, patch) {
  const doc = parseNotesDoc(raw);
  return serializeNotesDoc({
    v: 1,
    blocks: doc.blocks.map((b) => (b.id === aiId && b.type === "ai" ? { ...b, ...patch } : b)),
  });
}
