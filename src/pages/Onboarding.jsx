import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { ensurePrimaryBranch } from '../lib/branchesApi'
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
  { key:'restaurant', emoji:'🍽️', label:'مطعم',        desc:'وجبات ومأكولات متنوعة' },
  { key:'cafe',       emoji:'☕', label:'كافيه / كوفي', desc:'قهوة ومشروبات ومعجنات' },
  { key:'truck',      emoji:'🚚', label:'فود ترك',      desc:'أكل سريع وسندويتشات' },
  { key:'cloud',      emoji:'☁️', label:'مطبخ سحابي',   desc:'مطبخ للتوصيل فقط' },
]
const getTemplate = (type) => TEMPLATES[type] || TEMPLATES.restaurant

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
const RESUME_MAP = { welcome:'welcome', info:'info', type:'type', categories:'categories', items:'categories', preview:'preview', share:'share' }

export default function Onboarding() {
  const navigate = useNavigate()
  const { user, restaurant, fetchRestaurant } = useAuthStore()

  const [stage, setStage] = useState('loading') // loading | error | welcome | create | info | type | categories | items | minimum | preview | share | done
  const [rest, setRest] = useState(restaurant || null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [readiness, setReadiness] = useState(null)

  const [cForm, setCForm] = useState({ name:'', slug:'', slugEdited:false })
  const [info, setInfo] = useState({ description:'', phone:'', address:'' })

  // الأقسام المختارة = مصفوفة مرتّبة من {key, name, emoji, items}
  const [cats, setCats] = useState([])
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const dragFrom = useRef(null)
  const qrRef = useRef(null)
  const createRestaurantInFlight = useRef(false)
  const createMenuInFlight = useRef(false)

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
        const resumed = RESUME_MAP[r.onboarding_step] || 'welcome'
        if (resumed === 'categories' && r.type) setCats(getTemplate(r.type).slice(0, 5).map(c => ({ ...c })))
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
    if (!skip) {
      setSaving(true)
      try {
        await supabase.from('restaurants').update({
          description: info.description.trim() || null,
          phone: info.phone.trim() || null,
          address: info.address.trim() || null,
        }).eq('id', rest.id)
        setRest(r => ({ ...r, ...info }))
        await fetchRestaurant(user.id)
        trackOwnerEvent('restaurant_info_completed', { restaurantId: rest.id, props: { skipped: false } })
      } catch (err) { toast.error('تعذّر حفظ المعلومات') } finally { setSaving(false) }
    }
    if (skip && rest?.id) trackOwnerEvent('restaurant_info_completed', { restaurantId: rest.id, props: { skipped: true } })
    goStage('type')
  }

  // ===== اختيار النوع =====
  const chooseType = async (typeKey) => {
    setSaving(true)
    try {
      const { error } = await supabase.from('restaurants').update({ type: typeKey }).eq('id', rest.id)
      if (error) throw error
      const updated = { ...rest, type: typeKey }
      setRest(updated)
      await fetchRestaurant(user.id)
      // نبدأ بأقسام مقترحة جاهزة (أول 5) — يقدر يحذف/يضيف
      setCats(getTemplate(typeKey).slice(0, 5).map(c => ({ ...c })))
      trackOwnerEvent('business_type_selected', { restaurantId: rest.id, props: { type: typeKey } })
      goStage('categories')
    } catch (err) { toast.error('تعذّر حفظ النوع') } finally { setSaving(false) }
  }

  // ===== الأقسام =====
  const isAdded = (key) => cats.some(c => c.key === key)

  const addTemplateCat = (t) => {
    if (isAdded(t.key)) return
    setCats(prev => [...prev, { ...t }])
    toast.success(`تم إضافة "${t.name}"`)
  }

  const addCustomCat = () => {
    const name = customInput.trim()
    if (!name) return
    if (cats.some(c => c.name === name)) { toast.error('القسم موجود بالفعل'); return }
    setCats(prev => [...prev, { key:`custom-${Date.now()}`, name, emoji:'🍽️', items:[] }])
    toast.success(`تم إضافة "${name}"`)
    setCustomInput(''); setShowCustom(false)
  }

  const removeCat = (i) => setCats(prev => prev.filter((_, idx) => idx !== i))

  // إعادة الترتيب بالسحب
  const onDrop = (to) => {
    const from = dragFrom.current
    if (from === null || from === to) return
    setCats(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      return arr
    })
    dragFrom.current = null
  }
  const move = (i, dir) => setCats(prev => {
    const j = i + dir
    if (j < 0 || j >= prev.length) return prev
    const arr = [...prev]; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; return arr
  })

  const goToItems = () => {
    if (cats.length === 0) { toast.error('أضف قسماً واحداً على الأقل'); return }
    const s = new Set()
    cats.forEach(c => (c.items || []).forEach(it => s.add(`${c.key}::${it.name}`)))
    setSelectedItems(s)
    // لو ما في أصناف مقترحة إطلاقاً، ننشئ المنيو مباشرة
    const hasItems = cats.some(c => (c.items || []).length > 0)
    if (!hasItems) { finish(new Set()); return }
    goStage('items')
  }

  const toggleItem = (key) => setSelectedItems(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n
  })

  // ===== إنشاء المنيو (يربط الأقسام/الأصناف بالفرع الرئيسي — إصلاح جوهري ليظهر المنيو للزبون) =====
  const finish = async (itemsSet = selectedItems) => {
    if (saving || createMenuInFlight.current) return
    if (cats.length === 0) { toast.error('أضف قسماً واحداً على الأقل'); return }
    createMenuInFlight.current = true
    setSaving(true)
    try {
      // منيو العميل يُقرأ عبر branch_id → لا بد من ربط كل شيء بالفرع الرئيسي.
      const branch = await ensurePrimaryBranch(rest.id)
      const { data: existingCategories, error: existingCategoriesError } = await supabase
        .from('categories').select('id').eq('branch_id', branch.id).limit(1)
      if (existingCategoriesError) throw existingCategoriesError
      if (existingCategories?.length) {
        await refreshReadiness(rest.id)
        toast('يوجد منيو قائم بالفعل. نكمل من المرحلة المناسبة.', { icon: 'ℹ️' })
        goStage('preview')
        return
      }

      const catRows = cats.map((c, i) => ({ restaurant_id: rest.id, branch_id: branch.id, name:c.name, emoji:c.emoji, is_visible:true, sort_order:i }))
      const { data: insertedCats, error: catErr } = await supabase.from('categories').insert(catRows).select()
      if (catErr) throw catErr
      const nameToId = {}
      insertedCats.forEach(c => { nameToId[c.name] = c.id })

      const productRows = []
      cats.forEach(c => {
        (c.items || []).forEach((it, idx) => {
          if (!itemsSet.has(`${c.key}::${it.name}`)) return
          productRows.push({ restaurant_id: rest.id, branch_id: branch.id, category_id: nameToId[c.name] || null, name: it.name, price: it.price, emoji: it.emoji || '🍽️', is_available:true, sort_order: idx })
        })
      })
      if (productRows.length) {
        const { error: productError } = await supabase.from('products').insert(productRows)
        if (productError) throw productError
      }
      toast.success(`تم إنشاء منيوك (${cats.length} أقسام، ${productRows.length} صنف).`)
      trackOwnerMilestone('category_created', { restaurantId: rest.id, branchId: branch.id, props: { count: cats.length, source: 'onboarding_template' } })
      if (productRows.length > 0) trackOwnerMilestone('first_product_created', { restaurantId: rest.id, branchId: branch.id, props: { count: productRows.length, source: 'onboarding_template' } })
      const nextReadiness = await refreshReadiness(rest.id)
      if (nextReadiness?.minimumReady) trackOwnerMilestone('menu_minimum_ready', { restaurantId: rest.id, branchId: branch.id, props: { source: 'onboarding' } })
      trackOwnerEvent('menu_preview_opened', { restaurantId: rest.id, props: { source: 'onboarding_auto' } })
      goStage('preview')
    } catch (error) {
      console.error('Menu creation error:', error)
      toast.error('تعذّر إنشاء المنيو. لم ننتقل قبل تأكيد حفظ البيانات، جرّب مرة أخرى.')
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
  const card = { width:'100%', maxWidth:'560px', background:'white', borderRadius:'20px', padding: isMobile ? '20px' : '30px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }
  const primaryBtn = { flex:1, padding:'14px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer' }
  const ghostBtn = { padding:'14px 18px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer', color:'#374151' }
  const inputStyle = { width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', outline:'none', textAlign:'right', boxSizing:'border-box' }
  const labelStyle = { display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }
  const skipLink = { width:'100%', marginTop:'10px', background:'none', border:'none', color:'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontSize:'13px', cursor:'pointer' }

  // يعرض المؤشر أساسيات المشاركة فقط؛ لا تدخل التحسينات الاختيارية في حالة الجاهزية.
  const stepIndex = STEPS.findIndex(s => s.key === stage)
  const Progress = () => stepIndex < 0 ? null : (
    <div style={{ margin:'12px 0 18px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:'10px', fontSize:'11px', color:'#9CA3AF', marginBottom:'7px' }}>
        <span style={{ fontWeight:'800', color: readiness?.minimumReady ? '#15803D' : '#FF6A00' }}>
          {readiness?.minimumReady ? 'منيوك جاهز للمشاركة' : 'نبني منيوك الجاهز للمشاركة'}
        </span>
        <span>{readiness ? `الأساسيات ${readiness.essentialsDone}/${readiness.essentialsTotal}` : 'الأساسيات'}</span>
      </div>
      <div style={{ height:'6px', borderRadius:'100px', background:'#F0F2F5', overflow:'hidden' }}>
        <div style={{ height:'100%', width: readiness ? `${(readiness.essentialsDone / readiness.essentialsTotal) * 100}%` : '0%', background:readiness?.minimumReady ? 'linear-gradient(90deg,#16A34A,#22C55E)' : 'linear-gradient(90deg,#FF6A00,#E05D00)', borderRadius:'100px', transition:'width 0.3s' }}/>
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
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>عرّف بمطعمك ✨</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'18px' }}>معلومات تظهر للزبون في منيوك. كلها اختيارية — تقدر تكمّلها لاحقاً.</p>

            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>نبذة قصيرة <span style={{ color:'#9CA3AF', fontWeight:'400' }}>(اختياري)</span></label>
              <textarea style={{ ...inputStyle, minHeight:'70px', resize:'vertical' }} placeholder="ألذ المأكولات الطازجة يومياً..." value={info.description} onChange={e => setInfo(f => ({ ...f, description:e.target.value }))} />
            </div>
            <div style={{ marginBottom:'14px' }}>
              <label style={labelStyle}>رقم التواصل <span style={{ color:'#9CA3AF', fontWeight:'400' }}>(اختياري)</span></label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="tel" placeholder="05xxxxxxxx" value={info.phone} onChange={e => setInfo(f => ({ ...f, phone:e.target.value }))} />
            </div>
            <div style={{ marginBottom:'18px' }}>
              <label style={labelStyle}>العنوان <span style={{ color:'#9CA3AF', fontWeight:'400' }}>(اختياري)</span></label>
              <input style={inputStyle} placeholder="الرياض — حي..." value={info.address} onChange={e => setInfo(f => ({ ...f, address:e.target.value }))} />
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => goStage('welcome')} style={ghostBtn}>→ رجوع</button>
              <button onClick={() => saveInfo(false)} disabled={saving} style={{ ...primaryBtn, opacity: saving?0.7:1 }}>{saving ? 'جارٍ الحفظ...' : 'التالي ←'}</button>
            </div>
            <button onClick={() => saveInfo(true)} style={skipLink}>تخطّي الآن</button>
          </>
        )}

        {/* اختيار النوع */}
        {stage === 'type' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>شنو نوع نشاطك؟ 🏪</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'18px' }}>حنجهّز لك أقساماً وأصنافاً مناسبة حسب اختيارك.</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'11px' }}>
              {TYPES.map(t => (
                <div key={t.key} onClick={() => !saving && chooseType(t.key)} style={{ padding:'18px 14px', borderRadius:'15px', border:'2px solid #E5E7EB', cursor: saving?'default':'pointer', textAlign:'center', opacity: saving?0.6:1, background:'white' }}>
                  <div style={{ fontSize:'34px', marginBottom:'8px' }}>{t.emoji}</div>
                  <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', marginBottom:'3px' }}>{t.label}</div>
                  <div style={{ fontSize:'11px', color:'#9CA3AF' }}>{t.desc}</div>
                </div>
              ))}
            </div>
                            <button onClick={skipMenu} style={{ ...skipLink, marginTop:'16px' }}>راجع جاهزية المنيو أولاً</button>

          </>
        )}

        {/* اختيار الأقسام — نمط النموذج: قوالب تُضاف لقائمة كروت */}
        {stage === 'categories' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>أقسام منيوك 📋</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'16px' }}>أضف الأقسام الرئيسية لمنيوك. يمكنك تعديلها لاحقاً في أي وقت.</p>

            {/* قوالب جاهزة */}
            <div style={{ fontSize:'13px', fontWeight:'800', color:'#374151', marginBottom:'10px' }}>⚡ قوالب جاهزة — انقر للإضافة</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'18px' }}>
              {template.map(t => {
                const added = isAdded(t.key)
                return (
                  <button key={t.key} onClick={() => addTemplateCat(t)} disabled={added} style={{
                    display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'100px',
                    border:`1.5px solid ${added ? '#E5E7EB' : '#FFD9C7'}`, background: added ? '#F3F4F6' : 'white',
                    color: added ? '#9CA3AF' : '#374151', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'13px',
                    cursor: added ? 'default' : 'pointer', opacity: added ? 0.7 : 1,
                  }}>
                    <span>{t.emoji}</span>{t.name}{added ? ' ✓' : ' +'}
                  </button>
                )
              })}
            </div>

            {/* القائمة المختارة (كروت قابلة للترتيب والحذف) */}
            <div style={{ display:'flex', flexDirection:'column', gap:'9px', marginBottom:'12px' }}>
              {cats.map((c, i) => (
                <div key={c.key}
                  draggable
                  onDragStart={() => { dragFrom.current = i }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(i)}
                  style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'14px', border:'1.5px solid #E5E7EB', background:'#F8F9FB' }}>
                  <div style={{ display:'flex', flexDirection:'column', color:'#C4C7CE', cursor:'grab', lineHeight:'0.6', fontSize:'15px' }}>⋮⋮</div>
                  <div style={{ width:'40px', height:'40px', borderRadius:'11px', background:'white', border:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px', flexShrink:0 }}>{c.emoji}</div>
                  <div style={{ flex:1, fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px' }}>{c.name}</div>
                  {/* أسهم ترتيب (بديل موثوق للسحب على الجوال) */}
                  <button onClick={() => move(i, -1)} disabled={i===0} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'15px', color: i===0?'#E5E7EB':'#9CA3AF', padding:'2px' }}>▲</button>
                  <button onClick={() => move(i, 1)} disabled={i===cats.length-1} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'15px', color: i===cats.length-1?'#E5E7EB':'#9CA3AF', padding:'2px' }}>▼</button>
                  <button onClick={() => removeCat(i)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:'18px', color:'#EF4444', padding:'2px 4px' }}>✕</button>
                </div>
              ))}
            </div>

            {/* إضافة قسم جديد */}
            {showCustom ? (
              <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                <input autoFocus style={inputStyle} placeholder="اسم القسم الجديد..." value={customInput}
                  onChange={e => setCustomInput(e.target.value)} onKeyDown={e => { if (e.key==='Enter') addCustomCat() }} />
                <button onClick={addCustomCat} style={{ ...primaryBtn, flex:'none', padding:'0 18px' }}>إضافة</button>
              </div>
            ) : (
              <button onClick={() => setShowCustom(true)} style={{ width:'100%', padding:'13px', borderRadius:'13px', border:'2px dashed #D1D5DB', background:'white', color:'#6B7280', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer', marginBottom:'12px' }}>
                ＋ إضافة قسم جديد
              </button>
            )}

            <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'18px', lineHeight:'1.7' }}>💡 أضف من 3 إلى 8 أقسام للبداية. رتّبها بالأسهم أو بالسحب.</div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => goStage('type')} style={ghostBtn}>→ رجوع</button>
              <button onClick={goToItems} style={primaryBtn}>التالي: الأصناف ←</button>
            </div>
            <button onClick={skipMenu} style={skipLink}>راجع جاهزية المنيو أولاً</button>
          </>
        )}

        {/* اختيار الأصناف */}
        {stage === 'items' && (
          <>
            <h2 style={{ fontSize:'22px', fontWeight:'900', marginBottom:'4px', fontFamily:'Tajawal,sans-serif' }}>اختر أصنافك 🍽️</h2>
            <p style={{ fontSize:'13px', color:'#6B7280', marginBottom:'16px' }}>الأصناف والأسعار مقترحة — عدّلها لاحقاً من صفحة الأصناف.</p>

            <div style={{ maxHeight: isMobile ? '46vh' : '50vh', overflowY:'auto', marginBottom:'16px', paddingLeft:'4px' }}>
              {cats.filter(c => (c.items || []).length > 0).map(c => (
                <div key={c.key} style={{ marginBottom:'16px' }}>
                  <div style={{ fontSize:'13px', fontWeight:'800', marginBottom:'8px', color:'#374151' }}>{c.emoji} {c.name}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                    {c.items.map(it => {
                      const key = `${c.key}::${it.name}`
                      const on = selectedItems.has(key)
                      return (
                        <div key={key} onClick={() => toggleItem(key)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'12px', border:`1.5px solid ${on ? '#FF6A00' : '#E5E7EB'}`, background: on ? 'rgba(255,106,0,0.06)' : 'white', cursor:'pointer' }}>
                          <span style={{ width:'20px', height:'20px', borderRadius:'6px', border:`1.5px solid ${on ? '#FF6A00' : '#D1D5DB'}`, background: on ? '#FF6A00' : 'white', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', flexShrink:0 }}>{on ? '✓' : ''}</span>
                          <span style={{ fontSize:'18px' }}>{it.emoji}</span>
                          <span style={{ flex:1, fontSize:'13px', fontWeight:'700' }}>{it.name}</span>
                          <span style={{ fontSize:'13px', fontWeight:'800', color:'#6B7280', direction:'ltr' }}>{it.price} ﷼</span>
                        </div>
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
    </div>
  )
}
