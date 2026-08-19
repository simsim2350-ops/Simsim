import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { ensurePrimaryBranch } from '../lib/branchesApi'
import ConfirmDialog from '../components/ConfirmDialog'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { calculateMenuReadiness } from '../lib/menuReadiness'
import MenuReadinessCard from '../components/MenuReadinessCard'
import { trackOwnerEvent, trackOwnerMilestone } from '../lib/analytics'

// تحويل الاسم العربي إلى رابط لاتيني صالح
const AR_MAP = {
  'ا':'a','أ':'a','إ':'a','آ':'a','ب':'b','ت':'t','ث':'th','ج':'j','ح':'h','خ':'kh',
  'د':'d','ذ':'th','ر':'r','ز':'z','س':'s','ش':'sh','ص':'s','ض':'d','ط':'t','ظ':'z',
  'ع':'a','غ':'gh','ف':'f','ق':'q','ك':'k','ل':'l','م':'m','ن':'n','ه':'h','و':'w',
  'ي':'y','ى':'a','ة':'a','ء':'','ئ':'y','ؤ':'w','ٱ':'a',
}
const slugify = (name) =>
  (name || '').trim().toLowerCase()
    .split('').map(ch => (ch in AR_MAP ? AR_MAP[ch] : ch)).join('')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')

// قوالب الأقسام والأصناف الجاهزة حسب نوع النشاط (الأسعار مقترحة وقابلة للتعديل لاحقاً)
const TEMPLATES = {
  restaurant: [
    { key:'appetizers', emoji:'🥗', name:'المقبلات', items:[
      { name:'سلطة خضراء', price:15, emoji:'🥗' }, { name:'حمص', price:12, emoji:'🥣' }, { name:'شوربة', price:18, emoji:'🍜' } ] },
    { key:'mains', emoji:'🍔', name:'الوجبات الرئيسية', items:[
      { name:'برجر لحم', price:30, emoji:'🍔' }, { name:'دجاج مشوي', price:35, emoji:'🍗' }, { name:'شاورما', price:25, emoji:'🌯' }, { name:'بيتزا', price:40, emoji:'🍕' } ] },
    { key:'grills', emoji:'🥩', name:'المشويات', items:[
      { name:'كباب', price:35, emoji:'🍢' }, { name:'ريش', price:45, emoji:'🥩' }, { name:'تكة', price:30, emoji:'🍢' } ] },
    { key:'sides', emoji:'🍟', name:'وجبات جانبية', items:[
      { name:'بطاطس مقلية', price:10, emoji:'🍟' }, { name:'أجنحة دجاج', price:20, emoji:'🍗' } ] },
    { key:'salads', emoji:'🥗', name:'سلطات', items:[
      { name:'سلطة سيزر', price:18, emoji:'🥗' }, { name:'فتوش', price:15, emoji:'🥗' } ] },
    { key:'cold', emoji:'🧊', name:'مشروبات باردة', items:[
      { name:'عصير طازج', price:12, emoji:'🧃' }, { name:'مشروب غازي', price:5, emoji:'🥤' }, { name:'ماء', price:2, emoji:'💧' } ] },
    { key:'hot', emoji:'☕', name:'مشروبات ساخنة', items:[
      { name:'شاي', price:5, emoji:'🍵' }, { name:'قهوة', price:8, emoji:'☕' } ] },
    { key:'desserts', emoji:'🍰', name:'الحلويات', items:[
      { name:'كنافة', price:18, emoji:'🍰' }, { name:'تشيز كيك', price:20, emoji:'🍰' } ] },
    { key:'offers', emoji:'🎯', name:'العروض', items:[] },
  ],
  cafe: [
    { key:'coffee', emoji:'☕', name:'القهوة', items:[
      { name:'إسبريسو', price:10, emoji:'☕' }, { name:'لاتيه', price:15, emoji:'☕' }, { name:'كابتشينو', price:15, emoji:'☕' }, { name:'أمريكانو', price:12, emoji:'☕' } ] },
    { key:'tea', emoji:'🍵', name:'الشاي', items:[
      { name:'شاي أحمر', price:8, emoji:'🍵' }, { name:'شاي أخضر', price:10, emoji:'🍵' }, { name:'نعناع', price:8, emoji:'🌿' } ] },
    { key:'cold', emoji:'🧋', name:'مشروبات باردة', items:[
      { name:'آيس لاتيه', price:18, emoji:'🧊' }, { name:'فرابتشينو', price:20, emoji:'🥤' }, { name:'موهيتو', price:16, emoji:'🍹' } ] },
    { key:'pastries', emoji:'🥐', name:'المعجنات', items:[
      { name:'كرواسون', price:12, emoji:'🥐' }, { name:'دونات', price:10, emoji:'🍩' } ] },
    { key:'sweets', emoji:'🍰', name:'الحلويات', items:[
      { name:'تشيز كيك', price:20, emoji:'🍰' }, { name:'براوني', price:15, emoji:'🍫' } ] },
    { key:'breakfast', emoji:'🍳', name:'الإفطار', items:[
      { name:'بيض', price:15, emoji:'🍳' }, { name:'بان كيك', price:22, emoji:'🥞' } ] },
    { key:'offers', emoji:'🎯', name:'العروض', items:[] },
  ],
  truck: [
    { key:'burgers', emoji:'🍔', name:'برغر', items:[
      { name:'برجر كلاسيك', price:25, emoji:'🍔' }, { name:'دبل تشيز', price:35, emoji:'🍔' } ] },
    { key:'sandwiches', emoji:'🥪', name:'سندويتشات', items:[
      { name:'شاورما', price:20, emoji:'🌯' }, { name:'هوت دوج', price:18, emoji:'🌭' }, { name:'دجاج مقرمش', price:24, emoji:'🍗' } ] },
    { key:'sides', emoji:'🍟', name:'وجبات جانبية', items:[
      { name:'بطاطس', price:10, emoji:'🍟' }, { name:'أجنحة', price:20, emoji:'🍗' }, { name:'ناتشوز', price:18, emoji:'🧀' } ] },
    { key:'cold', emoji:'🥤', name:'المشروبات', items:[
      { name:'مشروب غازي', price:5, emoji:'🥤' }, { name:'عصير', price:12, emoji:'🧃' } ] },
    { key:'desserts', emoji:'🍦', name:'الحلويات', items:[
      { name:'آيس كريم', price:10, emoji:'🍦' } ] },
    { key:'offers', emoji:'🎯', name:'العروض', items:[] },
  ],
}
const TYPES = [
  { key:'restaurant', icon:'restaurant', label:'مطعم',        desc:'وجبات ومأكولات متنوعة' },
  { key:'cafe',       icon:'cafe',       label:'كافيه / كوفي', desc:'قهوة ومشروبات ومعجنات' },
  { key:'truck',      icon:'truck',      label:'فود ترك',      desc:'أكل سريع وسندويتشات' },
  { key:'cloud',      icon:'cloud',      label:'مطبخ سحابي',   desc:'مطبخ للتوصيل فقط' },
]
const getTemplate = (type) => TEMPLATES[type] || TEMPLATES.restaurant
const isKnownBusinessType = (type) => TYPES.some(item => item.key === type)

function BusinessTypeIcon({ type, size = 26 }) {
  const svg = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:1.8, strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':true }
  if (type === 'cafe') return <svg {...svg}><path d="M4 7h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7Z"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M6 3v2M10 3v2"/></svg>
  if (type === 'truck') return <svg {...svg}><path d="M3 6h11v10H3z"/><path d="M14 10h3l3 3v3h-6z"/><circle cx="7" cy="18" r="1.7"/><circle cx="17" cy="18" r="1.7"/><path d="M4 10h10"/></svg>
  if (type === 'cloud') return <svg {...svg}><path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 8.7 4.6 4.6 0 0 0 7 18Z"/><path d="M8.5 14h7M10 11.5h4"/></svg>
  return <svg {...svg}><path d="M3 18h18"/><path d="M5 18v2M19 18v2"/><path d="M6 15h12a6 6 0 0 0-12 0Z"/><path d="M12 9V6M10 6h4"/></svg>
}

function CheckIcon({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>
}

// خطوات الرحلة المعروضة في مؤشر التقدّم (welcome/create/done خارجها — مقدّمة/خاتمة)
const STEPS = [
  { key:'info',       label:'المعلومات' },
  { key:'type',       label:'النوع' },
  { key:'categories', label:'الأقسام' },
  { key:'items',      label:'الأصناف' },
  { key:'preview',    label:'المعاينة' },
  { key:'share',      label:'النشر' },
]
// خريطة استئناف: قيمة onboarding_step المحفوظة → مرحلة العرض
const RESUME_MAP = { welcome:'welcome', info:'info', type:'type', type_selected:'type', categories:'categories', items:'categories', preview:'preview', share:'share' }

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, restaurant, fetchRestaurant } = useAuthStore()

  const [stage, setStage] = useState('loading') // loading | error | welcome | create | info | type | categories | items | minimum | preview | share | done
  const [rest, setRest] = useState(restaurant || null)
  const [saving, setSaving] = useState(false)
  const [selectedType, setSelectedType] = useState(null)
  const [persistedType, setPersistedType] = useState(null)
  const [typeSaveError, setTypeSaveError] = useState('')
  const [infoSaveError, setInfoSaveError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [readiness, setReadiness] = useState(null)

  const [cForm, setCForm] = useState({ name:'', slug:'', slugEdited:false })
  const [info, setInfo] = useState({ description:'', phone:'', address:'' })

  // الأقسام هنا هي الصفوف الحقيقية من `public.categories` للفرع الرئيسي، وليست قوالب واجهة مؤقتة.
  const [cats, setCats] = useState([])
  const [categoryBranch, setCategoryBranch] = useState(null)
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categoriesError, setCategoriesError] = useState('')
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [categoryEmoji, setCategoryEmoji] = useState('🍽️')
  const [categoryFormError, setCategoryFormError] = useState('')
  const [categoryDeleteTarget, setCategoryDeleteTarget] = useState(null)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const dragFrom = useRef(null)
  const qrRef = useRef(null)
  const createRestaurantInFlight = useRef(false)
  const createMenuInFlight = useRef(false)
  const infoSaveInFlight = useRef(false)
  const typeSaveInFlight = useRef(false)
  const categoryActionInFlight = useRef(false)
  const categoryReorderInFlight = useRef(false)

  useBodyScrollLock(categoryModalOpen)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setStage('loading')
      setLoadError('')
      try {
        let r = restaurant
        if (!r && user) {
          const { data, error } = await supabase.from('restaurants').select('*').eq('owner_id', user.id).maybeSingle()
          if (error) throw error
          r = data || null
        }
        if (cancelled) return
        setRest(r)
        if (!r) { setStage('create'); return }
        // من أكمل الإعداد لا تُعاد عليه الرحلة.
        if (r.onboarding_completed) { navigate('/dashboard', { replace:true }); return }
        setInfo({ description: r.description || '', phone: r.phone || '', address: r.address || '' })
        // `type` له قيمة افتراضية في قاعدة البيانات؛ لا نعاملها كاختيار فعلي إلا إذا حفظت الخطوة `type_selected`.
        const hasSavedTypeSelection = r.onboarding_step === 'type_selected' && isKnownBusinessType(r.type)
        setSelectedType(hasSavedTypeSelection ? r.type : null)
        setPersistedType(hasSavedTypeSelection ? r.type : null)
        setTypeSaveError('')
        const resumed = RESUME_MAP[r.onboarding_step] || 'welcome'
        if (resumed === 'categories') await loadOnboardingCategories(r)
        if (cancelled) return
        trackOwnerEvent('onboarding_started', { restaurantId: r.id, props: { resumed: Boolean(r.onboarding_step) } })
        setStage(resumed)
      } catch (error) {
        console.error('Onboarding load error:', error)
        if (!cancelled) {
          setLoadError('حدث خطأ أثناء تجهيز حسابك. تحقق من اتصالك ثم أعد المحاولة.')
          setStage('error')
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [loadAttempt]) // eslint-disable-line

  useEffect(() => {
    if (rest?.id) refreshReadiness(rest.id)
  }, [rest?.id]) // eslint-disable-line

  const template = getTemplate(rest?.type)

  // الجاهزية مشتقة من بيانات المنيو الحية، ولا تعتمد على onboarding_completed.
  const refreshReadiness = async (restaurantId = rest?.id) => {
    if (!restaurantId) return null
    try {
      const { data: branchRows, error: branchError } = await supabase
        .from('branches').select('*').eq('restaurant_id', restaurantId).order('sort_order')
      if (branchError) throw branchError
      const activeBranch = (branchRows || []).find(branch => branch.is_primary && branch.is_active !== false && !branch.is_paused)
        || (branchRows || []).find(branch => branch.is_active !== false && !branch.is_paused)
        || null
      const [{ data: categoryRows }, { data: productRows }, { data: bannerRows }, { data: couponRows }] = await Promise.all([
        activeBranch ? supabase.from('categories').select('*').eq('branch_id', activeBranch.id) : Promise.resolve({ data: [] }),
        activeBranch ? supabase.from('products').select('*').eq('branch_id', activeBranch.id) : Promise.resolve({ data: [] }),
        supabase.from('banners').select('id').eq('restaurant_id', restaurantId).eq('is_active', true),
        supabase.from('coupons').select('id').eq('restaurant_id', restaurantId).eq('is_active', true),
      ])
      const next = calculateMenuReadiness({
        restaurant: rest,
        branch: activeBranch,
        categories: categoryRows || [],
        products: productRows || [],
        banners: bannerRows || [],
        coupons: couponRows || [],
      })
      setReadiness(next)
      return next
    } catch {
      return null
    }
  }

  const requireMinimumReady = async (nextStage = 'share') => {
    const nextReadiness = await refreshReadiness()
    if (!nextReadiness?.minimumReady) {
      setStage('minimum')
      return false
    }
    setStage(nextStage)
    return true
  }

  const goToFirstProduct = () => {
    if (cats.length > 0) goStage('items')
    else goStage('categories')
  }

  // حفظ خطوة التقدّم في قاعدة البيانات (للاستئناف عند الإغلاق/التحديث) — صامت وغير كاسر
  const saveStep = async (step) => {
    if (!rest?.id) return
    try {
      const { error } = await supabase.from('restaurants').update({ onboarding_step: step }).eq('id', rest.id)
      if (error) throw error
    } catch (error) {
      console.error('Onboarding step persistence error:', error)
    }
  }
  const goStage = (step) => { setStage(step); saveStep(step) }

  // ===== إنشاء المطعم (احتياطي: يُستخدم فقط لو وصل للأونبوردنغ بلا مطعم) =====
  const createRestaurant = async () => {
    if (saving || createRestaurantInFlight.current) return
    if (!cForm.name.trim()) { toast.error('أدخل اسم المطعم'); return }
    let slug = cForm.slug || slugify(cForm.name)
    if (!slug) slug = `store-${Math.random().toString(36).slice(2, 7)}`
    createRestaurantInFlight.current = true
    setSaving(true)
    try {
      const { data: existingRestaurant, error: existingError } = await supabase
        .from('restaurants').select('*').eq('owner_id', user.id).maybeSingle()
      if (existingError) throw existingError
      if (existingRestaurant) {
        setRest(existingRestaurant)
        await fetchRestaurant(user.id)
        setStage(existingRestaurant.onboarding_completed ? 'done' : (RESUME_MAP[existingRestaurant.onboarding_step] || 'welcome'))
        return
      }

      const { data: taken, error: slugError } = await supabase.from('restaurants').select('id').eq('slug', slug).maybeSingle()
      if (slugError) throw slugError
      if (taken) { toast.error('الرابط مستخدم، عدّله'); return }
      const { data, error } = await supabase.from('restaurants').insert({
        owner_id: user.id, name: cForm.name.trim(), slug, type:'restaurant', brand_color:'#FF6A00', is_active:true, onboarding_step:'info',
      }).select().single()
      if (error) throw error
      await fetchRestaurant(user.id)
      setRest(data)
      trackOwnerMilestone('restaurant_created', { restaurantId: data.id, props: { source: 'onboarding_fallback' } })
      setStage('info')
    } catch (error) {
      console.error('Fallback restaurant creation error:', error)
      toast.error(error?.code === '23505' ? 'لديك مطعم قائم بالفعل. نتابع إعدادك.' : 'تعذّر إنشاء المطعم. حاول مرة أخرى.')
    } finally {
      createRestaurantInFlight.current = false
      setSaving(false)
    }
  }

  // ===== معلومات المطعم (اختيارية — قابلة للتخطّي) =====
  const saveInfo = async (skip = false) => {
    if (saving || infoSaveInFlight.current) return

    // التخطي متعمد: لا يكتب الحقول الاختيارية في قاعدة البيانات.
    if (skip) {
      if (rest?.id) trackOwnerEvent('restaurant_info_completed', { restaurantId: rest.id, props: { skipped: true } })
      goStage('type')
      return
    }

    if (!rest?.id || !user?.id) {
      const message = 'تعذر تجهيز معلومات المطعم للحفظ. حاول مرة أخرى.'
      setInfoSaveError(message)
      toast.error(message)
      return
    }

    infoSaveInFlight.current = true
    setSaving(true)
    setInfoSaveError('')
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({
          description: info.description.trim() || null,
          phone: info.phone.trim() || null,
          address: info.address.trim() || null,
        })
        .eq('id', rest.id)
      if (error) throw error

      // لا ننتقل قبل أن ينجح تحديث سياق المطعم المركزي بالفعل.
      const refreshedRestaurant = await fetchRestaurant(user.id)
      if (!refreshedRestaurant?.id) throw new Error('restaurant_refresh_failed')

      setRest(refreshedRestaurant)
      trackOwnerEvent('restaurant_info_completed', { restaurantId: refreshedRestaurant.id, props: { skipped: false } })
      goStage('type')
    } catch (error) {
      console.error('Restaurant info persistence error:', error)
      const message = 'تعذر حفظ معلومات المطعم. حاول مرة أخرى.'
      setInfoSaveError(message)
      toast.error(message)
    } finally {
      infoSaveInFlight.current = false
      setSaving(false)
    }
  }

  // ===== اختيار النوع =====
  // القيمة تُخزَّن فور اختيارها في `restaurants.type`، ثم يتحقق زر «التالي» من نجاح الحفظ قبل الانتقال.
  const persistBusinessType = async (typeKey) => {
    if (!rest?.id || !user?.id || !isKnownBusinessType(typeKey)) {
      const message = 'تعذر تجهيز نوع النشاط للحفظ. حاول مرة أخرى.'
      setTypeSaveError(message)
      toast.error(message)
      return false
    }
    if (typeSaveInFlight.current) return false

    typeSaveInFlight.current = true
    setSaving(true)
    setTypeSaveError('')
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ type: typeKey, onboarding_step: 'type_selected' })
        .eq('id', rest.id)
      if (error) throw error

      const refreshedRestaurant = await fetchRestaurant(user.id)
      if (!refreshedRestaurant?.id || refreshedRestaurant.type !== typeKey) throw new Error('business_type_refresh_failed')

      setRest(refreshedRestaurant)
      setPersistedType(typeKey)
      trackOwnerEvent('business_type_selected', { restaurantId: refreshedRestaurant.id, props: { type: typeKey } })
      return true
    } catch (error) {
      console.error('Business type persistence error:', error)
      const message = 'تعذر حفظ نوع النشاط. حاول مرة أخرى.'
      setTypeSaveError(message)
      toast.error(message)
      return false
    } finally {
      typeSaveInFlight.current = false
      setSaving(false)
    }
  }

  const chooseType = async (typeKey) => {
    if (saving || typeSaveInFlight.current) return
    setSelectedType(typeKey)
    await persistBusinessType(typeKey)
  }

  const continueFromBusinessType = async () => {
    if (!selectedType) {
      const message = 'اختر نوع النشاط أولاً للمتابعة.'
      setTypeSaveError(message)
      toast.error(message)
      return
    }
    if (saving || typeSaveInFlight.current) return

    const isSaved = persistedType === selectedType || await persistBusinessType(selectedType)
    if (!isSaved) return

    // القوالب تبقى اقتراحات فقط؛ الأقسام المعروضة في الخطوة التالية تُقرأ من قاعدة البيانات.
    goStage('categories')
    await loadOnboardingCategories(rest)
  }

  const returnToBusinessType = () => {
    const savedType = isKnownBusinessType(rest?.type) ? rest.type : null
    setSelectedType(savedType)
    setPersistedType(savedType)
    setTypeSaveError('')
    setStage('type')
    if (savedType) void saveStep('type_selected')
  }

  // ===== الأقسام =====
  const normalizeCategoryName = (name) => name.trim().replace(/\s+/g, ' ')
  const templateForCategory = (category) => template.find(item => normalizeCategoryName(item.name) === normalizeCategoryName(category.name)) || null
  const categoryItems = (category) => templateForCategory(category)?.items || []
  const categoryItemKey = (category, item) => `${category.id}::${item.name}`
  const isTemplateAdded = (item) => cats.some(category => normalizeCategoryName(category.name) === normalizeCategoryName(item.name))

  const loadOnboardingCategories = async (restaurantRecord = rest) => {
    if (!restaurantRecord?.id) return []
    setCategoriesLoading(true)
    setCategoriesError('')
    try {
      const branch = await ensurePrimaryBranch(restaurantRecord.id)
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('branch_id', branch.id)
        .order('sort_order')
      if (error) throw error
      const rows = data || []
      setCategoryBranch(branch)
      setCats(rows)
      return rows
    } catch (error) {
      console.error('Onboarding categories load error:', error)
      const message = 'تعذر تحميل أقسام المنيو. تحقق من الاتصال ثم أعد المحاولة.'
      setCategoriesError(message)
      return []
    } finally {
      setCategoriesLoading(false)
    }
  }

  const persistCategory = async ({ name, emoji = '🍽️', source = 'custom' }) => {
    const normalizedName = normalizeCategoryName(name)
    if (!normalizedName) {
      const message = 'أدخل اسم القسم أولاً.'
      setCategoryFormError(message)
      toast.error(message)
      return false
    }
    if (!rest?.id || categoryActionInFlight.current) return false
    if (cats.some(category => normalizeCategoryName(category.name) === normalizedName)) {
      const message = 'هذا القسم مضاف بالفعل.'
      setCategoryFormError(message)
      toast.error(message)
      return false
    }

    categoryActionInFlight.current = true
    setSaving(true)
    setCategoryFormError('')
    try {
      const branch = categoryBranch || await ensurePrimaryBranch(rest.id)
      const { data: duplicateRows, error: duplicateError } = await supabase
        .from('categories')
        .select('id')
        .eq('branch_id', branch.id)
        .eq('name', normalizedName)
        .limit(1)
      if (duplicateError) throw duplicateError
      if (duplicateRows?.length) {
        const message = 'هذا القسم مضاف بالفعل.'
        setCategoryFormError(message)
        toast.error(message)
        await loadOnboardingCategories(rest)
        return false
      }

      const nextSortOrder = cats.reduce((max, category) => Math.max(max, Number(category.sort_order) || 0), -1) + 1
      const { data: insertedCategory, error } = await supabase
        .from('categories')
        .insert({
          restaurant_id: rest.id,
          branch_id: branch.id,
          name: normalizedName,
          emoji: emoji || '🍽️',
          is_visible: true,
          sort_order: nextSortOrder,
        })
        .select()
        .single()
      if (error) throw error

      setCategoryBranch(branch)
      setCats(previous => [...previous, insertedCategory].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)))
      if (cats.length === 0) trackOwnerMilestone('category_created', { restaurantId: rest.id, branchId: branch.id, props: { source: `onboarding_${source}` } })
      await refreshReadiness(rest.id)
      toast.success(`تمت إضافة "${normalizedName}"`)
      return true
    } catch (error) {
      console.error('Onboarding category create error:', error)
      const message = error?.message || 'تعذر إضافة القسم. حاول مرة أخرى.'
      setCategoryFormError(message)
      toast.error(message)
      return false
    } finally {
      categoryActionInFlight.current = false
      setSaving(false)
    }
  }

  const addTemplateCat = async (item) => {
    if (saving || isTemplateAdded(item)) return
    await persistCategory({ name: item.name, emoji: item.emoji, source: 'template' })
  }

  const openCategoryModal = () => {
    setCategoryName('')
    setCategoryEmoji('🍽️')
    setCategoryFormError('')
    setCategoryModalOpen(true)
  }

  const addCustomCat = async () => {
    const saved = await persistCategory({ name: categoryName, emoji: categoryEmoji, source: 'custom' })
    if (saved) {
      setCategoryModalOpen(false)
      setCategoryName('')
    }
  }

  const deleteCategory = async () => {
    const target = categoryDeleteTarget
    if (!target || categoryActionInFlight.current) return
    categoryActionInFlight.current = true
    setSaving(true)
    try {
      const { error } = await supabase.from('categories').delete().eq('id', target.id)
      if (error) throw error
      setCats(previous => previous.filter(category => category.id !== target.id))
      setCategoryDeleteTarget(null)
      await refreshReadiness(rest?.id)
      toast.success('تم حذف القسم')
    } catch (error) {
      console.error('Onboarding category delete error:', error)
      toast.error(error?.message || 'تعذر حذف القسم. حاول مرة أخرى.')
    } finally {
      categoryActionInFlight.current = false
      setSaving(false)
    }
  }

  const persistCategoryOrder = async (reordered, previous) => {
    if (categoryReorderInFlight.current) return
    categoryReorderInFlight.current = true
    setCats(reordered)
    try {
      const results = await Promise.all(
        reordered.map((category, index) => supabase.from('categories').update({ sort_order: index }).eq('id', category.id))
      )
      const failedResult = results.find(result => result.error)
      if (failedResult) throw failedResult.error
      await refreshReadiness(rest?.id)
    } catch (error) {
      console.error('Onboarding category order error:', error)
      setCats(previous)
      toast.error(error?.message || 'تعذر حفظ ترتيب الأقسام. أعد المحاولة.')
    } finally {
      categoryReorderInFlight.current = false
    }
  }

  const moveCategory = (index, direction) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= cats.length || categoryReorderInFlight.current) return
    const previous = [...cats]
    const reordered = [...cats]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, moved)
    void persistCategoryOrder(reordered, previous)
  }

  // إعادة الترتيب بالسحب على desktop؛ أزرار التحريك تبقى البديل الموثوق على الجوال.
  const onDrop = (targetIndex) => {
    const sourceIndex = dragFrom.current
    dragFrom.current = null
    if (sourceIndex === null || sourceIndex === targetIndex || categoryReorderInFlight.current) return
    const previous = [...cats]
    const reordered = [...cats]
    const [moved] = reordered.splice(sourceIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    void persistCategoryOrder(reordered, previous)
  }

  const goToItems = () => {
    if (cats.length === 0) { toast.error('أضف قسمًا واحدًا على الأقل للمتابعة.'); return }
    const suggestedItems = new Set()
    cats.forEach(category => categoryItems(category).forEach(item => suggestedItems.add(categoryItemKey(category, item))))
    setSelectedItems(suggestedItems)
    const hasItems = cats.some(category => categoryItems(category).length > 0)
    if (!hasItems) { finish(new Set()); return }
    goStage('items')
  }

  const toggleItem = (key) => setSelectedItems(previous => {
    const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next
  })

  // ===== إنشاء المنيو =====
  // الأقسام تحفظ قبل هذه المرحلة؛ هنا ننشئ الأصناف المختارة فقط وربطها بمعرّفات الأقسام الحقيقية.
  const finish = async (itemsSet = selectedItems) => {
    if (saving || createMenuInFlight.current) return
    if (cats.length === 0) { toast.error('أضف قسمًا واحدًا على الأقل.'); return }
    createMenuInFlight.current = true
    setSaving(true)
    try {
      const branch = categoryBranch || await ensurePrimaryBranch(rest.id)
      const { data: storedCategories, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .eq('branch_id', branch.id)
        .order('sort_order')
      if (categoriesError) throw categoriesError
      if (!storedCategories?.length) throw new Error('categories_not_persisted')

      // يمنع إنشاء الأصناف مرتين إذا استؤنفت الرحلة بعد وجود منيو محفوظ بالفعل.
      const { data: existingProducts, error: existingProductsError } = await supabase
        .from('products')
        .select('id')
        .eq('branch_id', branch.id)
        .limit(1)
      if (existingProductsError) throw existingProductsError
      if (existingProducts?.length) {
        setCats(storedCategories)
        await refreshReadiness(rest.id)
        toast('يوجد منيو قائم بالفعل. نكمل من المرحلة المناسبة.', { icon: 'ℹ️' })
        goStage('preview')
        return
      }

      const productRows = []
      storedCategories.forEach(category => {
        categoryItems(category).forEach((item, index) => {
          if (!itemsSet.has(categoryItemKey(category, item))) return
          productRows.push({
            restaurant_id: rest.id,
            branch_id: branch.id,
            category_id: category.id,
            name: item.name,
            price: item.price,
            emoji: item.emoji || '🍽️',
            is_available: true,
            sort_order: index,
          })
        })
      })
      if (productRows.length) {
        const { error: productError } = await supabase.from('products').insert(productRows)
        if (productError) throw productError
      }
      setCategoryBranch(branch)
      setCats(storedCategories)
      toast.success(`تم إنشاء منيوك (${storedCategories.length} أقسام، ${productRows.length} صنف).`)
      if (productRows.length > 0) trackOwnerMilestone('first_product_created', { restaurantId: rest.id, branchId: branch.id, props: { count: productRows.length, source: 'onboarding_template' } })
      const nextReadiness = await refreshReadiness(rest.id)
      if (nextReadiness?.minimumReady) trackOwnerMilestone('menu_minimum_ready', { restaurantId: rest.id, branchId: branch.id, props: { source: 'onboarding' } })
      trackOwnerEvent('menu_preview_opened', { restaurantId: rest.id, props: { source: 'onboarding_auto' } })
      goStage('preview')
    } catch (error) {
      console.error('Menu creation error:', error)
      toast.error('تعذر إنشاء الأصناف. لم ننتقل قبل تأكيد حفظ البيانات، جرّب مرة أخرى.')
    } finally {
      createMenuInFlight.current = false
      setSaving(false)
    }
  }

  // تخطّي بناء المنيو لم يعد يدّعي نجاحاً: يضمن الفرع ثم يعرض ما ينقص قبل أي مشاركة.
  const skipMenu = async () => {
    setSaving(true)
    try {
      await ensurePrimaryBranch(rest.id)
      await refreshReadiness(rest.id)
      setStage('minimum')
    } catch {
      toast.error('تعذّر تجهيز الفرع الرئيسي، جرّب مرة أخرى')
    } finally { setSaving(false) }
  }

  // ===== إنهاء الإعداد: لا توجد حالة «نشر» مستقلة؛ الجاهزية تقاس عبر minimumReady. =====
  const completeOnboarding = async (dest = '/dashboard') => {
    try {
      await supabase.from('restaurants').update({ onboarding_completed:true, onboarding_step:'done' }).eq('id', rest.id)
      await fetchRestaurant(user.id)
    } catch { /* غير كاسر */ }
    navigate(dest, { replace:true })
  }

  // ===== الرابط + QR =====
  const menuURL = rest ? `${window.location.origin}/menu/${rest.slug}` : ''
  useEffect(() => {
    if (stage === 'share' && qrRef.current && menuURL) {
      QRCode.toCanvas(qrRef.current, menuURL, { width: 190, margin: 2, color:{ dark:'#0B0B0F', light:'#FFFFFF' }, errorCorrectionLevel:'H' }).catch(() => {})
    }
  }, [stage, menuURL])

  const copyURL = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(menuURL)
      else {
        const ta = document.createElement('textarea'); ta.value = menuURL; ta.style.position='fixed'; ta.style.opacity='0'
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta)
      }
      toast.success('تم نسخ الرابط! 📋')
      trackOwnerMilestone('menu_link_copied', { restaurantId: rest.id, props: { source: 'onboarding' } })
    } catch { toast.error('تعذّر النسخ، انسخ الرابط يدوياً') }
  }
  const shareWhatsApp = () => {
    trackOwnerMilestone('menu_shared', { restaurantId: rest?.id, props: { channel: 'whatsapp', source: 'onboarding' } })
    window.open(`https://wa.me/?text=${encodeURIComponent(`تفضل منيونا الرقمي 👇\n${menuURL}`)}`, '_blank')
  }

  const downloadQR = () => {
    try {
      const canvas = qrRef.current
      if (!canvas) throw new Error('qr_not_ready')
      const link = document.createElement('a')
      link.download = `simsim-${rest?.slug || 'menu'}-qr.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      trackOwnerMilestone('qr_downloaded', { restaurantId: rest?.id, props: { source: 'onboarding' } })
    } catch {
      toast.error('تعذّر تحميل رمز QR، جرّب مرة أخرى')
    }
  }

  // ===== أنماط =====
  const bg = { minHeight:'100vh', background:'linear-gradient(135deg,#0B0B0F,#1a1a2e)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding: isMobile ? '18px 12px' : '40px', direction:'rtl' }
  const card = { width:'100%', maxWidth:'640px', background:'white', borderRadius:'22px', padding: isMobile ? '20px' : '34px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }
  const primaryBtn = { flex:1, padding:'14px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer' }
  const ghostBtn = { padding:'14px 18px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer', color:'#374151' }
  const inputStyle = { width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', outline:'none', textAlign:'right', boxSizing:'border-box' }
  const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }
  const skipLink = { width:'100%', marginTop:'10px', background:'none', border:'none', color:'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontSize:'13px', cursor:'pointer' }

  // يعرض المؤشر خطوة الرحلة الحالية والجاهزية الفعلية؛ لا تدخل التحسينات الاختيارية في حالة الجاهزية.
  const stepIndex = STEPS.findIndex(s => s.key === stage)
  const Progress = () => stepIndex < 0 ? null : (
    <div style={{ margin:'14px 0 20px', padding:'12px 13px', border:'1px solid #F0E7E1', borderRadius:'14px', background:'#FFFDFC' }} aria-label={`الخطوة ${stepIndex + 1} من ${STEPS.length}: ${STEPS[stepIndex].label}`}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:'10px', marginBottom:'7px', fontFamily:'Tajawal,sans-serif' }}>
        <span style={{ fontSize:'13px', fontWeight:'900', color:'#111827' }}>الخطوة {stepIndex + 1} من {STEPS.length}</span>
        <span style={{ fontSize:'12px', fontWeight:'800', color:'#FF6A00' }}>{STEPS[stepIndex].label}</span>
      </div>
      <div style={{ height:'7px', borderRadius:'100px', background:'#F0F2F5', overflow:'hidden' }} aria-hidden="true">
        <div style={{ height:'100%', width:`${((stepIndex + 1) / STEPS.length) * 100}%`, background:'linear-gradient(90deg,#FF6A00,#E05D00)', borderRadius:'100%', transition:'width 0.3s' }}/>
      </div>
      <div style={{ marginTop:'8px', fontSize:'11px', color:'#9CA3AF', lineHeight:'1.5' }}>
        أكمل الخطوات بالترتيب لتجهيز منيوك.
      </div>
    </div>
  )

  if (stage === 'loading') {
    return (
      <div style={{ ...bg, alignItems:'center' }}>
        <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,106,0,0.3)', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (stage === 'error') {
    return (
      <div style={{ ...bg, alignItems:'center' }}>
        <div style={{ ...card, maxWidth:'460px', textAlign:'center' }} role="alert">
          <div style={{ width:'48px', height:'48px', display:'grid', placeItems:'center', margin:'0 auto 14px', borderRadius:'14px', background:'#FEF2F2', color:'#B91C1C', fontSize:'24px', fontWeight:'900' }}>!</div>
          <h1 style={{ margin:'0 0 8px', fontSize:'21px', fontWeight:'900', fontFamily:'Tajawal,sans-serif' }}>حدث خطأ أثناء تجهيز حسابك</h1>
          <p style={{ margin:'0 0 20px', color:'#6B7280', fontSize:'14px', lineHeight:'1.8' }}>{loadError || 'تعذر تحميل بيانات الإعداد. حاول مرة أخرى.'}</p>
          <button type="button" onClick={() => setLoadAttempt(value => value + 1)} style={{ ...primaryBtn, width:'100%' }}>إعادة المحاولة</button>
          <button type="button" onClick={() => navigate('/login')} style={{ ...skipLink, marginTop:'12px' }}>العودة لتسجيل الدخول</button>
        </div>
      </div>
    )
  }

  return (
    <div style={bg}>
      <div style={card}>
        <style>{`@keyframes onboarding-inline-spin{to{transform:rotate(360deg)}}
          @keyframes onboarding-inline-pulse{0%,100%{opacity:.55}50%{opacity:1}}
          #onboarding-info-form input:focus,#onboarding-info-form textarea:focus,#onboarding-info-form button:focus-visible,#onboarding-type-form button:focus-visible,#onboarding-categories button:focus-visible,#onboarding-category-modal input:focus{outline:3px solid rgba(255,106,0,0.28);outline-offset:2px;border-color:#FF6A00!important}
        `}</style>
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
          <img src="/simsim-s.svg" alt="" style={{ height:'28px', width:'auto', display:'block' }} />
          <span style={{ fontFamily:'Poppins,sans-serif', fontWeight:'700', fontSize:'18px' }}>sim<span style={{ color:'#FF6A00' }}>sim</span></span>
        </div>

        <Progress />

        {/* شاشة الترحيب */}
        {stage === 'welcome' && (
          <div style={{ textAlign:'center', padding:'14px 4px 6px' }}>
            <div style={{ fontSize:'60px', marginBottom:'10px' }}>👋</div>
            <h2 style={{ fontSize:'23px', fontWeight:'900', marginBottom:'8px', fontFamily:'Tajawal,sans-serif' }}>أهلاً بك في SIMSIM 🎉</h2>
            <p style={{ fontSize:'14px', color:'#6B7280', lineHeight:'1.8', marginBottom:'22px' }}>
              خلّينا نجهّز مطعمك خطوة بخطوة: نضيف منيوك، نعاينه، ونعطيك رابطاً وQR جاهزين للمشاركة.
            </p>
            <button onClick={() => goStage('info')} style={{ ...primaryBtn, width:'100%' }}>لنبدأ ←</button>
          </div>
        )}

        {/* إنشاء مطعم (احتياطي) */}
        {stage === 'create' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', margin:'6px 0 4px', fontFamily:'Tajawal,sans-serif' }}>لنُنشئ مطعمك 🏪</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'20px' }}>معلومة واحدة وننطلق</p>
            <label style={labelStyle}>اسم المطعم</label>
            <input style={inputStyle} placeholder="مطعم البيت" value={cForm.name}
              onChange={e => setCForm(f => ({ ...f, name:e.target.value, slug: f.slugEdited ? f.slug : slugify(e.target.value) }))} />
            <div style={{ fontSize:'12px', color:'#9CA3AF', margin:'7px 0 18px', direction:'ltr' }}>🔗 {window.location.host}/menu/<b style={{ color:'#FF6A00' }}>{cForm.slug || slugify(cForm.name) || 'your-menu'}</b></div>
            <button onClick={createRestaurant} disabled={saving} style={{ ...primaryBtn, width:'100%', opacity: saving?0.7:1 }}>{saving ? 'جارٍ الإنشاء...' : 'التالي ←'}</button>
          </>
        )}

        {/* معلومات المطعم (اختيارية) */}
        {stage === 'info' && (
          <form id="onboarding-info-form" onSubmit={event => { event.preventDefault(); void saveInfo(false) }} noValidate aria-busy={saving}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'11px', marginBottom:'16px' }}>
              <div aria-hidden="true" style={{ width:'38px', height:'38px', flexShrink:0, display:'grid', placeItems:'center', borderRadius:'12px', background:'#FFF0E8', color:'#FF6A00', fontSize:'18px' }}>✦</div>
              <div>
                <h2 style={{ fontSize:'23px', fontWeight:'900', margin:'0 0 4px', fontFamily:'Tajawal,sans-serif', color:'#111827' }}>عرّف بمطعمك ✨</h2>
                <p style={{ fontSize:'13px', color:'#6B7280', lineHeight:'1.65', margin:0 }}>أضف معلومات بسيطة تظهر لعملائك في منيو مطعمك.</p>
              </div>
            </div>

            <div style={{ padding:'15px', border:'1px solid #EDEFF3', borderRadius:'16px', background:'#FCFDFE' }}>
              <div style={{ marginBottom:'15px' }}>
                <label htmlFor="onboarding-description" style={labelStyle}>نبذة قصيرة <span style={{ color:'#9CA3AF', fontWeight:'500' }}>اختياري</span></label>
                <textarea id="onboarding-description" aria-describedby={infoSaveError ? 'onboarding-info-error' : undefined} style={{ ...inputStyle, minHeight:'88px', resize:'vertical', background:'white' }} placeholder="مثال: نقدم أشهى الوجبات والمشروبات الطازجة يوميًا 🍽️" value={info.description} onChange={e => setInfo(f => ({ ...f, description:e.target.value }))} />
              </div>
              <div style={{ marginBottom:'15px' }}>
                <label htmlFor="onboarding-phone" style={labelStyle}>رقم التواصل <span style={{ color:'#9CA3AF', fontWeight:'500' }}>اختياري</span></label>
                <input id="onboarding-phone" aria-describedby={infoSaveError ? 'onboarding-info-error' : undefined} style={{ ...inputStyle, direction:'ltr', textAlign:'left', background:'white' }} type="tel" inputMode="tel" autoComplete="tel" placeholder="مثال: 05xxxxxxxx" value={info.phone} onChange={e => setInfo(f => ({ ...f, phone:e.target.value }))} />
              </div>
              <div>
                <label htmlFor="onboarding-address" style={labelStyle}>عنوان المطعم <span style={{ color:'#9CA3AF', fontWeight:'500' }}>اختياري</span></label>
                <input id="onboarding-address" aria-describedby={infoSaveError ? 'onboarding-info-error' : undefined} style={{ ...inputStyle, background:'white' }} autoComplete="street-address" placeholder="مثال: الرياض – حي الملقا" value={info.address} onChange={e => setInfo(f => ({ ...f, address:e.target.value }))} />
              </div>
            </div>

            {infoSaveError && <div id="onboarding-info-error" role="alert" aria-live="assertive" style={{ marginTop:'12px', padding:'10px 12px', borderRadius:'12px', background:'#FEF2F2', border:'1px solid #FECACA', color:'#B91C1C', fontSize:'13px', fontWeight:'700', lineHeight:'1.6' }}>{infoSaveError}</div>}

            <div style={{ display:'flex', gap:'10px', marginTop:'16px' }}>
              <button type="button" onClick={() => goStage('welcome')} disabled={saving} style={{ ...ghostBtn, opacity: saving ? 0.6 : 1 }}>→ رجوع</button>
              <button type="submit" disabled={saving} style={{ ...primaryBtn, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'8px', opacity: saving ? 0.72 : 1 }}>
                {saving && <span aria-hidden="true" style={{ width:'14px', height:'14px', border:'2px solid rgba(255,255,255,0.45)', borderTopColor:'white', borderRadius:'50%', animation:'onboarding-inline-spin 0.75s linear infinite' }} />}
                {saving ? 'جاري الحفظ...' : 'حفظ والمتابعة ←'}
              </button>
            </div>
            <button type="button" onClick={() => saveInfo(true)} disabled={saving} style={{ ...skipLink, opacity: saving ? 0.55 : 1 }}>تخطّى الآن</button>
          </form>
        )}

        {/* اختيار النوع */}
        {stage === 'type' && (
          <form id="onboarding-type-form" onSubmit={event => { event.preventDefault(); void continueFromBusinessType() }} noValidate aria-busy={saving}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'11px', marginBottom:'16px' }}>
              <div aria-hidden="true" style={{ width:'38px', height:'38px', flexShrink:0, display:'grid', placeItems:'center', borderRadius:'12px', background:'#FFF0E8', color:'#FF6A00' }}><BusinessTypeIcon type={selectedType || 'restaurant'} size={21} /></div>
              <div>
                <h2 style={{ fontSize:'23px', fontWeight:'900', margin:'0 0 4px', fontFamily:'Tajawal,sans-serif', color:'#111827' }}>اختر نوع نشاطك</h2>
                <p style={{ fontSize:'13px', color:'#6B7280', lineHeight:'1.65', margin:0 }}>سنقترح أقسامًا وأصنافًا مناسبة ويمكنك تعديلها لاحقًا.</p>
              </div>
            </div>

            <fieldset disabled={saving} style={{ margin:0, padding:0, border:'none' }}>
              <legend style={{ position:'absolute', width:'1px', height:'1px', padding:0, margin:'-1px', overflow:'hidden', clip:'rect(0, 0, 0, 0)', whiteSpace:'nowrap', border:0 }}>نوع النشاط</legend>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:'11px' }}>
                {TYPES.map(t => {
                  const isSelected = selectedType === t.key
                  return (
                    <button key={t.key} type="button" onClick={() => void chooseType(t.key)} aria-pressed={isSelected} style={{ position:'relative', minHeight:'142px', padding:'17px 12px', borderRadius:'16px', border:`2px solid ${isSelected ? '#FF6A00' : '#E5E7EB'}`, cursor: saving ? 'default' : 'pointer', textAlign:'right', opacity: saving ? 0.65 : 1, background:isSelected ? 'rgba(255,106,0,0.075)' : 'white', color:isSelected ? '#A94400' : '#111827', boxShadow:isSelected ? '0 8px 20px rgba(255,106,0,0.12)' : 'none', transition:'border-color 160ms ease-out, background 160ms ease-out, box-shadow 160ms ease-out' }}>
                      <span aria-hidden="true" style={{ width:'40px', height:'40px', display:'grid', placeItems:'center', marginBottom:'12px', borderRadius:'12px', background:isSelected ? '#FF6A00' : '#F8F9FB', color:isSelected ? 'white' : '#6B7280' }}><BusinessTypeIcon type={t.icon} /></span>
                      <span style={{ display:'block', fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'15px', marginBottom:'4px' }}>{t.label}</span>
                      <span style={{ display:'block', fontSize:'11px', lineHeight:'1.55', color:isSelected ? '#9A4B20' : '#6B7280' }}>{t.desc}</span>
                      {isSelected && <span aria-label="مختار" style={{ position:'absolute', top:'10px', left:'10px', width:'22px', height:'22px', display:'grid', placeItems:'center', borderRadius:'50%', background:'#FF6A00', color:'white' }}><CheckIcon size={13} /></span>}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {typeSaveError && <div id="onboarding-type-error" role="alert" aria-live="assertive" style={{ marginTop:'12px', padding:'10px 12px', borderRadius:'12px', background:'#FEF2F2', border:'1px solid #FECACA', color:'#B91C1C', fontSize:'13px', fontWeight:'700', lineHeight:'1.6' }}>{typeSaveError}</div>}

            <div style={{ display:'flex', gap:'10px', marginTop:'16px' }}>
              <button type="button" onClick={() => goStage('info')} disabled={saving} style={{ ...ghostBtn, opacity:saving ? 0.6 : 1 }}>→ رجوع</button>
              <button type="submit" disabled={!selectedType || saving} style={{ ...primaryBtn, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'8px', opacity:!selectedType || saving ? 0.55 : 1, cursor:!selectedType || saving ? 'not-allowed' : 'pointer' }}>
                {saving && <span aria-hidden="true" style={{ width:'14px', height:'14px', border:'2px solid rgba(255,255,255,0.45)', borderTopColor:'white', borderRadius:'50%', animation:'onboarding-inline-spin 0.75s linear infinite' }} />}
                {saving ? 'جاري الحفظ...' : 'التالي: الأقسام ←'}
              </button>
            </div>
          </form>
        )}

        {/* الأقسام: الصفوف المعروضة أدناه تأتي من public.categories للفرع الرئيسي فقط. */}
        {stage === 'categories' && (
          <section id="onboarding-categories" aria-busy={categoriesLoading || saving}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:'11px', marginBottom:'18px' }}>
              <div aria-hidden="true" style={{ width:'38px', height:'38px', flexShrink:0, display:'grid', placeItems:'center', borderRadius:'12px', background:'#FFF0E8', color:'#FF6A00', fontSize:'19px', fontWeight:'900' }}>≡</div>
              <div>
                <h2 style={{ fontSize:'23px', fontWeight:'900', margin:'0 0 4px', fontFamily:'Tajawal,sans-serif', color:'#111827' }}>أقسام منيوك</h2>
                <p style={{ fontSize:'13px', color:'#6B7280', lineHeight:'1.65', margin:0 }}>ابدأ بالأقسام المناسبة لنشاطك، ويمكنك تعديلها لاحقًا.</p>
              </div>
            </div>

            <div style={{ padding:'14px', border:'1px solid #F0E7E1', borderRadius:'16px', background:'#FFFDFC', marginBottom:'18px' }}>
              <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', color:'#374151', marginBottom:'3px' }}>ابدأ بسرعة — قوالب جاهزة</div>
              <p style={{ fontSize:'12px', lineHeight:'1.6', color:'#6B7280', margin:'0 0 11px' }}>اختر الأقسام المناسبة لنشاطك، ويمكنك تعديلها لاحقًا.</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
                {template.map(item => {
                  const added = isTemplateAdded(item)
                  return (
                    <button key={item.key} type="button" onClick={() => void addTemplateCat(item)} disabled={added || saving || categoriesLoading} aria-label={added ? `تمت إضافة ${item.name}` : `إضافة ${item.name}`} style={{ display:'inline-flex', alignItems:'center', gap:'6px', minHeight:'38px', padding:'8px 11px', borderRadius:'100px', border:`1.5px solid ${added ? '#D1E7D4' : '#FFD9C7'}`, background:added ? '#F0FDF4' : 'white', color:added ? '#15803D' : '#8A3900', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'12px', cursor:added || saving || categoriesLoading ? 'default' : 'pointer', opacity:saving || categoriesLoading ? 0.65 : 1 }}>
                      <span aria-hidden="true" style={{ fontSize:'15px' }}>{item.emoji}</span>
                      {added ? `تمت إضافة ${item.name}` : `${item.name} +`}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:'10px', marginBottom:'10px' }}>
              <h3 style={{ margin:0, fontFamily:'Tajawal,sans-serif', fontSize:'16px', fontWeight:'900', color:'#111827' }}>أقسام منيوك — {cats.length} {cats.length === 1 ? 'قسم' : 'أقسام'}</h3>
              {!categoriesLoading && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>يُحفظ تلقائيًا</span>}
            </div>

            {categoriesLoading ? (
              <div aria-label="جاري تحميل الأقسام" style={{ display:'flex', flexDirection:'column', gap:'9px', marginBottom:'12px' }}>
                {[0, 1, 2].map(index => <div key={index} style={{ height:'64px', borderRadius:'14px', border:'1px solid #EEF0F3', background:'linear-gradient(90deg,#F7F8FA,#FFFFFF,#F7F8FA)', animation:'onboarding-inline-pulse 1.1s ease-in-out infinite' }} />)}
              </div>
            ) : categoriesError ? (
              <div role="alert" style={{ marginBottom:'12px', padding:'12px', borderRadius:'14px', border:'1px solid #FECACA', background:'#FEF2F2', color:'#B91C1C', fontSize:'13px', lineHeight:'1.65' }}>
                <strong style={{ display:'block', marginBottom:'6px' }}>{categoriesError}</strong>
                <button type="button" onClick={() => void loadOnboardingCategories()} style={{ background:'transparent', border:'none', padding:0, color:'#B91C1C', fontFamily:'Tajawal,sans-serif', fontWeight:'900', textDecoration:'underline', cursor:'pointer' }}>إعادة المحاولة</button>
              </div>
            ) : cats.length === 0 ? (
              <div style={{ marginBottom:'12px', padding:'20px 16px', borderRadius:'16px', border:'1.5px dashed #D7DCE3', background:'#FAFBFC', textAlign:'center' }}>
                <div aria-hidden="true" style={{ margin:'0 auto 8px', width:'38px', height:'38px', display:'grid', placeItems:'center', borderRadius:'12px', background:'white', color:'#9CA3AF', fontWeight:'900' }}>+</div>
                <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', color:'#374151', marginBottom:'4px' }}>لسه ما أضفت أقسام</div>
                <p style={{ fontSize:'12px', color:'#6B7280', lineHeight:'1.6', margin:'0 0 10px' }}>اختر قالبًا سريعًا أو أنشئ قسمك الأول.</p>
                <button type="button" onClick={openCategoryModal} style={{ ...ghostBtn, padding:'10px 14px', fontSize:'13px' }}>+ إضافة قسم جديد</button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'9px', marginBottom:'12px' }}>
                {cats.map((category, index) => (
                  <div key={category.id} draggable={!isMobile && !saving} onDragStart={() => { dragFrom.current = index }} onDragOver={event => event.preventDefault()} onDrop={() => onDrop(index)} style={{ display:'flex', alignItems:'center', gap:'10px', minHeight:'64px', padding:'10px 11px', borderRadius:'14px', border:'1.5px solid #E5E7EB', background:'white', boxShadow:'0 2px 8px rgba(15,23,42,0.035)', opacity:saving ? 0.72 : 1 }}>
                    <span aria-hidden="true" style={{ width:'22px', color:'#B8BEC8', cursor:isMobile ? 'default' : 'grab', fontSize:'17px', letterSpacing:'-2px' }}>⠿</span>
                    <span aria-hidden="true" style={{ width:'39px', height:'39px', display:'grid', placeItems:'center', flexShrink:0, borderRadius:'11px', background:'#FFF7F2', color:'#FF6A00', fontSize:'19px' }}>{category.emoji || '🍽️'}</span>
                    <span style={{ flex:1, minWidth:0, fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', color:'#1F2937', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{category.name}</span>
                    <div style={{ display:'flex', alignItems:'center', gap:'2px' }}>
                      <button type="button" onClick={() => moveCategory(index, -1)} disabled={index === 0 || saving} aria-label={`تحريك ${category.name} للأعلى`} title="تحريك للأعلى" style={{ width:'34px', height:'34px', border:'none', borderRadius:'9px', background:'transparent', color:index === 0 ? '#D1D5DB' : '#6B7280', cursor:index === 0 || saving ? 'default' : 'pointer' }}>↑</button>
                      <button type="button" onClick={() => moveCategory(index, 1)} disabled={index === cats.length - 1 || saving} aria-label={`تحريك ${category.name} للأسفل`} title="تحريك للأسفل" style={{ width:'34px', height:'34px', border:'none', borderRadius:'9px', background:'transparent', color:index === cats.length - 1 ? '#D1D5DB' : '#6B7280', cursor:index === cats.length - 1 || saving ? 'default' : 'pointer' }}>↓</button>
                      <button type="button" onClick={() => setCategoryDeleteTarget(category)} disabled={saving} aria-label={`حذف ${category.name}`} title="حذف القسم" style={{ width:'34px', height:'34px', border:'none', borderRadius:'9px', background:'transparent', color:'#DC2626', cursor:saving ? 'default' : 'pointer' }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={openCategoryModal} disabled={saving || categoriesLoading} style={{ width:'100%', minHeight:'46px', marginBottom:'16px', borderRadius:'13px', border:'1.5px dashed #C9D0D9', background:'white', color:'#4B5563', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor:saving || categoriesLoading ? 'default' : 'pointer', opacity:saving || categoriesLoading ? 0.65 : 1 }}>+ إضافة قسم جديد</button>

            <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'18px', lineHeight:'1.7' }}>رتّب الأقسام بالسحب على الكمبيوتر أو بأسهم التحريك على الجوال. يُحفظ الترتيب مباشرة.</div>

            <div style={{ position:'sticky', bottom:isMobile ? '-20px' : '-34px', padding:'12px 0 3px', background:'linear-gradient(180deg,rgba(255,255,255,0),#FFFFFF 22%)', zIndex:2 }}>
              <div style={{ display:'flex', gap:'10px' }}>
                <button type="button" onClick={returnToBusinessType} disabled={saving} style={{ ...ghostBtn, opacity:saving ? 0.6 : 1 }}>→ رجوع</button>
                <button type="button" onClick={goToItems} disabled={cats.length === 0 || saving || categoriesLoading} style={{ ...primaryBtn, opacity:cats.length === 0 || saving || categoriesLoading ? 0.55 : 1, cursor:cats.length === 0 || saving || categoriesLoading ? 'not-allowed' : 'pointer' }}>التالي: الأصناف ←</button>
              </div>
              <button type="button" onClick={skipMenu} disabled={saving} style={{ ...skipLink, opacity:saving ? 0.55 : 1 }}>راجع جاهزية المنيو أولاً</button>
            </div>
          </section>
        )}

        {/* اختيار الأصناف */}
        {stage === 'items' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>اختر أصنافك 🍽️</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'16px' }}>الأصناف والأسعار مقترحة — عدّلها لاحقاً من صفحة الأصناف.</p>

            <div style={{ maxHeight: isMobile ? '46vh' : '50vh', overflowY:'auto', marginBottom:'16px', paddingLeft:'4px' }}>
              {cats.filter(category => categoryItems(category).length > 0).map(category => (
                <div key={category.id} style={{ marginBottom:'16px' }}>
                  <div style={{ fontSize:'13px', fontWeight:'800', marginBottom:'8px', color:'#374151' }}>{category.emoji} {category.name}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                    {categoryItems(category).map(item => {
                      const key = categoryItemKey(category, item)
                      const on = selectedItems.has(key)
                      return (
                        <button type="button" key={key} onClick={() => toggleItem(key)} aria-pressed={on} style={{ width:'100%', display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'12px', border:`1.5px solid ${on ? '#FF6A00' : '#E5E7EB'}`, background: on ? 'rgba(255,106,0,0.06)' : 'white', cursor:'pointer', textAlign:'right' }}>
                          <span aria-hidden="true" style={{ width:'20px', height:'20px', borderRadius:'6px', border:`1.5px solid ${on ? '#FF6A00' : '#D1D5DB'}`, background: on ? '#FF6A00' : 'white', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', flexShrink:0 }}>{on ? '✓' : ''}</span>
                          <span style={{ fontSize:'18px' }}>{item.emoji}</span>
                          <span style={{ flex:1, fontSize:'13px', fontWeight:'700' }}>{item.name}</span>
                          <span style={{ fontSize:'13px', fontWeight:'800', color:'#6B7280', direction:'ltr' }}>{item.price} ﷼</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => goStage('categories')} style={ghostBtn}>→ رجوع</button>
              <button onClick={() => finish()} disabled={saving} style={{ ...primaryBtn, opacity: saving?0.7:1 }}>{saving ? 'جارٍ الإنشاء...' : `🎉 إنشاء منيوي (${selectedItems.size})`}</button>
            </div>
          </>
        )}

        {/* بوابة الحد الأدنى: لا تعرض رابطاً أو QR كنجاح قبل وجود قسم مرئي وصنف متاح بسعر. */}
        {stage === 'minimum' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>لنشارك منيوً حقيقيًا أولاً</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', lineHeight:'1.8', marginBottom:'16px' }}>تستطيع إكمال الهوية والصور لاحقًا، لكن نحتاج قسمًا ظاهرًا وصنفًا متاحًا بسعر قبل أن يصبح الرابط جاهزًا للمشاركة.</p>
            <MenuReadinessCard readiness={readiness || calculateMenuReadiness({ restaurant:rest })} onResolve={goToFirstProduct} />
            <button onClick={() => completeOnboarding('/dashboard')} style={{ ...ghostBtn, width:'100%', marginTop:'10px' }}>سأكمل من لوحة التحكم</button>
          </>
        )}

        {/* معاينة المنيو الحقيقي داخل إطار جوال */}
        {stage === 'preview' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>هذا شكل منيوك 👀</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'14px' }}>هكذا سيراه زبونك على جواله. نتحقق من الأساسيات قبل إتاحة المشاركة.</p>
            <MenuReadinessCard readiness={readiness || calculateMenuReadiness({ restaurant:rest })} compact />

            <div style={{ display:'flex', justifyContent:'center', margin:'18px 0' }}>
              <div style={{ width:'280px', height:'520px', borderRadius:'34px', border:'9px solid #0B0B0F', overflow:'hidden', boxShadow:'0 18px 50px rgba(0,0,0,0.28)', background:'white' }}>
                <iframe title="معاينة المنيو" src={menuURL} style={{ width:'100%', height:'100%', border:'none' }} />
              </div>
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => window.open(menuURL, '_blank')} style={ghostBtn}>🌐 فتح</button>
              <button onClick={() => requireMinimumReady('share')} style={primaryBtn}>تحقق وشارك ←</button>
            </div>
          </>
        )}

        {/* الرابط + QR — لا يصل لهذه المرحلة إلا بعد اجتياز Menu Ready. */}
        {stage === 'share' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>منيوك جاهز للمشاركة 🎉</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'14px' }}>افتح المنيو، انسخ رابطه، شاركه على واتساب أو حمّل رمز QR للطباعة.</p>
            <MenuReadinessCard readiness={readiness || calculateMenuReadiness({ restaurant:rest })} compact />

            <div style={{ display:'flex', justifyContent:'center', margin:'16px 0' }}>
              <div style={{ padding:'14px', background:'white', border:'1.5px solid #E5E7EB', borderRadius:'18px' }}>
                <canvas ref={qrRef} style={{ display:'block', borderRadius:'8px' }} />
              </div>
            </div>

            <div style={{ display:'flex', gap:'8px', marginBottom:'10px' }}>
              <input readOnly value={menuURL} aria-label="رابط المنيو" style={{ flex:1, minWidth:0, padding:'11px 12px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', color:'#6B7280', background:'#F8F9FB', outline:'none', direction:'ltr', textAlign:'left' }} />
              <button onClick={copyURL} style={{ padding:'11px 16px', borderRadius:'11px', border:'none', background:'#FF6A00', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>نسخ الرابط</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'18px' }}>
              <button onClick={() => window.open(menuURL, '_blank')} style={{ ...ghostBtn, minHeight:'44px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>🌐 فتح المنيو</button>
              <button onClick={shareWhatsApp} style={{ ...ghostBtn, minHeight:'44px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>💬 مشاركة واتساب</button>
              <button onClick={downloadQR} style={{ ...ghostBtn, minHeight:'44px', gridColumn:'1 / -1', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>⬇️ تحميل QR</button>
            </div>

            <button onClick={() => goStage('done')} style={{ ...primaryBtn, width:'100%' }}>عرض ملخص الإعداد ←</button>
          </>
        )}

        {/* شاشة النجاح النهائية: بداية الاستخدام بعد أول نشر، لا QR منفرد. */}
        {stage === 'done' && (
          <div style={{ textAlign:'center', padding:'18px 6px 8px' }}>
            <div style={{ fontSize:'64px', marginBottom:'10px' }}>🎉</div>
            <h2 style={{ fontSize:'24px', fontWeight:'900', marginBottom:'8px', fontFamily:'Tajawal,sans-serif' }}>منيوك جاهز!</h2>
            <p style={{ fontSize:'14px', color:'#6B7280', lineHeight:'1.8', margin:'0 0 16px' }}>منيو <b>{rest?.name}</b> صار جاهزًا لعملائك. تستطيع الآن مشاركته أو متابعة تحسينه من لوحة التحكم.</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'16px', textAlign:'right', padding:'12px', borderRadius:'14px', background:'#F8F9FB', fontSize:'12px', color:'#6B7280' }}>
              <span>○ أضف شعارك</span><span>○ أضف صور الأصناف</span><span>○ أضف ساعات العمل</span><span>○ أنشئ عرضًا أو كوبونًا</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'10px' }}>
              <button onClick={copyURL} style={{ ...primaryBtn, minHeight:'44px' }}>نسخ رابط المنيو</button>
              <button onClick={() => window.open(menuURL, '_blank')} style={{ ...ghostBtn, minHeight:'44px' }}>فتح المنيو</button>
              <button onClick={shareWhatsApp} style={{ ...ghostBtn, minHeight:'44px' }}>مشاركة واتساب</button>
              <button onClick={downloadQR} style={{ ...ghostBtn, minHeight:'44px' }}>تحميل QR</button>
            </div>
            <button onClick={() => completeOnboarding('/dashboard')} style={{ ...ghostBtn, width:'100%' }}>الانتقال إلى لوحة التحكم</button>
          </div>
        )}
      </div>

      {categoryModalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:180, display:'flex', alignItems:isMobile ? 'flex-end' : 'center', justifyContent:'center', padding:isMobile ? 0 : '20px', direction:'rtl' }}>
          <div onClick={() => !saving && setCategoryModalOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(11,11,15,0.56)' }} />
          <form id="onboarding-category-modal" onSubmit={event => { event.preventDefault(); void addCustomCat() }} noValidate aria-busy={saving} style={{ position:'relative', width:'100%', maxWidth:isMobile ? '100%' : '420px', padding:isMobile ? '22px 20px calc(22px + env(safe-area-inset-bottom))' : '24px', borderRadius:isMobile ? '24px 24px 0 0' : '22px', background:'white', boxShadow:'0 -18px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ width:'42px', height:'4px', margin:'0 auto 16px', borderRadius:'100px', background:'#E5E7EB' }} aria-hidden="true" />
            <h3 style={{ margin:'0 0 5px', fontFamily:'Tajawal,sans-serif', fontSize:'19px', fontWeight:'900', color:'#111827' }}>إضافة قسم جديد</h3>
            <p style={{ margin:'0 0 16px', fontSize:'13px', color:'#6B7280', lineHeight:'1.65' }}>أضف قسمًا يظهر فور حفظه في منيو مطعمك.</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 82px', gap:'9px', alignItems:'end' }}>
              <div>
                <label htmlFor="onboarding-category-name" style={labelStyle}>اسم القسم</label>
                <input id="onboarding-category-name" autoFocus value={categoryName} onChange={event => { setCategoryName(event.target.value); setCategoryFormError('') }} placeholder="مثال: برجر" maxLength={60} style={{ ...inputStyle, background:'white' }} aria-describedby={categoryFormError ? 'onboarding-category-form-error' : undefined} />
              </div>
              <div>
                <label htmlFor="onboarding-category-icon" style={labelStyle}>الأيقونة</label>
                <input id="onboarding-category-icon" value={categoryEmoji} onChange={event => setCategoryEmoji(event.target.value)} maxLength={8} style={{ ...inputStyle, textAlign:'center', background:'white' }} aria-label="أيقونة القسم اختيارية" />
              </div>
            </div>
            {categoryFormError && <div id="onboarding-category-form-error" role="alert" aria-live="assertive" style={{ marginTop:'10px', padding:'10px 12px', borderRadius:'12px', background:'#FEF2F2', border:'1px solid #FECACA', color:'#B91C1C', fontSize:'13px', fontWeight:'700', lineHeight:'1.6' }}>{categoryFormError}</div>}
            <div style={{ display:'flex', gap:'10px', marginTop:'18px' }}>
              <button type="button" onClick={() => setCategoryModalOpen(false)} disabled={saving} style={{ ...ghostBtn, flex:1, opacity:saving ? 0.6 : 1 }}>إلغاء</button>
              <button type="submit" disabled={saving} style={{ ...primaryBtn, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:'8px', opacity:saving ? 0.72 : 1 }}>
                {saving && <span aria-hidden="true" style={{ width:'14px', height:'14px', border:'2px solid rgba(255,255,255,0.45)', borderTopColor:'white', borderRadius:'50%', animation:'onboarding-inline-spin .75s linear infinite' }} />}
                {saving ? 'جاري الإضافة...' : 'إضافة القسم'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(categoryDeleteTarget)}
        title="حذف القسم؟"
        body="سيتم حذف القسم من المنيو. يمكنك إضافة قسم جديد لاحقًا."
        confirmLabel={saving ? 'جاري الحذف...' : 'حذف'}
        cancelLabel="إلغاء"
        danger
        loading={saving}
        onConfirm={() => void deleteCategory()}
        onCancel={() => !saving && setCategoryDeleteTarget(null)}
      />
    </div>
  )
}
