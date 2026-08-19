// PostgrestFilterBuilder thenable وليس Promise كاملاً؛ لا يوفّر catch().
// Promise.resolve يبدأ الاستعلام ويحوّله إلى Promise حقيقي قبل معالجة الخطأ fail-open.
export const safeSupabaseRequest = (request) => Promise.resolve(request).catch((error) => ({ data: null, error }))
