import MeetingCodeChip from "./MeetingCodeChip.jsx";

/**
 * 會議室深色控制列（會議模式下為頁面最頂視覺錨點）
 * children：右側操作區（權限、邀請、在線人數等）
 */
export default function MeetingHeader({
  title,
  meetingCode,
  clockLabel = null,
  clockUrgent = false,
  onTitleClick,
  children,
  className = "",
  onMouseEnter,
  onMouseLeave,
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`bg-navy-800 text-white rounded-2xl px-3 md:px-5 py-2.5 md:py-3.5 shadow-card-hover flex items-center gap-1.5 md:gap-3 ${className}`}
    >
      <span className="text-base md:text-lg shrink-0" aria-hidden />

      <button
        type="button"
        onClick={onTitleClick}
        title={title}
        className="md:hidden font-bold text-[13px] leading-tight text-left max-w-[120px] truncate shrink min-w-0 active:opacity-80"
      >
        {title}
      </button>

      <p
        className="hidden md:block font-bold text-base truncate min-w-0 flex-1"
        title={title}
      >
        {title}
      </p>

      <div className="ml-auto flex items-center gap-1.5 md:gap-2 shrink-0">
        {clockLabel != null && (
          <span
            className={`md:hidden inline-flex items-center gap-1.5 text-[11px] font-black tabular-nums px-2.5 py-1.5 rounded-full ${
              clockUrgent ? "bg-coral-400/25 text-coral-100" : "bg-white/15 text-white"
            }`}
            title="議程剩餘時間"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                clockUrgent ? "bg-coral-300" : "bg-mint-300"
              } animate-pulse`}
            />
            {clockLabel}
          </span>
        )}

        {meetingCode != null && <MeetingCodeChip code={meetingCode} />}

        {children}
      </div>
    </div>
  );
}
