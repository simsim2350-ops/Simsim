import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'

// الطلبات النشطة على هذا الجهاز: حفظ localStorage + اشتراكات realtime + مصالحة الحالة + إلغاء الزبون
// كل عنصر: { id, orderNumber, status, items, total, tableNumber, createdAt }
export function useActiveOrders(slug, t) {
  const [activeOrders, setActiveOrders] = useState([])
  const [orderPlaced, setOrderPlaced] = useState(false)
  const orderChannelsRef = useRef({}) // { [orderId]: channel }
  const activeOrdersRef = useRef([]) // أحدث نسخة من activeOrders (تُستخدم في المصالحة داخل مستمعي الأحداث)

  const ORDERS_STORAGE_KEY = `simsim_orders_${slug}`
  const SCREEN_SESSION_KEY = `simsim_screen_${slug}`

  // تحميل الطلبات النشطة المحفوظة من قبل لهذا المطعم
  useEffect(() => {
    if (!slug) return
    try {
      const saved = JSON.parse(localStorage.getItem(ORDERS_STORAGE_KEY) || '[]')
      // إخفاء الطلبات المكتملة/الملغاة القديمة جداً (أكثر من 12 ساعة) لتجنب تراكم لا نهائي
      const recent = saved.filter(o => o.accessToken && Date.now() - (o.createdAt || 0) < 12 * 60 * 60 * 1000)
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
    const persistedOrders = activeOrders.map(({ id, orderNumber, accessToken, status, items, total, tableNumber, orderType, createdAt, cancelledBy }) => ({
      id, orderNumber, accessToken, status,
      items: Array.isArray(items) ? items.map(({ id, name, name_en, emoji, image_url, price, qty, note, selectedOptions, unavailable }) => ({ id, name, name_en, emoji, image_url, price, qty, note, selectedOptions, unavailable })) : [],
      total, tableNumber, orderType, createdAt, cancelledBy,
    }))
    try { localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(persistedOrders)) } catch { /* تجاهل امتلاء التخزين */ }
    activeOrdersRef.current = activeOrders
    activeOrders.forEach(order => {
      if (orderChannelsRef.current[order.id]) return // مشترك بالفعل
      // القناة تتطلب access token خاصًا بالطلب؛ UUID وحده لا يمنح صلاحية المتابعة.
      const ch = supabase.channel(`order-status:${order.id}:${order.accessToken}`, { config: { private: true } })
        .on('broadcast', { event: 'UPDATE' }, (payload) => {
          const update = payload.payload || {}
          const newItems = Array.isArray(update.items) ? update.items : []
          const newStatus = update.status
          const newCancelledBy = update.cancelled_by
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
            return { ...o, status: newStatus, cancelledBy: newCancelledBy, items: newItems.length > 0 ? o.items.map((item, idx) => ({ ...item, unavailable: newItems[idx]?.unavailable ?? item.unavailable })) : o.items }
          }))
        }).subscribe()
      orderChannelsRef.current[order.id] = ch
    })
  }, [activeOrders, slug])

  useEffect(() => {
    return () => {
      Object.values(orderChannelsRef.current).forEach(ch => supabase.removeChannel(ch))
    }
  }, [])

  // مصالحة الحالة: نعيد جلب الحالة الحقيقية للطلبات النشطة من قاعدة البيانات
  // لتعويض أي تحديث فات أثناء انقطاع اتصال realtime (خروج من المتصفح / قفل الشاشة)
  const reconcileActiveOrders = async () => {
    const list = activeOrdersRef.current || []
    const ids = list
      .filter(o => o.status !== 'completed' && o.status !== 'cancelled')
      .map(o => o.id)
    if (ids.length === 0) return
    try {
      const requests = list.filter(o => ids.includes(o.id)).map(o => ({ id: o.id, access_token: o.accessToken }))
      const { data, error } = await supabase.rpc('get_orders_status_secure', { p_orders: requests })
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
    const interval = setInterval(reconcileActiveOrders, 5000) // سقف أقصى مضمون للتأخير حتى لو تأخر البث اللحظي
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', reconcileActiveOrders)
      clearTimeout(kickoff)
      clearInterval(interval)
    }
  }, [slug])

  // إلغاء الطلب من جهة العميل نفسه — متاح فقط وهو لا يزال "انتظار" قبل أن يبدأ المطعم التحضير
  // التأكيد يحصل داخل المنصّة قبل استدعاء هذه الدالة (OrderCardActive) — وليس هنا
  const cancelOrderByCustomer = async (order) => {
    const { data: cancelled, error } = await supabase.rpc('cancel_order_by_customer', {
      p_order_id: order.id,
      p_access_token: order.accessToken,
    })

    if (error) {
      toast.error(t('tCancelFail3'))
      return
    }

    // RPC تعيد صفًا فقط عند انتقال pending إلى cancelled فعليًا.
    let confirmedCancelled = Array.isArray(cancelled) ? cancelled.length > 0 : !!cancelled
    try {
      const { data } = await supabase.rpc('get_orders_status_secure', {
        p_orders: [{ id: order.id, access_token: order.accessToken }],
      })
      const fresh = data && data[0]
      if (fresh) {
        confirmedCancelled = fresh.status === 'cancelled'
        if (!confirmedCancelled) {
          setActiveOrders(prev => prev.map(o => o.id === order.id
            ? { ...o, status: fresh.status, cancelledBy: fresh.cancelled_by ?? o.cancelledBy }
            : o))
        }
      }
    } catch { /* تعذّر التحقق — لا نغيّر الحالة محليًا دون إثبات */ }

    if (confirmedCancelled) {
      setActiveOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledBy:'customer' } : o))
      toast.success(t('tCancelled'))
    } else {
      toast.error(t('tCancelFail'))
    }
  }

  const clearStoredOrders = () => {
    try { localStorage.removeItem(ORDERS_STORAGE_KEY) } catch { /* تجاهل */ }
    try { sessionStorage.removeItem(SCREEN_SESSION_KEY) } catch { /* تجاهل */ }
    Object.values(orderChannelsRef.current).forEach(ch => supabase.removeChannel(ch))
    orderChannelsRef.current = {}
    setActiveOrders([])
    setOrderPlaced(false)
  }

  // عدد الطلبات النشطة فعلياً (انتظار/تحضير/جاهز) — لا يشمل المكتملة أو الملغاة
  const liveOrdersCount = activeOrders.filter(o => ['pending','preparing','ready'].includes(o.status)).length

  return { activeOrders, setActiveOrders, orderPlaced, setOrderPlaced, liveOrdersCount, cancelOrderByCustomer, clearStoredOrders }
}
