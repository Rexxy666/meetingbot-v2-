const SIZE_TEXT = {
  "h-5 w-5": "text-[10px]",
  "h-6 w-6": "text-[10px]",
  "h-7 w-7": "text-[11px]",
  "h-9 w-9": "text-sm",
  "h-12 w-12": "text-base",
  "h-16 w-16": "text-xl",
  "h-24 w-24": "text-3xl",
};

export default function Avatar({
  name,
  src = "",
  color = "bg-mint-500",
  size = "h-9 w-9",
  ring = true,
  className = "",
}) {
  const initials = name ? String(name).trim().charAt(0).toUpperCase() || "?" : "?";
  const textSize = SIZE_TEXT[size] || "text-sm";
  const photo = String(src || "").trim();

  return (
    <div
      className={`${size} ${photo ? "bg-navy-800/10" : color} ${
        ring ? "ring-2 ring-white shadow-card" : ""
      } rounded-full flex items-center justify-center text-white font-bold ${textSize} overflow-hidden shrink-0 ${className}`}
    >
      {photo ? (
        <img src={photo} alt={name || "avatar"} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}
