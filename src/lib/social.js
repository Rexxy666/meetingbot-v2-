import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "./api.js";
import { getSocket } from "./socket.js";

function sameUser(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const ae = String(a.email || "").trim().toLowerCase();
  const be = String(b.email || "").trim().toLowerCase();
  return Boolean(ae && be && ae === be);
}

function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const id = item?.id || item?.user?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

/**
 * 好友與邀請狀態：依「目前登入使用者」隔離。
 * @param {null | { id: string, email?: string, name?: string }} user
 */
export function useSocial(user = null) {
  const enabled = Boolean(user?.id);
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [invites, setInvites] = useState([]);

  const clear = useCallback(() => {
    setFriends([]);
    setIncoming([]);
    setOutgoing([]);
    setInvites([]);
  }, []);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [f, reqs, inv] = await Promise.all([
        api.fetchFriends(),
        api.fetchFriendRequests(),
        api.fetchInvites(),
      ]);

      // 防禦：即使後端回傳錯資料，也只保留與「我」相關、且對象不是自己的項目；並依 id 去重
      const me = user;
      setFriends(dedupeById((f || []).filter((u) => u?.id && !sameUser(u, me))));
      setIncoming(
        dedupeById((reqs?.incoming || []).filter((r) => r?.user && !sameUser(r.user, me)))
      );
      setOutgoing(
        dedupeById((reqs?.outgoing || []).filter((r) => r?.user && !sameUser(r.user, me)))
      );
      setInvites(dedupeById((inv || []).filter((i) => i?.from && !sameUser(i.from, me))));
    } catch {
      /* 靜默：後端未啟動時不干擾主要流程 */
    }
  }, [user]);

  // 帳號切換時立刻清空，再依新帳號重抓（避免沿用上一帳號的邀請列表）
  useEffect(() => {
    clear();
    if (!enabled) return;
    refresh();
  }, [enabled, user?.id, user?.email, clear, refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    const s = getSocket();
    const onEvent = () => refresh();
    const events = ["friend:request", "friend:accepted", "friend:changed", "meeting:invite", "meeting:invite-accepted"];
    events.forEach((e) => s.on(e, onEvent));
    return () => events.forEach((e) => s.off(e, onEvent));
  }, [enabled, user?.id, refresh]);

  const notifCount = useMemo(() => incoming.length + invites.length, [incoming, invites]);

  return {
    friends,
    incoming,
    outgoing,
    invites,
    notifCount,
    refresh,
    me: user,
    searchUsers: api.searchUsers,
    inviteToMeeting: api.inviteToMeeting,
    sendFriendRequest: async (receiverId) => {
      if (!user?.id) throw new Error("請先登入");
      if (!receiverId || receiverId === user.id) {
        throw new Error("不能邀請自己");
      }
      const r = await api.sendFriendRequest(receiverId);
      await refresh();
      return r;
    },
    respondFriendRequest: async (id, accept) => {
      await api.respondFriendRequest(id, accept);
      await refresh();
    },
    unfriend: async (id) => {
      await api.unfriend(id);
      await refresh();
    },
    respondInvite: async (id, accept) => {
      const r = await api.respondInvite(id, accept);
      await refresh();
      return r;
    },
  };
}
