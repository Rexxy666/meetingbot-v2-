import { useCallback, useEffect, useState } from "react";

const KEY = "meetflow.theme"; // "light" | "dark" | "auto"

// 自動模式：19:00–06:59 視為夜間（深色）
const isNight = (h) => h >= 19 || h < 7;

export function resolveTheme(pref) {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return isNight(new Date().getHours()) ? "dark" : "light";
}

function applyTheme(resolved) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.style.colorScheme = resolved;
}

// 匯入時立即套用，避免載入白屏閃爍
if (typeof window !== "undefined") {
  try {
    applyTheme(resolveTheme(localStorage.getItem(KEY) || "auto"));
  } catch {
    /* ignore */
  }
}

/** 全域主題：偏好(light/dark/auto) + 實際套用值(resolved) */
export function useTheme() {
  const [pref, setPrefState] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "auto";
    } catch {
      return "auto";
    }
  });
  const [resolved, setResolved] = useState(() => resolveTheme(pref));

  const setPref = useCallback((p) => {
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
    setPrefState(p);
  }, []);

  useEffect(() => {
    const r = resolveTheme(pref);
    setResolved(r);
    applyTheme(r);
  }, [pref]);

  // 自動模式：每分鐘與視窗聚焦時重新判定日夜
  useEffect(() => {
    if (pref !== "auto") return undefined;
    const tick = () => {
      const r = resolveTheme("auto");
      setResolved(r);
      applyTheme(r);
    };
    const id = setInterval(tick, 60 * 1000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, [pref]);

  return { pref, resolved, setPref };
}
