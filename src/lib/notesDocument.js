/**
 * 會中筆記文件模型（共用／私密皆可用）
 * 序列化字串可直接塞進 topicNotes 做即時同步；舊版純文字自動相容。
 */

const PREFIX = "@@MF1@@";

export function createId(prefix = "b") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function plainToDoc(text = "") {
  // 固定 id：純文字往返時不可每次 createId，否則 textarea remount 導致無法打字
  return {
    v: 1,
    blocks: [{ id: "t-main", type: "text", text: String(text || "") }],
  };
}

export function parseNotesDoc(raw) {
  const src = String(raw || "");
  if (!src.startsWith(PREFIX)) return plainToDoc(src);
  try {
    const parsed = JSON.parse(src.slice(PREFIX.length));
    if (!parsed || !Array.isArray(parsed.blocks)) return plainToDoc(src);
    return {
      v: 1,
      blocks: parsed.blocks.map((b) => {
        if (b?.type === "ai") {
          return {
            id: b.id || createId("a"),
            type: "ai",
            question: String(b.question || ""),
            answer: String(b.answer || ""),
            status: b.status || "done",
            hidden: Boolean(b.hidden),
          };
        }
        return {
          id: b?.id || createId("t"),
          type: "text",
          text: String(b?.text || ""),
        };
      }),
    };
  } catch {
    return plainToDoc(src);
  }
}

export function serializeNotesDoc(doc) {
  const blocks = Array.isArray(doc?.blocks) ? doc.blocks : plainToDoc("").blocks;
  // 若只有一個純文字區塊且無特殊內容，輸出舊版純文字，利於會後 AI 摘要相容
  if (
    blocks.length === 1 &&
    blocks[0].type === "text" &&
    !/@ai\b/i.test(blocks[0].text || "")
  ) {
    return blocks[0].text || "";
  }
  return PREFIX + JSON.stringify({ v: 1, blocks });
}

/** 會後整理用：壓成可讀純文字 */
export function flattenNotesDoc(raw) {
  const doc = parseNotesDoc(raw);
  return doc.blocks
    .map((b) => {
      if (b.type === "ai") {
        if (b.hidden) return `@ai ${b.question}`;
        return `@ai ${b.question}\n[AI] ${b.answer || ""}`.trim();
      }
      return b.text || "";
    })
    .filter((s) => String(s).trim())
    .join("\n\n");
}

/** 取出所有 AI 問答（底部對話面板用），順序即對話順序 */
export function extractAiItems(raw) {
  return parseNotesDoc(raw).blocks.filter((b) => b.type === "ai");
}

/**
 * 把一段文字附加到筆記正文最後一個文字區塊（「複製到筆記」用）。
 * 找不到文字區塊就補一個，確保內容不會遺失。
 */
export function appendTextToNotes(raw, text) {
  const addition = String(text || "").trim();
  if (!addition) return raw;
  const doc = parseNotesDoc(raw);
  const blocks = [...doc.blocks];

  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === "text") {
      const prev = blocks[i].text || "";
      blocks[i] = {
        ...blocks[i],
        text: prev.trim() ? `${prev.replace(/\s+$/, "")}\n${addition}` : addition,
      };
      return serializeNotesDoc({ v: 1, blocks });
    }
  }
  blocks.push({ id: createId("t"), type: "text", text: addition });
  return serializeNotesDoc({ v: 1, blocks });
}

export function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 將 @ai 標成高亮 HTML（供輸入框底層預覽）
 * 注意：不可用 padding / font-weight 改變字寬，否則會與透明 textarea 的 caret 錯位。
 */
export function highlightAtAiHtml(text) {
  return escapeHtml(text).replace(
    /(@ai)(\b)/gi,
    // \u200B 標示 token 邊界；display:inline + 零水平 padding，字寬與 textarea 一致
    '<span class="mf-at-ai-token" data-at-ai="1">\u200B$1\u200B</span>$2'
  );
}

const AT_AI_LINE = /^@ai\s+(.+)$/i;

export function extractAtAiLine(text, cursor) {
  const src = String(text || "");
  const pos = Math.max(0, Math.min(cursor ?? src.length, src.length));
  const before = src.slice(0, pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const afterNl = src.indexOf("\n", pos);
  const lineEnd = afterNl === -1 ? src.length : afterNl;
  const line = src.slice(lineStart, lineEnd).trim();
  const m = line.match(AT_AI_LINE);
  if (!m?.[1]?.trim()) return null;
  return {
    question: m[1].trim(),
    lineStart,
    lineEnd,
    before: src.slice(0, lineStart),
    after: src.slice(lineEnd).replace(/^\n/, ""),
  };
}

/**
 * 在文字區塊內觸發 @ai：拆成 before 文字 + ai 區塊 + after 文字
 */
export function splitTextBlockOnAtAi(block, hit) {
  const beforeText = hit.before;
  const afterText = hit.after;
  const aiBlock = {
    id: createId("a"),
    type: "ai",
    question: hit.question,
    answer: "",
    status: "thinking",
    hidden: false,
  };
  const out = [];
  if (beforeText.trim() || beforeText.includes("\n")) {
    out.push({ id: block.id, type: "text", text: beforeText.replace(/\n$/, "") });
  }
  out.push(aiBlock);
  if (afterText) {
    out.push({ id: createId("t"), type: "text", text: afterText });
  } else {
    out.push({ id: createId("t"), type: "text", text: "" });
  }
  return { blocks: out, aiId: aiBlock.id };
}
