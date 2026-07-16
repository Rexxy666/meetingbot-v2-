export default function Tag({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-150 border
        ${active
          ? "bg-mint-500 text-white border-mint-500 shadow-glow"
          : "bg-mint-50 text-mint-700 border-mint-100 hover:bg-mint-100 hover:border-mint-200"}`}
    >
      {children}
    </button>
  );
}
