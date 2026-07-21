import { useState } from "react";
import { isFirebaseConfigured } from "../lib/firebase.js";

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

  const googleLogin = async () => {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      await auth.loginWithGoogle();
    } catch (err) {
      const msg = err?.code === "auth/popup-closed-by-user"
        ? "已取消 Google 登入"
        : err?.message || "Google 登入失敗";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-gradient-to-b from-mint-50/80 to-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-mint-600 tracking-tight">MeetFlow</h1>
          <p className="mt-2 text-sm text-navy-400">登入後只會看到屬於你的會議與待辦</p>
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

          {isFirebaseConfigured && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-navy-800/8" />
                <span className="text-[11px] font-semibold text-navy-300">或</span>
                <div className="h-px flex-1 bg-navy-800/8" />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={googleLogin}
                className="w-full inline-flex items-center justify-center gap-2.5 font-bold py-3 rounded-2xl border border-navy-800/10 bg-white text-navy-800 hover:bg-navy-800/[0.03] disabled:opacity-60 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                使用 Google 登入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
