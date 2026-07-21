import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Firebase Hosting 用絕對根路徑；本機仍可正常開發
  base: "/",
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
})
