/** 無照片時的預設頭像底色（Tailwind class） */
export const AVATAR_COLORS = [
  { id: "mint", className: "bg-mint-500", swatch: "#14B8A6" },
  { id: "coral", className: "bg-coral-500", swatch: "#F97066" },
  { id: "sky", className: "bg-sky-500", swatch: "#0EA5E9" },
  { id: "navy", className: "bg-navy-700", swatch: "#1A3352" },
  { id: "violet", className: "bg-violet-500", swatch: "#8B5CF6" },
  { id: "amber", className: "bg-amber-500", swatch: "#F59E0B" },
];

export function resolveAvatarColor(value) {
  const found = AVATAR_COLORS.find((c) => c.className === value || c.id === value);
  return found?.className || "bg-mint-500";
}
