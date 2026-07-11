import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabase'

// جلب بيانات المنيو: المطعم + الفرع/الفروع + الأقسام + الأصناف + الأكثر مبيعاً + عدد الطلبات النشطة (حي)
export function useMenuData(slug, branchId) {
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
  const [restaurantActiveOrdersCount, setActiveOrdersCount] = useState(0)
  const [rating, setRating] = useState(null) // { avg, count } — متوسط تقييم المطعم للعرض العام
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false) // هل برنامج الولاء مفعّل؟ (بلا حاجة لهوية الزبون — لعرض تشويقي عام)
  const restaurantLoadChannelRef = useRef(null)

  useEffect(() => {
    fetchMenu()
  }, [slug])

  useEffect(() => {
    return () => {
      if (restaurantLoadChannelRef.current) supabase.removeChannel(restaurantLoadChannelRef.current)
    }
  }, [])

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

      // نجلب كل الفروع النشطة دائماً (بغضّ النظر عن وجود فرع محدد بالرابط) — تلزم لعرض
      // زر "تغيير" في الهيدر وصفحة "اختر فرعك" مهما كان الفرع الذي دخل منه العميل
      const { data: brs } = await supabase
        .from('branches')
        .select('*')
        .eq('restaurant_id', rest.id)
        .eq('is_active', true)
        .order('sort_order')
      const list = brs || []
      setBranchList(list)

      if (branchId) {
        // الرابط يحتوي معرّف فرع: نحدّده من القائمة المجلوبة أعلاه لعرض اسمه وربط الطلب به
        const br = list.find(b => b.id === branchId)
        if (br) setBranch(br)
        setBranchPicked(true) // الفرع محدد مسبقاً من الرابط، لا حاجة لصفحة الاختيار
      } else {
        // لا يوجد فرع في الرابط: نعرض صفحة الاختيار فقط لو فيه فرع نشط واحد على الأقل، وإلا نكمل مباشرة (الفرع الرئيسي)
        if (list.length === 0) setBranchPicked(true)
      }

      // عدد الطلبات النشطة حالياً لحساب وقت تجهيز تقديري ديناميكي (عبر RPC آمن)
      const { data: activeCount } = await supabase.rpc('get_active_orders_count', { p_restaurant_id: rest.id })
      setActiveOrdersCount(activeCount || 0)

      // متوسط تقييم المطعم (RPC آمن — sql/get_restaurant_rating.sql)
      // لو الدالة غير منفذة في Supabase بعد: نتجاهل بصمت وتُخفى النجوم
      try {
        const { data: rt, error: rtErr } = await supabase.rpc('get_restaurant_rating', { p_restaurant_id: rest.id })
        const row = Array.isArray(rt) ? rt[0] : rt
        if (!rtErr && row && Number(row.review_count) > 0) {
          setRating({ avg: Number(row.avg_rating), count: Number(row.review_count) })
        }
      } catch { /* تجاهل — النجوم اختيارية */ }

      // هل برنامج الولاء مفعّل؟ (لعرض تشويقي عام في صفحة اختيار الفرع، بلا حاجة لجوال الزبون)
      try {
        const { data: loy } = await supabase.from('loyalty_programs').select('enabled').eq('restaurant_id', rest.id).maybeSingle()
        setLoyaltyEnabled(!!loy?.enabled)
      } catch { /* تجاهل — التشويق اختياري */ }

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

  return {
    restaurant, branch, setBranch, branchList, branchPicked, setBranchPicked,
    categories, products, bestSellers, loading, notFound,
    activeCategory, setActiveCategory, restaurantActiveOrdersCount, rating, loyaltyEnabled,
  }
}
