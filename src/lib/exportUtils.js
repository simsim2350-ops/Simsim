// أدوات التصدير المشتركة (CSV / طباعة / PDF عبر الطباعة) — ADR-39/P3.2
// صفر تبعيات خارجية: CSV يُولَّد أصلياً، والطباعة عبر المتصفح (تدعم «حفظ كـPDF»).
// الطبقة مصمَّمة لتقبل مزوّد Excel حقيقياً لاحقاً بلا تعديل المتصلين (Open/Closed).

// تهريب خلية CSV (فواصل/اقتباسات/أسطر جديدة)
function escapeCell(value) {
  if (value == null) return ''
  const s = String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// تحويل صفوف إلى نص CSV.
// columns: [{ key, label, format? }] — format(value, row) اختيارية.
export function toCSV(rows, columns) {
  const header = columns.map(c => escapeCell(c.label)).join(',')
  const body = (rows || []).map(row =>
    columns.map(c => {
      const raw = typeof c.key === 'function' ? c.key(row) : row[c.key]
      return escapeCell(c.format ? c.format(raw, row) : raw)
    }).join(',')
  )
  return [header, ...body].join('\r\n')
}

// تنزيل نص CSV كملف.
// ⚠️ BOM (﻿) ضروري: بدونه يعرض Excel النص العربي كرموز مشوّهة.
export function downloadCSV(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// تصدير صفوف مباشرةً (اختصار شائع).
export function exportRows(filename, rows, columns) {
  downloadCSV(filename, toCSV(rows, columns))
}

// اسم ملف بتاريخ اليوم (يمنع الكتابة فوق ملفات سابقة)
export function stampName(base) {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))

// بناء جدول HTML للطباعة
export function buildTable(rows, columns) {
  const head = columns.map(c => `<th>${esc(c.label)}</th>`).join('')
  const body = (rows || []).map(row => {
    const tds = columns.map(c => {
      const raw = typeof c.key === 'function' ? c.key(row) : row[c.key]
      return `<td>${esc(c.format ? c.format(raw, row) : raw)}</td>`
    }).join('')
    return `<tr>${tds}</tr>`
  }).join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

// طباعة تقرير (والمتصفح يتيح «حفظ كـPDF» من نافذة الطباعة).
// sections: [{ title?, html }] — أو مرّر html واحداً.
// يستخدم iframe مخفياً (أوثق من نافذة منبثقة التي قد يحجبها المتصفح).
export function printReport({ title, subtitle, sections = [] }) {
  const content = sections.map(s =>
    `${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${s.html || ''}`
  ).join('')

  const doc = `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Tajawal, Cairo, system-ui, sans-serif; direction: rtl; color: #0B0B0F; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #6B7280; font-size: 12px; margin-bottom: 18px; }
  h2 { font-size: 14px; margin: 20px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #FF6A00; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; }
  th, td { border: 1px solid #E5E7EB; padding: 6px 8px; text-align: right; }
  th { background: #F8F9FB; font-weight: 700; }
  tr:nth-child(even) td { background: #FCFCFD; }
  .kv { display: flex; flex-wrap: wrap; gap: 8px; }
  .kv div { border: 1px solid #E5E7EB; border-radius: 8px; padding: 8px 12px; font-size: 12px; }
  .kv b { display: block; font-size: 15px; color: #FF6A00; margin-top: 2px; }
  @page { margin: 14mm; }
</style></head>
<body>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  ${content}
</body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)
  const w = iframe.contentWindow
  w.document.open()
  w.document.write(doc)
  w.document.close()
  // ننتظر تحميل المحتوى (الخطوط/التخطيط) قبل استدعاء الطباعة
  setTimeout(() => {
    try { w.focus(); w.print() } finally {
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }
  }, 250)
}
