import { createContext, useContext, useMemo } from "react";

const MeetingChromeContext = createContext(null);

/** 會議室頁共用 chrome（導覽已改左側抽屜，不再由頂部 Header 連動） */
export function useMeetingChrome() {
  return useContext(MeetingChromeContext);
}

/**
 * 會議沉浸版面：
 * - 全站導覽由 App 層 LeftVerticalGlobalNav（左側固定疊加）負責
 * - 本 Layout 只保證會議區滿高、無頂部 Navbar 佔位 → 無 Layout Shift
 */
export default function MeetingRoomLayout({ children }) {
  const ctx = useMemo(() => ({}), []);

  return (
    <MeetingChromeContext.Provider value={ctx}>
      <div className="relative h-dvh max-h-dvh min-h-0 flex flex-col overflow-hidden">
        <div className="relative z-0 flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </MeetingChromeContext.Provider>
  );
}
