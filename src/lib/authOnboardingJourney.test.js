import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const authStore = readSource('src/store/authStore.js')
const app = readSource('src/App.jsx')
const onboarding = readSource('src/pages/Onboarding.jsx')
const login = readSource('src/pages/Login.jsx')
const callback = readSource('src/pages/AuthCallback.jsx')

describe('auth and onboarding journey contract', () => {
  it('يوحّد تهيئة INITIAL_SESSION وSIGNED_IN في bootstrap واحد مع حالات تحميل صريحة', () => {
    expect(authStore).toContain("authState: 'INITIALIZING'")
    expect(authStore).toContain('completeAuthSession: async')
    expect(authStore).toContain('resolveUserDestination: () =>')
    expect(authStore).toContain("authState: 'LOADING_DATA'")
    expect(authStore).toContain("authState: 'READY'")
    expect(authStore).toContain('Promise.resolve().then(() => get().completeAuthSession')
    expect(authStore).toContain('invalidateAuthRequests()')
    expect(authStore).toContain('const bootstrapVersion = ++authBootstrapVersion')
    expect(authStore).toContain('if (!isCurrentBootstrap()) return')
    expect(authStore).not.toContain('onAuthStateChange(async')
  })

  it('يوحّد تقرير الوجهة بعد callback وتسجيل الدخول والمسار العام', () => {
    expect(callback).toContain('completeAuthSession(session')
    expect(callback).toContain('navigate(destination, { replace:true })')
    expect(login).toContain('completeAuthSession(session')
    expect(login).toContain('navigate(destination, { replace:true })')
    expect(app).toContain('resolveUserDestination()} replace')
  })

  it('يعرض Onboarding خطأ قابلًا لإعادة المحاولة ويحمي إنشاء المطعم والمنيو من التكرار', () => {
    expect(onboarding).toContain("setStage('error')")
    expect(onboarding).toContain('إعادة المحاولة')
    expect(onboarding).toContain('createRestaurantInFlight.current')
    expect(onboarding).toContain('createMenuInFlight.current')
    expect(onboarding).toContain("from('categories').select('id').eq('branch_id', branch.id).limit(1)")
    expect(onboarding).not.toContain('window.location.reload')
  })
})
