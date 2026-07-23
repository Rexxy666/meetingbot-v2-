import { useState } from "react";
import {
  ChevronLeft,
  Sun,
  Moon,
  Clock,
  Building2,
  GraduationCap,
  Check,
  LogOut,
  Palette,
  User,
  AppWindow,
  Info,
} from "lucide-react";
import Avatar from "../components/Avatar.jsx";

const THEME_OPTIONS = [
  { value: "light", label: "淺色", desc: "明亮清爽", Icon: Sun },
  { value: "dark", label: "深色", desc: "護眼低光", Icon: Moon },
  { value: "auto", label: "自動", desc: "依時間切換", Icon: Clock },
];

const MODE_OPTIONS = [
  { id: "enterprise", label: "企業模式", desc: "對客戶 / 佈達 / 匯報 / 跨部門", Icon: Building2 },
  { id: "student", label: "學生模式", desc: "分組報告 / 專題製作", Icon: GraduationCap },
];

function Section({ icon: Icon, title, desc, children }) {
  return (
    <section className="bg-white border border-gray-100 rounded-3xl shadow-sm p-5 md:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="h-9 w-9 shrink-0 rounded-xl bg-mint-50 text-mint-600 flex items-center justify-center">
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-navy-800">{title}</h2>
          {desc && <p className="text-[11px] text-navy-400">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage({ user, mode, setMode, updateProfile, theme, onLogout, go }) {
  const [name, setName] = useState(user?.name || "");
  const [savedName, setSavedName] = useState(false);

  const nameChanged = name.trim().length > 0 && name.trim() !== user?.name;
  const saveName = () => {
    if (!nameChanged) return;
    updateProfile?.({ name: name.trim() });
    setSavedName(true);
    setTimeout(() => setSavedName(false), 1600);
  };

  const themePref = theme?.pref || "auto";
  const themeResolved = theme?.resolved || "light";

  return (
    <div className="fade-in max-w-2xl mx-auto px-4 py-6 md:px-6 md:py-8 pb-28 md:pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go("dashboard")}
          className="h-9 w-9 shrink-0 rounded-xl border border-gray-100 bg-white flex items-center justify-center text-navy-500 hover:border-navy-800/15 transition-colors"
          aria-label="返回"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-navy-800">設定</h1>
          <p className="text-navy-400 text-sm mt-0.5">個人化你的 MeetFlow 體驗</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {/* 外觀 */}
        <Section icon={Palette} title="外觀主題" desc={themePref === "auto" ? `自動 · 目前為${themeResolved === "dark" ? "深色" : "淺色"}` : "選擇你偏好的顯示風格"}>
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((opt) => {
              const active = themePref === opt.value;
              const OptIcon = opt.Icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => theme?.setPref(opt.value)}
                  className={`relative flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 transition-all active:scale-[0.98]
                    ${active ? "border-mint-400 bg-mint-50/60 ring-2 ring-mint-200" : "border-gray-100 bg-white hover:border-mint-200"}`}
                >
                  {active && (
                    <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-mint-500 text-white flex items-center justify-center">
                      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                    </span>
                  )}
                  <OptIcon className={`h-5 w-5 ${active ? "text-mint-600" : "text-navy-400"}`} strokeWidth={2} />
                  <span className={`text-sm font-bold ${active ? "text-mint-700" : "text-navy-800"}`}>{opt.label}</span>
                  <span className="text-[10px] text-navy-400">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 基本資料 */}
        <Section icon={User} title="基本資料" desc="顯示名稱會出現在會議與協作中">
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={name.trim() || "U"} src={user?.photoURL} color={user?.avatarColor || "bg-mint-500"} size="h-12 w-12" />
            <div className="min-w-0">
              <p className="text-[11px] text-navy-300">登入帳號</p>
              <p className="text-sm font-medium text-navy-600 truncate">{user?.email}</p>
            </div>
          </div>
          <label className="text-xs font-semibold text-navy-500">顯示名稱</label>
          <div className="mt-1.5 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) saveName();
              }}
              placeholder="輸入你的名稱"
              className="flex-1 min-w-0 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-navy-800 placeholder-navy-300 shadow-sm focus:outline-none focus:border-mint-300 focus:ring-2 focus:ring-mint-100 transition-all"
            />
            <button
              type="button"
              onClick={saveName}
              disabled={!nameChanged && !savedName}
              className={`shrink-0 px-4 rounded-2xl text-sm font-bold transition-colors active:scale-95
                ${savedName ? "bg-mint-100 text-mint-700" : nameChanged ? "bg-mint-500 text-white hover:bg-mint-600" : "bg-navy-800/5 text-navy-300 cursor-not-allowed"}`}
            >
              {savedName ? "已儲存" : "儲存"}
            </button>
          </div>
        </Section>

        {/* 應用模式 */}
        <Section icon={AppWindow} title="應用模式" desc="切換後「發起會議」的場景與守門規則會立即改變">
          <div className="grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.id;
              const OptIcon = opt.Icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMode?.(opt.id)}
                  className={`relative text-left rounded-2xl border p-4 transition-all active:scale-[0.98]
                    ${active ? "border-mint-400 bg-mint-50/60 ring-2 ring-mint-200" : "border-gray-100 bg-white hover:border-mint-200"}`}
                >
                  {active && (
                    <span className="absolute top-3 right-3 h-4 w-4 rounded-full bg-mint-500 text-white flex items-center justify-center">
                      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                    </span>
                  )}
                  <OptIcon className={`h-5 w-5 ${active ? "text-mint-600" : "text-navy-400"}`} strokeWidth={2} />
                  <p className={`mt-2 font-black ${active ? "text-mint-700" : "text-navy-800"}`}>{opt.label}</p>
                  <p className="text-[11px] text-navy-400 mt-0.5 leading-snug">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </Section>

        {/* 帳號 */}
        <Section icon={LogOut} title="帳號" desc="登出後需重新輸入 Email 與密碼">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-coral-100 bg-coral-50 text-coral-500 font-bold py-3 hover:bg-coral-100 transition-colors active:scale-[0.98]"
          >
            <LogOut className="h-4 w-4" strokeWidth={2.2} />
            登出系統
          </button>
        </Section>

        {/* 關於 */}
        <Section icon={Info} title="關於 MeetFlow" desc="會議生命週期管理">
          <div className="flex items-center justify-between text-sm">
            <span className="text-navy-500">版本</span>
            <span className="font-semibold text-navy-700">v0.1.0</span>
          </div>
          <p className="mt-2 text-[11px] text-navy-400 leading-relaxed">
            守門把關每一場會議，讓時間花在真正值得的討論上。
          </p>
        </Section>
      </div>
    </div>
  );
}
