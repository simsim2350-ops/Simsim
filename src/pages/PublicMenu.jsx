import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'

// شارة مستوى السعرات: 🟢 منخفض (<300) / 🟡 متوسط (300-600) / 🔴 مرتفع (600+)
function getCalorieBadge(calories) {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

export default function PublicMenu() {
  const { slug } = useParams()
  const [restaurant, setRestaurant] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [modalQty, setModalQty] = useState(1)
  const [modalNote, setModalNote] = useState('')
  const [modalOptions, setModalOptions] = useState({}) // { groupIdx: choiceIdx | [choiceIdx,...] }
  const [tableNumber, setTableNumber] = useState('')
  const [orderType, setOrderType] = useState('dine_in') // dine_in | takeaway | delivery
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderPlaced, setOrderPlaced] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const [lastOrderSummary, setLastOrderSummary] = useState(null) // { items, total, tableNumber } للمشاركة عبر واتساب
  // activeOrders: كل الطلبات النشطة لهذا المطعم على هذا الجهاز، محفوظة في localStorage
  // كل عنصر: { id, orderNumber, status, items, total, tableNumber, createdAt }
  const [activeOrders, setActiveOrders] = useState([])
  const orderChannelsRef = useRef({}) // { [orderId]: channel }
  const [searchQuery, setSearchQuery] = useState('')
  const categoryObserverRef = useRef(null)

  const ORDERS_STORAGE_KEY = `simsim_orders_${slug}`
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
    activeOrders.forEach(order => {
      if (orderChannelsRef.current[order.id]) return // مشترك بالفعل
      const ch = supabase.channel(`order-status-${order.id}`)
        .on('postgres_changes',
          { event:'UPDATE', schema:'public', table:'orders', filter:`id=eq.${order.id}` },
          (p) => {
            const newItems = Array.isArray(p.new.items) ? p.new.items : []
            const newStatus = p.new.status
            setActiveOrders(prev => prev.map(o => {
              if (o.id !== order.id) return o
              if (newStatus === 'cancelled' && o.status !== 'cancelled') {
                toast.error(`🚫 تم إلغاء طلبك ${o.orderNumber} بالكامل — الأصناف غير متوفرة حالياً`, { duration: 8000 })
              } else {
                // إشعار عند تعليم صنف جديد كغير متوفر (طلب لسه نشط)
                newItems.forEach((ni, idx) => {
                  const wasUnavailable = o.items[idx]?.unavailable
                  if (ni.unavailable && !wasUnavailable) {
                    toast.error(`⚠️ ${ni.name} غير متوفر في طلب ${o.orderNumber}`, { duration: 6000 })
                  }
                })
              }
              return { ...o, status: newStatus, items: newItems, total: Number(p.new.total) || 0 }
            }))
          }
        ).subscribe()
      orderChannelsRef.current[order.id] = ch
    })
  }, [activeOrders, slug])

  useEffect(() => {
    return () => {
      Object.values(orderChannelsRef.current).forEach(ch => supabase.removeChannel(ch))
    }
  }, [])

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

    categories.forEach(cat => {
      const el = document.getElementById(`cat-${cat.id}`)
      if (el) observer.observe(el)
    })

    categoryObserverRef.current = observer
    return () => observer.disconnect()
  }, [categories, searchQuery])

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

      // Fetch categories & products
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('*').eq('restaurant_id', rest.id).eq('is_visible', true).order('sort_order'),
        supabase.from('products').select('*').eq('restaurant_id', rest.id).eq('is_available', true).order('sort_order'),
      ])

      if (cats) { setCategories(cats); if (cats.length > 0) setActiveCategory(cats[0].id) }
      if (prods) setProducts(prods)
    } finally {
      setLoading(false)
    }
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
    toast.success(`✅ تم إضافة ${product.name}`)
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

  // التحقق من اكتمال كل مجموعات الخيارات الإجبارية للصنف المعروض في الـ Modal
  const validateModalOptions = (product) => {
    const groups = Array.isArray(product?.options) ? product.options : []
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]
      if (!group.required) continue
      const sel = modalOptions[gi]
      if (group.type === 'multiple') {
        if (!Array.isArray(sel) || sel.length === 0) return group.name
      } else {
        if (sel == null) return group.name
      }
    }
    return null
  }

  // تحويل modalOptions (مؤشرات) إلى قائمة مفسّرة {groupName, choiceName, price}
  const resolveModalOptions = (product) => {
    const groups = Array.isArray(product?.options) ? product.options : []
    const resolved = []
    groups.forEach((group, gi) => {
      const sel = modalOptions[gi]
      if (sel == null) return
      if (group.type === 'multiple') {
        (Array.isArray(sel) ? sel : []).forEach(ci => {
          const choice = group.choices[ci]
          if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price || 0 })
        })
      } else {
        const choice = group.choices[sel]
        if (choice) resolved.push({ groupName: group.name, choiceName: choice.name, price: choice.price || 0 })
      }
    })
    return resolved
  }

  const toggleSingleOption = (groupIdx, choiceIdx) => {
    setModalOptions(prev => ({ ...prev, [groupIdx]: choiceIdx }))
  }

  const toggleMultipleOption = (groupIdx, choiceIdx) => {
    setModalOptions(prev => {
      const current = Array.isArray(prev[groupIdx]) ? prev[groupIdx] : []
      const next = current.includes(choiceIdx)
        ? current.filter(i => i !== choiceIdx)
        : [...current, choiceIdx]
      return { ...prev, [groupIdx]: next }
    })
  }

  const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0)

  // بناء رسالة واتساب جاهزة بتفاصيل الطلب وفتحها على رقم المطعم
  const sendWhatsAppConfirmation = () => {
    if (!lastOrderSummary || !restaurant?.phone) {
      toast.error('رقم تواصل المطعم غير متوفر')
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
          ? ` (${i.selectedOptions.map(o => o.choiceName).join('، ')})`
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
      toast.error('رقم تواصل المطعم غير متوفر')
      return
    }
    const greeting = restaurant.whatsapp_message?.trim() || `مرحباً، لدي استفسار بخصوص ${restaurant.name} 👋`
    const phone = restaurant.phone.replace(/[^\d]/g, '')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`
    window.open(url, '_blank')
  }

  // Place order
  const placeOrder = async () => {
    if (cart.length === 0) { toast.error('السلة فارغة!'); return }
    if (orderType === 'dine_in' && !tableNumber.trim()) { toast.error('أدخل رقم الطاولة'); return }
    if (orderType === 'delivery' && !deliveryAddress.trim()) { toast.error('أدخل عنوان التوصيل'); return }
    if (!customerPhone.trim()) { toast.error('أدخل رقم جوالك'); return }

    const items = cart.map(i => ({
      id: i.id, name: i.name, emoji: i.emoji, image_url: i.image_url,
      price: i.price, qty: i.qty, notes: i.note,
      selectedOptions: i.selectedOptions || [],
    }))

    const deliveryFee = orderType === 'delivery' ? (Number(restaurant.delivery_fee) || 0) : 0
    const tax = cartTotal * 0.15
    const total = cartTotal + tax + deliveryFee

    const { data, error } = await supabase.from('orders').insert({
      restaurant_id: restaurant.id,
      table_number: orderType === 'dine_in' ? tableNumber : null,
      delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : null,
      customer_name: customerName.trim() || null,
      customer_phone: customerPhone.trim(),
      type: orderType,
      status: 'pending',
      items,
      subtotal: cartTotal,
      tax,
      delivery_fee: deliveryFee,
      total,
      notes: '',
    }).select().single()

    if (error) {
      console.error('Order error:', error)
      toast.error(error.message || 'حدث خطأ، حاول مجدداً')
      return
    }

    setOrderNumber(data.order_number)
    setLastOrderSummary({ items, total, tableNumber, orderType, deliveryAddress, orderNumber: data.order_number })
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
      .update({ status: 'cancelled' })
      .eq('id', order.id)
      .eq('status', 'pending') // حماية إضافية: لا يُنفَّذ إلا لو لسه pending فعلياً في قاعدة البيانات

    if (error) {
      toast.error('تعذّر إلغاء الطلب، قد يكون المطعم بدأ تحضيره بالفعل')
      return
    }
    setActiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled' } : o))
    toast.success('تم إلغاء طلبك')
  }

  // Filter products
  const filteredProducts = (catId) => {
    let prods = products.filter(p => p.category_id === catId)
    if (searchQuery) prods = products.filter(p => p.name.includes(searchQuery) || (p.description || '').includes(searchQuery))
    return prods
  }

  const allFiltered = searchQuery ? products.filter(p => p.name.includes(searchQuery)) : []

  const brandColor = restaurant?.brand_color || '#FF6B35'

  // Loading
  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8F9FB', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'48px', height:'48px', border:`3px solid rgba(0,0,0,0.1)`, borderTopColor: brandColor, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <span style={{ color:'#9CA3AF', fontSize:'14px' }}>جارٍ تحميل المنيو...</span>
    </div>
  )

  // Not found
  if (notFound) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F8F9FB', flexDirection:'column', gap:'16px', fontFamily:'Cairo,sans-serif', direction:'rtl', textAlign:'center', padding:'24px' }}>
      <div style={{ fontSize:'64px' }}>🔍</div>
      <h2 style={{ fontSize:'22px', fontWeight:'900', color:'#0F1117' }}>المطعم غير موجود</h2>
      <p style={{ color:'#9CA3AF', fontSize:'14px' }}>تأكد من الرابط أو تواصل مع المطعم</p>
    </div>
  )

  // Order placed / tracking screen — يعرض كل الطلبات النشطة، الأحدث أولاً
  if (orderPlaced) return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif' }}>
      <div style={{ background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, padding:'32px 24px', textAlign:'center', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1), transparent)', pointerEvents:'none' }}/>
        <div style={{ fontSize:'56px', marginBottom:'10px', position:'relative' }}>🎉</div>
        <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', color:'white', marginBottom:'4px' }}>طلباتك</h2>
        <p style={{ color:'rgba(255,255,255,0.8)', fontSize:'13px' }}>لديك {activeOrders.length} طلب نشط</p>
      </div>

      <div style={{ padding:'20px 16px' }}>
        {activeOrders.map(order => {
          const statuses = ['pending','preparing','ready','completed']
          const currentIdx = statuses.indexOf(order.status)
          return (
            <div key={order.id} style={{ background:'white', borderRadius:'18px', padding:'18px', marginBottom:'16px', border: order.status==='cancelled' ? '1.5px solid #FEE2E2' : '1px solid #E5E7EB' }}>

              {/* رقم الطلب وحالته */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px' }}>{order.orderNumber}</span>
                <span style={{ fontSize:'11px', fontWeight:'700', color: order.status==='cancelled' ? '#EF4444' : brandColor, background: order.status==='cancelled' ? '#FEF2F2' : `${brandColor}15`, padding:'4px 10px', borderRadius:'100px' }}>
                  {{ pending:'استُلم', preparing:'قيد التحضير', ready:'جاهز للاستلام', completed:'تم التسليم 🎉', cancelled:'ملغي' }[order.status] || order.status}
                </span>
              </div>

              <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'16px' }}>
                {{ dine_in:'🪑 محلي', takeaway:'🥡 سفري', delivery:'🛵 توصيل' }[order.orderType] || ''}
                {order.orderType === 'dine_in' && order.tableNumber && ` — طاولة ${order.tableNumber}`}
                {order.orderType === 'delivery' && order.deliveryAddress && ` — ${order.deliveryAddress}`}
              </div>

              {/* Status stepper */}
              {order.status !== 'cancelled' && (
                <div style={{ display:'flex', alignItems:'center', marginBottom:'16px' }}>
                  {[
                    { key:'pending', icon:'📥' }, { key:'preparing', icon:'👨‍🍳' },
                    { key:'ready', icon:'✅' }, { key:'completed', icon:'🎉' },
                  ].map((step, i, arr) => {
                    const stepIdx = statuses.indexOf(step.key)
                    const isDone = stepIdx < currentIdx
                    const isCurrent = stepIdx === currentIdx
                    return (
                      <div key={step.key} style={{ display:'flex', alignItems:'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                        <div style={{
                          width:'30px', height:'30px', borderRadius:'50%',
                          background: isDone ? '#10B981' : isCurrent ? brandColor : '#F3F4F6',
                          border: `2px solid ${isDone ? '#10B981' : isCurrent ? brandColor : '#E5E7EB'}`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:'13px', transition:'all 0.5s', flexShrink:0,
                        }}>
                          {isDone ? '✓' : step.icon}
                        </div>
                        {i < arr.length - 1 && (
                          <div style={{ flex:1, height:'2px', background: isDone ? '#10B981' : '#E5E7EB', margin:'0 4px', transition:'background 0.5s' }}/>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* الأصناف */}
              <div style={{ borderTop:'1px solid #F3F4F6', paddingTop:'12px' }}>
                {order.items.map((item, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0', opacity: item.unavailable ? 0.55 : 1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'15px' }}>{item.emoji || '🍽️'}</span>
                      <span style={{ fontSize:'13px', fontWeight:'600', textDecoration: item.unavailable ? 'line-through' : 'none' }}>{item.name} × {item.qty}</span>
                      {item.unavailable && <span style={{ fontSize:'9px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 6px', borderRadius:'100px' }}>غير متوفر</span>}
                    </div>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', paddingTop:'8px', marginTop:'4px', borderTop:'1px solid #F3F4F6' }}>
                  <span>الإجمالي</span>
                  <span style={{ color:brandColor }}>{order.total.toFixed(2)} ﷼</span>
                </div>
              </div>

              {/* إلغاء الطلب — متاح فقط قبل أن يبدأ المطعم التحضير */}
              {order.status === 'pending' && (
                <button
                  onClick={() => cancelOrderByCustomer(order)}
                  style={{ width:'100%', marginTop:'12px', padding:'10px', borderRadius:'11px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}
                >
                  إلغاء الطلب
                </button>
              )}
            </div>
          )
        })}

        {/* WhatsApp confirmation لآخر طلب (اختياري) */}
        {restaurant?.phone && lastOrderSummary && (
          <button
            onClick={sendWhatsAppConfirmation}
            style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'1.5px solid #25D366', background:'rgba(37,211,102,0.08)', color:'#1FA855', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', cursor:'pointer', marginBottom:'12px', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}
          >
            💬 إرسال تأكيد آخر طلب عبر واتساب
          </button>
        )}

        {/* العودة للمنيو لطلب إضافي — الطلبات الحالية تستمر بالتتبع */}
        <button
          onClick={() => setOrderPlaced(false)}
          style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor:'pointer', boxShadow:`0 8px 24px ${brandColor}44` }}
        >
          ← العودة للمنيو لطلب إضافي
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#F8F9FB', direction:'rtl', fontFamily:'Tajawal,sans-serif', maxWidth:'480px', margin:'0 auto', position:'relative' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        * { box-sizing: border-box; }
      `}</style>

      {/* Restaurant Header */}
      <div style={{ background:`linear-gradient(135deg, ${brandColor}22, ${brandColor}08)`, borderBottom:'1px solid #E5E7EB' }}>

        {/* Cover image */}
        {restaurant.cover_url && (
          <div style={{ width:'100%', height:'120px', overflow:'hidden' }}>
            <img src={restaurant.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
          </div>
        )}

        <div style={{ padding: restaurant.cover_url ? '0 16px 16px' : '20px 16px 16px', marginTop: restaurant.cover_url ? '-32px' : 0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'14px', marginBottom: restaurant.description ? '10px' : 0 }}>
            <div style={{ width:'64px', height:'64px', borderRadius:'16px', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'30px', flexShrink:0, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', overflow:'hidden', border: restaurant.cover_url ? '3px solid white' : 'none' }}>
              {restaurant.logo_url
                ? <img src={restaurant.logo_url} alt={restaurant.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : '🍕'}
            </div>
            <div style={{ flex:1, paddingTop: restaurant.cover_url ? '38px' : 0 }}>
              <h1 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'20px', color:'#0F1117', marginBottom:'4px' }}>{restaurant.name}</h1>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
                <span style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'12px', fontWeight:'700', color:'#10B981', background:'rgba(16,185,129,0.1)', padding:'3px 10px', borderRadius:'100px' }}>
                  <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'#10B981', display:'inline-block' }}/>
                  مفتوح الآن
                </span>
                <span style={{ fontSize:'12px', color:'#9CA3AF' }}>🕐 15-25 د</span>
              </div>
            </div>
            {activeOrders.length > 0 && (
              <button
                onClick={() => setOrderPlaced(true)}
                style={{ flexShrink:0, padding:'9px 14px', borderRadius:'12px', border:'none', background:brandColor, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', boxShadow:`0 4px 12px ${brandColor}44` }}
              >
                📋 طلباتي
                <span style={{ background:'rgba(255,255,255,0.3)', borderRadius:'100px', padding:'1px 7px', fontSize:'11px' }}>{activeOrders.length}</span>
              </button>
            )}
          </div>

          {restaurant.description && (
            <p style={{ fontSize:'13px', color:'#6B7280', lineHeight:'1.6' }}>{restaurant.description}</p>
          )}
        </div>

        {/* Search */}
        <div style={{ padding:'0 16px 14px' }}>
          <div style={{ background:'white', borderRadius:'12px', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', overflow:'hidden' }}>
            <span style={{ padding:'10px 12px', fontSize:'16px', color:'#9CA3AF' }}>🔍</span>
            <input
              type="text"
              placeholder="ابحث في المنيو..."
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
                <div style={{ width:'38px', height:'38px', borderRadius:'50%', overflow:'hidden', flexShrink:0 }}>
                  <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                </div>
              ) : (
                <span style={{ fontSize:'18px' }}>{cat.emoji}</span>
              )}
              <span style={{ fontSize:'12px', fontWeight:'700', whiteSpace:'nowrap' }}>{cat.name}</span>
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
                <div style={{ fontSize:'14px', fontWeight:'700', color:'#374151' }}>لا توجد نتائج</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'1px', background:'#E5E7EB', borderRadius:'16px', overflow:'hidden' }}>
                {allFiltered.map(prod => <ProductItem key={prod.id} product={prod} cart={cart} onAdd={() => { setSelectedProduct(prod); setModalQty(1); setModalNote(''); setModalOptions({}) }} onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)} brandColor={brandColor} />)}
              </div>
            )}
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
                <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'17px', color:'#0F1117' }}>{cat.name}</h2>
                <span style={{ fontSize:'12px', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 8px', borderRadius:'100px' }}>{catProducts.length}</span>
              </div>
              <div style={{ background:'white', display:'flex', flexDirection:'column', gap:'1px', background:'#F3F4F6' }}>
                {catProducts.map(prod => (
                  <ProductItem
                    key={prod.id}
                    product={prod}
                    cart={cart}
                    onAdd={() => { setSelectedProduct(prod); setModalQty(1); setModalNote(''); setModalOptions({}) }}
                    onQtyChange={(delta) => delta > 0 ? addToCart(prod, 1) : removeFromCart(`${prod.id}____`)}
                    brandColor={brandColor}
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
            <span style={{ flex:1, textAlign:'center', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>عرض السلة</span>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px' }}>{cartTotal} ﷼</span>
          </button>
        </div>
      )}

      {/* Floating WhatsApp contact button — للاستفسارات العامة بمعزل عن طلب فعلي */}
      {restaurant?.phone && !cartOpen && (
        <button
          onClick={openWhatsAppContact}
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
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setCartOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'88vh', display:'flex', flexDirection:'column', animation:'slideUp 0.3s ease', position:'relative', overflow:'hidden' }}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>

            <div style={{ padding:'0 20px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
              <h3 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'18px' }}>🛒 سلتك ({cartCount})</h3>
              <button onClick={() => setCartOpen(false)} style={{ width:'32px', height:'32px', borderRadius:'50%', border:'1.5px solid #E5E7EB', background:'white', fontSize:'18px', cursor:'pointer', color:'#6B7280' }}>✕</button>
            </div>

            {/* Cart items */}
            <div style={{ flex:1, overflowY:'auto', padding:'12px 20px' }}>
              {cart.map((item) => (
                <div key={item.cartKey} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 0', borderBottom:'1px solid #F3F4F6' }}>
                  <div style={{ width:'48px', height:'48px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'24px', flexShrink:0, overflow:'hidden' }}>
                    {item.image_url
                      ? <img src={item.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : item.emoji}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:'700', fontSize:'14px', marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                    {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                      <div style={{ fontSize:'11px', color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item.selectedOptions.map(o => o.choiceName).join('، ')}
                      </div>
                    )}
                    {item.note && <div style={{ fontSize:'11px', color:'#9CA3AF' }}>📝 {item.note}</div>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'0', border:'1.5px solid #E5E7EB', borderRadius:'10px', overflow:'hidden', flexShrink:0 }}>
                    <button onClick={() => removeFromCart(item.cartKey)} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>−</button>
                    <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', minWidth:'24px', textAlign:'center', borderRight:'1px solid #E5E7EB', borderLeft:'1px solid #E5E7EB', lineHeight:'30px' }}>{item.qty}</span>
                    <button onClick={() => incrementCartItem(item.cartKey)} style={{ width:'30px', height:'30px', background:'none', border:'none', fontSize:'18px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>+</button>
                  </div>
                  <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'14px', flexShrink:0, minWidth:'50px', textAlign:'left' }}>{(item.price * item.qty).toFixed(2)} ﷼</div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div style={{ padding:'12px 20px', background:'#F8F9FB', borderTop:'1px solid #E5E7EB', flexShrink:0 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'4px' }}>
                <span>المجموع الجزئي</span><span>{cartTotal} ﷼</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#9CA3AF', marginBottom:'8px' }}>
                <span>الضريبة 15%</span><span>{(cartTotal * 0.15).toFixed(2)} ﷼</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', paddingTop:'8px', borderTop:'1px solid #E5E7EB', marginBottom:'12px' }}>
                <span>الإجمالي</span>
                <span style={{ color:brandColor }}>{(cartTotal * 1.15 + (orderType === 'delivery' ? (Number(restaurant.delivery_fee) || 0) : 0)).toFixed(2)} ﷼</span>
              </div>

              {/* Order type */}
              <div style={{ marginBottom:'14px' }}>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>📦 نوع الطلب *</label>
                <div style={{ display:'grid', gridTemplateColumns: restaurant?.delivery_enabled ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap:'8px' }}>
                  {[
                    { key:'dine_in', icon:'🪑', label:'محلي' },
                    { key:'takeaway', icon:'🥡', label:'سفري' },
                    ...(restaurant?.delivery_enabled ? [{ key:'delivery', icon:'🛵', label:'توصيل' }] : []),
                  ].map(opt => (
                    <div
                      key={opt.key}
                      onClick={() => setOrderType(opt.key)}
                      style={{
                        padding:'12px 8px', borderRadius:'11px', cursor:'pointer', textAlign:'center',
                        border:`1.5px solid ${orderType===opt.key ? brandColor : '#E5E7EB'}`,
                        background: orderType===opt.key ? `${brandColor}0D` : 'white',
                        transition:'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize:'20px', marginBottom:'4px' }}>{opt.icon}</div>
                      <div style={{ fontSize:'12px', fontWeight:'700', color: orderType===opt.key ? brandColor : '#374151' }}>{opt.label}</div>
                    </div>
                  ))}
                </div>
                {orderType === 'delivery' && restaurant?.delivery_fee > 0 && (
                  <div style={{ fontSize:'11px', color:'#9CA3AF', marginTop:'6px' }}>+ {Number(restaurant.delivery_fee).toFixed(2)} ﷼ رسوم توصيل</div>
                )}
              </div>

              {/* Customer info */}
              <div style={{ marginBottom:'12px' }}>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>👤 اسمك (اختياري)</label>
                <input
                  type="text"
                  placeholder="مثال: محمد"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', marginBottom:'10px' }}
                />
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>📱 رقم جوالك *</label>
                <input
                  type="tel"
                  placeholder="05XXXXXXXX"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', direction:'ltr' }}
                />
              </div>

              {/* Table number — محلي فقط */}
              {orderType === 'dine_in' && (
                <div style={{ marginBottom:'12px' }}>
                  <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>🪑 رقم الطاولة *</label>
                  <input
                    type="text"
                    placeholder="أدخل رقم طاولتك..."
                    value={tableNumber}
                    onChange={e => setTableNumber(e.target.value)}
                    style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right' }}
                  />
                </div>
              )}

              {/* Delivery address — توصيل فقط */}
              {orderType === 'delivery' && (
                <div style={{ marginBottom:'12px' }}>
                  <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>📍 عنوان التوصيل *</label>
                  <textarea
                    placeholder="الحي، الشارع، أقرب معلم، ملاحظات إضافية..."
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'white', outline:'none', textAlign:'right', minHeight:'72px', resize:'vertical' }}
                  />
                </div>
              )}

              <button
                onClick={placeOrder}
                style={{ width:'100%', padding:'15px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor:'pointer', boxShadow:`0 8px 24px ${brandColor}44` }}
              >
                🎉 تأكيد الطلب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product modal */}
      {selectedProduct && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
          <div onClick={() => setSelectedProduct(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', animation:'fadeIn 0.2s ease' }}/>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', animation:'slideUp 0.3s ease', position:'relative', overflow:'hidden', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'12px auto' }}/>

            <div style={{ height:'200px', background: selectedProduct.image_url ? '#F8F9FB' : `linear-gradient(135deg, ${brandColor}22, ${brandColor}08)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'80px', overflow:'hidden' }}>
              {selectedProduct.image_url
                ? <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : selectedProduct.emoji}
            </div>

            <div style={{ padding:'20px 20px 32px' }}>
              <h2 style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'22px', marginBottom:'6px' }}>{selectedProduct.name}</h2>
              {selectedProduct.description && <p style={{ fontSize:'14px', color:'#6B7280', lineHeight:'1.65', marginBottom:'16px' }}>{selectedProduct.description}</p>}

              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'24px', color:brandColor }}>{selectedProduct.price} ﷼</span>
                {selectedProduct.compare_price && <span style={{ fontSize:'15px', color:'#9CA3AF', textDecoration:'line-through' }}>{selectedProduct.compare_price} ﷼</span>}
                {selectedProduct.calories && <span style={{ fontSize:'12px', color:'#9CA3AF', background:'#F3F4F6', padding:'3px 10px', borderRadius:'100px', marginRight:'auto' }}>{getCalorieBadge(selectedProduct.calories)} {selectedProduct.calories} كالوري</span>}
              </div>

              {/* Option groups: size, extras, etc. */}
              {Array.isArray(selectedProduct.options) && selectedProduct.options.length > 0 && (
                <div style={{ marginBottom:'20px', display:'flex', flexDirection:'column', gap:'16px' }}>
                  {selectedProduct.options.map((group, gi) => (
                    <div key={gi}>
                      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px' }}>
                        <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'14px' }}>{group.name}</span>
                        {group.required && <span style={{ fontSize:'10px', fontWeight:'700', color:'#EF4444', background:'#FEF2F2', padding:'2px 7px', borderRadius:'100px' }}>إجباري</span>}
                        {!group.required && group.type === 'multiple' && <span style={{ fontSize:'10px', fontWeight:'700', color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:'100px' }}>اختياري</span>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {group.choices.map((choice, ci) => {
                          const isSelected = group.type === 'multiple'
                            ? (Array.isArray(modalOptions[gi]) && modalOptions[gi].includes(ci))
                            : modalOptions[gi] === ci
                          return (
                            <div
                              key={ci}
                              onClick={() => group.type === 'multiple' ? toggleMultipleOption(gi, ci) : toggleSingleOption(gi, ci)}
                              style={{
                                display:'flex', alignItems:'center', justifyContent:'space-between',
                                padding:'11px 14px', borderRadius:'11px', cursor:'pointer',
                                border:`1.5px solid ${isSelected ? brandColor : '#E5E7EB'}`,
                                background: isSelected ? `${brandColor}0D` : 'white',
                                transition:'all 0.15s',
                              }}
                            >
                              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                                <div style={{
                                  width:'18px', height:'18px', flexShrink:0,
                                  borderRadius: group.type === 'multiple' ? '5px' : '50%',
                                  border:`2px solid ${isSelected ? brandColor : '#D1D5DB'}`,
                                  background: isSelected ? brandColor : 'white',
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  fontSize:'11px', color:'white',
                                }}>
                                  {isSelected && '✓'}
                                </div>
                                <span style={{ fontSize:'14px', fontWeight:'600' }}>{choice.name}</span>
                              </div>
                              {choice.price > 0 && <span style={{ fontSize:'13px', fontWeight:'700', color:brandColor }}>+{choice.price} ﷼</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
                <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px' }}>الكمية</span>
                <div style={{ display:'flex', alignItems:'center', gap:'0', border:'1.5px solid #E5E7EB', borderRadius:'12px', overflow:'hidden' }}>
                  <button onClick={() => setModalQty(q => Math.max(1, q - 1))} style={{ width:'40px', height:'40px', background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>−</button>
                  <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'16px', minWidth:'40px', textAlign:'center', borderRight:'1px solid #E5E7EB', borderLeft:'1px solid #E5E7EB', lineHeight:'40px' }}>{modalQty}</span>
                  <button onClick={() => setModalQty(q => q + 1)} style={{ width:'40px', height:'40px', background:'none', border:'none', fontSize:'22px', cursor:'pointer', color:brandColor, fontWeight:'300' }}>+</button>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom:'20px' }}>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'6px' }}>💬 ملاحظتك للمطعم</label>
                <textarea
                  placeholder="أضف ملاحظتك هنا (اختياري)..."
                  value={modalNote}
                  onChange={e => setModalNote(e.target.value)}
                  rows={2}
                  style={{ width:'100%', padding:'11px 13px', border:'1.5px solid #E5E7EB', borderRadius:'11px', fontFamily:'Tajawal,sans-serif', fontSize:'14px', color:'#0F1117', background:'#F8F9FB', outline:'none', textAlign:'right', direction:'rtl', resize:'none' }}
                />
              </div>

              <button
                onClick={() => {
                  const missingGroup = validateModalOptions(selectedProduct)
                  if (missingGroup) { toast.error(`يرجى اختيار: ${missingGroup}`); return }
                  const resolved = resolveModalOptions(selectedProduct)
                  addToCart(selectedProduct, modalQty, modalNote, resolved)
                  setSelectedProduct(null)
                }}
                style={{ width:'100%', padding:'16px', borderRadius:'14px', border:'none', background:`linear-gradient(135deg, ${brandColor}, ${brandColor}CC)`, color:'white', fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:`0 8px 24px ${brandColor}44` }}
              >
                <span>إضافة للسلة</span>
                <span style={{ background:'rgba(0,0,0,0.15)', padding:'4px 12px', borderRadius:'8px', fontSize:'14px' }}>
                  {((selectedProduct.price + resolveModalOptions(selectedProduct).reduce((s,o)=>s+(o.price||0),0)) * modalQty).toFixed(2)} ﷼
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Product item component
function ProductItem({ product, cart, onAdd, onQtyChange, brandColor }) {
  const hasOptions = Array.isArray(product.options) && product.options.length > 0
  // لو الصنف بدون خيارات: نجمع كل عناصر السلة بنفس id (مفتاح بدون خيارات دائماً ثابت)
  const qty = hasOptions ? 0 : cart.filter(i => i.id === product.id).reduce((s,i) => s + i.qty, 0)

  return (
    <div style={{ background:'white', padding:'14px 16px', display:'flex', gap:'12px', alignItems:'center' }}>
      <div style={{ flex:1, minWidth:0 }}>
        {product.is_featured && (
          <span style={{ fontSize:'10px', fontWeight:'800', color:'#92400E', background:'#FEF3C7', padding:'2px 7px', borderRadius:'100px', marginBottom:'4px', display:'inline-block' }}>⭐ مميز</span>
        )}
        <div style={{ fontFamily:'Cairo,sans-serif', fontWeight:'800', fontSize:'15px', color:'#0F1117', marginBottom:'4px' }}>{product.name}</div>
        {product.description && (
          <div style={{ fontSize:'12px', color:'#9CA3AF', lineHeight:'1.5', marginBottom:'8px', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
            {product.description}
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'15px', color: brandColor }}>{product.price} ﷼</span>
          {product.compare_price && <span style={{ fontSize:'12px', color:'#9CA3AF', textDecoration:'line-through' }}>{product.compare_price} ﷼</span>}
          {product.calories && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{getCalorieBadge(product.calories)} {product.calories}</span>}
        </div>
      </div>

      <div style={{ position:'relative', flexShrink:0 }}>
        <div style={{ width:'88px', height:'88px', borderRadius:'14px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'42px', border:'1px solid #E5E7EB', overflow:'hidden' }}>
          {product.image_url
            ? <img src={product.image_url} alt={product.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : product.emoji}
        </div>

        {qty === 0 ? (
          <button
            onClick={onAdd}
            style={{ position:'absolute', bottom:'6px', left:'6px', width:'30px', height:'30px', borderRadius:'50%', border:'none', background: brandColor, color:'white', fontSize:'20px', fontWeight:'300', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 12px ${brandColor}55`, lineHeight:'1' }}
          >
            +
          </button>
        ) : (
          <div style={{ position:'absolute', bottom:'5px', left:'4px', display:'flex', alignItems:'center', background:'#0F1117', borderRadius:'100px', overflow:'hidden', boxShadow:'0 4px 12px rgba(0,0,0,0.3)' }}>
            <button onClick={() => onQtyChange(-1)} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
            <span style={{ fontFamily:'Cairo,sans-serif', fontWeight:'900', fontSize:'13px', color:'white', minWidth:'20px', textAlign:'center' }}>{qty}</span>
            <button onClick={onAdd} style={{ width:'26px', height:'26px', background:'none', border:'none', color:'white', fontSize:'17px', cursor:'pointer', fontWeight:'300', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
          </div>
        )}
      </div>
    </div>
  )
}
