import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendor deps into dedicated chunks. Browser cache can then
        // reuse them across route navigations and across sessions, and adding
        // a feature that pulls in one library won't inflate every other route.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@supabase'))      return 'vendor-supabase'
          if (id.includes('@tanstack/react-query')) return 'vendor-query'
          if (id.includes('@tiptap'))        return 'vendor-tiptap'
          if (id.includes('@dnd-kit'))       return 'vendor-dnd'
          if (id.includes('@fullcalendar'))  return 'vendor-fullcalendar'
          if (id.includes('recharts') || id.includes('d3-'))  return 'vendor-charts'
          if (id.includes('@radix-ui'))      return 'vendor-radix'
          if (id.includes('lucide-react'))   return 'vendor-icons'
          if (id.includes('socket.io-client')) return 'vendor-socket'
          if (id.includes('dompurify'))      return 'vendor-dompurify'
          if (id.includes('date-fns') || id.includes('dayjs')) return 'vendor-date'
          return undefined
        },
      },
    },
  },
})
