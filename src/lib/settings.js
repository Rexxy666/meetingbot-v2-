import { useEffect, useState } from "react";

const MODE_KEY = "meetflow.mode";

/** 全域應用模式（企業 / 學生），持久化到 localStorage。 */
export function useMode() {
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || "enterprise");
  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);
  return [mode, setMode];
}
