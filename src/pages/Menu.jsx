import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { compressAndUploadImage } from '../lib/uploadImage'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import UpgradeModal from '../components/UpgradeModal'
import { useFeature } from '../hooks/useFeature'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { fetchRecommendationsForProduct, addRecommendation, removeRecommendation, updateRecommendationPriority, fetchCartWideList, addCartWideItem, removeCartWideItem, updateCartWidePriority, toggleCartWideActive } from '../lib/recommendationsApi'
import { fetchBranches } from '../lib/branchesApi'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const EMOJIS = ['🍽️','🍔','🍕','🌮','🥙','🥗','🍜','🥩','🍗','☕','🧃','🥤','🍰','🧁','🍟','🌯','🎯','⭐','🔥','🍣']

// شارة مستوى السعرات: 🟢 منخفض (<300) / 🟡 متوسط (300-600) / 🔴 مرتفع (600+)
function getCalorieBadge(calories) {
  if (calories == null) return null
  if (calories < 300) return '🟢'
  if (calories <= 600) return '🟡'
  return '🔴'
}

const inputStyle = {
  width:'100%', padding:'11px 13px',
  border:'1.5px solid #E5E7EB', borderRadius:'11px',
  fontFamily:'Tajawal,sans-serif', fontSize:'14px',
  color:'#0B0B0F', background:'#F8F9FB',
  outline:'none', textAlign:'right', direction:'rtl',
  marginTop:'4px', boxSizing:'border-box',
}

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0B0B0F', color:'white', flexDirection:'column', gap:'16px', fontFamily:'Tajawal,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,106,0,0.3)', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

// يلف أي بطاقة (قسم أو صنف) ليصبح قابلاً للسحب والإفلات، مع مقبض سحب صريح (أأمن من سحب البطاقة كلها لأنها فيها أزرار أخرى)
function SortableCard({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
  }
  return (
    <div ref={setNodeRef} style={{ ...style, display:'flex', alignItems:'center', gap:'4px' }}>
      <div {...attributes} {...listeners} style={{ cursor:'grab', padding:'8px 4px', color:'#D1D5DB', fontSize:'18px', flexShrink:0, touchAction:'none' }}>
        ⠿
      </div>
      <div style={{ flex:1, minWidth:0 }}>{children}</div>
    </div>
  )
}

export default function Menu() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, restaurant, fetchRestaurant } = useAuthStore()
  const [tab, setTab] = useState(location.state?.tab === 'products' ? 'products' : 'categories')
  // قدرة الاقتراحات الذكية (PCR): مقفولة في الباقات التي لا تمنحها → تبويب «اقتراحات السلة» يظهر بقفل
  const recsFeature = useFeature('menu_recommendations')
  const [showRecsUpgrade, setShowRecsUpgrade] = useState(false)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState([])
  const [currentBranchId, setCurrentBranchId] = useState(null) // الفرع الذي يُحرَّر منيوه حالياً

  // Modals
  const [catModal, setCatModal] = useState(false)
  const [prodModal, setProdModal] = useState(false)
  useBodyScrollLock(catModal)
  useBodyScrollLock(prodModal)
  const [editingCat, setEditingCat] = useState(null)
  const [editingProd, setEditingProd] = useState(null)

  // Forms
  const [catForm, setCatForm] = useState({ name:'', name_en:'', emoji:'🍽️', cover_url:'', is_visible:true })
  const [prodForm, setProdForm] = useState({ name:'', name_en:'', description:'', description_en:'', price:'', compare_price:'', category_id:'', emoji:'🍽️', image_url:'', calories:'', is_available:true, is_featured:false, is_best_seller:false, options:[] })
  const [uploadingCatImage, setUploadingCatImage] = useState(false)
  const [uploadingProdImage, setUploadingProdImage] = useState(false)
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null)
  const [confirmDeleteProd, setConfirmDeleteProd] = useState(null)

  // محرك الاقتراحات الذكي — قواعد الصنف الجاري تعديله فقط (تُدار فوراً، لا تنتظر زر الحفظ)
  const [recommendations, setRecommendations] = useState([])
  const [recSearch, setRecSearch] = useState('')

  // قائمة اقتراحات السلة العامة — مستقلة تماماً عن قواعد الأصناف الفردية
  const [cartWideList, setCartWideList] = useState([])
  const [cwSearch, setCwSearch] = useState('')

  // إعدادات تفعيل الاقتراحات + عددها — أصبحت تُدار من هنا (المكان الوحيد لكل ما يخصّ الاقتراحات)
  const [recEnabled, setRecEnabled] = useState(restaurant?.recommendations_enabled ?? true)
  const [recCount, setRecCount] = useState(restaurant?.recommendations_count ?? 4)
  const [savingRec, setSavingRec] = useState(false)
  useEffect(() => {
    if (!restaurant) return
    setRecEnabled(restaurant.recommendations_enabled ?? true)
    setRecCount(restaurant.recommendations_count ?? 4)
  }, [restaurant])

  // حفظ فوري لإعدادات الاقتراحات في restaurants + تحديث الحالة العامة
  const saveRecSettings = async (patch) => {
    if (!restaurant) return
    setSavingRec(true)
    try {
      const { error } = await supabase.from('restaurants').update(patch).eq('id', restaurant.id)
      if (error) throw error
      if (user) await fetchRestaurant(user.id)
    } catch (e) {
      toast.error('تعذّر حفظ إعدادات الاقتراحات')
    } finally {
      setSavingRec(false)
    }
  }
  const toggleRecEnabled = () => {
    const v = !recEnabled
    setRecEnabled(v)
    saveRecSettings({ recommendations_enabled: v })
  }
  const commitRecCount = () => {
    const n = Math.min(8, Math.max(1, parseInt(recCount) || 4))
    setRecCount(n)
    saveRecSettings({ recommendations_count: n })
  }

  useEffect(() => {
    if (!restaurant) return
    fetchBranches(restaurant.id).then(list => {
      setBranches(list)
      setCurrentBranchId(prev => prev || list.find(b => b.is_primary)?.id || list[0]?.id || null)
    })
  }, [restaurant])

  useEffect(() => {
    if (!currentBranchId) return
    fetchAll()
    loadCartWide()
  }, [currentBranchId])

  // مزامنة التبويب عند التنقل من السايدبار (الأصناف/الأقسام)
  useEffect(() => {
    const t = location.state?.tab
    if (t === 'products' || t === 'categories') setTab(t)
  }, [location.state])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from('categories').select('*').eq('branch_id', currentBranchId).order('sort_order'),
        supabase.from('products').select('*, categories(name)').eq('branch_id', currentBranchId).order('sort_order'),
      ])
      if (cats) setCategories(cats)
      if (prods) setProducts(prods)
    } finally {
      setLoading(false)
    }
  }

  // ===== CATEGORIES =====
  const openAddCat = () => {
    setEditingCat(null)
    setCatForm({ name:'', name_en:'', emoji:'🍽️', cover_url:'', is_visible:true })
    setCatModal(true)
  }

  const openEditCat = (cat) => {
    setEditingCat(cat)
    setCatForm({ name:cat.name, name_en:cat.name_en || '', emoji:cat.emoji, cover_url:cat.cover_url || '', is_visible:cat.is_visible })
    setCatModal(true)
  }

  const saveCat = async () => {
    if (!catForm.name.trim()) { toast.error('أدخل اسم القسم'); return }
    try {
      if (editingCat) {
        const { error } = await supabase.from('categories')
          .update({ name:catForm.name, name_en:catForm.name_en || null, emoji:catForm.emoji, cover_url:catForm.cover_url, is_visible:catForm.is_visible })
          .eq('id', editingCat.id)
        if (error) throw error
        toast.success('تم تحديث القسم ✅')
      } else {
        const { error } = await supabase.from('categories').insert({
          restaurant_id: restaurant.id,
          branch_id: currentBranchId,
          name: catForm.name,
          name_en: catForm.name_en || null,
          emoji: catForm.emoji,
          cover_url: catForm.cover_url,
          is_visible: catForm.is_visible,
          sort_order: categories.length,
        })
        if (error) throw error
        toast.success('تم إضافة القسم 🎉')
      }
      setCatModal(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // رفع صورة غلاف القسم — تُضغط وتُرفع فوراً عند الاختيار
  const handleCatImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingCatImage(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'categories')
      setCatForm(f => ({ ...f, cover_url: url }))
      toast.success('تم رفع الصورة ✅')
    } catch (err) {
      toast.error(err.message || 'فشل رفع الصورة')
    } finally {
      setUploadingCatImage(false)
      e.target.value = ''
    }
  }

  const deleteCat = async (id) => {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('تم الحذف')
    fetchAll()
  }

  const toggleCatVisibility = async (cat) => {
    await supabase.from('categories').update({ is_visible: !cat.is_visible }).eq('id', cat.id)
    fetchAll()
    toast.success(cat.is_visible ? 'تم الإخفاء 🚫' : 'تم الإظهار ✅')
  }

  // ===== DRAG & DROP =====
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // إعادة ترتيب الأقسام: تحديث فوري في الواجهة، ثم حفظ sort_order الجديد لكل قسم في قاعدة البيانات
  const handleCatDragEnd = async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex(c => c.id === active.id)
    const newIndex = categories.findIndex(c => c.id === over.id)
    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)

    const results = await Promise.all(
      reordered.map((cat, idx) => supabase.from('categories').update({ sort_order: idx }).eq('id', cat.id))
    )
    const failedResult = results.find(r => r.error)
    if (failedResult) {
      console.error('Sort order save failed:', failedResult.error)
      toast.error(failedResult.error.message || 'تعذّر حفظ الترتيب')
      fetchAll()
    }
  }

  // إعادة ترتيب الأصناف داخل نفس القسم فقط (لا تؤثر على أصناف الأقسام الأخرى)
  const handleProdDragEnd = (categoryId) => async (event) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const sameCategoryProds = products.filter(p => (p.category_id || null) === categoryId)
    const otherProds = products.filter(p => (p.category_id || null) !== categoryId)

    const oldIndex = sameCategoryProds.findIndex(p => p.id === active.id)
    const newIndex = sameCategoryProds.findIndex(p => p.id === over.id)
    const reordered = arrayMove(sameCategoryProds, oldIndex, newIndex)
    setProducts([...otherProds, ...reordered])

    const results = await Promise.all(
      reordered.map((prod, idx) => supabase.from('products').update({ sort_order: idx }).eq('id', prod.id))
    )
    const failedResult = results.find(r => r.error)
    if (failedResult) {
      console.error('Sort order save failed:', failedResult.error)
      toast.error(failedResult.error.message || 'تعذّر حفظ الترتيب')
      fetchAll()
    }
  }

  // ===== PRODUCTS =====
  const openAddProd = () => {
    setEditingProd(null)
    setProdForm({ name:'', name_en:'', description:'', description_en:'', price:'', compare_price:'', category_id: categories[0]?.id || '', emoji:'🍽️', image_url:'', calories:'', is_available:true, is_featured:false, is_best_seller:false, options:[] })
    setProdModal(true)
  }

  const openEditProd = (prod) => {
    setEditingProd(prod)
    setProdForm({
      name: prod.name,
      name_en: prod.name_en || '',
      description: prod.description || '',
      description_en: prod.description_en || '',
      price: prod.price,
      compare_price: prod.compare_price || '',
      category_id: prod.category_id || '',
      emoji: prod.emoji || '🍽️',
      image_url: prod.image_url || '',
      calories: prod.calories || '',
      is_available: prod.is_available,
      is_featured: !!prod.is_featured,
      is_best_seller: !!prod.is_best_seller,
      options: Array.isArray(prod.options) ? prod.options : [],
    })
    setRecSearch('')
    loadRecommendations(prod.id)
    setProdModal(true)
  }

  // ===== محرك الاقتراحات الذكي (product_recommendations) =====
  const loadRecommendations = async (productId) => {
    try {
      setRecommendations(await fetchRecommendationsForProduct(productId))
    } catch (err) {
      toast.error(err.message)
    }
  }

  const addRec = async (recommendedProduct) => {
    try {
      await addRecommendation(restaurant.id, editingProd.id, recommendedProduct.id, recommendations.length)
      setRecSearch('')
      loadRecommendations(editingProd.id)
    } catch (err) {
      toast.error(err.code === '23505' ? 'هذا الصنف مقترَح بالفعل' : err.message)
    }
  }

  const removeRec = async (rec) => {
    try {
      await removeRecommendation(rec.id)
      loadRecommendations(editingProd.id)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const moveRec = async (rec, direction) => {
    const idx = recommendations.findIndex(r => r.id === rec.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= recommendations.length) return
    const other = recommendations[swapIdx]
    try {
      await Promise.all([
        updateRecommendationPriority(rec.id, other.priority),
        updateRecommendationPriority(other.id, rec.priority),
      ])
      loadRecommendations(editingProd.id)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // نتائج البحث لإضافة اقتراح: يستبعد الصنف نفسه والأصناف المُضافة أصلاً
  const recSearchResults = recSearch.trim()
    ? products
        .filter(p => p.id !== editingProd?.id)
        .filter(p => !recommendations.some(r => r.recommended?.id === p.id))
        .filter(p => p.name.toLowerCase().includes(recSearch.trim().toLowerCase()))
        .slice(0, 6)
    : []

  // ===== قائمة اقتراحات السلة العامة (cart_wide_recommendations) — مستقلة عن قواعد الأصناف الفردية =====
  const loadCartWide = async () => {
    try {
      setCartWideList(await fetchCartWideList(restaurant.id, currentBranchId))
    } catch (err) {
      toast.error(err.message)
    }
  }

  const addCartWide = async (product) => {
    try {
      await addCartWideItem(restaurant.id, currentBranchId, product.id, cartWideList.length)
      setCwSearch('')
      loadCartWide()
    } catch (err) {
      toast.error(err.code === '23505' ? 'هذا الصنف مضاف بالفعل' : err.message)
    }
  }

  const removeCartWide = async (item) => {
    try {
      await removeCartWideItem(item.id)
      loadCartWide()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const moveCartWide = async (item, direction) => {
    const idx = cartWideList.findIndex(r => r.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= cartWideList.length) return
    const other = cartWideList[swapIdx]
    try {
      await Promise.all([
        updateCartWidePriority(item.id, other.priority),
        updateCartWidePriority(other.id, item.priority),
      ])
      loadCartWide()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleCartWide = async (item) => {
    try {
      await toggleCartWideActive(item.id, !item.is_active)
      loadCartWide()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const cwSearchResults = cwSearch.trim()
    ? products
        .filter(p => !cartWideList.some(r => r.product?.id === p.id))
        .filter(p => p.name.toLowerCase().includes(cwSearch.trim().toLowerCase()))
        .slice(0, 6)
    : []

  // رفع صورة الصنف — تُضغط وتُرفع فوراً عند الاختيار
  const handleProdImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingProdImage(true)
    try {
      const url = await compressAndUploadImage(file, restaurant.id, 'products')
      setProdForm(f => ({ ...f, image_url: url }))
      toast.success('تم رفع الصورة ✅')
    } catch (err) {
      toast.error(err.message || 'فشل رفع الصورة')
    } finally {
      setUploadingProdImage(false)
      e.target.value = ''
    }
  }

  const saveProd = async () => {
    if (!prodForm.name.trim()) { toast.error('أدخل اسم الصنف'); return }
    if (!prodForm.price) { toast.error('أدخل السعر'); return }

    // تنظيف مجموعات الخيارات: إزالة المجموعات/الخيارات بدون اسم
    const cleanOptions = (prodForm.options || [])
      .map(group => ({
        name: (group.name || '').trim(),
        type: group.type === 'multiple' ? 'multiple' : 'single',
        required: !!group.required,
        choices: (group.choices || [])
          .map(c => ({ name: (c.name || '').trim(), price: parseFloat(c.price) || 0 }))
          .filter(c => c.name),
      }))
      .filter(group => group.name && group.choices.length > 0)

    try {
      const data = {
        restaurant_id: restaurant.id,
        branch_id: currentBranchId,
        name: prodForm.name,
        name_en: prodForm.name_en || null,
        description: prodForm.description,
        description_en: prodForm.description_en || null,
        price: parseFloat(prodForm.price),
        compare_price: prodForm.compare_price ? parseFloat(prodForm.compare_price) : null,
        category_id: prodForm.category_id || null,
        emoji: prodForm.emoji,
        image_url: prodForm.image_url,
        calories: prodForm.calories ? parseInt(prodForm.calories) : null,
        is_available: prodForm.is_available,
        is_featured: prodForm.is_featured,
        is_best_seller: prodForm.is_best_seller,
        options: cleanOptions,
        sort_order: editingProd ? editingProd.sort_order : products.length,
      }
      if (editingProd) {
        const { error } = await supabase.from('products').update(data).eq('id', editingProd.id)
        if (error) throw error
        toast.success('تم تحديث الصنف ✅')
      } else {
        const { error } = await supabase.from('products').insert(data)
        if (error) throw error
        toast.success('تم إضافة الصنف 🎉')
      }
      setProdModal(false)
      fetchAll()
    } catch (err) {
      toast.error(err.message)
    }
  }

  // ===== OPTIONS GROUPS (إدارة مجموعات الإضافات/الحجم) =====
  const addOptionGroup = () => {
    setProdForm(f => ({
      ...f,
      options: [...(f.options || []), { name:'', type:'single', required:false, choices:[{ name:'', price:'' }] }],
    }))
  }

  const removeOptionGroup = (groupIdx) => {
    setProdForm(f => ({ ...f, options: f.options.filter((_, i) => i !== groupIdx) }))
  }

  const updateOptionGroup = (groupIdx, field, value) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx ? { ...g, [field]: value } : g),
    }))
  }

  const addChoice = (groupIdx) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx ? { ...g, choices: [...g.choices, { name:'', price:'' }] } : g),
    }))
  }

  const removeChoice = (groupIdx, choiceIdx) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx ? { ...g, choices: g.choices.filter((_, ci) => ci !== choiceIdx) } : g),
    }))
  }

  const updateChoice = (groupIdx, choiceIdx, field, value) => {
    setProdForm(f => ({
      ...f,
      options: f.options.map((g, i) => i === groupIdx
        ? { ...g, choices: g.choices.map((c, ci) => ci === choiceIdx ? { ...c, [field]: value } : c) }
        : g),
    }))
  }

  const deleteProd = async (id) => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('تم الحذف')
    fetchAll()
  }

  const toggleProdAvailability = async (prod) => {
    await supabase.from('products').update({ is_available: !prod.is_available }).eq('id', prod.id)
    fetchAll()
    toast.success(prod.is_available ? 'تم الإخفاء 🚫' : 'تم الإظهار ✅')
  }

  if (loading) return <Spinner />

  return (
    <AppShell
      active="menu"
      title="إدارة المنيو"
      actions={<>
        <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>
        {tab !== 'suggestions' && (
          <button onClick={() => tab === 'categories' ? openAddCat() : openAddProd()} style={{ padding:'7px 14px', borderRadius:'9px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer' }}>＋ {tab === 'categories' ? 'قسم' : 'صنف'}</button>
        )}
      </>}
    >

        {/* Tabs */}
        <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', display:'flex', padding:'0 16px', flexShrink:0, overflowX:'auto', scrollbarWidth:'none' }}>
          {[
            { key:'categories', label:`📋 الأقسام (${categories.length})` },
            { key:'products', label:`🍽️ الأصناف (${products.length})` },
            { key:'suggestions', label:`🍽️ اقتراحات السلة (${cartWideList.length})`, locked: recsFeature.locked },
          ].map(t => (
            <div key={t.key} onClick={() => t.locked ? setShowRecsUpgrade(true) : setTab(t.key)} title={t.locked ? 'غير متاح في باقتك — اضغط للترقية' : undefined} style={{
              padding:'13px 16px', fontSize:'14px', fontWeight:'700', display:'flex', alignItems:'center', gap:'5px',
              color: t.locked ? '#B8BCC4' : (tab === t.key ? '#FF6A00' : '#6B7280'),
              borderBottom: tab === t.key && !t.locked ? '2.5px solid #FF6A00' : '2.5px solid transparent',
              cursor:'pointer', transition:'all 0.2s', whiteSpace:'nowrap',
            }}>
              {t.label}{t.locked && <span style={{ fontSize:'12px' }}>🔒</span>}
            </div>
          ))}
        </div>

        {/* منتقي الفرع — يظهر فقط لو فيه أكثر من فرع، كل فرع منيوه المستقل */}
        {branches.length > 1 && (
          <div style={{ background:'white', borderBottom:'1px solid #E5E7EB', padding:'10px 16px', flexShrink:0 }}>
            <select value={currentBranchId || ''} onChange={e => setCurrentBranchId(e.target.value)} style={{ padding:'8px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', fontFamily:'Tajawal,sans-serif', fontSize:'12.5px', fontWeight:'700', color:'#374151', outline:'none', cursor:'pointer', background:'white' }}>
              {branches.map(b => <option key={b.id} value={b.id}>{b.is_primary ? '🏠' : '🏢'} {b.name}</option>)}
            </select>
          </div>
        )}

        {/* Content */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>

          {/* CATEGORIES */}
          {tab === 'categories' && (
            <div>
              {categories.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>📋</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>لا توجد أقسام بعد</div>
                  <div style={{ fontSize:'13px', marginBottom:'20px' }}>أضف أقسام لتنظيم منيوك</div>
                  <button onClick={openAddCat} style={{ padding:'12px 24px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                    ＋ إضافة أول قسم
                  </button>
                </div>
              ) : (
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
                  <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                      {categories.map(cat => (
                        <SortableCard key={cat.id} id={cat.id}>
                          <div style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                            <div style={{ width:'44px', height:'44px', borderRadius:'12px', background:'#FFF0EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', flexShrink:0, overflow:'hidden' }}>
                              {cat.cover_url
                                ? <img src={cat.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                : cat.emoji}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'15px', marginBottom:'3px' }}>{cat.name}</div>
                              <div style={{ fontSize:'12px', color:'#9CA3AF' }}>
                                {products.filter(p => p.category_id === cat.id).length} صنف
                              </div>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0 }}>
                              <button onClick={() => toggleCatVisibility(cat)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: cat.is_visible ? '#D1FAE5' : '#F3F4F6', color: cat.is_visible ? '#065F46' : '#6B7280', fontSize:'11px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
                                {cat.is_visible ? '👁️' : '🚫'}
                              </button>
                              <button onClick={() => openEditCat(cat)} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'14px' }}>✏️</button>
                              <button onClick={() => setConfirmDeleteCat(cat)} style={{ width:'32px', height:'32px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'14px' }}>🗑️</button>
                            </div>
                          </div>
                        </SortableCard>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              {categories.length > 0 && (
                <button onClick={openAddCat} style={{ marginTop:'10px', width:'100%', padding:'14px', borderRadius:'14px', border:'2px dashed #E5E7EB', background:'transparent', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', color:'#9CA3AF', cursor:'pointer' }}>
                  ＋ إضافة قسم جديد
                </button>
              )}
            </div>
          )}

          {/* PRODUCTS */}
          {tab === 'products' && (
            <div>
              {products.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'48px', opacity:0.3, marginBottom:'12px' }}>🍽️</div>
                  <div style={{ fontSize:'16px', fontWeight:'700', color:'#374151', marginBottom:'8px' }}>لا توجد أصناف بعد</div>
                  <div style={{ fontSize:'13px', marginBottom:'20px' }}>أضف أصنافاً لتملأ منيوك</div>
                  <button onClick={openAddProd} style={{ padding:'12px 24px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', cursor:'pointer' }}>
                    ＋ إضافة أول صنف
                  </button>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
                  {[...categories, { id: null, name: 'بدون قسم', emoji:'📦' }].map(cat => {
                    const catProds = products.filter(p => (p.category_id || null) === cat.id)
                    if (catProds.length === 0) return null
                    return (
                      <div key={cat.id || 'none'}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', padding:'0 2px' }}>
                          <span style={{ fontSize:'15px' }}>{cat.emoji}</span>
                          <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', color:'#6B7280' }}>{cat.name}</span>
                          <span style={{ fontSize:'11px', color:'#9CA3AF', background:'#F3F4F6', padding:'1px 7px', borderRadius:'100px' }}>{catProds.length}</span>
                        </div>
                        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleProdDragEnd(cat.id)}>
                          <SortableContext items={catProds.map(p => p.id)} strategy={verticalListSortingStrategy}>
                            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                              {catProds.map(prod => (
                                <SortableCard key={prod.id} id={prod.id}>
                                  <div style={{ background:'white', borderRadius:'14px', border:'1.5px solid #E5E7EB', padding:'14px 16px', display:'flex', alignItems:'center', gap:'12px' }}>
                                    <div style={{ width:'52px', height:'52px', borderRadius:'12px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', flexShrink:0, border:'1px solid #E5E7EB', overflow:'hidden' }}>
                                      {prod.image_url
                                        ? <img src={prod.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                        : prod.emoji}
                                    </div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', marginBottom:'3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prod.name}</div>
                                      {prod.description && <div style={{ fontSize:'12px', color:'#9CA3AF', marginBottom:'4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{prod.description}</div>}
                                      <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
                                        <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'14px', color:'#FF6A00' }}>{prod.price} ﷼</span>
                                        {prod.compare_price && <span style={{ fontSize:'12px', color:'#9CA3AF', textDecoration:'line-through' }}>{prod.compare_price} ﷼</span>}
                                        {prod.calories && <span style={{ fontSize:'11px', color:'#9CA3AF' }}>{getCalorieBadge(prod.calories)} {prod.calories} كالوري</span>}
                                        {prod.is_best_seller && <span style={{ fontSize:'10px', color:'#B45309', background:'#FEF3C7', padding:'2px 6px', borderRadius:'100px' }}>🔥 الأكثر مبيعًا</span>}
                                        {prod.is_featured && <span style={{ fontSize:'10px', color:'#1E5FBF', background:'#EAF3FF', padding:'2px 6px', borderRadius:'100px' }}>مختارات المطعم</span>}
                                      </div>
                                    </div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:'6px', alignItems:'flex-end', flexShrink:0 }}>
                                      <button onClick={() => toggleProdAvailability(prod)} style={{ padding:'4px 8px', borderRadius:'7px', border:'1.5px solid #E5E7EB', background: prod.is_available ? '#D1FAE5' : '#F3F4F6', color: prod.is_available ? '#065F46' : '#6B7280', fontSize:'10px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>
                                        {prod.is_available ? '✅ متاح' : '🚫 مخفي'}
                                      </button>
                                      <div style={{ display:'flex', gap:'5px' }}>
                                        <button onClick={() => openEditProd(prod)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background:'white', cursor:'pointer', fontSize:'13px' }}>✏️</button>
                                        <button onClick={() => setConfirmDeleteProd(prod)} style={{ width:'30px', height:'30px', borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                                      </div>
                                    </div>
                                  </div>
                                </SortableCard>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    )
                  })}
                  <button onClick={openAddProd} style={{ padding:'14px', borderRadius:'14px', border:'2px dashed #E5E7EB', background:'transparent', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'14px', color:'#9CA3AF', cursor:'pointer' }}>
                    ＋ إضافة صنف جديد
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUGGESTIONS — قائمة اقتراحات السلة العامة، مستقلة عن قواعد الأصناف الفردية */}
          {/* PCR: حماية إضافية — لا يُعرض المحتوى إن كانت القدرة مُطفأة (لا تجاوز حتى لو تغيّر tab) */}
          {tab === 'suggestions' && !recsFeature.locked && (
            <div>
              {/* إعدادات الاقتراحات — نُقلت هنا من صفحة الإعدادات ليكون كل ما يخصّ الاقتراحات في مكان واحد */}
              <div style={{ background:'white', borderRadius:'14px', border:'1px solid #E5E7EB', padding:'14px 16px', marginBottom:'16px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'14px', fontWeight:'800', marginBottom:'3px' }}>تفعيل قسم «أكمل وجبتك»</div>
                    <div style={{ fontSize:'12px', color:'#9CA3AF', lineHeight:'1.5' }}>عرض الاقتراحات في سلة الزبون. عند الإيقاف لا يظهر القسم إطلاقاً.</div>
                  </div>
                  <label style={{ position:'relative', width:'48px', height:'26px', cursor: savingRec ? 'wait' : 'pointer', flexShrink:0, opacity: savingRec ? 0.6 : 1 }}>
                    <input type="checkbox" checked={recEnabled} disabled={savingRec} onChange={toggleRecEnabled} style={{ opacity:0, width:0, height:0, position:'absolute' }}/>
                    <div style={{ position:'absolute', inset:0, background: recEnabled ? '#10B981' : '#E5E7EB', borderRadius:'26px', transition:'0.3s' }}>
                      <div style={{ position:'absolute', width:'20px', height:'20px', background:'white', borderRadius:'50%', top:'3px', left: recEnabled ? '25px' : '3px', transition:'0.3s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }}/>
                    </div>
                  </label>
                </div>
                {recEnabled && (
                  <div style={{ marginTop:'14px', paddingTop:'14px', borderTop:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'12px' }}>
                    <label style={{ fontSize:'13px', fontWeight:'700', color:'#374151' }}>عدد الاقتراحات المعروضة</label>
                    <input
                      style={{ ...inputStyle, marginTop:0, direction:'ltr', textAlign:'center', maxWidth:'84px' }}
                      type="number" min="1" max="8"
                      value={recCount}
                      onChange={e => setRecCount(e.target.value)}
                      onBlur={commitRecCount}
                    />
                  </div>
                )}
              </div>

              <div style={{ fontSize:'13px', color:'#9CA3AF', marginBottom:'14px', lineHeight:'1.6' }}>
                هذه القائمة تظهر في قسم «🍽️ أكمل وجبتك» العام داخل سلة الزبون — بمعزل تماماً عن اقتراحات كل صنف على حدة، وعن «مختارات المطعم ⭐» و«الأكثر مبيعًا 🔥» اليدوية.
              </div>

              <div style={{ position:'relative', marginBottom:'16px' }}>
                <input
                  value={cwSearch}
                  onChange={e => setCwSearch(e.target.value)}
                  placeholder="ابحث عن صنف لإضافته..."
                  style={{ ...inputStyle, marginTop:0 }}
                />
                {cwSearchResults.length > 0 && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, left:0, background:'white', border:'1.5px solid #E5E7EB', borderRadius:'10px', boxShadow:'0 8px 20px rgba(0,0,0,0.08)', zIndex:10, overflow:'hidden' }}>
                    {cwSearchResults.map(p => (
                      <div key={p.id} onClick={() => addCartWide(p)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F3F4F6' }}>
                        <span style={{ fontSize:'15px' }}>{p.emoji || '🍽️'}</span>
                        <span style={{ flex:1, fontSize:'13px' }}>{p.name}</span>
                        <span style={{ fontSize:'12px', color:'#9CA3AF' }}>{p.price} ﷼</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {cartWideList.length === 0 ? (
                <div style={{ textAlign:'center', padding:'50px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'42px', opacity:0.3, marginBottom:'12px' }}>🍽️</div>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#374151' }}>لا توجد أصناف في القائمة العامة بعد</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {cartWideList.map((item, i) => (
                    <div key={item.id} style={{ display:'flex', alignItems:'center', gap:'10px', border:'1.5px solid #E5E7EB', borderRadius:'12px', padding:'10px 12px', background:'white' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0', flexShrink:0 }}>
                        <button type="button" onClick={() => moveCartWide(item, 'up')} disabled={i === 0} style={{ width:'20px', height:'16px', border:'none', background:'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E5E7EB' : '#6B7280', fontSize:'10px' }}>▲</button>
                        <button type="button" onClick={() => moveCartWide(item, 'down')} disabled={i === cartWideList.length - 1} style={{ width:'20px', height:'16px', border:'none', background:'none', cursor: i === cartWideList.length - 1 ? 'default' : 'pointer', color: i === cartWideList.length - 1 ? '#E5E7EB' : '#6B7280', fontSize:'10px' }}>▼</button>
                      </div>
                      <span style={{ fontSize:'18px', flexShrink:0 }}>{item.product?.emoji || '🍽️'}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'13.5px', fontWeight:'700', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.product?.name}</div>
                        <div style={{ fontSize:'12px', color:'#9CA3AF' }}>{item.product?.price} ﷼</div>
                      </div>
                      <button type="button" onClick={() => toggleCartWide(item)} style={{ padding:'5px 8px', borderRadius:'8px', border:'1.5px solid #E5E7EB', background: item.is_active ? '#D1FAE5' : '#F3F4F6', color: item.is_active ? '#065F46' : '#6B7280', fontSize:'11px', fontWeight:'700', cursor:'pointer', flexShrink:0 }}>
                        {item.is_active ? '👁️' : '🚫'}
                      </button>
                      <button type="button" onClick={() => removeCartWide(item)} style={{ width:'30px', height:'30px', flexShrink:0, borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      {/* ===== CATEGORY MODAL ===== */}
      {catModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setCatModal(false)}>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', padding:'20px 20px 36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 20px' }}/>
            <h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'18px', textAlign:'center' }}>
              {editingCat ? 'تعديل القسم' : '📋 إضافة قسم جديد'}
            </h3>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>صورة غلاف القسم (اختياري)</label>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'12px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden', flexShrink:0 }}>
                  {catForm.cover_url
                    ? <img src={catForm.cover_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : catForm.emoji}
                </div>
                <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                  {uploadingCatImage ? 'جارٍ الرفع...' : '📷 رفع صورة'}
                  <input type="file" accept="image/*" onChange={handleCatImageUpload} disabled={uploadingCatImage} style={{ display:'none' }} />
                </label>
                {catForm.cover_url && (
                  <button onClick={() => setCatForm(f => ({ ...f, cover_url: '' }))} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>حذف</button>
                )}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>أيقونة القسم (تظهر إن لم توجد صورة)</label>
              <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
                {EMOJIS.map(e => (
                  <div key={e} onClick={() => setCatForm(f=>({...f,emoji:e}))} style={{ width:'36px', height:'36px', borderRadius:'9px', border:`2px solid ${catForm.emoji===e?'#FF6A00':'#E5E7EB'}`, background: catForm.emoji===e?'#FFF0EB':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', cursor:'pointer', transition:'all 0.15s' }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>اسم القسم *</label>
              <input style={inputStyle} placeholder="مثال: البرغر، المشروبات..." value={catForm.name} onChange={e => setCatForm(f=>({...f,name:e.target.value}))} autoFocus />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px', color:'#6B7280' }}>🇬🇧 اسم القسم (إنجليزي) <span style={{ fontWeight:'400', fontSize:'11px' }}>— اختياري</span></label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} placeholder="e.g. Burgers, Drinks..." value={catForm.name_en} onChange={e => setCatForm(f=>({...f,name_en:e.target.value}))} />
            </div>

            <label style={{ display:'flex', alignItems:'center', gap:'10px', cursor:'pointer', marginBottom:'20px' }}>
              <input type="checkbox" checked={catForm.is_visible} onChange={e => setCatForm(f=>({...f,is_visible:e.target.checked}))} style={{ width:'18px', height:'18px', accentColor:'#FF6A00' }}/>
              <span style={{ fontSize:'14px', fontWeight:'600' }}>إظهار القسم في المنيو</span>
            </label>

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setCatModal(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'600', fontSize:'14px', cursor:'pointer', color:'#6B7280' }}>إلغاء</button>
              <button onClick={saveCat} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
                💾 {editingCat ? 'تحديث القسم' : 'إضافة القسم'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PRODUCT MODAL ===== */}
      {prodModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setProdModal(false)}>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'480px', maxHeight:'92vh', overflowY:'auto', padding:'20px 20px 36px' }} onClick={e => e.stopPropagation()}>
            <div style={{ width:'40px', height:'4px', background:'#E5E7EB', borderRadius:'2px', margin:'0 auto 20px' }}/>
            <h3 style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'900', fontSize:'18px', marginBottom:'18px', textAlign:'center' }}>
              {editingProd ? 'تعديل الصنف' : '🍽️ إضافة صنف جديد'}
            </h3>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>صورة الصنف (اختياري)</label>
              <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                <div style={{ width:'64px', height:'64px', borderRadius:'12px', background:'#F8F9FB', border:'1.5px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'26px', overflow:'hidden', flexShrink:0 }}>
                  {prodForm.image_url
                    ? <img src={prodForm.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : prodForm.emoji}
                </div>
                <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'9px 14px', borderRadius:'10px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'12px', cursor:'pointer', color:'#374151' }}>
                  {uploadingProdImage ? 'جارٍ الرفع...' : '📷 رفع صورة'}
                  <input type="file" accept="image/*" onChange={handleProdImageUpload} disabled={uploadingProdImage} style={{ display:'none' }} />
                </label>
                {prodForm.image_url && (
                  <button onClick={() => setProdForm(f => ({ ...f, image_url: '' }))} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', color:'#EF4444', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>حذف</button>
                )}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>أيقونة الصنف (تظهر إن لم توجد صورة)</label>
              <div style={{ display:'flex', gap:'7px', flexWrap:'wrap' }}>
                {EMOJIS.map(e => (
                  <div key={e} onClick={() => setProdForm(f=>({...f,emoji:e}))} style={{ width:'36px', height:'36px', borderRadius:'9px', border:`2px solid ${prodForm.emoji===e?'#FF6A00':'#E5E7EB'}`, background: prodForm.emoji===e?'#FFF0EB':'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', cursor:'pointer', transition:'all 0.15s' }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>اسم الصنف *</label>
              <input style={inputStyle} placeholder="مثال: برغر كلاسيك" value={prodForm.name} onChange={e => setProdForm(f=>({...f,name:e.target.value}))} autoFocus />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px', color:'#6B7280' }}>🇬🇧 اسم الصنف (إنجليزي) <span style={{ fontWeight:'400', fontSize:'11px' }}>— اختياري</span></label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} placeholder="e.g. Classic Burger" value={prodForm.name_en} onChange={e => setProdForm(f=>({...f,name_en:e.target.value}))} />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>الوصف</label>
              <textarea style={{ ...inputStyle, minHeight:'72px', resize:'vertical' }} placeholder="وصف شهي يجذب العملاء..." value={prodForm.description} onChange={e => setProdForm(f=>({...f,description:e.target.value}))} />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px', color:'#6B7280' }}>🇬🇧 الوصف (إنجليزي) <span style={{ fontWeight:'400', fontSize:'11px' }}>— اختياري</span></label>
              <textarea style={{ ...inputStyle, minHeight:'72px', resize:'vertical', direction:'ltr', textAlign:'left' }} placeholder="Appetizing description..." value={prodForm.description_en} onChange={e => setProdForm(f=>({...f,description_en:e.target.value}))} />
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'14px' }}>
              <div>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>السعر (ريال) *</label>
                <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="0.5" placeholder="0.00" value={prodForm.price} onChange={e => setProdForm(f=>({...f,price:e.target.value}))} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>سعر المقارنة</label>
                <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="0.5" placeholder="0.00" value={prodForm.compare_price} onChange={e => setProdForm(f=>({...f,compare_price:e.target.value}))} />
              </div>
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>🔥 السعرات الحرارية (اختياري)</label>
              <input style={{ ...inputStyle, direction:'ltr', textAlign:'left' }} type="number" min="0" step="1" placeholder="مثال: 450" value={prodForm.calories} onChange={e => setProdForm(f=>({...f,calories:e.target.value}))} />
            </div>

            <div style={{ marginBottom:'14px' }}>
              <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'4px' }}>القسم</label>
              <select style={{ ...inputStyle, cursor:'pointer' }} value={prodForm.category_id} onChange={e => setProdForm(f=>({...f,category_id:e.target.value}))}>
                <option value="">بدون قسم</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display:'flex', gap:'12px 20px', marginBottom:'20px', flexWrap:'wrap' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_available} onChange={e => setProdForm(f=>({...f,is_available:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#FF6A00' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>✅ متاح للطلب</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_featured} onChange={e => setProdForm(f=>({...f,is_featured:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#1E5FBF' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>⭐ مختارات المطعم</span>
              </label>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                <input type="checkbox" checked={prodForm.is_best_seller} onChange={e => setProdForm(f=>({...f,is_best_seller:e.target.checked}))} style={{ width:'17px', height:'17px', accentColor:'#F59E0B' }}/>
                <span style={{ fontSize:'13px', fontWeight:'600' }}>🔥 الأكثر مبيعًا</span>
              </label>
            </div>

            {/* ===== خيارات الصنف (الحجم / الإضافات) ===== */}
            <div style={{ marginBottom:'20px', border:'1.5px solid #E5E7EB', borderRadius:'14px', overflow:'hidden' }}>
              <div style={{ padding:'12px 14px', background:'#F8F9FB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:'13px', fontWeight:'800' }}>🧩 خيارات الصنف (الحجم، الإضافات...)</span>
                <button type="button" onClick={addOptionGroup} style={{ padding:'5px 10px', borderRadius:'8px', border:'1.5px solid #FF6A00', background:'white', color:'#FF6A00', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                  ＋ مجموعة
                </button>
              </div>

              {(prodForm.options || []).length === 0 ? (
                <div style={{ padding:'16px', textAlign:'center', fontSize:'12px', color:'#9CA3AF' }}>
                  لا توجد خيارات — مفيدة لو الصنف له أحجام أو إضافات (مثل: الحجم، الإضافات)
                </div>
              ) : (
                <div style={{ padding:'12px', display:'flex', flexDirection:'column', gap:'12px' }}>
                  {prodForm.options.map((group, gi) => (
                    <div key={gi} style={{ border:'1.5px solid #E5E7EB', borderRadius:'12px', padding:'10px', background:'white' }}>
                      <div style={{ display:'flex', gap:'8px', marginBottom:'8px', alignItems:'center' }}>
                        <input
                          placeholder="اسم المجموعة (مثال: الحجم)"
                          value={group.name}
                          onChange={e => updateOptionGroup(gi, 'name', e.target.value)}
                          style={{ flex:1, padding:'8px 10px', border:'1.5px solid #E5E7EB', borderRadius:'9px', fontFamily:'Tajawal,sans-serif', fontSize:'13px', outline:'none', textAlign:'right' }}
                        />
                        <button type="button" onClick={() => removeOptionGroup(gi)} style={{ width:'30px', height:'30px', flexShrink:0, borderRadius:'8px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'13px' }}>🗑️</button>
                      </div>

                      <div style={{ display:'flex', gap:'14px', marginBottom:'10px', flexWrap:'wrap' }}>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="radio"
                            name={`group-type-${gi}`}
                            checked={group.type !== 'multiple'}
                            onChange={() => updateOptionGroup(gi, 'type', 'single')}
                            style={{ accentColor:'#FF6A00' }}
                          />
                          اختيار واحد
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="radio"
                            name={`group-type-${gi}`}
                            checked={group.type === 'multiple'}
                            onChange={() => updateOptionGroup(gi, 'type', 'multiple')}
                            style={{ accentColor:'#FF6A00' }}
                          />
                          اختيار متعدد
                        </label>
                        <label style={{ display:'flex', alignItems:'center', gap:'6px', cursor:'pointer', fontSize:'12px' }}>
                          <input
                            type="checkbox"
                            checked={!!group.required}
                            onChange={e => updateOptionGroup(gi, 'required', e.target.checked)}
                            style={{ accentColor:'#FF6A00' }}
                          />
                          إجباري
                        </label>
                      </div>

                      <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                        {group.choices.map((choice, ci) => (
                          <div key={ci} style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                            <input
                              placeholder="اسم الخيار"
                              value={choice.name}
                              onChange={e => updateChoice(gi, ci, 'name', e.target.value)}
                              style={{ flex:2, padding:'7px 9px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', textAlign:'right' }}
                            />
                            <input
                              type="number"
                              step="0.5"
                              placeholder="+0"
                              value={choice.price}
                              onChange={e => updateChoice(gi, ci, 'price', e.target.value)}
                              style={{ flex:1, padding:'7px 9px', border:'1.5px solid #E5E7EB', borderRadius:'8px', fontFamily:'Tajawal,sans-serif', fontSize:'12px', outline:'none', direction:'ltr', textAlign:'left' }}
                            />
                            <button type="button" onClick={() => removeChoice(gi, ci)} style={{ width:'26px', height:'26px', flexShrink:0, borderRadius:'7px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'11px' }}>✕</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addChoice(gi)} style={{ marginTop:'4px', padding:'6px', borderRadius:'8px', border:'1.5px dashed #E5E7EB', background:'transparent', color:'#9CA3AF', fontFamily:'Tajawal,sans-serif', fontWeight:'700', fontSize:'11px', cursor:'pointer' }}>
                          ＋ إضافة خيار
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* محرك الاقتراحات الذكي — يظهر فقط لصنف محفوظ فعلاً (يحتاج معرّفاً) */}
            {editingProd && (
              <div style={{ marginBottom:'18px' }}>
                <label style={{ display:'block', fontSize:'13px', fontWeight:'700', marginBottom:'8px', color:'#374151' }}>
                  🔗 اقتراح مع هذا الصنف <span style={{ fontWeight:'400', color:'#9CA3AF' }}>— تظهر هذه الأصناف في السلة عند إضافة الزبون لـ«{editingProd.name}»</span>
                </label>

                {recommendations.length > 0 && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'10px' }}>
                    {recommendations.map((rec, i) => (
                      <div key={rec.id} style={{ display:'flex', alignItems:'center', gap:'8px', border:'1.5px solid #E5E7EB', borderRadius:'10px', padding:'7px 10px', background:'white' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:'0', flexShrink:0 }}>
                          <button type="button" onClick={() => moveRec(rec, 'up')} disabled={i === 0} style={{ width:'18px', height:'14px', border:'none', background:'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#E5E7EB' : '#6B7280', fontSize:'9px' }}>▲</button>
                          <button type="button" onClick={() => moveRec(rec, 'down')} disabled={i === recommendations.length - 1} style={{ width:'18px', height:'14px', border:'none', background:'none', cursor: i === recommendations.length - 1 ? 'default' : 'pointer', color: i === recommendations.length - 1 ? '#E5E7EB' : '#6B7280', fontSize:'9px' }}>▼</button>
                        </div>
                        <span style={{ fontSize:'16px', flexShrink:0 }}>{rec.recommended?.emoji || '🍽️'}</span>
                        <span style={{ flex:1, fontSize:'13px', fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rec.recommended?.name}</span>
                        <span style={{ fontSize:'12px', color:'#9CA3AF', flexShrink:0 }}>{rec.recommended?.price} ﷼</span>
                        <button type="button" onClick={() => removeRec(rec)} style={{ width:'24px', height:'24px', flexShrink:0, borderRadius:'7px', border:'1.5px solid #FEE2E2', background:'#FEF2F2', cursor:'pointer', fontSize:'11px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ position:'relative' }}>
                  <input
                    value={recSearch}
                    onChange={e => setRecSearch(e.target.value)}
                    placeholder="ابحث عن صنف لإضافته كاقتراح..."
                    style={{ ...inputStyle, marginTop:0 }}
                  />
                  {recSearchResults.length > 0 && (
                    <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, left:0, background:'white', border:'1.5px solid #E5E7EB', borderRadius:'10px', boxShadow:'0 8px 20px rgba(0,0,0,0.08)', zIndex:10, overflow:'hidden' }}>
                      {recSearchResults.map(p => (
                        <div key={p.id} onClick={() => addRec(p)} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'9px 12px', cursor:'pointer', borderBottom:'1px solid #F3F4F6' }}>
                          <span style={{ fontSize:'15px' }}>{p.emoji || '🍽️'}</span>
                          <span style={{ flex:1, fontSize:'13px' }}>{p.name}</span>
                          <span style={{ fontSize:'12px', color:'#9CA3AF' }}>{p.price} ﷼</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setProdModal(false)} style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'600', fontSize:'14px', cursor:'pointer', color:'#6B7280' }}>إلغاء</button>
              <button onClick={saveProd} style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'14px', cursor:'pointer' }}>
                💾 {editingProd ? 'تحديث الصنف' : 'إضافة الصنف'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteCat}
        title="حذف القسم"
        body={confirmDeleteCat ? `حذف قسم "${confirmDeleteCat.name}"؟` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDeleteCat(null)}
        onConfirm={() => { deleteCat(confirmDeleteCat.id); setConfirmDeleteCat(null) }}
      />
      <ConfirmDialog
        open={!!confirmDeleteProd}
        title="حذف الصنف"
        body={confirmDeleteProd ? `حذف صنف "${confirmDeleteProd.name}"؟` : ''}
        confirmLabel="حذف"
        onCancel={() => setConfirmDeleteProd(null)}
        onConfirm={() => { deleteProd(confirmDeleteProd.id); setConfirmDeleteProd(null) }}
      />

      {/* مودال الترقية — عند الضغط على تبويب «اقتراحات السلة» المقفول في الباقة */}
      {showRecsUpgrade && (
        <UpgradeModal
          feature="menu_recommendations"
          name={recsFeature.name || 'الاقتراحات الذكية'}
          message={recsFeature.upgrade_message}
          onClose={() => setShowRecsUpgrade(false)}
        />
      )}
    </AppShell>
  )
}
