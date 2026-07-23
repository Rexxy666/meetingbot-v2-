import { useEffect } from "react";
import { createPortal } from "react-dom";
import { LogOut, X } from "lucide-react";

/**
 * 登出二次確認：Portal 掛到 body，避免側欄 transform / overflow 截斷遮罩
 */
export default function LogoutConfirmModal({ open, busy = false, onCancel, onConfirm }) {
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
      <button
        type="button"
        aria-label="關閉登出確認"
        disabled={busy}
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-sm"
        onClick={busy ? undefined : onCancel}
      />

      <div
        className="relative z-10 w-full max-w-sm bg-white border border-gray-100 shadow-card rounded-2xl p-6 fade-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        aria-describedby="logout-confirm-desc"
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

        <div className="h-11 w-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <LogOut className="h-5 w-5" strokeWidth={2.2} />
        </div>

        <h3 id="logout-confirm-title" className="text-lg font-bold text-navy-800 pr-8">
          確定要登出嗎？
        </h3>
        <p id="logout-confirm-desc" className="mt-2 text-sm text-navy-500 leading-relaxed">
          登出後您將需要重新登入才能存取您的會議紀錄與個人待辦事項。
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="flex-1 font-medium py-2.5 rounded-xl text-navy-500 bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 font-bold py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors disabled:opacity-50 active:scale-[0.98]"
          >
            {busy ? "登出中…" : "確定登出"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
