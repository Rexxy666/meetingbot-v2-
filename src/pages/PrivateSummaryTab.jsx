import { useMemo, useState } from "react";
import {
  Lock,
  Globe,
  KeyRound,
  PenLine,
  ListChecks,
  Sparkles,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  Circle,
} from "lucide-react";
import { flattenNotesDoc } from "../lib/notesDocument.js";

/* ════════════════════════════════════════════════════════════════════════
   會後「我的康乃爾摘要」私密分頁
   ── SummaryTabs      : [ 全員 AI 摘要 ] / [ 我的康乃爾摘要 ] 切換殼層
   ── PrivateSummaryTab: 康乃爾筆記回顧 + AI 個人化洞察（私密 Action / 學習建議）

   ⚠ 隱私：本頁所有內容僅該使用者可見，不得寫入共享的 meeting 物件。
   ════════════════════════════════════════════════════════════════════════ */

/* ── Mock Data（未接真實資料時展示用）───────────────────────────────── */
export const MOCK_PRIVATE = {
  cornell: {
    cue: "關鍵字：滿額折扣、組合包\n? 毛利門檻誰定的\n★ 要問 Lacy 試算邏輯",
    notes:
      "討論不要單品降價，改滿額折扣。\n滯銷品綁熱銷做組合包，限時四週。\n主管提到毛利率要回到 3% 以上。\n我覺得通路端可能會反彈，但沒講出來。",
    summary:
      "這場的重點是「別再用降價換業績」。我要先弄懂毛利門檻怎麼算，下次才有底氣提通路的疑慮。",
  },
  privateActions: [
    { id: "p1", text: "私下跟 Lacy 要毛利試算表，搞懂門檻怎麼推導", done: false },
    { id: "p2", text: "整理通路可能反彈的三個理由，下次會議前提出", done: false },
    { id: "p3", text: "補讀公司過去兩季的折扣成效報告", done: true },
  ],
  insights: [
    {
      type: "learning",
      title: "補齊「毛利結構」基礎",
      body: "你在筆記中兩次對毛利門檻打問號。建議先弄懂變動成本與貢獻邊際的關係，下次討論定價時才能提出具體反論。",
    },
    {
      type: "decision",
      title: "把「沒講出口的疑慮」轉成提案",
      body: "你記到「通路可能反彈但沒講出來」。這類未表達的風險最容易在事後爆炸，建議整理成一頁備忘，於下次同步會前先送給主管。",
    },
  ],
};

/* ── 小元件 ─────────────────────────────────────────────────────────── */
function PrivateBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 dark:text-violet-200 bg-violet-100 dark:bg-violet-500/15 border border-violet-200 dark:border-violet-400/25 px-2 py-0.5 rounded-full">
      <Lock className="h-3 w-3" strokeWidth={2.4} />
      僅自己可見
    </span>
  );
}

function Panel({ icon: Icon, title, hint, children, tone = "violet" }) {
  const tones = {
    violet: "text-violet-500 dark:text-violet-300",
    blue: "text-blue-500 dark:text-blue-300",
    emerald: "text-emerald-500 dark:text-emerald-300",
  };
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#131d2f] shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 shrink-0 ${tones[tone]}`} strokeWidth={2.2} />
        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        {hint && <span className="text-[11px] text-slate-400 truncate">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function NoteBlock({ icon: Icon, label, text, empty }) {
  const has = String(text || "").trim().length > 0;
  return (
    <div className="rounded-xl border border-violet-200/60 dark:border-violet-400/20 bg-violet-50/40 dark:bg-violet-500/[0.06] p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="h-3.5 w-3.5 text-violet-500 dark:text-violet-300" strokeWidth={2.2} />
        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</span>
      </div>
      {has ? (
        <pre className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
          {text}
        </pre>
      ) : (
        <p className="text-[11px] text-slate-400">{empty}</p>
      )}
    </div>
  );
}

/* ── 私密分頁本體 ───────────────────────────────────────────────────── */
export default function PrivateSummaryTab({
  cornell = MOCK_PRIVATE.cornell,
  privateActions = MOCK_PRIVATE.privateActions,
  insights = MOCK_PRIVATE.insights,
  loading = false,
  message = "",
  onRetry,
  onToggleAction,
}) {
  const [localActions, setLocalActions] = useState(privateActions);

  const actions = onToggleAction ? privateActions : localActions;
  const toggle = (id) => {
    if (onToggleAction) return onToggleAction(id);
    setLocalActions((prev) => prev.map((a) => (a.id === id ? { ...a, done: !a.done } : a)));
  };

  const doneCount = useMemo(() => actions.filter((a) => a.done).length, [actions]);

  const hasCornell =
    flattenNotesDoc(cornell?.cue || "").trim() ||
    flattenNotesDoc(cornell?.notes || "").trim() ||
    flattenNotesDoc(cornell?.summary || "").trim();

  return (
    <div className="space-y-4">
      {/* 隱私聲明條 */}
      <div className="flex items-center gap-2 rounded-xl border border-violet-200 dark:border-violet-400/25 bg-violet-50 dark:bg-violet-500/10 px-4 py-2.5">
        <ShieldCheck className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" strokeWidth={2.2} />
        <p className="text-[11px] text-violet-700 dark:text-violet-200 leading-relaxed">
          這一頁只有你看得到。你的康乃爾筆記與下列 AI 建議<b>不會</b>同步給其他與會者，也不會出現在全員摘要中。
        </p>
      </div>

      {/* 康乃爾筆記回顧 */}
      <Panel icon={PenLine} title="我的康乃爾筆記" hint="會議中的即時紀錄">
        {!hasCornell ? (
          <p className="text-[11px] text-slate-400 py-4 text-center">
            這場會議你沒有留下私密筆記。下次可在會議室切到「個人私密筆記」分頁記錄。
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,0.34fr)_1fr] gap-3">
              <NoteBlock
                icon={KeyRound}
                label="線索欄"
                text={flattenNotesDoc(cornell.cue)}
                empty="沒有記錄關鍵字或疑問。"
              />
              <NoteBlock
                icon={PenLine}
                label="筆記欄"
                text={flattenNotesDoc(cornell.notes)}
                empty="沒有隨手筆記。"
              />
            </div>
            <NoteBlock
              icon={ListChecks}
              label="摘要欄"
              text={flattenNotesDoc(cornell.summary)}
              empty="沒有寫下總結。"
            />
          </div>
        )}
      </Panel>

      {/* AI 個人化增強 */}
      <Panel
        icon={Sparkles}
        title="AI 個人化洞察"
        hint="讀取逐字稿 + 你的線索欄產出"
        tone="blue"
      >
        {(message || onRetry) && !loading && (
          <div className="flex items-center justify-between gap-3 mb-3 -mt-1">
            <p className="text-[11px] text-slate-400 leading-relaxed">{message}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 text-[11px] font-bold text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-400/25 px-2.5 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
              >
                重新分析
              </button>
            )}
          </div>
        )}
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 私密 Action Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  私密 Action Items
                </p>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {doneCount}/{actions.length} 完成
                </span>
              </div>
              {actions.length === 0 ? (
                <p className="text-[11px] text-slate-400">AI 沒有從你的筆記中找到個人待辦。</p>
              ) : (
                <ul className="space-y-2">
                  {actions.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-start gap-2.5 rounded-xl border border-gray-100 dark:border-white/10 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(a.id)}
                        aria-label={a.done ? "標為未完成" : "標為完成"}
                        className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
                          a.done
                            ? "bg-violet-500 border-violet-500 text-white"
                            : "border-slate-300 dark:border-white/40 hover:border-violet-400"
                        }`}
                      >
                        {a.done ? (
                          <CheckCircle2 className="h-3 w-3" strokeWidth={3} />
                        ) : (
                          <Circle className="h-2 w-2 opacity-0" />
                        )}
                      </button>
                      <span
                        className={`text-sm leading-snug ${
                          a.done
                            ? "line-through text-slate-400"
                            : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {a.text}
                      </span>
                      <PrivateBadge />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 延伸學習 / 決策建議 */}
            <div>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">
                個人延伸學習 / 決策建議
              </p>
              <div className="space-y-2">
                {insights.length === 0 && (
                  <p className="text-[11px] text-slate-400">
                    目前沒有可提供的個人建議。多寫一點線索欄的疑問，AI 才抓得到你卡在哪。
                  </p>
                )}
                {insights.map((ins, i) => {
                  const isLearning = ins.type === "learning";
                  const Icon = isLearning ? GraduationCap : Sparkles;
                  return (
                    <div
                      key={i}
                      className={`rounded-xl border p-3 ${
                        isLearning
                          ? "border-blue-100 dark:border-blue-500/20 bg-blue-50/60 dark:bg-blue-500/10"
                          : "border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/60 dark:bg-emerald-500/10"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isLearning
                              ? "text-blue-500 dark:text-blue-300"
                              : "text-emerald-500 dark:text-emerald-300"
                          }`}
                          strokeWidth={2.2}
                        />
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{ins.title}</p>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            isLearning
                              ? "text-blue-600 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-500/15"
                              : "text-emerald-600 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-500/15"
                          }`}
                        >
                          {isLearning ? "延伸學習" : "決策建議"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{ins.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ── 會後頁面的分頁殼層：全員摘要 / 我的康乃爾摘要 ──────────────────── */
export function SummaryTabs({
  children,
  privateProps = {},
  defaultTab = "public",
  onTabChange,
  className = "",
}) {
  const [tab, setTab] = useState(defaultTab);
  const select = (id) => {
    setTab(id);
    onTabChange?.(id);
  };

  const TABS = [
    { id: "public", label: "全員 AI 摘要", Icon: Globe },
    { id: "private", label: "我的康乃爾摘要", Icon: Lock },
  ];

  return (
    <div className={className}>
      <div className="flex items-center gap-1 mb-4">
        {TABS.map((t) => {
          const active = tab === t.id;
          const isPrivate = t.id === "private";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors
                ${
                  active
                    ? isPrivate
                      ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200"
                      : "bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-100"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                }`}
            >
              <t.Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "public" ? children : <PrivateSummaryTab {...privateProps} />}
    </div>
  );
}
