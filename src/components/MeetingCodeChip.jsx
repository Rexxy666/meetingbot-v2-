import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { formatMeetingCode } from "./CreatedInviteModal.jsx";

export default function MeetingCodeChip({ code }) {
  const digits = String(code || "").replace(/\D/g, "");
  const [copied, setCopied] = useState(false);
  if (!digits) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(digits);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="點擊複製會議代碼"
      className="flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-full transition-colors"
    >
      <KeyRound className="h-3.5 w-3.5 opacity-80" strokeWidth={2} />
      <span className="tabular-nums tracking-wider">{formatMeetingCode(digits)}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-mint-300" strokeWidth={2.5} />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-70" strokeWidth={2} />
      )}
    </button>
  );
}
