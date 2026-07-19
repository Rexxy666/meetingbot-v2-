import { useState } from "react";
import Avatar from "../components/Avatar.jsx";

const colorFor = (name) => {
  const colors = ["bg-mint-500", "bg-coral-400", "bg-navy-600", "bg-sky-400"];
  let h = 0;
  for (const ch of name || "") h = (h + ch.charCodeAt(0)) % colors.length;
  return colors[h];
};

function SectionTitle({ children, count }) {
  return (
    <div className="flex items-center gap-2 mt-8 mb-3">
      <h2 className="text-lg font-black text-navy-800">{children}</h2>
      {count > 0 && <span className="text-[11px] font-bold text-white bg-coral-400 rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">{count}</span>}
    </div>
  );
}

function AddSearch({ social, me }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState({});

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const list = await social.searchUsers(q.trim());
      // 搜尋結果再排除自己（email / id）
      const meEmail = String(me?.email || "").trim().toLowerCase();
      setResults(
        (list || []).filter(
          (u) => u.id !== me?.id && String(u.email || "").trim().toLowerCase() !== meEmail
        )
      );
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const add = async (u) => {
    // sender = 當前登入者；receiver = 搜尋結果對象
    if (!me?.id || !u?.id || u.id === me.id) {
      setSent((s) => ({ ...s, [u?.id]: "error" }));
      return;
    }
    if (String(u.email || "").toLowerCase() === String(me.email || "").toLowerCase()) {
      setSent((s) => ({ ...s, [u.id]: "error" }));
      return;
    }

    setSent((s) => ({ ...s, [u.id]: "sending" }));
    try {
      const r = await social.sendFriendRequest(u.id); // receiverId only；sender 由後端 JWT 決定
      setSent((s) => ({ ...s, [u.id]: r.status === "accepted" ? "friend" : "requested" }));
    } catch (e) {
      setSent((s) => ({ ...s, [u.id]: "error" }));
    }
  };

  const relLabel = (u) => {
    const local = sent[u.id];
    if (local === "sending") return { text: "送出中…", disabled: true };
    if (local === "requested" || u.relation === "requested") return { text: "已送出邀請", disabled: true };
    if (local === "friend" || u.relation === "friend") return { text: "已是好友", disabled: true };
    if (u.relation === "incoming") return { text: "同意其邀請", disabled: false, incoming: true };
    if (local === "error") return { text: "重試", disabled: false };
    return { text: "+ 加好友", disabled: false };
  };

  return (
    <div className="bg-white border border-navy-800/8 rounded-3xl p-6 shadow-card">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) run();
          }}
          placeholder="輸入 Email 或姓名搜尋…"
          className="flex-1 rounded-xl border border-navy-800/10 bg-white px-4 py-3 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
        />
        <button onClick={run} disabled={busy || !q.trim()} className="shrink-0 px-5 rounded-xl bg-mint-500 text-white font-semibold text-sm hover:bg-mint-600 disabled:bg-navy-800/10 disabled:text-navy-300 transition-colors active:scale-95">
          {busy ? "搜尋中…" : "搜尋"}
        </button>
      </div>

      {results && (
        <div className="mt-4 space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-navy-300 text-center py-6">找不到符合的使用者。可用完整 Email 精準搜尋。</p>
          ) : (
            results.map((u) => {
              const r = relLabel(u);
              return (
                <div key={u.id} className="flex items-center gap-3 border border-navy-800/8 rounded-2xl px-4 py-3">
                  <Avatar name={u.name} color={colorFor(u.name)} size="h-9 w-9" ring={false} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-800 truncate">{u.name}</p>
                    <p className="text-xs text-navy-400 truncate">{u.email}</p>
                  </div>
                  <button
                    onClick={() => add(u)}
                    disabled={r.disabled}
                    className={`shrink-0 text-sm font-semibold px-4 py-2 rounded-xl transition-all active:scale-95
                      ${r.disabled ? "bg-navy-800/5 text-navy-300 cursor-default" : "bg-mint-500 text-white hover:bg-mint-600"}`}
                  >
                    {r.text}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function Friends({ social, store, go, me }) {
  const meEmail = String(me?.email || "").trim().toLowerCase();

  // 已送出的邀請：只顯示「我發出、且對象不是我自己」的項目
  const outgoing = (social.outgoing || []).filter((r) => {
    const email = String(r.user?.email || "").trim().toLowerCase();
    if (!r.user?.id) return false;
    if (me?.id && r.user.id === me.id) return false;
    if (meEmail && email === meEmail) return false;
    return true;
  });

  const incoming = (social.incoming || []).filter((r) => {
    if (!r.user?.id) return false;
    if (me?.id && r.user.id === me.id) return false;
    return true;
  });

  const friends = social.friends || [];
  const invites = social.invites || [];

  const acceptInvite = async (inv, accept) => {
    await social.respondInvite(inv.id, accept);
    if (accept && store?.refreshMeetings) await store.refreshMeetings();
  };

  return (
    <div className="fade-in max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8">
      <h1 className="text-2xl font-black text-navy-800">好友</h1>
      <p className="text-navy-400 mt-1">加好友與邀請入會都需經雙方同意。</p>

      <div className="mt-6">
        <AddSearch social={social} me={me} />
      </div>

      {/* 會議邀請 */}
      {invites.length > 0 && (
        <>
          <SectionTitle count={invites.length}>會議邀請</SectionTitle>
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 bg-mint-50 border border-mint-200 rounded-2xl px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-800 truncate">{inv.meeting?.title}</p>
                  <p className="text-xs text-navy-400 truncate">{inv.from?.name} 邀請你加入協作</p>
                </div>
                <button onClick={() => acceptInvite(inv, true)} className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl bg-mint-500 text-white hover:bg-mint-600 transition-colors active:scale-95">接受</button>
                <button onClick={() => acceptInvite(inv, false)} className="shrink-0 text-sm font-semibold px-3 py-2 rounded-xl text-navy-500 hover:bg-navy-800/5 transition-colors">婉拒</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 收到的好友邀請 */}
      {incoming.length > 0 && (
        <>
          <SectionTitle count={incoming.length}>收到的好友邀請</SectionTitle>
          <div className="space-y-2">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-white border border-navy-800/8 rounded-2xl px-4 py-3">
                <Avatar name={r.user?.name} color={colorFor(r.user?.name)} size="h-9 w-9" ring={false} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-800 truncate">{r.user?.name || "使用者"}</p>
                  <p className="text-xs text-navy-400 truncate">{r.user?.email}</p>
                </div>
                <button onClick={() => social.respondFriendRequest(r.id, true)} className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl bg-mint-500 text-white hover:bg-mint-600 transition-colors active:scale-95">同意</button>
                <button onClick={() => social.respondFriendRequest(r.id, false)} className="shrink-0 text-sm font-semibold px-3 py-2 rounded-xl text-navy-500 hover:bg-navy-800/5 transition-colors">拒絕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 送出的好友邀請 */}
      {outgoing.length > 0 && (
        <>
          <SectionTitle>已送出的邀請</SectionTitle>
          <div className="space-y-2">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center gap-3 bg-white border border-navy-800/8 rounded-2xl px-4 py-3 opacity-80">
                <Avatar name={r.user?.name} color={colorFor(r.user?.name)} size="h-9 w-9" ring={false} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy-800 truncate">{r.user?.name || "使用者"}</p>
                  <p className="text-xs text-navy-400 truncate">{r.user?.email}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-navy-400 bg-navy-800/5 px-3 py-1.5 rounded-full">等待對方同意</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 好友列表 */}
      <SectionTitle>我的好友（{friends.length}）</SectionTitle>
      {friends.length === 0 ? (
        <div className="border-2 border-dashed border-navy-800/10 rounded-3xl py-12 text-center">
          <p className="font-bold text-navy-700">還沒有好友</p>
          <p className="text-sm text-navy-400 mt-1">用上方搜尋加好友，之後就能一鍵邀請進會議。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {friends.map((u) => (
            <div key={u.id} className="group flex items-center gap-3 bg-white border border-navy-800/8 rounded-2xl px-4 py-3 hover:shadow-card transition-all">
              <Avatar name={u.name} color={colorFor(u.name)} size="h-9 w-9" ring={false} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy-800 truncate">{u.name}</p>
                <p className="text-xs text-navy-400 truncate">{u.email}</p>
              </div>
              <button
                onClick={() => social.unfriend(u.id)}
                className="opacity-0 group-hover:opacity-100 text-xs font-semibold text-navy-400 hover:text-coral-500 border border-navy-800/10 hover:border-coral-300 px-3 py-1.5 rounded-xl transition-all"
              >
                移除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
