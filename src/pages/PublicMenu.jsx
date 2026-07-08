import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { vatBreakdown } from '../lib/pricing'
import ErrBoundary from '../features/menu/ErrBoundary'
import { computeOpenStatus } from '../features/menu/helpers'
import { SOCIAL_ICONS } from '../features/menu/SocialIcons'
import { makeT } from '../features/menu/i18n'
import ProductItem from '../features/menu/ProductItem'
import ProductModal from '../features/menu/ProductModal'
import CartDrawer from '../features/menu/CartDrawer'
import AllergensModal from '../features/menu/AllergensModal'
import BranchPickerScreen from '../features/menu/BranchPickerScreen'
import OrdersScreen from '../features/menu/OrdersScreen'

function PublicMenuInner() {
  const { slug } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const branchId = searchParams.get('branch')
  const [branch, setBranch] = useState(null)
  const [branchList, setBranchList] = useState([])   // كل الفروع النشطة (لصفحة اختيار الفرع)
  const [branchPicked, setBranchPicked] = useState(false) // هل حسم الزبون اختيار الفرع؟
  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [bestSellers, setBestSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)

  // ===== اللغة (عربي/إنجليزي) =====
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('sm_lang') || 'ar' } catch { return 'ar' } })
  const isEn = lang === 'en'
  const toggleLang = () => setLang(l => { const n = l === 'ar' ? 'en' : 'ar'; try { localStorage.setItem('sm_lang', n) } catch {} return n })
  // ترجمة المحتوى: يرجّع الإنجليزي إن وُجد وإلا العربي (fallback)
  const tx = (obj, base) => (isEn && obj && obj[`${base}_en`]) ? obj[`${base}_en`] : (obj?.[base] || '')
  // اسم الصنف داخل الطلب: يُطابق الصنف الحالي لجلب الترجمة، وإلا الاسم المخزّن
  const itemName = (item) => {
    if (isEn && item?.id) {
      const pr = products.find(p => p.id === item.id)
      if (pr?.name_en) return pr.name_en
    }
    return item?.name || ''
  }
  // نصوص الواجهة الثابتة — من features/menu/i18n
  const t = makeT(lang)

  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [reviewedIds, setReviewedIds] = useState([])       // طلبات قُيّمت بالفعل
  const [reviewDraft, setReviewDraft] = useState({})       // { [orderId]: { rating, comment } }
  const [submittingReview, setSubmittingReview] = useState(false)
  const [loyalty, setLoyalty] = useState(null)             // معلومات نقاط الزبون (لو البرنامج مفعّل)
  const [orderNumber, setOrderNumber] = useState('')
  const [lastOrderSummary, setLastOrderSummary] = useState(null) // { items, total, tableNumber } للمشاركة عبر واتساب
  // activeOrders: كل الطلبات النشطة لهذا المطعم على هذا الجهاز، محفوظة في localStorage
  // كل عنصر: { id, orderNumber, status, items, total, tableNumber, createdAt }
  const [activeOrders, setActiveOrders] = useState([])
  const [restaurantActiveOrdersCount, setActiveOrdersCount] = useState(0)
  const orderChannelsRef = useRef({}) // { [orderId]: channel }
  const restaurantLoadChannelRef = useRef(null)
  const activeOrdersRef = useRef([]) // أحدث نسخة من activeOrders (تُستخدم في المصالحة داخل مستمعي الأحداث)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAllergensModal, setShowAllergensModal] = useState(false)
  const categoryObserverRef = useRef(null)

  const ORDERS_STORAGE_KEY = `simsim_orders_${slug}`
  const REVIEWS_STORAGE_KEY = `simsim_reviewed_${slug}` // معرّفات الطلبات التي قُيّمت من هذا الجهاز
  const PHONE_STORAGE_KEY = `simsim_phone_${slug}`       // آخر رقم جوال استخدمه الزبون (لعرض نقاطه)
  const SCREEN_SESSION_KEY = `simsim_screen_${slug}`

  useEffect(() => {
    fetchMenu()
  }, [slug])


  // تحميل الطلبات النشطة المحفوظة من قبل لهذا المطعم، والاستماع لتحديثاتها
  useEffect(() => {
    if (!slug) return
    try {
      const saved = JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY) || '[]')
      // إخفاء الطلبات المكتملة/الملغاة القديمة جداً (أكثر من 12 ساعة) لتجنب تراكم لا نهائي
      const recent = saved.filter(o => Date.now() - (o.createdAt || 0) < 12 * 60 * 60 * 1000)
      setActiveOrders(recent)

      // تحديد الشاشة الافتراضية: لو هذه أول فتحة في الجلسة الحالية (تبويب/مسح QR جديد) → المنيو دائماً
      // لو فيه شاشة محفوظة من قبل في نفس الجلسة (تحديث الصفحة) → نرجع لنفس الشاشة التي كان فيها العميل
      const savedScreen = sessionStorage.getItem(SCREEN_SESSION_KEY)
      if (savedScreen === 'orders' && recent.length > 0) {
        setOrderPlaced(true)
      } else {
        setOrderPlaced(false)
        sessionStorage.setItem(SCREEN_SESSION_KEY, 'menu')
      }
    } catch {
      setActiveOrders([])
    }
  }, [slug])

  // حفظ الشاشة الحالية (منيو أو طلباتي) في sessionStorage عند أي تغيير، لتُستعاد بدقة عند تحديث الصفحة فقط
  useEffect(() => {
    if (!slug) return
    sessionStorage.setItem(SCREEN_SESSION_KEY, orderPlaced ? 'orders' : 'menu')
  }, [orderPlaced, slug])

  // حفظ activeOrders في localStorage عند أي تغيير، والاشتراك في تحديثات أي طلب جديد لم يُشترك له بعد
  useEffect(() => {
    if (!slug) return
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(activeOrders))
    activeOrdersRef.current = activeOrders
    activeOrders.forEach(order => {
      if (orderChannelsRef.current[order.id]) return // مشترك بالفعل
      const ch = supabase.channel(`order-status-${order.id}`)
        .on('postgres_changes',
          { event:'UPDATE', schema:'public', table:'orders', filter:`id=eq.${order.id}` },
          (p) => {
            const newItems = Array.isArray(p.new.items) ? p.new.items : []
            const newStatus = p.new.status
            const newCancelledBy = p.new.cancelled_by
            setActiveOrders(prev => prev.map(o => {
              if (o.id !== order.id) return o
              if (newStatus === 'cancelled' && o.status !== 'cancelled') {
                toast.error(`🚫 ${t('cancelledByShop')} (${o.orderNumber})`, { duration: 8000 })
              } else {
                // إشعار عند تعليم صنف جديد كغير متوفر (طلب لسه نشط)
                newItems.forEach((ni, idx) => {
                  const wasUnavailable = o.items[idx]?.unavailable
                  if (ni.unavailable && !wasUnavailable) {
                    toast.error(`⚠️ ${ni.name} ${t('itemUnavail')} (${o.orderNumber})`, { duration: 6000 })
                  }
                })
              }
              return { ...o, status: newStatus, cancelledBy: newCancelledBy, items: newItems, total: Number(p.new.total) || 0 }
            }))
          }
        ).subscribe()
      orderChannelsRef.current[order.id] = ch
    })
  }, [activeOrders, slug])

  useEffect(() => {
    return () => {
      Object.values(orderChannelsRef.current).forEach(ch => supabase.removeChannel(ch))
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
    }
  }, [])

  // جلب نقاط ولاء الزبون عند دخول شاشة "طلباتي" (لو البرنامج مفعّل)
  useEffect(() => {
    if (!orderPlaced || !restaurant) return
    let phone = customerPhone.replace(/[^\d]/g, '')
    if (!phone) { try { phone = localStorage.getItem(PHONE_STORAGE_KEY) || '' } catch { phone = '' } }
    if (!phone) { setLoyalty(null); return }
    supabase.rpc('get_customer_loyalty', { rest_id: restaurant.id, phone })
      .then(({ data }) => {
        const info = data && data[0]
        setLoyalty(info && info.enabled ? info : null)
      })
      .catch(() => setLoyalty(null))
  }, [orderPlaced, restaurant, activeOrders])

  // مصالحة الحالة: نعيد جلب الحالة الحقيقية للطلبات النشطة من قاعدة البيانات
  // لتعويض أي تحديث فات أثناء انقطاع اتصال realtime (خروج من المتصفح / قفل الشاشة)
  const reconcileActiveOrders = async () => {
    const list = activeOrdersRef.current || []
    const ids = list
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
      .map(o => o.id)
    if (ids.length === 0) return
    try {
      const { data, error } = await supabase.rpc('get_orders_status', { order_ids: ids })
      if (error || !data) return
      setActiveOrders(prev => prev.map(o => {
        const fresh = data.find(d => d.id === o.id)
        if (!fresh) return o
        // إشعار لو اكتشفنا إلغاءً من المطعم لم يصل عبر realtime
        if (fresh.status === 'cancelled' && o.status !== 'cancelled' && fresh.cancelled_by !== 'customer') {
          toast.error(`🚫 ${t('cancelledByShop')} (${o.orderNumber})`, { duration: 8000 })
        }
        return {
          ...o,
          status: fresh.status,
          cancelledBy: fresh.cancelled_by ?? o.cancelledBy,
          items: Array.isArray(fresh.items) ? fresh.items : o.items,
          total: Number(fresh.total) || o.total,
        }
      }))
    } catch { /* تجاهل أخطاء الشبكة المؤقتة */ }
  }

  // إعادة المزامنة عند رجوع الزبون للصفحة (تبديل تبويب/فتح المتصفح) + كل فترة قصيرة كشبكة أمان
  useEffect(() => {
    if (!slug) return
    const onVisible = () => { if (document.visibilityState === 'visible') reconcileActiveOrders() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', reconcileActiveOrders)
    const kickoff = setTimeout(reconcileActiveOrders, 1500) // مزامنة أولية سريعة بعد التحميل
    const interval = setInterval(reconcileActiveOrders, 20000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', reconcileActiveOrders)
      clearTimeout(kickoff)
      clearInterval(interval)
    }
  }, [slug])

  // Scroll-spy: رصد القسم الظاهر حالياً أثناء التمرير، وتمييزه تلقائياً في شريط التبويبات + تمرير الشريط لإظهاره
  useEffect(() => {
    if (searchQuery || categories.length === 0) return

    if (categoryObserverRef.current) categoryObserverRef.current.disconnect()

    const observer = new IntersectionObserver(
      (entries) => {
        // من بين الأقسام المتقاطعة مع منطقة الرصد، نختار الأقرب لأعلى الشاشة
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length === 0) return
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b
        )
        const catId = topMost.target.id.replace('cat-', '')
        setActiveCategory(prev => {
          if (prev === catId) return prev
          document.getElementById(`tab-${catId}`)?.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'center' })
          return catId
        })
      },
      { rootMargin: '-120px 0px -65% 0px', threshold: 0 }
    )

    // تأخير بسيط لضمان اكتمال رندرة React الفعلية للعناصر في DOM قبل محاولة ربطها بالـ Observer
    const timer = setTimeout(() => {
      categories.forEach(cat => {
        const el = document.getElementById(`cat-${cat.id}`)
        if (el) observer.observe(el)
      })
    }, 100)

    categoryObserverRef.current = observer
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [categories, searchQuery, bestSellers])

  const fetchMenu = async () => {
    try {
      // Fetch restaurant
      const { data: rest, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (error || !rest) { setNotFound(true); return }
      setRestaurant(rest)

      // لو الرابط يحتوي معرّف فرع، نجلب بياناته لعرض اسمه وربط الطلب به
      if (branchId) {
        const { data: br } = await supabase
          .from('branches')
          .select('*')
          .eq('id', branchId)
          .eq('restaurant_id', rest.id)
          .eq('is_active', true)
          .single()
        if (br) setBranch(br)
        setBranchPicked(true) // الفرع محدد مسبقاً من الرابط، لا حاجة لصفحة الاختيار
      } else {
        // لا يوجد فرع في الرابط: نجلب كل الفروع النشطة لعرض صفحة "اختر فرعك"
        const { data: brs } = await supabase
          .from('branches')
          .select('*')
          .eq('restaurant_id', rest.id)
          .eq('is_active', true)
          .order('sort_order')
        const list = brs || []
        setBranchList(list)
        // نعرض صفحة الاختيار فقط لو فيه فرع نشط واحد على الأقل، وإلا نكمل مباشرة (الفرع الرئيسي)
        if (list.length === 0) setBranchPicked(true)
      }

      // عدد الطلبات النشطة حالياً لحساب وقت تجهيز تقديري ديناميكي (عبر RPC آمن)
      const { data: activeCount } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id })
      setActiveOrdersCount(activeCount || 0)

      // Fetch categories & products
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', rest.id).eq('is_visible', true).order('sort_order'),
        supabase.from('products').select('*').eq('restaurant_id', rest.id).eq('is_available', true).order('sort_order'),
      ])

      if (cats) { setCategories(cats); if (cats.length > 0) setActiveCategory(cats[0].id) }
      if (prods) setProducts(prods)

      // حساب الأصناف الأكثر مبيعاً من الطلبات الفعلية (غير الملغاة) خلال آخر 30 يوماً (عبر RPC آمن)
      const { data: pastOrders } = await supabase.rpc('get_recent_order_items', { p_restaurant_id: rest.id })

      if (pastOrders && prods) {
        const salesCount = {}
        pastOrders.forEach(o => {
          const orderItems = Array.isArray(o.items) ? o.items : []
          orderItems.forEach(it => {
            if (it.unavailable) return
            salesCount[it.id] = (salesCount[it.id] || 0) + (it.qty || 1)
          })
        })
        const ranked = prods
          .filter(p => salesCount[p.id] > 0)
          .sort((a, b) => salesCount[b.id] - salesCount[a.id])
          .slice(0, 4)
        setBestSellers(ranked)
      }

      // تحديث عدد الطلبات النشطة لحظياً مع كل طلب جديد أو تغيّر حالة
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
      restaurantLoadChannelRef.current = supabase.channel(`restaurant-load-${rest.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rest.id}` },
          async () => {
            const { data: c } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id })
            setActiveOrdersCount(c || 0)
          }
        ).subscribe()
    } finally {
      setLoading(false)
    }
  }

  // وقت تجهيز تقديري ديناميكي: وقت أساسي + دقائق إضافية لكل طلب نشط حالياً بالمطبخ
  const estimatedPrepTime = () => {
    const base = 10
    const perOrder = 3
    const min = base + restaurantActiveOrdersCount * perOrder
    const max = min + 10
    return `${min}-${max}`
  }

  // Cart functions
  // selectedOptions: [{ groupName, choiceName, price }] — قائمة مفسّرة من الخيارات المختارة
  const addToCart = (product, qty = 1, note = '', selectedOptions = []) => {
    const optionsPrice = selectedOptions.reduce((s, o) => s + (o.price || 0), 0)
    const finalPrice = product.price + optionsPrice
    // مفتاح فريد للعنصر: نفس الصنف بخيارات مختلفة = عنصر سلة مختلف
    const optionsKey = selectedOptions.map(o => `${o.groupName}:${o.choiceName}`).sort().join('|')
    const cartKey = `${product.id}__${optionsKey}__${note}`

    setCart(prev => {
      const existing = prev.find(i => i.cartKey === cartKey)
      if (existing) return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + qty } : i)
      return [...prev, {
        cartKey, id: product.id, name: product.name, emoji: product.emoji, image_url: product.image_url,
        price: finalPrice, basePrice: product.price, qty, note,
        selectedOptions,
      }]
    })
    toast.success(`✅ ${t('tAdded')}`)
  }

  const removeFromCart = (cartKey) => {
    setCart(prev => {
      const item = prev.find(i => i.cartKey === cartKey)
      if (!item) return prev
      if (item.qty <= 1) return prev.filter(i => i.cartKey !== cartKey)
      return prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty - 1 } : i)
    })
  }

  const incrementCartItem = (cartKey) => {
    setCart(prev => prev.map(i => i.cartKey === cartKey ? { ...i, qty: i.qty + 1 } : i))
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0)

  // حالة فتح المحل (حسب الفرع لو محدد، وإلا المطعم) — تُستخدم لمنع الطلب وقت الإغلاق
  const openStatus = restaurant
    ? computeOpenStatus(branch?.opening_hours || restaurant.opening_hours)
    : { open: true, unknown: true, nextText: '', todayText: '' }

  // عدد الطلبات النشطة فعلياً (انتظار/تحضير/جاهز) — لا يشمل المكتملة أو الملغاة
  const liveOrdersCount = activeOrders.filter(o => ['pending','preparing','ready'].includes(o.status)).length

  // بناء رسالة واتساب جاهزة بتفاصيل الطلب وفتحها على رقم المطعم
  const sendWhatsAppConfirmation = () => {
    if (!lastOrderSummary || !restaurant?.phone) {
      toast.error(t('tNoContact'))
      return
    }
    const greeting = restaurant.whatsapp_message?.trim() || `تفضل تأكيد طلبي من ${restaurant.name} 🍽️`
    const typeLabels = { dine_in:'محلي 🪑', takeaway:'سفري 🥡', delivery:'توصيل 🛵' }
    const locationLine = lastOrderSummary.orderType === 'delivery'
      ? `عنوان التوصيل: ${lastOrderSummary.deliveryAddress}`
      : lastOrderSummary.orderType === 'dine_in'
        ? `رقم الطاولة: ${lastOrderSummary.tableNumber}`
        : null
    const lines = [
      greeting,
      `رقم الطلب: ${lastOrderSummary.orderNumber}`,
      `نوع الطلب: ${typeLabels[lastOrderSummary.orderType] || lastOrderSummary.orderType}`,
      ...(locationLine ? [locationLine] : []),
      '',
      'الأصناف:',
      ...lastOrderSummary.items.map(i => {
        const optsText = (i.selectedOptions && i.selectedOptions.length > 0)
          ? ` (${i.selectedOptions.map(o => o.choiceName).join(isEn ? ', ' : '، ')})`
          : ''
        return `- ${i.name}${optsText} × ${i.qty} = ${(i.price * i.qty).toFixed(2)} ﷼`
      }),
      '',
      `الإجمالي: ${lastOrderSummary.total.toFixed(2)} ﷼`,
    ]
    const phone = restaurant.phone.replace(/[^\d]/g, '')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`
    window.open(url, '_blank')
  }

  // فتح محادثة واتساب عامة للاستفسارات، بمعزل عن طلب فعلي (الزر العائم)
  const openWhatsAppContact = () => {
    if (!restaurant?.phone) {
      toast.error(t('tNoContact'))
      return
    }
    const greeting = restaurant.whatsapp_message?.trim() || `مرحباً، لدي استفسار بخصوص ${restaurant.name} 👋`
    const phone = restaurant.phone.replace(/[^\d]/g, '')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`
    window.open(url, '_blank')
  }

  // Place order
  const placeOrder = async () => {
    if (cart.length === 0) { toast.error(t('tCartEmpty')); return }
    // منع الطلب وقت الإغلاق حسب أوقات الفرع/المطعم
    const openStatus = computeOpenStatus(branch?.opening_hours || restaurant.opening_hours)
    if (!openStatus.open) {
      toast.error(openStatus.nextText ? `${t('closedTitle')} — ${openStatus.nextText}` : t('tClosed'))
      return
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) { toast.error(t('tEnterTable')); return }
    if (orderType === 'delivery' && !deliveryAddress.trim()) { toast.error(t('tEnterAddr')); return }
    if (!customerPhone.trim()) { toast.error(t('tEnterPhone')); return }
    const cleanPhone = customerPhone.replace(/[^\d]/g, '')
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      toast.error(t('tBadPhone'))
      return
    }

    const items = cart.map(i => ({
      id: i.id, name: i.name, emoji: i.emoji, image_url: i.image_url,
      price: i.price, qty: i.qty, notes: i.note,
      selectedOptions: i.selectedOptions || [],
    }))

    const deliveryFee = orderType === 'delivery' ? (Number(restaurant.delivery_fee) || 0) : 0
    // الأسعار المعروضة شاملة ض.ق.م 15% — نفكّ الضريبة للخلف (lib/pricing)
    const { net, tax } = vatBreakdown(cartTotal)
    const total = cartTotal + deliveryFee

    const { data, error } = await supabase.from('orders').insert({
      restaurant_id: restaurant.id,
      branch_id: branch?.id || null,
      table_number: orderType === 'dine_in' ? tableNumber : null,
      delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
      customer_name: customerName.trim() || null,
      customer_phone: cleanPhone,
      type: orderType,
      status: 'pending',
      items,
      subtotal: net,
      tax,
      delivery_fee: deliveryFee,
      total,
      notes: '',
    }).select().single()

    if (error) {
      console.error('Order error:', error)
      toast.error(error.message || t('tErr'))
      return
    }

    setOrderNumber(data.order_number)
    setLastOrderSummary({ items, total, tableNumber, orderType, deliveryAddress, orderNumber: data.order_number })
    try { localStorage.setItem(PHONE_STORAGE_KEY, cleanPhone) } catch { /* تجاهل */ }
    setOrderPlaced(true)
    setCart([])
    setCartOpen(false)

    // إضافة الطلب الجديد فوق قائمة الطلبات النشطة (الأحدث أولاً) — الاشتراك في تحديثاته يحصل تلقائياً
    setActiveOrders(prev => [
      { id: data.id, orderNumber: data.order_number, status: 'pending', items, total, tableNumber, orderType, deliveryAddress, createdAt: Date.now() },
      ...prev,
    ])
  }

  // إلغاء الطلب من جهة العميل نفسه — متاح فقط وهو لا يزال "انتظار" قبل أن يبدأ المطعم التحضير
  const cancelOrderByCustomer = async (order) => {
    if (!window.confirm(`هل تريد إلغاء طلب ${order.orderNumber}؟`)) return
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', cancelled_by: 'customer' })
      .eq('id', order.id)
      .eq('status', 'pending') // حماية إضافية: لا يُنفَّذ إلا لو لسه pending فعلياً في قاعدة البيانات

    if (error) {
      toast.error(t('tCancelFail3'))
      return
    }

    // التأكد من الحالة الحقيقية: update().eq() لا يُرجع خطأ لو لم يُطابق أي صف
    // (أي لو المطعم بدأ التحضير فعلاً) — لذلك نتحقق بدل افتراض النجاح
    let confirmedCancelled = true
    try {
      const { data } = await supabase.rpc('get_orders_status', { order_ids: [order.id] })
      const fresh = data && data[0]
      if (fresh) {
        confirmedCancelled = fresh.status === 'cancelled'
        if (!confirmedCancelled) {
          setActiveOrders(prev => prev.map(o => o.id === order.id
            ? { ...o, status: fresh.status, cancelledBy: fresh.cancelled_by ?? o.cancelledBy }
            : o))
        }
      }
    } catch { /* تعذّر التحقق — نفترض النجاح ما دام لم يُرجع خطأ */ }

    if (confirmedCancelled) {
      setActiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledBy:'customer' } : o))
      toast.success(t('tCancelled'))
    } else {
      toast.error(t('tCancelFail'))
    }
  }

  // تحميل معرّفات الطلبات التي سبق تقييمها من هذا الجهاز (حتى لا يُقيّم الطلب مرتين)
  useEffect(() => {
    if (!slug) return
    try {
      const saved = JSON.parse(localStorage.getItem(REVIEWS_STORAGE_KEY) || '[]')
      if (Array.isArray(saved)) setReviewedIds(saved)
    } catch { /* تجاهل */ }
  }, [slug])

  const setDraft = (orderId, patch) => {
    setReviewDraft(prev => ({ ...prev, [orderId]: { rating: 0, comment: '', ...prev[orderId], ...patch } }))
  }

  // إرسال تقييم الزبون بعد اكتمال الطلب — يصل لصاحب المطعم في لوحة التحكم
  const submitReview = async (order) => {
    const draft = reviewDraft[order.id] || {}
    if (!draft.rating || draft.rating < 1) { toast.error(t('tPickStars')); return }
    setSubmittingReview(true)
    try {
      const { error } = await supabase.from('reviews').insert({
        restaurant_id: restaurant.id,
        branch_id: branch?.id || null,
        order_id: order.id,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.replace(/[^\d]/g, '') || null,
        rating: draft.rating,
        comment: (draft.comment || '').trim() || null,
      })
      if (error) throw error
      const updated = [...reviewedIds, order.id]
      setReviewedIds(updated)
      localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(updated))
      toast.success(t('tRevThanks'))
    } catch (err) {
      toast.error(t('tRevFail'))
    } finally {
      setSubmittingReview(false)
    }
  }

  // Filter products
  const filteredProducts = (catId) => {
    let prods = products.filter(p => p.category_id === catId)
    if (searchQuery) prods = products.filter(p => p.name.includes(searchQuery) || (p.description || '').includes(searchQuery))
    return prods
  }

  const allFiltered = searchQuery ? products.filter(p => p.name.includes(searchQuery)) : []

  const brandColor = restaurant?.brand_color || '#FF6B35'
  const priceColor = restaurant?.price_color || brandColor
  const descColor = restaurant?.description_color || '#9CA3AF'

  // Loading
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8F9FB', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'48px', height:'48px', border:`3px solid rgba(0,0,0,0.1)`, borderTopColor: brandColor, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <span style={{ color:'#9CA3AF', fontSize:'14px' }}>{t('loadingMenu')}</span>
    </div>
  )

  // Not found
  if (notFound) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8F9FB', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif', direction:'rtl', textAlign:'center', padding:'24px' }}>
      <div style={{ fontSize:'64px' }}>🔍</div>
      <h2 style={{ fontSize:'22px', fontWeight:'900', color:'#0F1117' }}>{t('notFound')}</h2>
      <p style={{ color:'#9CA3AF', fontSize:'14px' }}>{t('notFoundSub')}</p>
    </div>
  )

  // ===== صفحة "اختر فرعك" — تظهر لو فيه فروع نشطة ولم يُحدَّد فرع في الرابط =====
  const chooseBranch = (b) => {
    if (b) {
      setBranch(b)
      setSearchParams({ branch: b.id })
    } else {
      setBranch(null)
      setSearchParams({})
    }
    setBranchPicked(true)
    window.scrollTo(0, 0)
  }

  if (!branchPicked && branchList.length > 0) {
    return (
      <BranchPickerScreen
        restaurant={restaurant}
        branchList={branchList}
        brandColor={brandColor}
        isEn={isEn}
        t={t}
        onChoose={chooseBranch}
      />
    )
  }

  // Order placed / tracking screen — يعرض كل الطلبات النشطة، الأحدث أولاً
  if (orderPlaced) return (
    <OrdersScreen
      restaurant={restaurant}
      brandColor={brandColor}
      isEn={isEn}
      t={t}
      itemName={itemName}
      activeOrders={activeOrders}
      liveOrdersCount={liveOrdersCount}
      loyalty={loyalty}
      reviewedIds={reviewedIds}
      reviewDraft={reviewDraft}
      setDraft={setDraft}
      submitReview={submitReview}
      submittingReview={submittingReview}
      cancelOrderByCustomer={cancelOrderByCustomer}
      lastOrderSummary={lastOrderSummary}
      sendWhatsAppConfirmation={sendWhatsAppConfirmation}
      onBack={() => setOrderPlaced(false)}
    />
  )

  return (
    <div className="sm-menu-frame" style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        * { box-sizing: border-box; }
        html, body { background: #E4E7EE; }
        /* تابلت: إطار متمركز أنيق (اتجاه أ) */
        @media (min-width: 600px) and (max-width: 1023px) {
          .sm-menu-frame { box-shadow: 0 0 0 100vw #E4E7EE, 0 0 60px rgba(15,17,23,0.14); }
          .sm-wa-btn { left: calc(50% - 240px + 16px) !important; }
        }
        /* لابتوب: تخطيط عريض + الأصناف عمودين (اتجاه ب) */
        @media (min-width: 1024px) {
          .sm-menu-frame { max-width: 980px !important; box-shadow: 0 0 0 100vw #E4E7EE, 0 0 70px rgba(15,17,23,0.14); }
          .sm-products { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 14px !important; background: transparent !important; padding: 0 16px !important; }
          .sm-wa-btn { left: calc(50% - 490px + 16px) !important; }
        }
      `}</style>

      {/* Restaurant Header */}
      <div style={{ background:`linear-gradient(135deg, ${brandColor}22, ${brandColor}08)`, borderBottom:'1px solid #E5E7EB' }}>

        {/* Cover image */}
        {restaurant.cover_url && (
          <div style={{ width:'100%', height:'200px', overflow:'hidden' }}>
            <img src={restaurant.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
        )}

        <div style={{ padding: restaurant.cover_url ? '0 16px 16px' : '20px 16px 16px', marginTop: restaurant.cover_url ? '-32px' : 0 }}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'8px' }}>
            <button onClick={toggleLang} style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'100px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', color:'#374151', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              🌐 {isEn ? 'العربية' : 'English'}
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'14px', marginBottom: tx(restaurant,'description') ? '10px' : 0 }}>
            <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', flexShrink:0, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', overflow:'hidden', border: restaurant.cover_url ? '3px solid white' : 'none' }}>
              {restaurant.logo_url
                ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : '🍕'}
            </div>
            <div style={{ flex:1, paddingTop: restaurant.cover_url ? '38px' : 0 }}>
              <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:'#0F1117', marginBottom:'4px' }}>{restaurant.name}</h1>
              {branch && (
                <div style={{ fontSize:'12px', fontWeight:'700', color:brandColor, marginBottom:'6px' }}>🏢 {isEn && branch.name_en ? branch.name_en : branch.name}</div>
              )}
              <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                {(() => {
                  const c = openStatus.open ? '#10B981' : '#EF4444'
                  const bg = openStatus.open ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
                  return (
                    <>
                      <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px', fontWeight:'700', color:c, background:bg, padding:'3px 10px', borderRadius:'100px' }}>
                        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:c, display:'inline-block' }}/>
                        {openStatus.open ? t('openNow') : t('closedNow')}
                      </span>
                      {openStatus.open
                        ? (!openStatus.unknown && openStatus.todayText && (
                            <span style={{ fontSize:'12px', color:'#9CA3AF', direction:'ltr' }}>🕐 {openStatus.todayText}</span>
                          ))
                        : (openStatus.nextText && (
                            <span style={{ fontSize:'12px', color:'#EF4444' }}>{openStatus.nextText}</span>
                          ))}
                    </>
                  )
                })()}
                {estimatedPrepTime() != null && (
                  <span style={{ fontSize:'12px', color:'#9CA3AF' }}>⏱️ {estimatedPrepTime()} {t('minShort')}</span>
                )}
              </div>
            </div>
            {activeOrders.length > 0 && (
              <button
                onClick={() => setOrderPlaced(true)}
                style={{ flexShrink:0, padding:'9px 14px', borderRadius:'12px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', boxShadow:`0 4px 12px ${brandColor}44` }}
              >
                📋 {t('myOrders')}
                {liveOrdersCount > 0 && (
                  <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:'100px', padding:'1px 7px', fontSize:'11px' }}>{liveOrdersCount}</span>
                )}
              </button>
            )}
          </div>

          {tx(restaurant,'description') && (
            <p style={{ fontSize:'13px', color:descColor, lineHeight:'1.6', marginBottom:'10px' }}>{tx(restaurant,'description')}</p>
          )}

          {/* موقع المحل — يعرض موقع الفرع لو محدد، وإلا موقع المطعم */}
          {(() => {
            const addr = branch?.address || restaurant.address
            const mapsUrl = branch?.maps_url
            if (!addr && !mapsUrl) return null
            return (
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px', flexWrap:'wrap' }}>
                {addr && (
                  <span style={{ fontSize:'12px', color:'#6B7280', display:'inline-flex', alignItems:'center', gap:'4px' }}>
                    📍 {addr}
                  </span>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize:'12px', fontWeight:'700', color:brandColor, background:`${brandColor}14`, padding:'5px 11px', borderRadius:'100px', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'5px' }}
                  >
                    {t('mapLocation')}
                  </a>
                )}
              </div>
            )
          })()}

          {/* Social links */}
          {restaurant.social_links && Object.values(restaurant.social_links).some(v => v) && (
            <div style={{ display:'flex', gap:'8px' }}>
              {['instagram', 'whatsapp_social', 'snapchat', 'twitter', 'tiktok']
                .filter(key => restaurant.social_links[key])
                .map(key => {
                  const Icon = SOCIAL_ICONS[key]
                  return (
                    <a
                      key={key}
                      href={restaurant.social_links[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ width:'34px', height:'34px', borderRadius:'50%', background:'white', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', overflow:'hidden' }}
                    >
                      <Icon/>
                    </a>
                  )
                })}
            </div>
          )}

          {/* Allergens button */}
          {Array.isArray(restaurant.allergens) && restaurant.allergens.length > 0 && (
            <button
              onClick={() => setShowAllergensModal(true)}
              style={{ marginTop:'10px', display:'flex', alignItems:'center', gap:'6px', padding:'7px 12px', borderRadius:'10px', border:'1.5px solid #FDE68A', background:'#FFFBEB', color:'#92400E', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}
            >
              ⚠️ {t('allergens')}
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ padding:'0 16px 14px' }}>
          <div style={{ background:'white', borderRadius:'12px', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', overflow:'hidden' }}>
            <span style={{ padding:'10px 12px', fontSize:'16px', color:'#9CA3AF' }}>🔍</span>
            <input
              type="text"
              placeholder={t('search')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ flex:1, padding:'10px 4px', border:'none', outline:'none', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'transparent', textAlign:'right' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ padding:'10px 12px', background:'none', border:'none', fontSize:'16px', cursor:'pointer', color:'#9CA3AF' }}>✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', overflowX:'auto', display:'flex', padding:'0 8px', position:'sticky', top:0, zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          {categories.map(cat => (
            <div
              key={cat.id}
              id={`tab-${cat.id}`}
              onClick={() => {
                setActiveCategory(cat.id)
                document.getElementById(`cat-${cat.id}`)?.scrollIntoView({ behavior:'smooth', block:'start' })
              }}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:'3px',
                padding:'10px 14px', cursor:'pointer', flexShrink:0,
                borderBottom: activeCategory === cat.id ? `2.5px solid ${brandColor}` : '2.5px solid transparent',
                color: activeCategory === cat.id ? brandColor : '#6B7280',
                transition:'all 0.2s',
              }}
            >
              {cat.cover_url ? (
                <div style={{ width:'48px', height:'48px', borderRadius:'50%', overflow:'hidden', flexShrink:0 }}>
                  <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
              ) : (
                <span style={{ fontSize:'18px' }}>{cat.emoji}</span>
              )}
              <span style={{ fontSize:'12px', fontWeight:'700', whiteSpace:'nowrap' }}>{tx(cat,'name')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Menu content */}
      <div style={{ padding:'0 0 100px' }}>

        {/* Search results */}
        {searchQuery && (
          <div style={{ padding:'16px' }}>
            <div style={{ fontSize:'13px', color:'#9CA3AF', marginBottom:'12px' }}>
              {allFiltered.length} نتيجة لـ "{searchQuery}"
            </div>
            {allFiltered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF' }}>
                <div style={{ fontSize:'40px', opacity:0.3, marginBottom:'10px' }}>🔍</div>
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#374151' }}>{t('noResults')}</div>
              </div>
            ) : (
              <div className="sm-products" style={['grid','circles'].includes(restaurant.menu_layout)
                ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
                : { display:'flex', flexDirection:'column', gap:'1px', background:'#E5E7EB', borderRadius:'16px', overflow:'hidden' }
              }>
                {allFiltered.map(prod => <ProductItem key={prod.id} product={prod} cart={cart} onAdd={() => setSelectedProduct(prod)} onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)} brandColor={brandColor} priceColor={priceColor} descColor={descColor} isEn={isEn} layout={restaurant.menu_layout} />)}
              </div>
            )}
          </div>
        )}

        {/* Best sellers */}
        {!searchQuery && bestSellers.length > 0 && (
          <div style={{ marginBottom:'8px' }}>
            <div style={{ padding:'16px 16px 10px', display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'20px' }}>🔥</span>
              <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#0F1117' }}>{t('bestSellers')}</h2>
            </div>
            <div className="sm-products" style={['grid','circles'].includes(restaurant.menu_layout)
              ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
              : { display:'flex', flexDirection:'column', gap:'1px', background:'#F3F4F6' }
            }>
              {bestSellers.map(prod => (
                <ProductItem key={prod.id} product={prod} cart={cart} onAdd={() => setSelectedProduct(prod)} onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)} brandColor={brandColor} priceColor={priceColor} descColor={descColor} isEn={isEn} layout={restaurant.menu_layout} />
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {!searchQuery && categories.map(cat => {
          const catProducts = filteredProducts(cat.id)
          if (catProducts.length === 0) return null
          return (
            <div key={cat.id} id={`cat-${cat.id}`} style={{ marginBottom:'8px' }}>
              <div style={{ padding:'16px 16px 10px', display:'flex', alignItems:'center', gap:'10px' }}>
                {cat.cover_url ? (
                  <div style={{ width:'36px', height:'36px', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
                    <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  </div>
                ) : (
                  <span style={{ fontSize:'20px' }}>{cat.emoji}</span>
                )}
                <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#0F1117' }}>{tx(cat,'name')}</h2>
                <span style={{ fontSize:'12px', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 8px', borderRadius:'100px' }}>{catProducts.length}</span>
              </div>
              <div className="sm-products" style={['grid','circles'].includes(restaurant.menu_layout)
                ? { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', padding:'0 16px' }
                : { display:'flex', flexDirection:'column', gap:'1px', background:'#F3F4F6' }
              }>
                {catProducts.map(prod => (
                  <ProductItem
                    key={prod.id}
                    product={prod}
                    cart={cart}
                    onAdd={() => setSelectedProduct(prod)}
                    onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)}
                    brandColor={brandColor}
                    priceColor={priceColor}
                    descColor={descColor}
                    isEn={isEn}
                    layout={restaurant.menu_layout}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Floating cart button */}
      {cartCount > 0 && !cartOpen && (
        <div style={{ position:'fixed', bottom:'20px', right:'50%', transform:'translateX(50%)', width:'calc(100% - 32px)', maxWidth:'448px', zIndex:50 }}>
          <button
            onClick={() => setCartOpen(true)}
            style={{ width:'100%', padding:'0 16px', height:'58px', borderRadius:'16px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', cursor:'pointer', display:'flex', alignItems:'center', boxShadow:`0 8px 32px ${brandColor}55`, transition:'all 0.2s' }}
          >
            <div style={{ width:'28px', height:'28px', background:'rgba(0,0,0,0.15)', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px' }}>{cartCount}</div>
            <span style={{ flex:1, textAlign:'center', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>{t('viewCart')}</span>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px' }}>{cartTotal} ﷼</span>
          </button>
        </div>
      )}

      {/* Floating WhatsApp contact button — للاستفسارات العامة بمعزل عن طلب فعلي */}
      {restaurant?.phone && !cartOpen && (
        <button
          onClick={openWhatsAppContact}
          className="sm-wa-btn"
          style={{
            position:'fixed', bottom: cartCount > 0 ? '90px' : '20px', left:'16px',
            width:'52px', height:'52px', borderRadius:'50%', border:'none',
            background:'#25D366', color:'white', fontSize:'26px',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow:'0 6px 20px rgba(37,211,102,0.45)', cursor:'pointer', zIndex:49,
            transition:'bottom 0.2s',
          }}
          aria-label="تواصل عبر واتساب"
        >
          💬
        </button>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          cartCount={cartCount}
          cartTotal={cartTotal}
          restaurant={restaurant}
          brandColor={brandColor}
          isEn={isEn}
          t={t}
          itemName={itemName}
          orderType={orderType}
          setOrderType={setOrderType}
          customerName={customerName}
          setCustomerName={setCustomerName}
          customerPhone={customerPhone}
          setCustomerPhone={setCustomerPhone}
          tableNumber={tableNumber}
          setTableNumber={setTableNumber}
          deliveryAddress={deliveryAddress}
          setDeliveryAddress={setDeliveryAddress}
          openStatus={openStatus}
          placeOrder={placeOrder}
          removeFromCart={removeFromCart}
          incrementCartItem={incrementCartItem}
          onClose={() => setCartOpen(false)}
        />
      )}

      {/* Product modal */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          brandColor={brandColor}
          priceColor={priceColor}
          isEn={isEn}
          t={t}
          onAdd={addToCart}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Allergens Modal */}
      {showAllergensModal && (
        <AllergensModal
          restaurant={restaurant}
          isEn={isEn}
          t={t}
          onClose={() => setShowAllergensModal(false)}
        />
      )}
    </div>
  )
}

// الغلاف: يلفّ المنيو كله بمصيدة الأخطاء (أي خطأ في أي مكان يظهر كنص بدل شاشة بيضاء)
export default function PublicMenu() {
  return (
    <ErrBoundary>
      <PublicMenuInner />
    </ErrBoundary>
  )
}
