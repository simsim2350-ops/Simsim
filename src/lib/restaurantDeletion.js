const MEDIA_BUCKET = 'restaurant-media'
const LIST_PAGE_SIZE = 1000

function required(value, label) {
  if (!value || typeof value !== 'string') throw new Error(`${label} مطلوب لإتمام الحذف بأمان`)
}

async function collectMediaPaths(client, prefix) {
  const { data, error } = await client.storage.from(MEDIA_BUCKET).list(prefix, {
    limit: LIST_PAGE_SIZE,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error) throw error

  const entries = Array.isArray(data) ? data : []
  const paths = []
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`
    // Supabase Storage يعيد id للملف وid فارغاً للمجلد الافتراضي.
    if (entry.id) {
      paths.push(path)
    } else {
      paths.push(...await collectMediaPaths(client, path))
    }
  }
  return paths
}

async function removeMedia(client, restaurantId) {
  const paths = await collectMediaPaths(client, restaurantId)
  for (let index = 0; index < paths.length; index += LIST_PAGE_SIZE) {
    const { error } = await client.storage
      .from(MEDIA_BUCKET)
      .remove(paths.slice(index, index + LIST_PAGE_SIZE))
    if (error) throw error
  }
  return paths.length
}

/**
 * يحذف مطعم المالك الحالي فقط. يعتمد التنفيذ على RLS في restaurants_owner
 * وعلى قيود ON DELETE CASCADE في قاعدة البيانات؛ لا يستخدم service_role أو owner_id من طلب خارجي.
 */
export async function deleteOwnedRestaurant({ restaurantId, ownerId, client }) {
  required(restaurantId, 'معرّف المطعم')
  required(ownerId, 'معرّف المالك')
  if (!client?.from || !client?.storage?.from) {
    throw new Error('عميل Supabase مطلوب لإتمام الحذف بأمان')
  }

  // تنظف الوسائط أولًا؛ إذ تعتمد سياسة Storage على وجود سجل المطعم وملكيته.
  const deletedMediaCount = await removeMedia(client, restaurantId)

  const { data, error } = await client
    .from('restaurants')
    .delete()
    .eq('id', restaurantId)
    .eq('owner_id', ownerId)
    .select('id')

  if (error) throw error
  if (!data || data.length !== 1) {
    const deletionError = new Error('لم يتم العثور على مطعم تملكه أو أن الصلاحية لم تعد متاحة')
    deletionError.code = 'not_owner_or_missing'
    throw deletionError
  }

  return { restaurantId: data[0].id, deletedMediaCount }
}
