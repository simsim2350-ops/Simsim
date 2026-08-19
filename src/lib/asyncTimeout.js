export class AsyncTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`Timed out while waiting for ${operation}.`)
    this.name = 'AsyncTimeoutError'
    this.code = 'SIMSIM_ASYNC_TIMEOUT'
    this.operation = operation
    this.timeoutMs = timeoutMs
  }
}

// يمنع ترك واجهة تعتمد على Promise شبكة معلّقة في حالة تحميل دائمة.
// لا يلغي الطلب الأصلي (عميل Supabase لا يوفّر AbortSignal هنا)، لكنه يحرر مسار الواجهة
// لعرض حالة خطأ قابلة لإعادة المحاولة، ويتجاهل حراس الإصدارات النتائج المتأخرة.
export function withTimeout(promise, { operation = 'request', timeoutMs = 12_000 } = {}) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new AsyncTimeoutError(operation, timeoutMs)), timeoutMs)
  })

  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer !== null) globalThis.clearTimeout(timer)
  })
}

export function isTimeoutError(error) {
  return error?.code === 'SIMSIM_ASYNC_TIMEOUT'
}
