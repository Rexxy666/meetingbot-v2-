import { useState } from "react";
import { MODE_LIST } from "../config/meetingConfig.js";
import Avatar from "./Avatar.jsx";

/**
 * 個人設定彈窗：改名 + 切換應用模式。
 * onSave({ name, mode }) 由父層寫入全域狀態 / localStorage。
 */
export default function SettingsModal({ user, mode, onSave, onClose }) {
  const [name, setName] = useState(user?.name || "");
  const [draftMode, setDraftMode] = useState(mode);

  const trimmed = name.trim();
  const changed = (trimmed && trimmed !== user?.name) || draftMode !== mode;

  const save = () => {
    onSave({ name: trimmed || user?.name || "使用者", mode: draftMode });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy-900/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-card-hover p-6 fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-navy-800">個人設定</h3>
          <button onClick={onClose} className="text-navy-300 hover:text-navy-700 transition-colors">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* 基本資料 */}
        <div className="mt-6">
          <p className="text-sm font-bold text-navy-700 mb-3">基本資料</p>
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={trimmed || "U"} size="h-12 w-12" />
            <div className="min-w-0">
              <p className="text-xs text-navy-300">登入帳號</p>
              <p className="text-sm font-medium text-navy-600 truncate">{user?.email}</p>
            </div>
          </div>
          <label className="text-xs font-semibold text-navy-500">顯示名稱</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="輸入你的名稱"
            className="mt-1.5 w-full rounded-2xl border border-navy-800/10 bg-white px-4 py-3 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
          />
        </div>

        {/* 應用模式 */}
        <div className="mt-6">
          <p className="text-sm font-bold text-navy-700 mb-3">應用模式</p>
          <div className="grid grid-cols-2 gap-2">
            {MODE_LIST.map((m) => {
              const active = m.id === draftMode;
              return (
                <button
                  key={m.id}
                  onClick={() => setDraftMode(m.id)}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-4 transition-all active:scale-[0.98]
                    ${active ? "bg-mint-50 border-mint-300 shadow-glow" : "bg-white border-navy-800/10 hover:border-mint-200"}`}
                >
                  <span className={`font-black ${active ? "text-mint-700" : "text-navy-800"}`}>{m.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-navy-300 mt-2">切換後「發起會議」的場景與守門規則會立即改變。</p>
        </div>

        {/* 動作 */}
        <div className="mt-7 flex gap-2">
          <button onClick={onClose} className="flex-1 font-semibold py-3 rounded-2xl text-navy-500 border border-navy-800/10 hover:bg-navy-800/[0.03] transition-colors">
            關閉
          </button>
          <button
            onClick={save}
            disabled={!changed}
            className={`flex-1 font-bold py-3 rounded-2xl transition-all active:scale-[0.98]
              ${changed ? "bg-mint-500 text-white shadow-glow hover:bg-mint-600" : "bg-navy-800/5 text-navy-300 cursor-not-allowed"}`}
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}
