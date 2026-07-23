import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Pencil, X } from "lucide-react";
import Avatar from "./Avatar.jsx";
import { AVATAR_COLORS, resolveAvatarColor } from "../lib/avatarColors.js";
import { uploadAvatarFile } from "../lib/avatarUpload.js";

/**
 * 個人頁 Hero：頭像上傳／配色、原地編輯顯示名稱
 */
export default function UserProfileCard({ user, modeLabel, updateProfile }) {
  const fileRef = useRef(null);
  const displayName = String(user?.name || "").trim() || "使用者";
  const email = String(user?.email || "").trim() || "尚未設定 Email";
  const photoURL = String(user?.photoURL || "").trim();
  const avatarColor = resolveAvatarColor(user?.avatarColor);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!editing) setDraftName(displayName);
  }, [displayName, editing]);

  const startEdit = () => {
    setDraftName(displayName);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraftName(displayName);
    setError(null);
    setEditing(false);
  };

  const saveName = async () => {
    const next = draftName.trim();
    if (!next) {
      setError("名稱不可為空");
      return;
    }
    if (next === displayName) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateProfile?.({ name: next });
      setEditing(false);
    } catch (e) {
      setError(e?.message || "儲存名稱失敗");
    } finally {
      setBusy(false);
    }
  };

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadAvatarFile(file, user?.id);
      await updateProfile?.({ photoURL: url });
    } catch (err) {
      setError(err?.message || "上傳頭像失敗");
    } finally {
      setUploading(false);
    }
  };

  const onSelectColor = async (className) => {
    setError(null);
    try {
      await updateProfile?.({ avatarColor: className, photoURL: "" });
    } catch (err) {
      setError(err?.message || "更新配色失敗");
    }
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-navy-800/8 shadow-card mb-5">
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #0F1B2D 0%, #1A3352 48%, #0D9488 140%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 20%, rgba(255,255,255,0.18), transparent 42%), radial-gradient(circle at 88% 10%, rgba(45,212,191,0.25), transparent 36%)",
        }}
      />

      <div className="relative px-6 pt-10 pb-8 flex flex-col items-center text-center">
        <div className="relative">
          <div className="rounded-full p-1 bg-white/15 backdrop-blur-md ring-1 ring-white/25 shadow-card-hover">
            <Avatar
              name={displayName}
              src={photoURL}
              color={avatarColor}
              size="h-24 w-24"
              ring={false}
              className="text-3xl"
            />
          </div>
          <button
            type="button"
            onClick={onPickFile}
            disabled={uploading}
            aria-label="更換頭像"
            className="absolute -bottom-0.5 -right-0.5 h-9 w-9 rounded-full bg-white text-navy-700 shadow-card border border-navy-800/10 flex items-center justify-center hover:bg-mint-50 hover:text-mint-700 transition-colors disabled:opacity-60 active:scale-95"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
            ) : (
              <Camera className="h-4 w-4" strokeWidth={2.2} />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          {AVATAR_COLORS.map((c) => {
            const active = !photoURL && avatarColor === c.className;
            return (
              <button
                key={c.id}
                type="button"
                title={c.id}
                aria-label={`頭像配色 ${c.id}`}
                onClick={() => onSelectColor(c.className)}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  active ? "border-white scale-110 shadow-md" : "border-white/30"
                }`}
                style={{ backgroundColor: c.swatch }}
              />
            );
          })}
        </div>
        {photoURL && (
          <button
            type="button"
            onClick={() => onSelectColor(avatarColor)}
            className="mt-2 text-[11px] font-semibold text-white/60 hover:text-white/90 transition-colors"
          >
            改用縮寫頭像
          </button>
        )}

        {editing ? (
          <div className="mt-4 w-full max-w-sm">
            <div className="flex items-center gap-2">
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelEdit();
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) saveName();
                }}
                autoFocus
                maxLength={80}
                className="flex-1 min-w-0 rounded-xl border border-white/20 bg-white/95 px-3 py-2 text-sm font-bold text-navy-800 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-mint-300"
                placeholder="顯示名稱"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-mint-500 text-white text-xs font-bold px-3 py-2 hover:bg-mint-600 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                儲存
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1 rounded-xl bg-white/15 text-white text-xs font-bold px-3 py-2 hover:bg-white/25 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                取消
              </button>
            </div>
          </div>
        ) : (
          <h1 className="mt-4 text-2xl md:text-3xl font-black text-white tracking-tight inline-flex items-center gap-2">
            <span>{displayName}</span>
            <button
              type="button"
              onClick={startEdit}
              aria-label="編輯顯示名稱"
              className="h-8 w-8 rounded-full bg-white/12 border border-white/20 text-white/85 hover:bg-white/20 hover:text-white flex items-center justify-center transition-colors active:scale-95"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </h1>
        )}

        <p className="mt-1.5 text-sm text-white/75 max-w-full truncate">{email}</p>

        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/12 backdrop-blur-md border border-white/20 px-3 py-1 text-[11px] font-bold text-mint-200">
          {modeLabel || "企業模式"}
        </span>

        {error && (
          <p className="mt-3 text-xs text-coral-200 bg-coral-500/20 border border-coral-400/30 rounded-xl px-3 py-2 max-w-sm">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
