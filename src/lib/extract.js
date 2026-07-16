// 規則式筆記解析：把會議中手打的口語筆記，實際拆成
// 靈感 / 決議 / 風險 三類，並擷取待辦事項（負責人、時程）。
// 這不是預先寫死的範例，而是真的讀你輸入的文字做處理。

const TIME_RE =
  /((?:今天|明天|後天|大後天)(?:中午前|早上|下午|傍晚|晚上|前)?|(?:下下週|下週|本週|這週)[一二三四五六日天]?|(?:週|禮拜|星期)[一二三四五六日天]|週末|月底|月初|中午前|下班前)|(\d{1,2}\s*[\/\-月]\s*\d{1,2}\s*日?)|(\d{1,2}\s*點)/;

const DECISION_RE = /(決定|確定|拍板|結論|決議|定案|鎖定|通過|採用|選定)/;
const RISK_RE = /(擔心|風險|可能來不及|來不及|恐|卡住|delay|延遲|問題是|隱憂|阻礙|沒把握|不確定能)/i;
const IDEA_RE = /(點子|靈感|想法|或許|也許|可以考慮|建議|不如|試試|提案)/;
const ACTION_RE = /(要|需|得|負責|聯繫|聯絡|確認|完成|處理|彙整|整理|跟進|安排|寄|發|準備|規劃|評估|回覆|提供|製作|更新|檢查|追蹤)/;

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);

function cleanLine(line) {
  return line.replace(/^[\s\-*#>·•\d.、]+/, "").trim();
}

function findWho(line, participants) {
  for (const p of participants) {
    if (p && line.includes(p)) return p;
  }
  // 後備：抓句首英文名字（例如 Sam 要…）
  const m = line.match(/^([A-Z][a-z]{1,15})\b/);
  return m ? m[1] : "";
}

function findWhen(line) {
  const m = line.match(TIME_RE);
  return m ? m[0] : "";
}

export function extractReview(notes, participants = []) {
  const lines = (notes || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((l) => l.length > 1);

  const ideas = [];
  const decisions = [];
  const risks = [];
  const actions = [];

  for (const line of lines) {
    if (RISK_RE.test(line)) risks.push(line);
    else if (DECISION_RE.test(line)) decisions.push(line);
    else if (IDEA_RE.test(line)) ideas.push(line);

    const who = findWho(line, participants);
    const when = findWhen(line);
    if (who || when || ACTION_RE.test(line)) {
      actions.push({ id: uid(), task: line, who, when, done: false });
    }
  }

  // 若完全沒抓到分類，至少把每行當作決議顯示，避免空白
  if (!ideas.length && !decisions.length && !risks.length && lines.length) {
    decisions.push(...lines);
  }

  return { ideas, decisions, risks, actions };
}
