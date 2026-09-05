
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'marketing-ssr/**', 'menu-next/**', 'tests/e2e/**'],
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'src/test/**',
        'src/**/*.test.{js,jsx}',
        'src/main.jsx',
        'src/integration/tests/**',
      ],
      thresholds: {
        statements: 60,
        branches: 53,
        functions: 45,
        lines: 63,
      },
    },
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
