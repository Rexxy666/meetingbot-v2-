import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api.js";
import { connectSocket, disconnectSocket } from "./socket.js";

/**
 * 登入後才載入：後端只回傳目前使用者的會議。
 */
export function useMeetings(enabled = true) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  const refreshMeetings = useCallback(async () => {
    if (!enabled) {
      setMeetings([]);
      setLoading(false);
      return;
    }
    try {
      const list = await api.fetchMeetings();
      setMeetings(list);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setMeetings([]);
      setLoading(false);
      setError(null);
      disconnectSocket();
      return;
    }
    setLoading(true);
    refreshMeetings();
  }, [enabled, refreshMeetings]);

  useEffect(() => {
    if (!enabled) return undefined;

    const socket = connectSocket();

    const onUpdated = (meeting) => {
      setMeetings((prev) => {
        const idx = prev.findIndex((m) => m.id === meeting.id);
        if (idx === -1) return [meeting, ...prev];
        const next = [...prev];
        next[idx] = meeting;
        return next;
      });
    };

    const onDeleted = ({ id }) => {
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    };

    socket.on("meeting:updated", onUpdated);
    socket.on("meeting:deleted", onDeleted);

    return () => {
      socket.off("meeting:updated", onUpdated);
      socket.off("meeting:deleted", onDeleted);
    };
  }, [enabled]);

  const createMeeting = useCallback(async (data) => {
    const meeting = await api.createMeeting(data);
    setMeetings((prev) => [meeting, ...prev]);
    return meeting;
  }, []);

  const updateMeeting = useCallback(
    async (id, patch) => {
      const current = meetingsRef.current.find((m) => m.id === id);
      if (!current) return null;

      const patchBody = typeof patch === "function" ? patch(current) : patch;
      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, ...patchBody } : m)));

      try {
        const updated = await api.patchMeeting(id, patchBody);
        setMeetings((prev) =>
          prev.map((m) => {
            if (m.id !== id) return m;
            const merged = { ...m, ...updated };
            // 若本次明確結束會議，即使後端回傳舊文件也強制保留結束狀態
            if (patchBody.status === "done" || patchBody.meetingStatus === "ended") {
              merged.status = "done";
              merged.meetingStatus = "ended";
              merged.endedAt = patchBody.endedAt || updated?.endedAt || Date.now();
            }
            return merged;
          })
        );
        return updated;
      } catch (e) {
        // 結束會議：失敗也不回滾成 live，避免看板／PIP 殘留「進行中」
        if (patchBody.status === "done" || patchBody.meetingStatus === "ended") {
          setMeetings((prev) =>
            prev.map((m) =>
              m.id === id
                ? {
                    ...m,
                    ...patchBody,
                    status: "done",
                    meetingStatus: "ended",
                    endedAt: patchBody.endedAt || Date.now(),
                  }
                : m
            )
          );
          throw e;
        }
        await refreshMeetings();
        throw e;
      }
    },
    [refreshMeetings]
  );

  const deleteMeeting = useCallback(async (id) => {
    await api.deleteMeeting(id);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return {
    meetings,
    loading,
    error,
    createMeeting,
    updateMeeting,
    deleteMeeting,
    refreshMeetings,
    setMeetings,
  };
}
