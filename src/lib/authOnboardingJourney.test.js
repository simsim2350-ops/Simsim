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
    expect(onboarding).toContain("const { data: storedCategories, error: categoriesError } = await supabase")
    expect(onboarding).toContain("if (!storedCategories?.length) throw new Error('categories_not_persisted')")
    expect(onboarding).not.toContain('window.location.reload')
  })

  it('لا ينتقل من معلومات المطعم قبل نجاح UPDATE وتحديث سياق المطعم', () => {
    expect(onboarding).toContain('const { error } = await supabase')
    expect(onboarding).toContain(".from('restaurants')")
    expect(onboarding).toContain('if (error) throw error')
    expect(onboarding).toContain('const refreshedRestaurant = await fetchRestaurant(user.id)')
    expect(onboarding).toContain("if (!refreshedRestaurant?.id) throw new Error('restaurant_refresh_failed')")
    expect(onboarding).toContain("setRest(refreshedRestaurant)")
    expect(onboarding).toContain("goStage('type')")
    expect(onboarding).toContain("تعذر حفظ معلومات المطعم. حاول مرة أخرى.")
  })

  it('يحمي حفظ معلومات المطعم من النقر المتكرر ويحافظ على مسار التخطي بلا UPDATE', () => {
    expect(onboarding).toContain('const infoSaveInFlight = useRef(false)')
    expect(onboarding).toContain('if (saving || infoSaveInFlight.current) return')
    expect(onboarding).toContain('infoSaveInFlight.current = true')
    expect(onboarding).toContain('infoSaveInFlight.current = false')
    expect(onboarding).toContain('// التخطي متعمد: لا يكتب الحقول الاختيارية في قاعدة البيانات.')
    expect(onboarding).toContain('onClick={() => saveInfo(true)}')
  })

  it('يحسّن خطوة معلومات المطعم بوسوم وأزرار وحالة تحميل قابلة للوصول', () => {
    expect(onboarding).toContain('id="onboarding-info-form"')
    expect(onboarding).toContain('htmlFor="onboarding-description"')
    expect(onboarding).toContain('htmlFor="onboarding-phone"')
    expect(onboarding).toContain('htmlFor="onboarding-address"')
    expect(onboarding).toContain('aria-busy={saving}')
    expect(onboarding).toContain('role="alert"')
    expect(onboarding).toContain('جاري الحفظ...')
    expect(onboarding).toContain('الخطوة {stepIndex + 1} من {STEPS.length}')
  })

  it('يحفظ نوع النشاط الحقيقي في restaurants.type ويستعيد الاختيار المحفوظ', () => {
    expect(onboarding).toContain(".update({ type: typeKey, onboarding_step: 'type_selected' })")
    expect(onboarding).toContain("const hasSavedTypeSelection = r.onboarding_step === 'type_selected' && isKnownBusinessType(r.type)")
    expect(onboarding).toContain('setSelectedType(hasSavedTypeSelection ? r.type : null)')
    expect(onboarding).toContain('setPersistedType(hasSavedTypeSelection ? r.type : null)')
    expect(onboarding).toContain("const refreshedRestaurant = await fetchRestaurant(user.id)")
    expect(onboarding).toContain("if (!refreshedRestaurant?.id || refreshedRestaurant.type !== typeKey) throw new Error('business_type_refresh_failed')")
  })

  it('لا يتيح الانتقال من نوع النشاط قبل اختيار وحفظ ناجحين ويمنع التكرار', () => {
    expect(onboarding).toContain('const typeSaveInFlight = useRef(false)')
    expect(onboarding).toContain('if (saving || typeSaveInFlight.current) return')
    expect(onboarding).toContain('if (!selectedType)')
    expect(onboarding).toContain('const isSaved = persistedType === selectedType || await persistBusinessType(selectedType)')
    expect(onboarding).toContain('if (!isSaved) return')
    expect(onboarding).toContain("goStage('categories')")
    expect(onboarding).toContain("await loadOnboardingCategories(rest)")
    expect(onboarding).not.toContain("setCats(getTemplate(selectedType).slice(0, 5).map(c => ({ ...c })))")
  })

  it('يدير أقسام Onboarding الحقيقية عبر الفرع الرئيسي ويستعيدها عند الاستئناف', () => {
    expect(onboarding).toContain('const loadOnboardingCategories = async')
    expect(onboarding).toContain('const branch = await ensurePrimaryBranch(restaurantRecord.id)')
    expect(onboarding).toContain(".from('categories')")
    expect(onboarding).toContain(".eq('branch_id', branch.id)")
    expect(onboarding).toContain("if (resumed === 'categories') await loadOnboardingCategories(r)")
    expect(onboarding).toContain('const [categoryBranch, setCategoryBranch] = useState(null)')
  })

  it('يحفظ إضافة القسم ويحمي التكرار والحذف والترتيب في قاعدة البيانات', () => {
    expect(onboarding).toContain('const categoryActionInFlight = useRef(false)')
    expect(onboarding).toContain(".eq('name', normalizedName)")
    expect(onboarding).toContain('sort_order: nextSortOrder')
    expect(onboarding).toContain(".insert({\n          restaurant_id: rest.id,")
    expect(onboarding).toContain("const { error } = await supabase.from('categories').delete().eq('id', target.id)")
    expect(onboarding).toContain("reordered.map((category, index) => supabase.from('categories').update({ sort_order: index }).eq('id', category.id))")
    expect(onboarding).toContain('<ConfirmDialog')
  })

  it('ينشئ الأصناف على الأقسام المحفوظة فقط ولا يعيد إدراج الأقسام عند إتمام المنيو', () => {
    expect(onboarding).toContain('category_id: category.id')
    expect(onboarding).toContain("const { data: existingProducts, error: existingProductsError } = await supabase")
    expect(onboarding).toContain(".from('products')")
    expect(onboarding).not.toContain('const catRows = cats.map')
  })

  it('يعرض مصدر تقدم واحدًا واختيار نوع قابلًا للوصول بلا رموز Emoji للخيارات', () => {
    expect(onboarding).toContain('الخطوة {stepIndex + 1} من {STEPS.length}')
    expect(onboarding).not.toContain('الأساسيات ${readiness.essentialsDone}/${readiness.essentialsTotal}')
    expect(onboarding).toContain('id="onboarding-type-form"')
    expect(onboarding).toContain('aria-pressed={isSelected}')
    expect(onboarding).toContain('<BusinessTypeIcon type={t.icon} />')
    expect(onboarding).toContain('<CheckIcon size={13} />')
    const typesBlock = onboarding.slice(onboarding.indexOf('const TYPES = ['), onboarding.indexOf('const getTemplate'))
    expect(typesBlock).not.toContain('emoji:')
  })
})
