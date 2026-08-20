// دالة خالصة لعرض "آخر تحديث" بصيغة نسبية (TASK-TRK-002) — تُختبَر بلا شبكة ولا React.

export function formatLastSynced(lastSyncedAt, now, isEn) {
  if (!lastSyncedAt) return null
  const seconds = Math.max(0, Math.round((now - lastSyncedAt) / 1000))
  if (seconds < 5) return isEn ? 'just now' : 'الآن'
  if (seconds < 60) return isEn ? `${seconds}s ago` : `قبل ${seconds} ث`
  const minutes = Math.round(seconds / 60)
  return isEn ? `${minutes}m ago` : `قبل ${minutes} د`
}
