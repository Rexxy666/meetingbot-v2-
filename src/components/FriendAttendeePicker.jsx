import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";

const colorFor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

/**
 * 與會者：從好友列表點選（物件陣列 { id, name, email }），不再用純文字 Enter。
 */
export default function FriendAttendeePicker({
  value = [],
  onChange,
  friends = [],
  placeholder = "搜尋好友姓名或 Email…",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef(null);
  const openAtPointerDown = useRef(false);

  const selectedIds = useMemo(() => new Set((value || []).map((a) => a.id)), [value]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (friends || []).filter((f) => {
      if (selectedIds.has(f.id)) return false;
      if (!query) return true;
      return (
        String(f.name || "").toLowerCase().includes(query) ||
        String(f.email || "").toLowerCase().includes(query)
      );
    });
  }, [friends, q, selectedIds]);

  const closePanel = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) closePanel();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const add = (friend) => {
    if (!friend?.id || selectedIds.has(friend.id)) return;
    onChange([
      ...(value || []),
      { id: friend.id, name: friend.name, email: friend.email },
    ]);
    setQ("");
  };

  const remove = (id) => onChange((value || []).filter((a) => a.id !== id));

  const onSearchPointerDown = () => {
    openAtPointerDown.current = open;
  };

  const onSearchClick = () => {
    if (!friends.length) return;
    // 展開時再點輸入框 → 收起；關閉時點擊 → 展開（與 focus 互補）
    if (openAtPointerDown.current) {
      closePanel();
      return;
    }
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      {open && friends.length > 0 && (
        <div
          className="fixed inset-0 z-20"
          aria-hidden
          onClick={closePanel}
        />
      )}

      {(value || []).length > 0 && (
        <div className="relative z-30 flex flex-wrap gap-2 mb-2.5">
          {value.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-2 bg-mint-50 border border-mint-200 text-navy-800 rounded-full pl-1.5 pr-2.5 py-1"
            >
              <Avatar name={a.name} color={colorFor(a.name)} size="h-6 w-6" ring={false} />
              <span className="text-sm font-semibold leading-none">{a.name}</span>
              <span className="text-[10px] text-navy-400 max-w-[120px] truncate">{a.email}</span>
              <button
                type="button"
                onClick={() => remove(a.id)}
                className="text-navy-300 hover:text-coral-500 transition-colors"
                title="移除"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className={`relative z-30 flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 transition-all ${
          open ? "border-mint-400 shadow-glow" : "border-navy-800/10"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-navy-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (friends.length) setOpen(true);
          }}
          onPointerDown={onSearchPointerDown}
          onClick={onSearchClick}
          placeholder={friends.length ? placeholder : "尚無好友，請先到「好友」頁加好友"}
          disabled={!friends.length}
          className="flex-1 bg-transparent text-sm text-navy-800 placeholder-navy-300 outline-none disabled:cursor-not-allowed"
          aria-expanded={open}
          aria-controls="friend-attendee-panel"
        />
        <span className="text-[10px] font-semibold text-navy-300 shrink-0">{(value || []).length} 位</span>
      </div>

      {open && friends.length > 0 && (
        <div
          id="friend-attendee-panel"
          role="listbox"
          className="absolute z-40 left-0 right-0 mt-2 bg-white border border-navy-800/10 rounded-2xl shadow-card-hover overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-navy-800/[0.02] border-b border-navy-800/6">
            <p className="text-[11px] font-semibold text-navy-400">從好友選擇與會者</p>
            <button
              type="button"
              onClick={closePanel}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-navy-400 hover:text-navy-700 hover:bg-navy-800/[0.06] transition-colors"
              title="收起選單"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              收起
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-navy-300">沒有符合的好友</li>
            ) : (
              filtered.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => add(f)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-mint-50 transition-colors"
                  >
                    <Avatar name={f.name} color={colorFor(f.name)} size="h-8 w-8" ring={false} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-navy-800 truncate">{f.name}</span>
                      <span className="block text-xs text-navy-400 truncate">{f.email}</span>
                    </span>
                    <span className="text-xs font-semibold text-mint-600">＋ 加入</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
