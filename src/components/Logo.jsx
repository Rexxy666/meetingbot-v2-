export default function Logo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <div className="relative h-9 w-9 rounded-xl bg-mint-500 shadow-glow flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4 4 10-10" />
        </svg>
      </div>
      <div className="leading-none">
        <div className="text-lg font-black text-navy-800 tracking-tight">
          關會 <span className="text-mint-600">GuanHui</span>
        </div>
        <div className="text-[10px] font-medium text-navy-400 tracking-widest">MEETING GATEKEEPER</div>
      </div>
    </div>
  );
}
