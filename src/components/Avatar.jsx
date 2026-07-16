export default function Avatar({ name, color = "bg-mint-500", size = "h-9 w-9", ring = true }) {
  const initials = name ? name[0].toUpperCase() : "R";
  return (
    <div className={`${size} ${color} ${ring ? "ring-2 ring-white shadow-card" : ""} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
      {initials}
    </div>
  );
}
