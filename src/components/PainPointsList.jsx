export default function PainPointsList({ pains, compact = false, className = "" }) {
  if (!pains?.length) return null;

  if (compact) {
    return (
      <div className={className}>
        <p className="text-[10px] font-bold uppercase tracking-wide text-coral-500">要解決的痛點</p>
        <ul className="mt-2 space-y-1.5">
          {pains.map((p, i) => (
            <li key={i} className="flex gap-2 text-xs text-navy-600 leading-snug">
              <span className="h-4 w-4 shrink-0 rounded-full bg-coral-400 text-white text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={`bg-coral-50 border border-coral-100 rounded-2xl px-5 py-3.5 ${className}`}>
      <p className="text-xs font-bold text-coral-600 flex items-center gap-1.5">
        <span>🔥</span> 要解決的痛點與問題
      </p>
      <ul className="mt-2.5 space-y-2">
        {pains.map((p, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-navy-700 leading-snug">
            <span className="h-5 w-5 shrink-0 rounded-full bg-coral-400 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
