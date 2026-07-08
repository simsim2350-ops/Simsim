// دوال مساعدة نقية لمنيو الزبون — بلا React وبلا حالة

// شارة مستوى السعرات: 🟢 منخفض (<300) / 🟡 متوسط (300-600) / 🔴 مرتفع (600+)
export function getCalorieBadge(calories) {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

// حساب حالة الفتح من أوقات العمل (مصفوفة 7 أيام {open, from, to}، الأحد = 0)
// يرجّع { open, unknown, todayText, nextText }
export function computeOpenStatus(hours) {
  // بدون أوقات محددة => نعتبره مفتوح دائماً (سلوك افتراضي متوافق مع القديم)
  if (!Array.isArray(hours) || hours.length !== 7) {
    return { open: true, unknown: true, todayText: '', nextText: '' }
  }
  const DAY_NAMES = ['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']

  const fmt = (t) => (t === '24:00' ? '00:00' : t)
  const toMins = (t) => {
    if (!t) return null
    const [h, m] = String(t).split(':').map(Number)
    return (h * 60) + (m || 0)
  }
  const now = new Date()
  const day = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const today = hours[day]
  const yesterday = hours[(day + 6) % 7]

  let open = false

  // فترة تمتد من أمس بعد منتصف الليل (مثال: 18:00 - 02:00)
  if (yesterday && yesterday.open) {
    const f = toMins(yesterday.from), t = toMins(yesterday.to)
    if (f !== null && t !== null && t <= f && mins < t) open = true
  }
  // فترة اليوم
  if (!open && today && today.open) {
    const f = toMins(today.from), t = toMins(today.to)
    if (f !== null && t !== null) {
      if (t > f) { if (mins >= f && mins < t) open = true }
      else { if (mins >= f) open = true } // تمتد بعد منتصف الليل
    }
  }

  const todayText = today && today.open
    ? `${fmt(today.from)} - ${fmt(today.to)}`
    : 'مغلق اليوم'

  // إيجاد أقرب موعد فتح قادم (لو مغلق حالياً)
  let nextText = ''
  if (!open) {
    for (let offset = 0; offset <= 7; offset++) {
      const idx = (day + offset) % 7
      const h = hours[idx]
      if (!h || !h.open) continue
      const f = toMins(h.from)
      if (f === null) continue
      if (offset === 0) {
        if (mins < f) { nextText = `يفتح اليوم الساعة ${fmt(h.from)}`; break }
        // اليوم لكن فات وقت الفتح — نكمل للأيام الجاية
      } else if (offset === 1) {
        nextText = `يفتح غداً الساعة ${fmt(h.from)}`; break
      } else {
        nextText = `يفتح ${DAY_NAMES[idx]} الساعة ${fmt(h.from)}`; break
      }
    }
  }

  return { open, unknown: false, todayText, nextText }
}
