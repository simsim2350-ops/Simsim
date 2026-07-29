// ============================================================================
// حارس سجل القدرات (Capability Registry guard) — ADR-40 · M2
// فحص ثابت (Offline) — أي مخالفة توقف الدمج في CI (نمط ADR-28).
// يفرض: snake_case · تفرّد · صحة الأنواع/النطاقات/الحالات · صحة مراجع
// (parent/supersedes/category/dependencies) · قواعد الأنواع (mode/limit) ·
// «سجّل أولاً» + منع استخدام مفتاح قدرة مباشرة في الواجهة (يمرّ عبر Feature API فقط).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CATEGORIES, CAPABILITIES, DEPENDENCIES } from './features.manifest.js'
import { buildSeedSQL } from './buildSeedSQL.js'

const SNAKE = /^[a-z][a-z0-9_]*(@[0-9]+)?$/
const TYPES = ['feature', 'limit', 'option', 'mode']
const SCOPES = ['platform', 'restaurant', 'user']
const LIFECYCLES = ['draft', 'active', 'deprecated', 'archived']
const RUNTIMES = ['enabled', 'disabled', 'beta', 'preview']

const capKeys = new Set(CAPABILITIES.map((c) => c.key))
const catKeys = new Set(CATEGORIES.map((c) => c.key))

describe('حارس سجل القدرات — الفئات', () => {
  it('مفاتيح الفئات snake_case وفريدة', () => {
    const seen = new Set()
    for (const c of CATEGORIES) {
      expect(SNAKE.test(c.key), `فئة بمفتاح غير snake_case: ${c.key}`).toBe(true)
      expect(seen.has(c.key), `فئة مكرّرة: ${c.key}`).toBe(false)
      seen.add(c.key)
      expect(!!c.name, `فئة بلا name: ${c.key}`).toBe(true)
    }
  })
})

describe('حارس سجل القدرات — القدرات', () => {
  it('كل مفتاح قدرة snake_case وفريد', () => {
    const seen = new Set()
    for (const c of CAPABILITIES) {
      expect(SNAKE.test(c.key), `قدرة بمفتاح غير snake_case: ${c.key}`).toBe(true)
      expect(seen.has(c.key), `قدرة مكرّرة: ${c.key}`).toBe(false)
      seen.add(c.key)
    }
  })

  it.each(CAPABILITIES.map((c) => [c.key, c]))('القدرة %s صحيحة الحقول', (_k, c) => {
    expect(!!c.name, `${c.key}: بلا name`).toBe(true)
    expect(TYPES.includes(c.type), `${c.key}: type غير صالح (${c.type})`).toBe(true)
    expect(SCOPES.includes(c.scope || 'restaurant'), `${c.key}: scope غير صالح`).toBe(true)
    expect(LIFECYCLES.includes(c.lifecycle_status || 'active'), `${c.key}: lifecycle غير صالح`).toBe(true)
    expect(RUNTIMES.includes(c.runtime_status || 'enabled'), `${c.key}: runtime غير صالح`).toBe(true)
    // مراجع
    if (c.category) expect(catKeys.has(c.category), `${c.key}: فئة غير موجودة (${c.category})`).toBe(true)
    if (c.parent) expect(capKeys.has(c.parent), `${c.key}: parent غير موجود (${c.parent})`).toBe(true)
    if (c.supersedes) expect(capKeys.has(c.supersedes), `${c.key}: supersedes غير موجود (${c.supersedes})`).toBe(true)
    // قواعد الأنواع
    if (c.type === 'mode') {
      expect(Array.isArray(c.allowed_values) && c.allowed_values.length > 0, `${c.key}: mode بلا allowed_values`).toBe(true)
      expect(c.allowed_values.includes(c.default_value), `${c.key}: default_value خارج allowed_values`).toBe(true)
    }
    if (c.type === 'limit') {
      expect(!!c.metric, `${c.key}: limit بلا metric`).toBe(true)
    }
  })

  it('لا قدرة تعتمد على نفسها كأب', () => {
    for (const c of CAPABILITIES) expect(c.parent !== c.key, `${c.key}: parent = نفسها`).toBe(true)
  })
})

describe('حارس سجل القدرات — التبعيات', () => {
  it.each(DEPENDENCIES.map((d, i) => [`${d.feature}->${d.depends_on}#${i}`, d]))(
    'التبعية %s تشير لمفاتيح موجودة وصحيحة النوع',
    (_id, d) => {
      expect(capKeys.has(d.feature), `تبعية: feature غير موجود (${d.feature})`).toBe(true)
      expect(capKeys.has(d.depends_on), `تبعية: depends_on غير موجود (${d.depends_on})`).toBe(true)
      expect(d.feature !== d.depends_on, `تبعية ذاتية: ${d.feature}`).toBe(true)
      expect(['required', 'optional', 'conflicts'].includes(d.type || 'required'), `تبعية: نوع غير صالح`).toBe(true)
    },
  )
})

describe('حارس سجل القدرات — البذر (buildSeedSQL)', () => {
  it('يُنتج SQL يغطّي كل الفئات والقدرات والتبعيات بلا خطأ', () => {
    const sql = buildSeedSQL({ CATEGORIES, CAPABILITIES, DEPENDENCIES })
    for (const c of CATEGORIES) expect(sql.includes(`'${c.key}'`), `بذر ناقص للفئة ${c.key}`).toBe(true)
    for (const c of CAPABILITIES) expect(sql.includes(`'${c.key}'`), `بذر ناقص للقدرة ${c.key}`).toBe(true)
    // كل عبارة UPSERT (لا INSERT صريح بلا on conflict — تنفيذ متكرّر آمن)
    for (const line of sql.split('\n')) {
      if (line.startsWith('insert into')) expect(/on conflict/.test(line), `بذر بلا on conflict: ${line.slice(0, 60)}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// «سجّل أولاً» + منع الاستخدام المباشر للمفتاح في الواجهة (ADR-40 حوكمة 9):
// أي فحص قدرة في تطبيق العميل يجب أن يمرّ عبر Feature API (features.has(...)) —
// يُمنع الوصول المباشر لـ has_feature/feature_flags خارج طبقة الوصول المسموح لها.
// (M2: لا استخدام بعد؛ الفحص استباقي — يمنع الانحراف عند بناء M4.)
// ---------------------------------------------------------------------------
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED = new Set([
  join(SRC, 'lib', 'featuresApi.js'),          // طبقة الوصول (تُبنى في M4)
  join(SRC, 'lib', 'features.js'),             // طبقة Domain (تُبنى في M4)
  join(SRC, 'admin', 'features', 'flags', 'flagsApi.js'), // أدمن المزايا القائم (admin_* فقط)
])
const FORBIDDEN = /\.rpc\(\s*['"]has_feature['"]|\bfeature_flags\s*\./

function walk(dir) {
  const files = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) files.push(...walk(p))
    else if (/\.(js|jsx)$/.test(p)) files.push(p)
  }
  return files
}

describe('حارس سجل القدرات — منع الاستخدام المباشر', () => {
  it('لا وصول مباشر لـ has_feature/feature_flags خارج طبقة الوصول المسموح لها', () => {
    const offenders = []
    for (const file of walk(SRC)) {
      if (ALLOWED.has(file) || file.includes(`${join('src', 'registry')}`)) continue
      if (file.endsWith('.test.js') || file.endsWith('.test.jsx')) continue
      if (FORBIDDEN.test(readFileSync(file, 'utf8'))) offenders.push(file)
    }
    expect(offenders, `استخدام مباشر ممنوع في: ${offenders.join(', ')} — استخدم Feature API`).toEqual([])
  })
})
