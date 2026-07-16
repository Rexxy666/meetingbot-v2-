import { useCallback, useEffect, useState } from "react";

const KEY = "guanhui.meetings.v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(meetings) {
  localStorage.setItem(KEY, JSON.stringify(meetings));
}

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);

/**
 * 單一資料來源：所有會議存在 localStorage。
 * 提供實際的新增／更新／刪除操作，讓整個網站真正可運作。
 */
export function useMeetings() {
  const [meetings, setMeetings] = useState(load);

  useEffect(() => {
    save(meetings);
  }, [meetings]);

  const createMeeting = useCallback((data) => {
    const m = {
      id: uid(),
      title: data.title.trim(),
      participants: data.participants || [],
      pains: data.pains || [],
      goals: data.goals || [],
      links: data.links || [],
      durationMin: data.durationMin || 30,
      notes: "", // 結束時彙整的完整筆記（含各議程標題）
      topicNotes: {}, // 依議程主題分頁的筆記：{ 主題: 文字 }
      status: "ready", // ready → live → done
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      review: null, // 會後 AI 整理結果
      actions: [], // [{id, task, who, when, done}]
    };
    setMeetings((prev) => [m, ...prev]);
    return m.id;
  }, []);

  const updateMeeting = useCallback((id, patch) => {
    setMeetings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m))
    );
  }, []);

  const deleteMeeting = useCallback((id) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return { meetings, createMeeting, updateMeeting, deleteMeeting, setMeetings };
}
