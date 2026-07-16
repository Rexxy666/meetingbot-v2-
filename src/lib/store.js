import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./api.js";
import { connectSocket } from "./socket.js";

/**
 * 單一資料來源：所有會議由後端 API 管理，Socket.io 接收即時更新。
 */
export function useMeetings() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const meetingsRef = useRef(meetings);
  meetingsRef.current = meetings;

  const refreshMeetings = useCallback(async () => {
    try {
      const list = await api.fetchMeetings();
      setMeetings(list);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMeetings();
  }, [refreshMeetings]);

  useEffect(() => {
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
  }, []);

  const createMeeting = useCallback(async (data) => {
    const meeting = await api.createMeeting(data);
    setMeetings((prev) => [meeting, ...prev]);
    return meeting.id;
  }, []);

  const updateMeeting = useCallback(async (id, patch) => {
    const current = meetingsRef.current.find((m) => m.id === id);
    if (!current) return null;

    const patchBody = typeof patch === "function" ? patch(current) : patch;

    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, ...patchBody } : m)));

    try {
      const updated = await api.patchMeeting(id, patchBody);
      setMeetings((prev) => prev.map((m) => (m.id === id ? updated : m)));
      return updated;
    } catch (e) {
      await refreshMeetings();
      throw e;
    }
  }, [refreshMeetings]);

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
