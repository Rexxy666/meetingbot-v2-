import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { flattenNotesDoc } from "../lib/notesDocument.js";

/**
 * 會議議程頁籤：切換／新增／重新命名／刪除（權限由父層 canManage 控制）。
 */
export default function AgendaTabs({
  agenda = [],
  agendaIdx = 0,
  topicNotes = {},
  typingTopics = new Map(),
  canManage = false,
  onSelect,
  onRequestAdd,
  onRequestRename,
  onRequestDelete,
  className = "",
}) {
  return (
    <div
      className={`flex gap-1 px-3 pt-2.5 md:pt-3 overflow-x-auto border-b border-navy-800/6 shrink-0 items-stretch ${className}`}
    >
      {agenda.map((a, i) => {
        const active = i === agendaIdx;
        const label = a.length > 10 ? `${a.slice(0, 10)}…` : a;
        return (
          <div
            key={`${i}-${a}`}
            className={`group relative shrink-0 flex items-center gap-0.5 rounded-t-lg transition-colors ${
              active
                ? "bg-mint-50 text-mint-700 border-b-2 border-mint-500"
                : "text-navy-400 hover:text-navy-700"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect?.(i)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 pr-1.5"
              title={a}
            >
              <span>
                {i + 1}. {label}
              </span>
              {typingTopics.has(a) ? (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${typingTopics.get(a).dot} animate-pulse`}
                  title="有人正在此議程輸入"
                />
              ) : flattenNotesDoc(topicNotes[a] || "").trim() ? (
                <span className="h-1.5 w-1.5 rounded-full bg-mint-400" />
              ) : null}
            </button>

            {canManage ? (
              <div className="flex items-center pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  type="button"
                  title="重新命名議程"
                  aria-label={`重新命名 ${a}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestRename?.(i);
                  }}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-navy-400 hover:text-mint-700 hover:bg-mint-100/80"
                >
                  <Pencil className="h-3 w-3" strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  title="刪除議程"
                  aria-label={`刪除 ${a}`}
                  disabled={agenda.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (agenda.length <= 1) return;
                    onRequestDelete?.(i);
                  }}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-navy-400 hover:text-coral-600 hover:bg-coral-50 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.6} />
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {canManage ? (
        <button
          type="button"
          onClick={() => onRequestAdd?.()}
          title="新增議程"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-2 rounded-t-lg text-mint-700 hover:bg-mint-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
          <span className="hidden sm:inline">新增議程</span>
        </button>
      ) : null}
    </div>
  );
}

/** 新增／重新命名議程：名稱 + 時間預算 */
export function AgendaEditModal({
  open,
  mode = "add",
  initialName = "",
  initialMinutes = 15,
  busy = false,
  onClose,
  onConfirm,
}) {
  if (!open) return null;
  const isRename = mode === "rename";
  return (
    <AgendaFormDialog
      key={`${mode}-${initialName}-${initialMinutes}`}
      title={isRename ? "重新命名議程" : "新增議程"}
      confirmLabel={isRename ? "儲存" : "新增"}
      initialName={initialName}
      initialMinutes={initialMinutes}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function AgendaFormDialog({
  title,
  confirmLabel,
  initialName,
  initialMinutes,
  busy,
  onClose,
  onConfirm,
}) {
  const [name, setName] = useState(initialName);
  const [minutes, setMinutes] = useState(String(initialMinutes || 15));

  const submit = (e) => {
    e?.preventDefault?.();
    const clean = String(name || "").trim();
    if (!clean || busy) return;
    const mins = Math.min(480, Math.max(1, Math.round(Number(minutes) || 15)));
    onConfirm?.({ name: clean, minutes: mins });
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-edit-title"
    >
      <button
        type="button"
        aria-label="關閉"
        disabled={busy}
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={() => !busy && onClose?.()}
      />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-sm rounded-3xl border border-white/60 bg-white/90 backdrop-blur-md shadow-card-hover p-5 ring-1 ring-navy-800/10 dark:bg-[#111c35] dark:border-slate-800"
      >
        <h3
          id="agenda-edit-title"
          className="text-base font-bold text-navy-800 dark:text-white"
        >
          {title}
        </h3>
        <label className="mt-4 block">
          <span className="text-[11px] font-bold text-navy-500 dark:text-slate-400">
            議程名稱
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="例：進度同步"
            className="mt-1.5 w-full rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm font-semibold text-navy-800 outline-none focus:border-mint-300 focus:ring-2 focus:ring-mint-100 dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-100"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-[11px] font-bold text-navy-500 dark:text-slate-400">
            時間預算（分鐘）
          </span>
          <input
            type="number"
            min={1}
            max={480}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-navy-800/10 bg-white px-3 py-2.5 text-sm font-semibold text-navy-800 outline-none focus:border-mint-300 focus:ring-2 focus:ring-mint-100 dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-100"
          />
          <span className="mt-1 block text-[10px] text-navy-400 dark:text-slate-500">
            Time Boxing 預設 15 分鐘，切換到此議程時會套用倒數
          </span>
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose?.()}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 bg-navy-800/5 hover:bg-navy-800/10 transition-colors disabled:opacity-50 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy || !String(name || "").trim()}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-mint-500 hover:bg-mint-600 shadow-sm transition-colors disabled:opacity-60"
          >
            {busy ? "處理中…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 刪除議程二次確認 */
export function DeleteAgendaConfirmModal({
  open,
  agendaName = "",
  busy = false,
  onClose,
  onConfirm,
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-agenda-title"
    >
      <button
        type="button"
        aria-label="關閉"
        disabled={busy}
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={() => !busy && onClose?.()}
      />
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/60 bg-white/90 backdrop-blur-md shadow-card-hover p-5 ring-1 ring-navy-800/10 dark:bg-[#111c35] dark:border-slate-800">
        <h3
          id="delete-agenda-title"
          className="text-base font-bold text-navy-800 dark:text-white"
        >
          確定要刪除此議程？
        </h3>
        <p className="mt-2 text-sm text-navy-600 leading-relaxed dark:text-slate-300">
          刪除「{agendaName}」將連同該議程下對應的共編筆記一併移除，此操作無法復原。
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onClose?.()}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-navy-500 bg-navy-800/5 hover:bg-navy-800/10 transition-colors disabled:opacity-50 dark:text-slate-300 dark:bg-slate-800"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm?.()}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white bg-coral-500 hover:bg-coral-600 shadow-sm transition-colors disabled:opacity-60"
          >
            {busy ? "刪除中…" : "確定刪除"}
          </button>
        </div>
      </div>
    </div>
  );
}
