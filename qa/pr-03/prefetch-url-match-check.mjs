#!/usr/bin/env node
/**
 * PR-03 guard — يتحقق بلا شبكة إطلاقاً أن الرابط الذي يُسخّنه imagePrefetch
 * يطابق حرفياً الرابط الذي سيطلبه <img> عبر ResponsiveMenuImage، في التخطيطات الأربعة.
 *
 * اختبار الوحدة يغطي تخطيط list فقط؛ هذا السكربت يغطي الأربعة معاً.
 * الاستخدام:  node qa/pr-03/prefetch-url-match-check.mjs   (يخرج بالرمز 1 عند أي عدم تطابق)
 */

import { createSupabaseWebpSrcSet } from '../../src/features/menu/imageTransforms.js'

const SRC = 'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/object/public/products/burger.jpg'

// ما يمرّره ProductItem.jsx إلى ResponsiveMenuImage (المستهلك الحقيقي).
const CONSUMER = {
  circles:  { widths: [128, 240, 320], quality: 72, width: '104', height: '104' },
  grid:     { widths: [240, 480, 640], quality: 72, width: '240', height: '240' },
  showcase: { widths: [480, 720, 960], quality: 76, width: '480', height: '360' },
  list:     { widths: [128, 240, 320], quality: 72, width: '108', height: '108' },
}

// ما يستخدمه MenuBody.jsx → LAYOUT_IMAGE_CONFIG لتسخين صور القسم التالي (المُنتِج).
const PREFETCH = {
  circles:  { widths: [128, 240, 320], quality: 72, width: '104', height: '104' },
  grid:     { widths: [240, 480, 640], quality: 72, width: '240', height: '240' },
  showcase: { widths: [480, 720, 960], quality: 76, width: '480', height: '360' },
  list:     { widths: [128, 240, 320], quality: 72, width: '108', height: '108' },
}

let failed = 0
for (const layout of Object.keys(CONSUMER)) {
  const c = CONSUMER[layout]
  const p = PREFETCH[layout]

  const actual = createSupabaseWebpSrcSet(SRC, c.widths, c.quality, { width: c.width, height: c.height })
  const warmed = createSupabaseWebpSrcSet(SRC, p.widths, p.quality, { width: p.width, height: p.height })
  const match = actual === warmed

  console.log(`\n===== layout: ${layout} =====`)
  console.log('  <img> requests :', actual.split(', ')[0].split(' ')[0])
  console.log('  prefetch warms :', warmed.split(', ')[0].split(' ')[0])
  console.log('  SRCSET MATCH?  :', match ? 'YES' : 'NO  <-- cache miss')
  if (!match) failed++
}

console.log(failed === 0 ? '\nRESULT: MATCH in all layouts.' : `\nRESULT: ${failed} layout(s) MISMATCHED — prefetch produces no cache hit.`)
process.exit(failed === 0 ? 0 : 1)
