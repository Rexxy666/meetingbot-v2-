import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // 👈 確保這行是相對路徑，解決 Render Static Site 找不到資產的問題
})
