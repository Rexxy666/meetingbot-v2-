import { Pause, Play } from "lucide-react";

function formatClock(seconds) {
  const s = Math.max(0, seconds | 0);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * 右下角精簡 Time Boxing 卡：只保留計時、當前議題、下一個／暫停。
 * 不放痛點、不放議程清單、不產生內部捲軸。
 */
export default function AgendaTimerCard({
  seconds = 0,
  topic = "",
  agendaCount = 1,
  agendaIndex = 0,
  budgetMinutes = null,
  paused = false,
  onTogglePause,
  onNextAgenda,
  className = "",
}) {
  const low = seconds <= 60;
  const atLast = agendaIndex >= Math.max(0, agendaCount - 1);
  const budget =
    budgetMinutes != null && Number.isFinite(Number(budgetMinutes))
      ? Math.max(1, Math.round(Number(budgetMinutes)))
      : null;

  return (
    <div
      className={`bg-white border border-navy-800/8 rounded-3xl p-5 shadow-card ${className}`}
    >
      <p className="text-[11px] font-bold tracking-wide text-mint-600">
        Time Boxing · {agendaIndex + 1}/{agendaCount}
      </p>

      <p
        className={`mt-2 text-4xl font-black tabular-nums leading-none tracking-tight ${
          low ? "text-coral-500" : "text-navy-800"
        }`}
      >
        {formatClock(seconds)}
      </p>
      <p className="mt-1 text-xs font-semibold text-navy-400">
        {paused ? "已暫停" : budget != null ? `剩餘時間 · 預算 ${budget} 分` : "剩餘時間"}
      </p>

      <div className="mt-4 min-w-0">
        <p className="text-xs font-semibold text-navy-400">當前議程</p>
        <p className="mt-1 text-base font-black text-navy-800 leading-snug break-words">
          {topic || "會議討論"}
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onNextAgenda}
          disabled={atLast}
          className="w-full text-sm font-bold text-white bg-navy-800 rounded-xl py-2.5 hover:bg-navy-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          下一個議程 →
        </button>
        <button
          type="button"
          onClick={onTogglePause}
          className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-navy-600 border border-navy-800/10 rounded-xl py-2.5 hover:bg-navy-800/[0.03] transition-colors"
        >
          {paused ? (
            <>
              <Play className="h-3.5 w-3.5" strokeWidth={2.4} />
              繼續計時
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" strokeWidth={2.4} />
              暫停計時
            </>
          )}
        </button>
      </div>
    </div>
  );
}
