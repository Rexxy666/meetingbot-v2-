import { useState } from "react";
import Avatar from "./Avatar.jsx";

const colorFor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

/**
 * 會議中邀請好友 Modal。
 * 點選好友後直接透過 Socket.io emit `invite-user`（帶 ack 回傳結果）。
 */
export default function InviteModal({ meeting, friends = [], socket, onClose }) {
  const [state, setState] = useState({}); // friendId -> 'sending' | 'sent' | 'error'
  const members = new Set([meeting.ownerId, ...(meeting.memberIds || [])]);

  const invite = (u) => {
    if (!socket) {
      setState((s) => ({ ...s, [u.id]: "error" }));
      return;
    }
    setState((s) => ({ ...s, [u.id]: "sending" }));
    socket.emit("invite-user", { meetingId: meeting.id, toUserId: u.id }, (ack) => {
      setState((s) => ({ ...s, [u.id]: ack?.ok ? "sent" : "error" }));
    });
    // 保險：若後端未回 ack，2 秒後也標記完成
    setTimeout(() => {
      setState((s) => (s[u.id] === "sending" ? { ...s, [u.id]: "sent" } : s));
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-navy-900/30 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-card-hover p-6 fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-navy-800">邀請好友加入</h3>
          <button onClick={onClose} className="text-navy-300 hover:text-navy-700 transition-colors">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="text-sm text-navy-400 mt-1 truncate">{meeting.title}</p>

        {friends.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-navy-400">還沒有好友，先到「好友」頁加好友吧。</p>
          </div>
        ) : (
          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
            {friends.map((u) => {
              const already = members.has(u.id);
              const st = state[u.id];
              const done = already || st === "sent";
              return (
                <div key={u.id} className="flex items-center gap-3 border border-navy-800/8 rounded-2xl px-3 py-2.5">
                  <Avatar name={u.name} color={colorFor(u.name)} size="h-8 w-8" ring={false} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-800 truncate text-sm">{u.name}</p>
                    <p className="text-xs text-navy-400 truncate">{u.email}</p>
                  </div>
                  <button
                    onClick={() => invite(u)}
                    disabled={done || st === "sending"}
                    className={`shrink-0 text-xs font-semibold px-3 py-2 rounded-xl transition-all active:scale-95
                      ${done ? "bg-mint-100 text-mint-700 cursor-default" : st === "sending" ? "bg-navy-800/5 text-navy-300" : st === "error" ? "bg-coral-100 text-coral-500" : "bg-mint-500 text-white hover:bg-mint-600"}`}
                  >
                    {already ? "已加入" : st === "sent" ? "已送出" : st === "sending" ? "送出中" : st === "error" ? "重試" : "邀請"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-4 text-[11px] text-navy-300 text-center">透過即時連線送出，對方接受後即可進入會議室協作。</p>
      </div>
    </div>
  );
}
