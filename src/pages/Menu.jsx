import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { compressAndUploadImage } from '../lib/uploadImage'
import { useAuthStore } from '../store/authStore'
import AppShell from '../components/AppShell'
import ConfirmDialog from '../components/ConfirmDialog'
import UpgradeModal from '../components/UpgradeModal'
import { useFeature } from '../hooks/useFeature'
import { appConfig } from '../config'
import { fetchRecommendationsForProduct, addRecommendation, removeRecommendation, updateRecommendationPriority, fetchCartWideList, addCartWideItem, removeCartWideItem, updateCartWidePriority, toggleCartWideActive } from '../lib/recommendationsApi'
import { fetchBranches } from '../lib/branchesApi'
import { calculateMenuReadiness } from '../lib/menuReadiness'
import { isFirstOwnerContentItem } from '../lib/ownerActivation'
import { trackOwnerMilestone } from '../lib/analytics'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import SortableCard from './menu/SortableCard'
import CategoryCard from './menu/CategoryCard'
import ProductCard from './menu/ProductCard'
import CategoryFormModal from './menu/CategoryFormModal'
import ProductFormModal from './menu/ProductFormModal'
import SearchFilterBar from './menu/SearchFilterBar'
import FilterSheet from './menu/FilterSheet'
import { inputStyle } from './menu/menuFormShared'
import {
  filterCategories, filterProductsBySearch, filterProductsByFilters,
  DEFAULT_PRODUCT_FILTERS, isDefaultProductFilters, countActiveFilters,
} from './menu/menuSearch'

function Spinner() {
  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0B0B0F', color:'white', flexDirection:'column', gap:'16px', fontFamily:'Tajawal,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,106,0,0.3)', borderTopColor:'#FF6A00', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
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
  const currentBranch = branches.find(branch => branch.id === currentBranchId) || null

  // بحث وفلترة — يعملان على البيانات المحمّلة أصلاً، بلا استعلام أو إعادة تحميل جديد
  const [searchQuery, setSearchQuery] = useState('')
  const [productFilters, setProductFilters] = useState(DEFAULT_PRODUCT_FILTERS)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)

  // Modals
  const [catModal, setCatModal] = useState(false)
  const [prodModal, setProdModal] = useState(false)
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
    // تبديل الفرع = منيو مختلف بالكامل — لا معنى لبقاء بحث/فلاتر الفرع السابق
    setSearchQuery('')
    setProductFilters(DEFAULT_PRODUCT_FILTERS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ===== بحث وفلترة (Client-side على البيانات المحمّلة) =====
  const categoriesById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const filteredCategories = useMemo(() => filterCategories(categories, searchQuery), [categories, searchQuery])
  const searchedProducts = useMemo(() => filterProductsBySearch(products, categoriesById, searchQuery), [products, categoriesById, searchQuery])
  const filteredProducts = useMemo(() => filterProductsByFilters(searchedProducts, productFilters), [searchedProducts, productFilters])
  const activeFilterCount = countActiveFilters(productFilters)
  // إعادة الترتيب بالسحب تُعيد كتابة sort_order لكل العناصر الظاهرة — غير آمنة أثناء
  // بحث/فلترة نشطة (قد تُخفي عناصر أخرى من نفس القسم وتُفسد ترتيبها الحقيقي)
  const isCategoriesFiltering = searchQuery.trim().length > 0
  const isProductsFiltering = searchQuery.trim().length > 0 || !isDefaultProductFilters(productFilters)

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
        if (isFirstOwnerContentItem(categories.length)) {
          trackOwnerMilestone('category_created', {
            restaurantId: restaurant.id,
            branchId: currentBranchId,
            props: { source: 'menu_admin' },
          })
        }
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
        if (isFirstOwnerContentItem(products.length)) {
          trackOwnerMilestone('first_product_created', {
            restaurantId: restaurant.id,
            branchId: currentBranchId,
            props: { source: 'menu_admin' },
          })
        }
        toast.success('تم إضافة الصنف 🎉')
      }
      const nextProducts = editingProd
        ? products.map(product => product.id === editingProd.id ? { ...product, ...data } : product)
        : [...products, data]
      const readiness = calculateMenuReadiness({
        restaurant,
        branch: currentBranch,
        categories,
        products: nextProducts,
      })
      if (readiness.minimumReady) {
        trackOwnerMilestone('menu_minimum_ready', {
          restaurantId: restaurant.id,
          branchId: currentBranchId,
          props: { source: 'menu_admin' },
        })
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

  // ===== معاينة/مشاركة المنيو — تُعيد استخدام نفس رابط منيو الزبون الحقيقي (menu-next) =====
  const menuUrl = restaurant?.slug ? `${appConfig.menuNextBaseUrl}/menu/${restaurant.slug}` : null
  const previewMenu = () => { if (menuUrl) window.open(menuUrl, '_blank') }
  const shareMenu = async () => {
    if (!menuUrl) return
    try {
      await navigator.clipboard.writeText(menuUrl)
      trackOwnerMilestone('menu_link_copied', { restaurantId: restaurant?.id, props: { source: 'menu_admin' } })
      toast.success('تم نسخ رابط المنيو')
    } catch {
      toast.error('تعذر نسخ الرابط')
    }
  }

  if (loading) return <Spinner />

  return (
    <AppShell
      active="menu"
      title="إدارة المنيو"
      actions={<>
        <button onClick={() => navigate('/dashboard')} style={{ padding:'7px 12px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontFamily:'Tajawal,sans-serif', fontWeight:'600', fontSize:'12px', cursor:'pointer', color:'#374151' }}>← الرئيسية</button>
        <button onClick={previewMenu} disabled={!menuUrl} aria-label="معاينة المنيو" title="معاينة المنيو" style={{ width:'32px', height:'32px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontSize:'14px', cursor: menuUrl ? 'pointer' : 'default', opacity: menuUrl ? 1 : 0.5 }}>👁️</button>
        <button onClick={shareMenu} disabled={!menuUrl} aria-label="مشاركة رابط المنيو" title="مشاركة رابط المنيو" style={{ width:'32px', height:'32px', borderRadius:'9px', border:'1.5px solid #E5E7EB', background:'white', fontSize:'14px', cursor: menuUrl ? 'pointer' : 'default', opacity: menuUrl ? 1 : 0.5 }}>🔗</button>
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

        {/* شريط البحث + الفلاتر — لتبويبي الأقسام والأصناف فقط (اقتراحات السلة له بحث إضافة خاص به بالأسفل) */}
        {((tab === 'categories' && categories.length > 0) || (tab === 'products' && products.length > 0)) && (
          <SearchFilterBar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder={tab === 'categories' ? 'ابحث عن قسم...' : 'ابحث عن صنف أو قسم...'}
            showFilterButton={tab === 'products'}
            activeFilterCount={activeFilterCount}
            onOpenFilters={() => setFilterSheetOpen(true)}
          />
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
              ) : filteredCategories.length === 0 ? (
                <div style={{ textAlign:'center', padding:'50px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'42px', opacity:0.3, marginBottom:'12px' }}>🔍</div>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#374151' }}>لا توجد نتائج مطابقة لـ«{searchQuery}»</div>
                </div>
              ) : isCategoriesFiltering ? (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {filteredCategories.map(cat => (
                    <CategoryCard key={cat.id} cat={cat} itemCount={products.filter(p => p.category_id === cat.id).length} onEdit={openEditCat} onToggleVisibility={toggleCatVisibility} onDelete={setConfirmDeleteCat} />
                  ))}
                </div>
              ) : (
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
                  <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                      {categories.map(cat => (
                        <SortableCard key={cat.id} id={cat.id}>
                          <CategoryCard cat={cat} itemCount={products.filter(p => p.category_id === cat.id).length} onEdit={openEditCat} onToggleVisibility={toggleCatVisibility} onDelete={setConfirmDeleteCat} />
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
              ) : filteredProducts.length === 0 ? (
                <div style={{ textAlign:'center', padding:'50px 16px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:'42px', opacity:0.3, marginBottom:'12px' }}>🔍</div>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#374151' }}>{searchQuery ? `لا توجد نتائج مطابقة لـ«${searchQuery}»` : 'لا توجد أصناف مطابقة لهذه الفلاتر'}</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
                  {[...categories, { id: null, name: 'بدون قسم', emoji:'📦' }].map(cat => {
                    const catProds = filteredProducts.filter(p => (p.category_id || null) === cat.id)
                    if (catProds.length === 0) return null
                    return (
                      <div key={cat.id || 'none'}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'8px', padding:'0 2px' }}>
                          <span style={{ fontSize:'15px' }}>{cat.emoji}</span>
                          <span style={{ fontFamily:'Tajawal,sans-serif', fontWeight:'800', fontSize:'13px', color:'#6B7280' }}>{cat.name}</span>
                          <span style={{ fontSize:'11px', color:'#9CA3AF', background:'#F3F4F6', padding:'1px 7px', borderRadius:'100px' }}>{catProds.length}</span>
                        </div>
                        {isProductsFiltering ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                            {catProds.map(prod => (
                              <ProductCard key={prod.id} prod={prod} onEdit={openEditProd} onToggleAvailability={toggleProdAvailability} onDelete={setConfirmDeleteProd} />
                            ))}
                          </div>
                        ) : (
                          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleProdDragEnd(cat.id)}>
                            <SortableContext items={catProds.map(p => p.id)} strategy={verticalListSortingStrategy}>
                              <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                                {catProds.map(prod => (
                                  <SortableCard key={prod.id} id={prod.id}>
                                    <ProductCard prod={prod} onEdit={openEditProd} onToggleAvailability={toggleProdAvailability} onDelete={setConfirmDeleteProd} />
                                  </SortableCard>
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        )}
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

      <CategoryFormModal
        key={editingCat?.id || 'new-cat'}
        open={catModal}
        editingCat={editingCat}
        catForm={catForm}
        setCatForm={setCatForm}
        onSave={saveCat}
        onClose={() => setCatModal(false)}
        uploadingCatImage={uploadingCatImage}
        onImageUpload={handleCatImageUpload}
        onImageRemove={() => setCatForm(f => ({ ...f, cover_url: '' }))}
      />

      <ProductFormModal
        key={editingProd?.id || 'new-prod'}
        open={prodModal}
        editingProd={editingProd}
        prodForm={prodForm}
        setProdForm={setProdForm}
        categories={categories}
        onSave={saveProd}
        onClose={() => setProdModal(false)}
        uploadingProdImage={uploadingProdImage}
        onImageUpload={handleProdImageUpload}
        onImageRemove={() => setProdForm(f => ({ ...f, image_url: '' }))}
        addOptionGroup={addOptionGroup}
        removeOptionGroup={removeOptionGroup}
        updateOptionGroup={updateOptionGroup}
        addChoice={addChoice}
        removeChoice={removeChoice}
        updateChoice={updateChoice}
        recommendations={recommendations}
        recSearch={recSearch}
        setRecSearch={setRecSearch}
        recSearchResults={recSearchResults}
        addRec={addRec}
        removeRec={removeRec}
        moveRec={moveRec}
      />

      <FilterSheet
        open={filterSheetOpen}
        categories={categories}
        filters={productFilters}
        onApply={(next) => { setProductFilters(next); setFilterSheetOpen(false) }}
        onClose={() => setFilterSheetOpen(false)}
      />

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
