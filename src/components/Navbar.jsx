import Logo from "./Logo.jsx";
import Avatar from "./Avatar.jsx";

const tabs = [
  { id: "dashboard", label: "會議看板", icon: "M4 5h16M4 12h16M4 19h10" },
  { id: "create", label: "發起會議", icon: "M12 5v14M5 12h14" },
  { id: "todo", label: "待辦任務", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
];

export default function Navbar({ page, setPage, todoCount = 0, user, onLogout }) {
  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-navy-800/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <button onClick={() => setPage("dashboard")} className="active:scale-95 transition-transform">
          <Logo />
        </button>
        <nav className="hidden md:flex items-center gap-1 bg-navy-800/[0.03] p-1 rounded-2xl">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setPage(t.id)}
              className={`relative flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-150
                ${page === t.id ? "bg-white text-mint-600 shadow-card" : "text-navy-400 hover:text-navy-700"}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              {t.label}
              {t.id === "todo" && todoCount > 0 && (
                <span className="ml-0.5 text-[10px] font-bold text-white bg-coral-400 rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {todoCount}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right leading-tight">
            <p className="text-sm font-semibold text-navy-700">{user?.name || "使用者"}</p>
            <p className="text-[11px] text-navy-300">{user?.email}</p>
          </div>
          <Avatar name={user?.name || "U"} />
          <button
            onClick={onLogout}
            className="text-xs font-semibold text-navy-500 border border-navy-800/10 px-3 py-1.5 rounded-xl hover:border-coral-300 hover:text-coral-500 transition-colors"
          >
            登出
          </button>
        </div>
      </div>
    </header>
  );
}
