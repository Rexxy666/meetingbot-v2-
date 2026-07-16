/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // 主色調 — 明亮薄荷綠/青綠（高效、通行）
        mint: {
          50: "#EFFCF9",
          100: "#D3F7F0",
          200: "#A7EFE1",
          300: "#6FE3CE",
          400: "#33D0B6",
          500: "#14B8A6", // 品牌主色
          600: "#0E9488",
          700: "#0F766E",
        },
        // 輔助色 — 溫和亮橘（警告、倒數）
        coral: {
          50: "#FFF6F1",
          100: "#FFE9DD",
          200: "#FFD0B8",
          300: "#FFB088",
          400: "#FF8A5B",
          500: "#F97236",
        },
        // 深碳藍 — 主要文字與卡片邊框
        navy: {
          400: "#5A6B82",
          600: "#33445C",
          700: "#243449",
          800: "#1B2838",
          900: "#0F1B2D",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,27,45,0.04), 0 8px 24px rgba(15,27,45,0.06)",
        "card-hover": "0 4px 12px rgba(15,27,45,0.08), 0 16px 40px rgba(15,27,45,0.10)",
        glow: "0 0 0 4px rgba(20,184,166,0.12)",
      },
      fontFamily: {
        sans: ['"Inter"', '"Noto Sans TC"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
