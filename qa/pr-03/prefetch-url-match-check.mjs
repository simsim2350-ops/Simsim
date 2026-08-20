import { createSupabaseWebpSrcSet, createSupabaseImageTransform } from '../../src/features/menu/imageTransforms.js'

const SRC = 'https://gpwwnuuicywsvmmhxngs.supabase.co/storage/v1/object/public/products/burger.jpg'

// exactly what ProductItem passes to ResponsiveMenuImage, per layout
const RENDERED = {
  circles:  { widths:[128,240,320], quality:72, width:'104', height:'104' },
  grid:     { widths:[240,480,640], quality:72, width:'240', height:'240' },
  showcase: { widths:[480,720,960], quality:76, width:'480', height:'360' },
  list:     { widths:[128,240,320], quality:72, width:'108', height:'108' },
}

for (const [layout, c] of Object.entries(RENDERED)) {
  // what <img>/<source> will REQUEST (ResponsiveMenuImage passes {width,height})
  const actual = createSupabaseWebpSrcSet(SRC, c.widths, c.quality, { width: c.width, height: c.height })
  // what imagePrefetch.js WARMS (no {width,height} passed)
  const warmed = createSupabaseWebpSrcSet(SRC, c.widths, c.quality)
  const warmedHref = createSupabaseImageTransform(SRC, { width: c.widths[0], quality: c.quality })

  const a1 = actual.split(', ')[0].split(' ')[0]
  const w1 = warmed.split(', ')[0].split(' ')[0]
  console.log(`\n===== layout: ${layout} =====`)
  console.log('  <img> requests :', a1)
  console.log('  prefetch warms :', w1)
  console.log('  href warms     :', warmedHref)
  console.log('  SRCSET MATCH?  :', actual === warmed ? 'YES' : 'NO  <-- cache miss')
}
