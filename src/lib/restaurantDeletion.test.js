import { describe, expect, it, vi } from 'vitest'
import { deleteOwnedRestaurant } from './restaurantDeletion'

function createClient({ deleteResult = { data:[{ id:'restaurant-1' }], error:null }, media = [] } = {}) {
  const remove = vi.fn().mockResolvedValue({ error:null })
  const list = vi.fn().mockResolvedValue({ data:media, error:null })
  const select = vi.fn().mockResolvedValue(deleteResult)
  const query = {
    eq: vi.fn(function () { return this }),
    select,
  }
  const removeRow = vi.fn(() => query)
  const from = vi.fn((resource) => {
    if (resource === 'restaurants') return { delete: removeRow }
    throw new Error(`unexpected resource: ${resource}`)
  })
  const storageFrom = vi.fn(() => ({ list, remove }))

  return {
    client: { from, storage: { from: storageFrom } },
    calls: { remove, list, select, query, removeRow, from, storageFrom },
  }
}

describe('deleteOwnedRestaurant', () => {
  it('ينظف الوسائط ثم يحذف المطعم باستخدام restaurant_id وowner_id معًا', async () => {
    const { client, calls } = createClient({
      media: [{ id:'media-1', name:'logo.jpg' }, { id:'media-2', name:'cover.jpg' }],
    })

    const result = await deleteOwnedRestaurant({ restaurantId:'restaurant-1', ownerId:'owner-1', client })

    expect(result).toEqual({ restaurantId:'restaurant-1', deletedMediaCount:2 })
    expect(calls.storageFrom).toHaveBeenCalledWith('restaurant-media')
    expect(calls.remove).toHaveBeenCalledWith(['restaurant-1/logo.jpg', 'restaurant-1/cover.jpg'])
    expect(calls.from).toHaveBeenCalledWith('restaurants')
    expect(calls.removeRow).toHaveBeenCalledOnce()
    expect(calls.query.eq).toHaveBeenNthCalledWith(1, 'id', 'restaurant-1')
    expect(calls.query.eq).toHaveBeenNthCalledWith(2, 'owner_id', 'owner-1')
    expect(calls.select).toHaveBeenCalledWith('id')
  })

  it('يرفض التنفيذ عندما لا يعيد الحذف صف مطعم مملوكًا للمستخدم الحالي', async () => {
    const { client } = createClient({ deleteResult:{ data:[], error:null } })

    await expect(deleteOwnedRestaurant({ restaurantId:'restaurant-1', ownerId:'different-owner', client }))
      .rejects.toMatchObject({ code:'not_owner_or_missing' })
  })

  it('يرفض غياب معرّف المطعم أو المالك قبل استدعاء Supabase', async () => {
    const { client, calls } = createClient()

    await expect(deleteOwnedRestaurant({ restaurantId:'', ownerId:'owner-1', client })).rejects.toThrow('معرّف المطعم مطلوب')
    await expect(deleteOwnedRestaurant({ restaurantId:'restaurant-1', ownerId:'', client })).rejects.toThrow('معرّف المالك مطلوب')
    expect(calls.from).not.toHaveBeenCalled()
  })
})
