import { CheckSquare, LayoutDashboard, Plus, Users } from "lucide-react";

const TABS = [
  { id: "dashboard", label: "看板", Icon: LayoutDashboard },
  { id: "create", label: "發起", Icon: Plus },
  { id: "todo", label: "待辦", Icon: CheckSquare },
  { id: "friends", label: "好友", Icon: Users },
];

/**
 * 手機版毛玻璃動態島導覽列：四鍵平整均分，無突起 FAB。
 */
export default function BottomNav({ page, setPage, todoCount = 0, friendsCount = 0 }) {
  const badge = { todo: todoCount, friends: friendsCount };

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 flex justify-center px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md flex items-stretch justify-between gap-0.5 rounded-full border border-white/20 bg-white/80 backdrop-blur-md shadow-lg px-1.5 py-1.5">
        {TABS.map(({ id, label, Icon }) => {
          const active = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPage(id)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 rounded-full px-2 py-2 transition-all active:scale-95
                ${active ? "bg-mint-50/90 text-mint-600" : "text-navy-400 hover:text-navy-700"}`}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.35 : 1.9} />
              <span className="text-[10px] font-semibold leading-none tracking-wide">{label}</span>
              {badge[id] > 0 && (
                <span className="absolute top-1 right-[18%] text-[9px] font-bold text-white bg-coral-400 rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center shadow-sm">
                  {badge[id]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
