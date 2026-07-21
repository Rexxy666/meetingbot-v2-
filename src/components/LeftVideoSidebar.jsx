import { Users } from "lucide-react";

/**
 * 左側視訊側欄：上＝視訊＋媒體控制列（永不被遮蓋），下＝與會名單（限高可滾）
 */
export default function LeftVideoSidebar({
  videoPanel,
  roster,
  joinedCount = 0,
  rosterTotal = 0,
  className = "",
}) {
  return (
    <div
      className={`h-full min-h-0 flex flex-col overflow-hidden rounded-2xl border border-navy-800/10 bg-navy-900 shadow-card ${className}`}
    >
      {/* 上：視訊區 — 吃剩餘高度；內部 VideoPanel 以 flex 把控制列釘在底部 */}
      <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
        {videoPanel}
      </div>

      {/* 下：與會人員 — 限高，overflow 自滾，絕不壓到上方控制列 */}
      <div className="shrink-0 max-h-[200px] flex flex-col border-t border-slate-700/70 bg-navy-950/40">
        <div className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="h-3.5 w-3.5 shrink-0 text-mint-300" strokeWidth={2.2} />
            <p className="text-[11px] font-bold text-white/85 truncate">與會人員</p>
          </div>
          <p className="text-[10px] font-semibold text-mint-300 shrink-0">
            {joinedCount}/{rosterTotal} 已加入
          </p>
        </div>
        <div className="min-h-0 max-h-[148px] overflow-y-auto overflow-x-hidden px-2.5 pb-2.5">
          {roster}
        </div>
      </div>
    </div>
  );
}
