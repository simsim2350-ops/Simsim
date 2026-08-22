
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'marketing-ssr/**', 'tests/e2e/**'],
    setupFiles: ['./src/test/setup.js'],
  },
  build: {
    rollupOptions: {
      output: {
        // فصل المكتبات المشتركة عن كود الصفحات (الصفحات نفسها تنقسم تلقائياً عبر lazy)
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
})
