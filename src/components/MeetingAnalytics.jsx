import { useMemo } from "react";
import {
  CheckCircle2,
  Target,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Lightbulb,
  Layers,
  ListOrdered,
  PieChart,
  Rocket,
  Zap,
} from "lucide-react";
import { hasAssignees } from "../lib/assignees.js";
import { normalizeRisks, RISK_LEVEL_META } from "../lib/risk.js";
import {
  buildActionCategories,
  buildDecisionPriority,
  buildPainResolution,
  PRIORITY_META,
  STATUS_META,
} from "../lib/meetingOutcomeCharts.js";

/* ════════════════════════════════════════════════════════════════════════
   會後分析儀表板（結果導向 Executive Summary）
   ── 痛點解決率 / 決議優先級清單 / 待辦領域結構
   ════════════════════════════════════════════════════════════════════════ */

function Card({ className = "", children }) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#131d2f] shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function CardTitle({ icon: Icon, title, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 flex items-center justify-center">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{title}</h3>
          {sub && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function InsightBullet({ children }) {
  return (
    <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 px-3.5 py-3">
      <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" strokeWidth={2.2} />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{children}</p>
    </div>
  );
}

function EmptyHint({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/10 px-5 py-8 text-center">
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{children}</p>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, unit, tone, hint }) {
  const tones = {
    blue: "text-blue-500 bg-blue-50 dark:bg-blue-500/10",
    emerald: "text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
    amber: "text-amber-500 bg-amber-50 dark:bg-amber-500/10",
    violet: "text-violet-500 bg-violet-50 dark:bg-violet-500/10",
  };
  return (
    <Card className="p-5 md:p-6">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-600 dark:text-slate-400">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5 min-w-0">
        <span className="text-3xl font-black text-slate-800 dark:text-slate-100 tabular-nums truncate leading-none">
          {value}
        </span>
        {unit && <span className="text-sm font-bold text-slate-600 dark:text-slate-400 shrink-0">{unit}</span>}
      </p>
      {hint && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">{hint}</p>
      )}
    </Card>
  );
}

function Donut({ segments, size = 160, thickness = 20 }) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={thickness}
        className="stroke-slate-100 dark:stroke-white/10"
      />
      {segments.map((s) => {
        const len = (s.value / 100) * circ;
        const el = (
          <circle
            key={s.name}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-acc}
            strokeLinecap="butt"
          />
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}

/* ── 1. 痛點解決率：堆疊進度條 ───────────────────────────────────────── */
function PainResolutionChart({ data }) {
  const { total, segments, insight, fromMock, items } = data;
  const rate = total ? Math.round(((data.resolved || 0) / total) * 100) : 0;

  return (
    <Card className="p-6 h-full flex flex-col">
      <CardTitle
        icon={Layers}
        title="痛點解決率與轉化狀態"
        sub={fromMock ? "示意資料 · 補痛點後自動計算" : `共 ${total} 項痛點`}
        right={
          <span className="shrink-0 text-sm font-black tabular-nums text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-300 px-2.5 py-1 rounded-full">
            {rate}%
          </span>
        }
      />

      {total === 0 ? (
        <EmptyHint>本場沒有登錄痛點，無法計算解決率。</EmptyHint>
      ) : (
        <>
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            {segments
              .filter((s) => s.count > 0)
              .map((s) => (
                <div
                  key={s.key}
                  style={{ width: `${s.pct}%`, background: s.color }}
                  title={`${s.label} ${s.count} 項`}
                  className="transition-all"
                />
              ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {segments.map((s) => (
              <div
                key={s.key}
                className="rounded-xl border border-gray-100 dark:border-white/10 px-3 py-2.5 text-center"
              >
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center justify-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">
                  {s.count}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{s.pct}%</p>
              </div>
            ))}
          </div>

          <ul className="mt-4 space-y-2 max-h-40 overflow-y-auto">
            {(items || []).slice(0, 6).map((item, i) => {
              const meta = STATUS_META[item.status] || STATUS_META.unresolved;
              return (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                >
                  <span className={`shrink-0 mt-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${meta.soft}`}>
                    {meta.label}
                  </span>
                  <span className="min-w-0">{item.pain}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-auto">
        <InsightBullet>{insight}</InsightBullet>
      </div>
    </Card>
  );
}

/* ── 2. 決議優先級排序卡片清單 ───────────────────────────────────────── */
const PRIORITY_ICONS = {
  P0: Rocket,
  P1: Target,
  P2: Zap,
};

function PriorityDecisionList({ data }) {
  const { points, groups, insight, fromMock, priorityMeta = PRIORITY_META } = data;
  const order = ["P0", "P1", "P2"];

  return (
    <Card className="p-6 h-full flex flex-col">
      <CardTitle
        icon={ListOrdered}
        title="決議執行優先級"
        sub={fromMock ? "示意排序 · 依語意推估效益／難度" : "依效益與難度自動分級，先做最划算的"}
      />

      {!points?.length ? (
        <EmptyHint>本場尚未產出決議，無法排定優先級。</EmptyHint>
      ) : (
        <div className="space-y-5">
          {order.map((key) => {
            const meta = priorityMeta[key] || PRIORITY_META[key];
            const items = groups?.[key] || [];
            if (!items.length) return null;
            const Icon = PRIORITY_ICONS[key] || ListOrdered;
            return (
              <section key={key}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full ${meta.badge}`}>
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
                    {key}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold ${meta.accent}`}>{meta.title}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{meta.hint}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-xs font-bold tabular-nums text-slate-500">
                    {items.length} 項
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={`rounded-xl border px-4 py-3.5 ${meta.soft}`}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`shrink-0 mt-0.5 text-[11px] font-black px-2 py-0.5 rounded-md ${meta.badge}`}
                        >
                          {key}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                            {item.text}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-white/80 dark:bg-white/10 border border-black/5 dark:border-white/10 text-slate-700 dark:text-slate-200">
                              效益：{item.impactLevel}
                              <span aria-hidden>{item.impactLevel === "高" ? "🟢" : "⚪"}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-white/80 dark:bg-white/10 border border-black/5 dark:border-white/10 text-slate-700 dark:text-slate-200">
                              難度：{item.effortLevel}
                              <span aria-hidden>{item.effortLevel === "高" ? "🟠" : "⚪"}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-auto">
        <InsightBullet>{insight}</InsightBullet>
      </div>
    </Card>
  );
}

/* ── 3. 待辦領域結構 Donut ───────────────────────────────────────────── */
function ActionCategoryDonut({ data }) {
  const { segments, total, insight, fromMock } = data;
  const top = segments[0];

  return (
    <Card className="p-6 h-full flex flex-col">
      <CardTitle
        icon={PieChart}
        title="待辦事項領域結構"
        sub={fromMock ? "示意分類 · 新增待辦後自動歸類" : `共 ${total} 項 Action Items`}
      />

      {!segments.length ? (
        <EmptyHint>尚無待辦可分類。</EmptyHint>
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative shrink-0">
            <Donut segments={segments} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black text-slate-800 dark:text-slate-100 tabular-nums">
                {top?.value ?? 0}%
              </span>
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 max-w-[88px] truncate text-center">
                {top?.name || "—"}
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1 w-full space-y-2.5">
            {segments.map((s) => (
              <div key={s.name} className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-base font-semibold text-slate-700 dark:text-slate-200 flex-1 truncate">
                  {s.name}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums shrink-0">
                  {s.count} 項
                </span>
                <span className="text-base font-black tabular-nums text-slate-800 dark:text-slate-100 w-12 text-right">
                  {s.value}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto">
        <InsightBullet>{insight}</InsightBullet>
      </div>
    </Card>
  );
}

export default function MeetingAnalytics({ meeting, review, actions = [], durationMin = 0 }) {
  const decisions = review?.decisions || [];
  const risks = review?.risks || [];
  const pains = meeting?.pains || [];

  const painResolution = useMemo(
    () => buildPainResolution({ pains, decisions, actions }),
    [pains, decisions, actions]
  );

  const decisionPriority = useMemo(() => buildDecisionPriority(decisions), [decisions]);

  const actionCategories = useMemo(() => buildActionCategories(actions), [actions]);

  const riskRows = useMemo(() => normalizeRisks(risks), [risks]);

  const assigned = actions.filter((a) => hasAssignees(a)).length;
  const claimRate = actions.length ? Math.round((assigned / actions.length) * 100) : 0;
  const solveRate = painResolution.total
    ? Math.round((painResolution.resolved / painResolution.total) * 100)
    : 0;
  const quickWins = decisionPriority.points.filter((p) => p.priority === "P0").length;

  const keyTakeaway =
    decisions[0] ||
    (meeting?.goals?.length ? `本場聚焦：${meeting.goals.join("、")}` : "") ||
    "本場尚未產出明確決議，建議補記結論再結案。";

  return (
    <section className="mt-6 space-y-5">
      {/* Hero */}
      <div className="rounded-2xl p-6 md:p-8 bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 shadow-lg shadow-blue-500/20">
        <p className="text-sm font-bold text-blue-100/95 tracking-wide">KEY TAKEAWAY · 核心結論</p>
        <p className="mt-3 text-2xl md:text-3xl font-bold text-white leading-relaxed">{keyTakeaway}</p>
        {decisions.length > 1 && (
          <p className="mt-3 text-sm text-blue-100/90 leading-relaxed">
            另有 {decisions.length - 1} 項決議，詳見下方優先級矩陣。
          </p>
        )}
      </div>

      {/* Outcome KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={Target}
          label="痛點解決率"
          value={solveRate}
          unit="%"
          tone="emerald"
          hint={
            painResolution.total
              ? `${painResolution.resolved}/${painResolution.total} 項已形成決議`
              : "尚無痛點資料"
          }
        />
        <Kpi
          icon={CheckCircle2}
          label="決議產出"
          value={decisions.length || decisionPriority.points.length}
          unit="項"
          tone="blue"
          hint={decisions.length ? "已形成明確結論" : "示意／待補決議"}
        />
        <Kpi
          icon={TrendingUp}
          label="P0 優先執行"
          value={quickWins}
          unit="項"
          tone="violet"
          hint="高效益、低難度，建議立刻啟動"
        />
        <Kpi
          icon={Layers}
          label="待辦認領率"
          value={claimRate}
          unit="%"
          tone="amber"
          hint={actions.length ? `${assigned}/${actions.length} 項已有負責人` : "尚無待辦"}
        />
      </div>

      {/* 三大結果圖表 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <PainResolutionChart data={painResolution} />
        <PriorityDecisionList data={decisionPriority} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <ActionCategoryDonut data={actionCategories} />

        <Card className="p-6">
          <CardTitle
            icon={ShieldAlert}
            title="風險與預防對策"
            sub={riskRows.length ? `${riskRows.length} 項風險 · 依嚴重度排序` : "AI 自動評估"}
          />
          {riskRows.length === 0 ? (
            <EmptyHint>本場未偵測到風險敘述。</EmptyHint>
          ) : (
            <ul className="space-y-3.5">
              {riskRows.slice(0, 4).map((r, i) => {
                const meta = RISK_LEVEL_META[r.level];
                return (
                  <li
                    key={i}
                    className="relative overflow-hidden rounded-xl border border-gray-100 dark:border-white/10 pl-4 pr-4 py-4"
                  >
                    <span className={`absolute left-0 inset-y-0 w-1.5 ${meta.bar}`} />
                    <div className="flex items-start gap-3">
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <p className="text-base font-semibold text-slate-800 dark:text-slate-100 flex-1 leading-relaxed">
                        {r.text}
                      </p>
                    </div>
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 px-3.5 py-3">
                      <Lightbulb
                        className="h-4 w-4 mt-0.5 shrink-0 text-blue-500 dark:text-blue-300"
                        strokeWidth={2.2}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                          建議對策{r.suggested ? "（系統建議）" : ""}
                        </p>
                        <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed mt-1">
                          {r.mitigation}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <InsightBullet>
            {riskRows.length
              ? "風險依語意推估嚴重度；請把高風險項轉成有負責人的追蹤待辦。"
              : "未偵測到風險敘述，仍建議會後複核關鍵依賴與時程。"}
          </InsightBullet>
        </Card>
      </div>

      <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400 px-1 leading-relaxed">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={2} />
        圖表以「問題解決與決策品質」為核心：痛點轉化、決議優先序、待辦領域重心皆由本場會議資料推算；不足時顯示示意結構。
        {durationMin ? ` 本場實際歷時約 ${durationMin} 分鐘。` : ""}
      </p>
    </section>
  );
}
