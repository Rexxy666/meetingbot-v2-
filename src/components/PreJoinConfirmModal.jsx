import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const CARD = "bg-white border border-gray-100 shadow-card rounded-2xl";

/**
 * 第一階段：二次確認是否前往大廳準備頁
 * 使用 Portal 掛到 document.body，避免父層 fade-in / transform 截斷 fixed 遮罩
 */
export default function PreJoinConfirmModal({
  open,
  meetingTitle = "會議",
  busy = false,
  onCancel,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;
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
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="presentation"
    >
      {/* 全視窗遮罩：覆蓋 Navbar / Footer / BottomNav */}
      <button
        type="button"
        aria-label="關閉確認視窗"
        disabled={busy}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />

      <div
        className={`relative z-10 w-full max-w-md ${CARD} p-6 fade-in`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prejoin-confirm-title"
      >
        <button
          type="button"
          aria-label="關閉"
          disabled={busy}
          onClick={onCancel}
          className="absolute right-3 top-3 p-1.5 rounded-lg text-navy-300 hover:text-navy-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>

        <h3 id="prejoin-confirm-title" className="text-lg font-bold text-navy-800 pr-8">
          是否確定加入「{meetingTitle || "會議"}」？
        </h3>
        <p className="mt-2 text-sm text-navy-500 leading-relaxed">
          接下來會進入大廳準備頁，讓你先調整麥克風、鏡頭與裝置，確認後再正式進房。
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 font-medium py-2.5 rounded-xl text-navy-500 border border-gray-100 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
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
