import { useState } from "react";

function PasswordField({ value, onChange, placeholder = "至少 6 碼" }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        required
        minLength={6}
        autoComplete="current-password"
        placeholder={placeholder}
        className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 pr-12 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-navy-400 hover:text-navy-700 hover:bg-navy-800/5 transition-colors"
        aria-label={visible ? "隱藏密碼" : "顯示密碼"}
        title={visible ? "隱藏密碼" : "顯示密碼"}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

export default function Auth({ auth }) {
  const [mode, setMode] = useState("login"); // login | register
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    const cleanEmail = email.trim().toLowerCase();
    try {
      if (mode === "register") {
        await auth.register({ name: name.trim(), email: cleanEmail, password });
      } else {
        await auth.login({ email: cleanEmail, password });
      }
    } catch (err) {
      setError(err.message || "操作失敗");
      if (err.status === 404 || /尚未註冊/.test(err.message || "")) {
        setHint("提示：帳號存在後端，不是瀏覽器。若你換過本機／Render 後端，請重新註冊一次。");
      }
    } finally {
      setBusy(false);
    }
  };

  const clearCache = () => {
    auth.resetLocalCache?.();
    setError(null);
    setHint("已清除本機登入快取。請重新註冊或登入。");
    setPassword("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gradient-to-b from-mint-50/80 to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-mint-600 tracking-tight">MeetFlow</h1>
          <p className="mt-2 text-sm text-navy-400">登入後只會看到屬於你的會議與待辦</p>
          <p className="mt-1 text-[11px] text-navy-300">後端：{auth.apiBase || "—"}</p>
        </div>

        <div className="bg-white border border-navy-800/8 rounded-3xl shadow-card p-6">
          <div className="flex gap-1 p-1 rounded-2xl bg-navy-800/[0.03] mb-6">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
                setHint(null);
              }}
              className={`flex-1 text-sm font-semibold py-2 rounded-xl transition-colors ${mode === "login" ? "bg-white text-mint-600 shadow-card" : "text-navy-400"}`}
            >
              登入
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setHint(null);
              }}
              className={`flex-1 text-sm font-semibold py-2 rounded-xl transition-colors ${mode === "register" ? "bg-white text-mint-600 shadow-card" : "text-navy-400"}`}
            >
              註冊
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-bold text-navy-700 mb-1.5">姓名</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="例：Rex"
                  className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-navy-800/10 px-4 py-3 text-sm text-navy-800 placeholder-navy-300 focus:border-mint-400 focus:shadow-glow transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-navy-700 mb-1.5">密碼</label>
              <PasswordField value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && (
              <p className="text-sm text-coral-500 bg-coral-50 border border-coral-100 rounded-xl px-3 py-2">{error}</p>
            )}
            {hint && (
              <p className="text-xs text-navy-500 bg-navy-800/[0.03] border border-navy-800/8 rounded-xl px-3 py-2">{hint}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full font-bold py-3 rounded-2xl bg-mint-500 text-white shadow-glow hover:bg-mint-600 disabled:opacity-60 transition-colors"
            >
              {busy ? "處理中…" : mode === "register" ? "建立帳號" : "登入"}
            </button>
          </form>

          <button
            type="button"
            onClick={clearCache}
            className="mt-4 w-full text-xs font-semibold text-navy-400 hover:text-coral-500 transition-colors"
          >
            登入異常？清除本機登入快取
          </button>
        </div>
      </div>
    </div>
  );
}
