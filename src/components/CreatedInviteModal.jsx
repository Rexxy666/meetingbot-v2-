import { useEffect, useState } from "react";
import { CalendarDays, Check, Copy, KeyRound, Link2 } from "lucide-react";

/** 顯示用：882913 → 882 913 */
export function formatMeetingCode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  if (digits.length === 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  if (digits.length === 8) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits || "—— ———";
}

/** 產品感短網址（分享用）；首頁「輸入代碼」可解析 join 路徑 */
export function shortJoinUrl(code) {
  const digits = String(code || "").replace(/\D/g, "");
  return `https://meetflow.io/join/${digits}`;
}

export function formatScheduledLabel(ts, durationMin) {
  if (!ts) return durationMin ? `${durationMin} 分鐘` : "時間未定";
  try {
    const d = new Date(ts);
    const when = d.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return durationMin ? `${when} · ${durationMin} 分鐘` : when;
  } catch {
    return durationMin ? `${durationMin} 分鐘` : "時間未定";
  }
}

/**
 * 會議建立成功：
 * - invite：立即開會（可進大廳）
 * - scheduled：預約排程成功（複製邀請後回看板）
 */
export default function CreatedInviteModal({
  meetingCode,
  title,
  attendeeCount = 0,
  variant = "invite",
  scheduledAt = null,
  durationMin = null,
  onEnterLive,
  onDone,
}) {
  const isScheduled = variant === "scheduled";
  const code = String(meetingCode || "").replace(/\D/g, "") || "000000";
  const prettyCode = formatMeetingCode(code);
  const shareUrl = shortJoinUrl(code);
  const scheduleLabel = formatScheduledLabel(scheduledAt, durationMin);

  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!copiedLink && !copiedCode && !copiedAll) return undefined;
    const t = setTimeout(() => {
      setCopiedLink(false);
      setCopiedCode(false);
      setCopiedAll(false);
    }, 2000);
    return () => clearTimeout(t);
  }, [copiedLink, copiedCode, copiedAll]);

  const copyText = async (text, which) => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "link") setCopiedLink(true);
      if (which === "code") setCopiedCode(true);
      if (which === "all") setCopiedAll(true);
    } catch {
      /* ignore */
    }
  };

  const inviteBundle = [
    title ? `會議：${title}` : null,
    isScheduled ? `時間：${scheduleLabel}` : null,
    `會議代碼：${prettyCode}`,
    `加入連結：${shareUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-4">
      <div
        className="absolute inset-0 bg-navy-900/35 backdrop-blur-md dark:bg-black/55"
        onClick={onDone}
      />

      <div className="relative w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-6 shadow-[0_20px_60px_rgba(15,27,45,0.12)] backdrop-blur-xl fade-in dark:border-slate-600/40 dark:bg-slate-900/90">
        <p
          className={`text-[11px] font-semibold inline-flex px-2.5 py-1 rounded-full border ${
            isScheduled
              ? "text-sky-700 bg-sky-50 border-sky-100 dark:text-sky-300 dark:bg-sky-950/40 dark:border-sky-500/25"
              : "text-mint-700 bg-mint-50 border-mint-100 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-500/25"
          }`}
        >
          {isScheduled ? "會議排程成功" : "會議已建立"}
        </p>

        <h3 className="mt-3 text-xl font-black tracking-tight text-navy-800 dark:text-white">
          {isScheduled ? "預約會議已排入行程" : "邀請與會者加入"}
        </h3>
        <p className="mt-1 text-sm text-navy-500 truncate dark:text-slate-300">{title}</p>

        {isScheduled ? (
          <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-navy-600 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1 dark:text-slate-200 dark:bg-slate-800 dark:border-slate-600">
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
            {scheduleLabel}
          </div>
        ) : attendeeCount > 0 ? (
          <p className="mt-2 text-[12px] font-semibold text-navy-400 dark:text-slate-400">
            已選定 {attendeeCount} 位與會者 · 進入會議室後將自動發送邀請
          </p>
        ) : null}

        <p className="mt-4 text-[13px] leading-relaxed text-navy-400 dark:text-slate-400">
          {isScheduled
            ? "可先分享代碼與連結給與會者；到點前可從看板進入大廳準備。"
            : "你可以將連結分享給與會者，或讓他們在首頁輸入 6 碼代碼直接加入。"}
        </p>

        <div className="mt-5 rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white shadow-sm px-4 py-4 dark:border-slate-600 dark:from-slate-800/80 dark:to-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-navy-400 dark:text-slate-400">
              <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
              會議代碼
            </div>
            <button
              type="button"
              onClick={() => copyText(code, "code")}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-500 hover:text-mint-700 border border-gray-100 rounded-lg px-2 py-1 transition-colors dark:text-slate-300 dark:border-slate-600 dark:hover:text-cyan-300"
            >
              {copiedCode ? (
                <>
                  <Check className="h-3 w-3 text-mint-600" strokeWidth={2.5} />
                  已複製
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" strokeWidth={2} />
                  複製代碼
                </>
              )}
            </button>
          </div>
          <p className="mt-2 text-[2rem] font-black tracking-[0.18em] text-navy-800 tabular-nums leading-none dark:text-white">
            {prettyCode}
          </p>
        </div>

        <div className="mt-3 rounded-2xl border border-gray-100 bg-white shadow-sm px-4 py-3.5 dark:border-slate-600 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-navy-400 dark:text-slate-400">
            <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
            專屬連結
          </div>
          <p className="mt-1.5 text-sm font-semibold text-mint-700 break-all leading-snug dark:text-cyan-300">
            {shareUrl}
          </p>
        </div>

        {isScheduled ? (
          <>
            <button
              type="button"
              onClick={() => copyText(inviteBundle, "all")}
              className="mt-5 w-full font-bold py-3.5 rounded-2xl bg-coral-500 text-white shadow-sm hover:bg-coral-400 transition-colors active:scale-[0.99]"
            >
              {copiedAll ? "已複製邀請內容！" : "複製邀請連結與代碼"}
            </button>
            <button
              type="button"
              onClick={onDone}
              className="mt-2 w-full font-black py-3.5 rounded-2xl bg-navy-800 text-white hover:bg-navy-900 transition-colors active:scale-[0.99] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              返回看板
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => copyText(shareUrl, "link")}
              className="mt-5 w-full font-bold py-3.5 rounded-2xl bg-mint-500 text-white shadow-[0_8px_24px_rgba(20,184,166,0.25)] hover:bg-mint-600 transition-colors active:scale-[0.99]"
            >
              {copiedLink ? "已複製網址！" : "複製專屬會議連結"}
            </button>

            {typeof onEnterLive === "function" && (
              <button
                type="button"
                onClick={onEnterLive}
                className="mt-2 w-full font-black py-3.5 rounded-2xl bg-navy-800 text-white hover:bg-navy-900 transition-colors active:scale-[0.99]"
              >
                進入大廳準備
              </button>
            )}

            <button
              type="button"
              onClick={onDone}
              className="mt-2 w-full text-sm font-medium text-navy-500 py-2.5 rounded-xl hover:bg-gray-50 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
            >
              稍後再說 · 前往會議看板
            </button>
          </>
        )}
      </div>
    </div>
  );
}
