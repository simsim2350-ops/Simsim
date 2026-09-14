
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// معرّف بناء بسيط لاكتشاف نشرة جديدة (src/lib/deploymentVersion.js) — بلا أي
// backend/DB/WebSocket جديد. VERCEL_GIT_COMMIT_SHA يتوفر تلقائياً في بيئة بناء
// Vercel لكل نشرة؛ الاحتياط بالوقت الحالي يغطي التطوير المحلي فقط (لا يُستخدم هناك فعلياً).
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())

// يكتب dist/version.json وقت البناء فقط — يقرأه التطبيق نفسه من المتصفح (عند بدء
// التشغيل وعند عودة التبويب للظهور) ليقارن النشرة الحالية بما يُشغّله فعلياً.
function writeVersionFilePlugin() {
  return {
    name: 'simsim-write-version-file',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ buildId }))
    },
  }
}

export default defineConfig({
  plugins: [react(), writeVersionFilePlugin()],
  define: {
    __SIMSIM_BUILD_ID__: JSON.stringify(buildId),
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'marketing-ssr/**', 'menu-next/**', 'print-agent/**', 'tests/e2e/**'],
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
