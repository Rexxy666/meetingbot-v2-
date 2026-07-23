import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * 第一階段：二次確認是否前往大廳準備頁
 * - instant：可編輯會議名稱後再建立並進大廳
 * - join：確認加入既有會議
 * 使用 Portal 掛到 document.body，避免父層 fade-in / transform 截斷 fixed 遮罩
 */
export default function PreJoinConfirmModal({
  open,
  meetingTitle = "會議",
  /** "instant" = 發起即時會議（可改名）；"join" = 加入既有會議 */
  variant = "join",
  busy = false,
  onCancel,
  onConfirm,
}) {
  const isInstant = variant === "instant";
  const defaultTitle = String(meetingTitle || "").trim() || "即時討論會議";
  const [draftTitle, setDraftTitle] = useState(defaultTitle);

  useEffect(() => {
    if (!open) return undefined;
    setDraftTitle(defaultTitle);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onCancel, defaultTitle]);

  if (!open) return null;

  const handleConfirm = () => {
    if (busy) return;
    if (isInstant) {
      const next = String(draftTitle || "").trim() || defaultTitle;
      onConfirm?.(next);
      return;
    }
    onConfirm?.(meetingTitle);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        aria-label="關閉確認視窗"
        disabled={busy}
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        onClick={busy ? undefined : onCancel}
      />

      <div
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/50 bg-white/90 p-6 shadow-card-hover backdrop-blur-xl ring-1 ring-navy-800/10 fade-in dark:border-slate-600/40 dark:bg-slate-900/85 dark:ring-white/5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prejoin-confirm-title"
      >
        <button
          type="button"
          aria-label="關閉"
          disabled={busy}
          onClick={onCancel}
          className="absolute right-3 top-3 p-1.5 rounded-lg text-navy-300 hover:text-navy-600 hover:bg-gray-50 disabled:opacity-40 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <h3
          id="prejoin-confirm-title"
          className="text-lg font-bold text-navy-800 pr-8 dark:text-white"
        >
          {isInstant ? "準備發起會議" : `是否確定加入「${meetingTitle || "會議"}」？`}
        </h3>

        {isInstant ? (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold text-navy-600 dark:text-slate-300">
              會議名稱
            </span>
            <input
              type="text"
              value={draftTitle}
              disabled={busy}
              autoFocus
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder={`請輸入會議主題（選填，預設：${defaultTitle}）`}
              className="w-full h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-navy-800 shadow-sm placeholder:text-navy-300 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-400"
            />
          </label>
        ) : null}

        <p className="mt-3 text-sm text-navy-500 leading-relaxed dark:text-slate-300">
          接下來將進入大廳準備頁，讓你先調整麥克風、鏡頭與設備，確認後再正式進房。
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 font-medium py-2.5 rounded-xl text-navy-500 border border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleConfirm}
            className="flex-1 font-semibold py-2.5 rounded-xl bg-coral-500 text-white hover:bg-coral-400 shadow-sm transition-colors disabled:opacity-60"
          >
            {busy ? "準備中…" : "前往準備"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
