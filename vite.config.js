import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // 👈 確保這行是相對路徑，解決 Render Static Site 找不到資產的問題
  server: {
    host: true, // 允許手機用 LAN IP 連前端（例如 192.168.50.51:5174）
    port: 5174,
    strictPort: true, // 埠被占用就失敗，避免跳到 5175 導致登入狀態「消失」
  },
})
