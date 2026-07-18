import { GoogleGenAI } from "@google/genai";

/** 預設用官方建議後繼型號；可用 .env 的 GEMINI_MODEL 覆寫 */
const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];

function resolveGeminiModel() {
  const fromEnv = (process.env.GEMINI_MODEL || "").trim();
  return fromEnv || DEFAULT_GEMINI_MODEL;
}

const RESPONSE_SCHEMA_HINT = `{
  "ideas": ["靈感點子字串"],
  "decisions": ["決議字串"],
  "risks": ["風險字串"],
  "actionItems": [
    { "text": "由 AI 提出的可能需要做的事項（不要指定負責人）" }
  ]
}`;

const INSUFFICIENT_MSG =
  "偵測到本次會議口語筆記資訊量不足，無法完整萃取。建議補充討論重點、決策與待辦後再整理。";

const INSUFFICIENT_PAYLOAD = {
  ideas: [INSUFFICIENT_MSG],
  decisions: [
    "偵測到本次會議口語筆記資訊量不足，無法完整萃取決議事項。請補上達成共識的結論後再試。",
  ],
  risks: ["因筆記資訊量不足，暫無法評估潛在風險。"],
  actionItems: [],
};

const MOCK_BY_MODE = {
  enterprise: {
    ideas: [
      "將跨部門對齊會議改為雙週非同步摘要，節省約 40% 工時成本。",
      "以里程碑驗收取代週報堆積，讓決策節點更可追蹤。",
    ],
    decisions: [
      "本季優先交付核心路徑功能，次要需求列入下一個 sprint backlog。",
      "對外溝通統一由專案窗口彙整，避免多線平行承諾造成成本失控。",
    ],
    risks: [
      "依賴方交付時程未鎖定，可能壓縮整合測試窗口並推高加班成本。",
      "需求變更未走變更流程，易造成重工與預算偏差。",
    ],
    actionItems: [
      { text: "產出本週風險與依賴清單，並標註影響工時" },
      { text: "與利害關係人確認驗收標準與截止日期" },
    ],
  },
  student: {
    ideas: [
      "報告開頭直接放 30 秒「我們到底在幹嘛」短片，教授比較會醒。",
      "分工表改成公開可看，誰在混分一目瞭然，別再靠感覺吵架。",
    ],
    decisions: [
      "這週五前一定要定題目與大綱，不然週末又會集體消失。",
      "投影片統一模板，禁止每人一種字體地獄。",
    ],
    risks: [
      "有人白天裝忙、晚上只滑 Threads，報告進度永遠卡在『我再想一下』。",
      "最後一夜才開始整併投影片，鐵定變成誰都看不懂的拼貼地獄。",
    ],
    actionItems: [
      { text: "今晚前交出各自負責的段落草稿（不能只交大綱）" },
      { text: "把大家的草稿整合成能上台的版本" },
    ],
  },
};

/** 字數過少、重複亂鍵、無實質內容 → 視為無效筆記 */
export function isNotesInsufficient(notes) {
  const raw = String(notes || "").trim();
  if (!raw || raw === "（空白筆記）") return true;
  if (raw.length < 24) return true;
  // 同一字元狂按：dddd / aaaa
  if (/^(.)\1{2,}$/u.test(raw)) return true;
  // 幾乎只有 1～2 種字元
  const compact = raw.replace(/\s+/g, "");
  const unique = new Set([...compact]);
  if (compact.length >= 4 && unique.size <= 2) return true;
  // 沒有中文且幾乎沒有空白／標點的短英文字串
  const hasCjk = /[\u4e00-\u9fff]/.test(raw);
  const wordCount = (raw.match(/[A-Za-z]{2,}/g) || []).length;
  if (!hasCjk && wordCount <= 1 && raw.length < 40) return true;
  return false;
}

function systemInstructionFor(mode) {
  const shared = [
    "【精簡萃取・最高優先・強制遵守】",
    "只做「點到為止」的精華萃取：高度貼近左側／原文口語筆記，禁止過度包裝、禁止商務廢話、禁止無中生有。",
    "反例（禁止）：把「把手寫稿完成」擴寫成「評估導入手寫辨識技術以提升數位化流程…」之類冗長腦補。",
    "正例（允許）：整理成「完成手寫稿」或「把手寫稿完成」這類短句即可。",
    "ideas / decisions / risks / actionItems 每條盡量 ≤ 30 個中文字，能短則短；沒寫到的主題不要發明。",
    "若筆記只提到 1～2 件具體事，就只輸出對應的少數條目，寧缺勿濫。",
    "",
    "【有效性判斷】",
    "若筆記過短、空白、或明顯是無意義亂打（例如 dd、dddd、asdf、只有單一字元重複），",
    "絕對禁止把亂字串當成專案名稱、產品名、決議或靈感來腦補。",
    "此時 ideas 與 decisions 溫和回傳「資訊量不足、無法完整萃取」引導句；risks 說明暫無法評估；actionItems 必須為 []。",
    "",
    "【負責人規則】",
    "actionItems 只能包含 text 欄位，禁止輸出 assignee、who、負責人、姓名。",
    "待辦由與會者事後自行認領／由上級指派，你不可預先分配。",
    "",
    "只輸出符合指定 JSON Schema 的純 JSON，不要 markdown、不要多餘說明。",
  ];

  if (mode === "student") {
    return [
      "你是一位直白的大學學長，把分組口語筆記整理成短句摘要。",
      "語氣白話即可，但一樣禁止腦補沒寫過的東西。",
      "風險僅在筆記有跡象時才寫（混分／擺爛等），不要硬掰人名。",
      ...shared,
    ].join("\n");
  }
  return [
    "你是會議紀要助理：做結構化精簡萃取，不是顧問簡報撰稿人。",
    "語氣客觀精煉；禁止行銷腔、禁止堆砌工時／成本套話（除非筆記原文有提）。",
    ...shared,
  ].join("\n");
}

function buildUserPrompt({ notes, participants, title, mode }) {
  const people =
    Array.isArray(participants) && participants.length
      ? participants.join("、")
      : "（未提供）";
  return [
    `會議標題：${title || "未命名會議"}（僅供參考；若筆記無效，勿用標題硬凹出決議）`,
    `應用模式：${mode === "student" ? "學生模式" : "企業模式"}`,
    `與會者：${people}（僅供語境；請勿在 actionItems 寫入負責人）`,
    "",
    "請根據以下會議原始口語筆記，做「精簡、貼近原文」的結構化萃取（禁止過度腦補）。",
    "回傳 JSON 必須嚴格符合下列 Schema（欄位名稱不可更改；actionItems 只有 text）：",
    RESPONSE_SCHEMA_HINT,
    "",
    "—— 會議原始口語筆記開始 ——",
    (notes || "").trim() || "（空白筆記）",
    "—— 會議原始口語筆記結束 ——",
  ].join("\n");
}

function normalizePayload(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const ideas = Array.isArray(data?.ideas) ? data.ideas.map(String).filter(Boolean) : [];
  const decisions = Array.isArray(data?.decisions)
    ? data.decisions.map(String).filter(Boolean)
    : [];
  const risks = Array.isArray(data?.risks) ? data.risks.map(String).filter(Boolean) : [];
  const actionItems = Array.isArray(data?.actionItems)
    ? data.actionItems
        .map((it) => ({
          text: String(it?.text || it?.task || "").trim(),
        }))
        .filter((it) => it.text)
    : [];
  return { ideas, decisions, risks, actionItems };
}

function mockPayload(mode) {
  return MOCK_BY_MODE[mode === "student" ? "student" : "enterprise"];
}

function extractResponseText(response) {
  if (typeof response?.text === "string" && response.text.trim()) return response.text;
  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p) => p?.text || "").join("");
  }
  return "";
}

/**
 * 會後整理：優先用後端 GEMINI_API_KEY 呼叫 Gemini；無 Key 或失敗則降級 Mock。
 * API Key 只存在於伺服器環境變數，不會回傳給前端。
 */
export async function summarizeMeetingNotes({
  notes = "",
  participants = [],
  title = "",
  mode = "enterprise",
} = {}) {
  const safeMode = mode === "student" ? "student" : "enterprise";

  // 無效筆記：直接回傳引導句，避免 Gemini 把「dd」腦補成專案名
  if (isNotesInsufficient(notes)) {
    return {
      ...INSUFFICIENT_PAYLOAD,
      source: "insufficient",
      message: "筆記資訊量不足，已略過 Gemini 並回傳引導提示",
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      ...mockPayload(safeMode),
      source: "mock",
      message: "後端未設定 GEMINI_API_KEY，已使用雙模式 Mock 資料",
    };
  }

  const preferred = resolveGeminiModel();
  const modelsToTry = [preferred, ...FALLBACK_MODELS.filter((m) => m !== preferred)];
  const ai = new GoogleGenAI({ apiKey });
  const contents = buildUserPrompt({
    notes,
    participants,
    title,
    mode: safeMode,
  });
  const config = {
    responseMimeType: "application/json",
    systemInstruction: systemInstructionFor(safeMode),
  };

  let lastError = null;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({ model, contents, config });
      const text = extractResponseText(response);
      const payload = normalizePayload(text);
      return {
        ...payload,
        source: "gemini",
        model,
        message: `Gemini（${model}）分析完成`,
      };
    } catch (err) {
      lastError = err;
      console.error(`[geminiService] model=${model}`, err?.message || err);
    }
  }

  return {
    ...mockPayload(safeMode),
    source: "mock",
    message: `Gemini 請求失敗，已降級 Mock：${lastError?.message || "未知錯誤"}`,
  };
}

export function geminiConfigured() {
  return Boolean((process.env.GEMINI_API_KEY || "").trim());
}
