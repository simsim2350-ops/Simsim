import { describe, expect, it, vi, afterEach } from 'vitest'
import { CURRENT_BUILD_ID, checkForNewDeployment } from './deploymentVersion'

describe('deploymentVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('CURRENT_BUILD_ID مضمَّن فعلياً وقت البناء (vite.config.js define)، وليس undefined', () => {
    expect(CURRENT_BUILD_ID).toBeTruthy()
  })

  it('checkForNewDeployment يعيد false عندما يطابق buildId في version.json البناء الحالي', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ buildId: CURRENT_BUILD_ID }) })))
    await expect(checkForNewDeployment()).resolves.toBe(false)
  })

  it('checkForNewDeployment يعيد true عندما يختلف buildId فعلاً — نشرة جديدة', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ buildId: 'a-totally-different-build-id' }) })))
    await expect(checkForNewDeployment()).resolves.toBe(true)
  })

  it('checkForNewDeployment يعيد false بأمان عند فشل الشبكة — لا يُزعج المستخدم ولا يُعتبر نشرة جديدة', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    await expect(checkForNewDeployment()).resolves.toBe(false)
  })

  it('checkForNewDeployment يعيد false عندما تستجيب /version.json بحالة غير ناجحة', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    await expect(checkForNewDeployment()).resolves.toBe(false)
  })

  it('checkForNewDeployment يستدعي /version.json بـcache: no-store لتفادي أي تخزين مؤقت من المتصفح', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ buildId: CURRENT_BUILD_ID }) }))
    vi.stubGlobal('fetch', fetchSpy)
    await checkForNewDeployment()
    expect(fetchSpy).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
  })
})
