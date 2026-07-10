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

  // إلغاء الطلب من جهة العميل نفسه — متاح فقط وهو لا يزال "انتظار" قبل أن يبدأ المطعم التحضير
  // التأكيد يحصل داخل المنصّة قبل استدعاء هذه الدالة (OrderCardActive) — وليس هنا
  const cancelOrderByCustomer = async (order) => {
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

  // عدد الطلبات النشطة فعلياً (انتظار/تحضير/جاهز) — لا يشمل المكتملة أو الملغاة
  const liveOrdersCount = activeOrders.filter(o => ['pending','preparing','ready'].includes(o.status)).length

  return { activeOrders, setActiveOrders, orderPlaced, setOrderPlaced, liveOrdersCount, cancelOrderByCustomer }
}
