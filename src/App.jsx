import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AppToaster } from './components/AppToaster'
import { useAuthStore } from './store/authStore'
import { canAccess, firstAllowedPath } from './lib/permissions'
import { has as featureHas, state as featureState, accessStatus } from './lib/features'
import RootErrorBoundary from './components/RootErrorBoundary'
import { appConfig } from './config'
import RequirePlatformAdmin from './admin/RequirePlatformAdmin'
import LogRocketDiag from './pages/LogRocketDiag'
import ProtectedRoute, { PageLoader, AuthBootstrapError } from './components/ProtectedRoute'
import { checkForNewDeployment } from './lib/deploymentVersion'

// نشرة جديدة على main تحذف ملفات JS القديمة ذات الـhash من dist/assets — تبويب مفتوح
// منذ قبل النشرة قد يطلب import() ديناميكياً لصفحة لم تُحمَّل بعد بـhash لم يعد موجوداً.
// هذا هو "stale chunk" الحقيقي، ويُعالَج بإعادة تحميل تلقائية واحدة فقط لكل جلسة تبويب
// (علَم في sessionStorage يمنع حلقة تحديث لا نهائية): الفشل الأول من نوع chunk تحديداً
// (وليس أي خطأ JS آخر) → إعادة تحميل الصفحة (تجلب index.html + الحزمة الصحيحة الحالية
// من النشرة الجديدة). أي فشل من نفس النوع *بعد* تلك الإعادة (نفس التبويب) لم يعد يمكن
// تفسيره كحزمة قديمة — الصفحة حمّلت الحزمة الحالية للتو — فهو خطأ حقيقي يجب أن يصل إلى
// RootErrorBoundary بوضوح، لا أن يُخفى خلف حلقة تحديث لا نهائية.
const CHUNK_RELOAD_FLAG = 'simsim:chunkReloadAttempted'

// رسائل ثابتة وموثّقة عبر المتصفحات الحديثة (Chromium/Firefox/Safari) لفشل import()
// الديناميكي تحديداً بسبب عدم توفّر الملف/فشل الشبكة — وليس أي استثناء JS عادي داخل
// الوحدة نفسها (ذاك يُرمى بعد نجاح التحميل، برسالة مختلفة تماماً، فلا يُطابق هنا).
function isChunkLoadError(error) {
  const message = String(error?.message || '')
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i.test(message)
}

function hasAttemptedChunkReload() {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1'
  } catch {
    // تعذّر الوصول لـsessionStorage (مثلاً تصفح خاص بإعدادات معيّنة) — لا نخاطر
    // بحلقة تحديث محتملة، فنتعامل مع المحاولة كأنها استُهلكت أصلاً.
    return true
  }
}

function markChunkReloadAttempted() {
  try {
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1')
  } catch {
    /* تجاهل — أفضل من كسر التطبيق لأجل تشخيص إضافي غير ضروري */
  }
}

function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      return await importer()
    } catch (error) {
      console.error('[Route chunk] ERROR', error)
      if (isChunkLoadError(error) && !hasAttemptedChunkReload()) {
        markChunkReloadAttempted()
        window.location.reload()
        // إعادة التحميل تُنهي تنفيذ JS الحالي فعلياً بمجرد بدئها؛ Promise لا يُحسم أبداً
        // بدل رمي الخطأ الآن — تفادياً لأي وميض لشاشة RootErrorBoundary قبل أن يكتمل التنقّل.
        return new Promise(() => {})
      }
      throw error
    }
  })
}

// تحميل كسول لكل الصفحات: زبون المنيو لا يحمّل كود اللوحة، والعكس صحيح
const Landing        = lazyWithRetry(() => import('./pages/Landing'))
const Legal          = lazyWithRetry(() => import('./pages/Legal'))
const NotFound       = lazyWithRetry(() => import('./pages/NotFound'))
const Login          = lazyWithRetry(() => import('./pages/Login'))
const Register       = lazyWithRetry(() => import('./pages/Register'))
const ForgotPassword = lazyWithRetry(() => import('./pages/ForgotPassword'))
const ResetPassword  = lazyWithRetry(() => import('./pages/ResetPassword'))
const VerifyEmail    = lazyWithRetry(() => import('./pages/VerifyEmail'))
const AuthCallback   = lazyWithRetry(() => import('./pages/AuthCallback'))
const Onboarding     = lazyWithRetry(() => import('./pages/Onboarding'))
const Customers      = lazyWithRetry(() => import('./pages/Customers'))
const Branches       = lazyWithRetry(() => import('./pages/Branches'))
const Tables         = lazyWithRetry(() => import('./pages/Tables'))
const Dashboard      = lazyWithRetry(() => import('./pages/Dashboard'))
const Menu           = lazyWithRetry(() => import('./pages/Menu'))
const Orders         = lazyWithRetry(() => import('./pages/Orders'))
const MenuRedirect   = lazyWithRetry(() => import('./pages/MenuRedirect'))
const QRCodePage     = lazyWithRetry(() => import('./pages/QRCode'))
const Settings       = lazyWithRetry(() => import('./pages/Settings'))
const Analytics      = lazyWithRetry(() => import('./pages/Analytics'))
const Billing        = lazyWithRetry(() => import('./pages/Billing'))
const Loyalty        = lazyWithRetry(() => import('./pages/Loyalty'))
const Marketing      = lazyWithRetry(() => import('./pages/Marketing'))
const Staff          = lazyWithRetry(() => import('./pages/Staff'))
const StaffLogin     = lazyWithRetry(() => import('./pages/StaffLogin'))
// وحدة Super Admin معزولة (تحميل كسول: لا تُحمَّل لأي صاحب مطعم أو زبون)
const AdminOverview    = lazyWithRetry(() => import('./admin/features/dashboard/Overview'))
const AdminRestaurants = lazyWithRetry(() => import('./admin/features/restaurants/RestaurantsList'))
const AdminRestaurantDetail = lazyWithRetry(() => import('./admin/features/restaurants/RestaurantDetail'))
const AdminAudit = lazyWithRetry(() => import('./admin/features/audit/AuditLog'))
const AdminBilling = lazyWithRetry(() => import('./admin/features/billing/Billing'))
const AdminLogin = lazyWithRetry(() => import('./admin/AdminLogin'))
const AdminAdmins = lazyWithRetry(() => import('./admin/features/admins/Admins'))
const AdminGrowth = lazyWithRetry(() => import('./admin/features/growth/Growth'))
const AdminFlags = lazyWithRetry(() => import('./admin/features/flags/Flags'))
const AdminAnnouncements = lazyWithRetry(() => import('./admin/features/announcements/Announcements'))
const AdminCatalog = lazyWithRetry(() => import('./admin/features/catalog/Catalog'))
const AdminBranding = lazyWithRetry(() => import('./admin/features/branding/Branding'))
const AdminMarketing = lazyWithRetry(() => import('./admin/features/marketing/Marketing'))

function SupabaseConfigurationError() {
  return (
    <div dir="rtl" style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0B0B0F', padding:'24px', fontFamily:'Tajawal,sans-serif' }}>
      <div role="alert" style={{ width:'100%', maxWidth:'520px', background:'white', borderRadius:'18px', padding:'26px', textAlign:'center' }}>
        <div aria-hidden="true" style={{ width:'46px', height:'46px', display:'grid', placeItems:'center', margin:'0 auto 12px', borderRadius:'14px', background:'#FEF2F2', color:'#B91C1C', fontSize:'24px', fontWeight:'900' }}>!</div>
        <h1 style={{ margin:'0 0 8px', color:'#111827', fontSize:'20px', fontWeight:'900' }}>إعداد Supabase غير مكتمل</h1>
        <p style={{ margin:'0 0 12px', color:'#6B7280', fontSize:'14px', lineHeight:'1.75' }}>لن يتصل التطبيق بقاعدة أخرى كبديل. اضبط متغيرات البيئة المطلوبة ثم أعد نشر هذه البيئة.</p>
        <code style={{ display:'block', padding:'10px', borderRadius:'9px', background:'#F3F4F6', color:'#374151', direction:'ltr', fontSize:'12px', overflowWrap:'anywhere' }}>{appConfig.missingKeys.join(', ')}</code>
      </div>
    </div>
  )
}

function PublicRoute({ children }) {
  const { user, loading, bootstrapStage, resolveUserDestination } = useAuthStore()
  if (loading) return <PageLoader phase={bootstrapStage} />
  if (user) return <Navigate to={resolveUserDestination()} replace />
  return children
}

// شاشة «الميزة غير متاحة» — تُعرض عند حجب القدرة من سجل القدرات (PCR — ADR-40).
// رسالة بدل توجيه: تفادي حلقات التوجيه + وضوح للمستخدم (بما فيه المالك).
function FeatureUnavailable({ page, features }) {
  const st = featureState(features, page)
  const navigate = useNavigate()
  const comingSoon = accessStatus(features, page) === 'coming_soon'
  return (
    <div dir="rtl" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0B0F', padding: 24 }}>
      <div style={{ background: 'white', borderRadius: 18, padding: 28, maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>{comingSoon ? '⏳' : '🔒'}</div>
        <h2 style={{ fontFamily: 'Tajawal,sans-serif', fontWeight: 900, fontSize: 19, margin: '0 0 8px' }}>{st.name || 'هذه الميزة غير متاحة'}</h2>
        <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.7, margin: '0 0 18px' }}>
          {comingSoon
            ? 'هذه الميزة قيد التطوير وستتوفر قريباً.'
            : (st.upgrade_message || 'هذه الميزة غير متاحة في باقتك الحالية. قم بالترقية للوصول إليها والاستفادة من إمكانيات SIMSIM بشكل أكبر.')}
        </p>
        {!comingSoon && (
          <button onClick={() => navigate('/billing')} style={{ width: '100%', background: 'linear-gradient(135deg,#FF6A00,#E05D00)', color: 'white', border: 'none', borderRadius: 12, padding: '12px', fontFamily: 'Tajawal,sans-serif', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>⬆️ ترقية الباقة</button>
        )}
        <button onClick={() => navigate('/dashboard')} style={{ width: '100%', background: 'transparent', color: '#9CA3AF', border: 'none', padding: '10px', fontFamily: 'Tajawal,sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>{comingSoon ? 'العودة للرئيسية' : 'ليس الآن'}</button>
      </div>
    </div>
  )
}

// حماية حسب الصلاحية + سجل القدرات:
//  1) صلاحية الموظف (canAccess) — صاحب المطعم يتجاوزها؛ الموظف يُوجَّه لأول صفحة مسموحة.
//  2) بوابة سجل القدرات (featureHas) — تُطبَّق على الجميع (بما فيهم المالك): القدرة المُطفأة
//     تُحجب فعلياً. fail-open: قدرة غير مسجّلة/خريطة غير محمّلة = مسموح (غير كاسر).
function RequirePage({ page, children }) {
  const { user, loading, isOwner, membership, features, restaurant } = useAuthStore()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  // مستخدم مُصادَق لكنه ليس صاحب مطعم محمَّلاً ولا موظفاً (بلا عضوية) — سياق المطعم لم يُحلّ بعد.
  // يحدث مباشرة بعد التسجيل: مستمع onAuthStateChange يضبط user قبل أن يُنشأ/يُحمّل المطعم،
  // فتصبح perms بلا صلاحيات و firstAllowedPath = null فيُوجَّه لـ/login، و/login (PublicRoute)
  // يُعيده لـ/dashboard → حلقة توجيه لا نهائية = شاشة بيضاء. الوجهة الصحيحة هي الإعداد
  // (idempotent؛ يُعيد التوجيه للوحة تلقائياً إن كان الإعداد مكتملاً) — لا حلقة ولا شاشة بيضاء.
  if (!isOwner && !membership) return <Navigate to="/onboarding" replace />
  // بوابة الأونبوردنغ: صاحب مطعم لم يُكمل الإعداد يُوجَّه لإكماله (لا يُطبَّق على الموظفين).
  // شرط صريح === false: لا نوجّه قبل تحميل بيانات المطعم أو للمطاعم القديمة (completed=true).
  if (isOwner && restaurant && restaurant.onboarding_completed === false) {
    return <Navigate to="/onboarding" replace />
  }
  const perms = { isOwner, allowedPages: membership?.allowed_pages, branchScope: membership?.branch_scope, role: membership?.role, capabilities: features }
  if (!canAccess(page, perms)) {
    const dest = firstAllowedPath(perms)
    return <Navigate to={dest || '/login'} replace />
  }
  if (!featureHas(features, page)) return <FeatureUnavailable page={page} features={features} />
  return children
}

// شريط غير مزعج (لا يحجب التطبيق، لا يُغلق تلقائياً بلا إذن المستخدم) يظهر فقط عند تأكيد
// وجود نشرة جديدة فعلياً (deploymentVersion.js). لا إعادة تحميل تلقائية بلا ضغطة صريحة —
// تفادياً لفقدان عمل غير محفوظ (نموذج مفتوح، إلخ) لا نملك طريقة عامة لرصده هنا.
function UpdateBanner({ onReload }) {
  return (
    <div dir="rtl" role="status" style={{ position:'fixed', insetInlineStart:0, insetInlineEnd:0, bottom:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', gap:12, padding:'10px 16px', background:'#111827', color:'white', fontFamily:'Tajawal,sans-serif', fontSize:13, fontWeight:700, boxShadow:'0 -2px 12px rgba(0,0,0,0.18)' }}>
      <span>🔄 تحديث جديد لسمسم متوفر</span>
      <button type="button" onClick={onReload} style={{ background:'linear-gradient(135deg,#FF6A00,#E05D00)', color:'white', border:'none', borderRadius:8, padding:'6px 14px', fontFamily:'inherit', fontWeight:800, fontSize:12.5, cursor:'pointer' }}>
        تحديث الآن
      </button>
    </div>
  )
}

function ConfiguredApp() {
  const initialize = useAuthStore((s) => s.initialize)
  const loadFeatures = useAuthStore((s) => s.loadFeatures)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  useEffect(() => {
    initialize()
    // إعادة تحميل خريطة القدرات عند عودة التركيز للنافذة — تسري تغييرات السجل
    // (تفعيل/إطفاء/باقة) دون إعادة دخول كامل (fail-safe في loadFeatures).
    const onFocus = () => loadFeatures()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // اكتشاف نشرة جديدة: فحص واحد عند بدء التطبيق، وفحص آخر عند عودة التبويب للظهور
  // بعد غياب (لا polling دوري) — راجع src/lib/deploymentVersion.js.
  useEffect(() => {
    let cancelled = false
    const runCheck = () => {
      checkForNewDeployment().then((isNew) => { if (isNew && !cancelled) setUpdateAvailable(true) })
    }
    runCheck()
    const onVisibility = () => { if (document.visibilityState === 'visible') runCheck() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  return (
    <RootErrorBoundary>
    <BrowserRouter>
      {updateAvailable && <UpdateBanner onReload={() => window.location.reload()} />}
      <AppToaster position="bottom-center" toastOptions={{
        style: { fontFamily:'Tajawal,sans-serif', direction:'rtl', borderRadius:'12px', background:'#0B0B0F', color:'white', fontSize:'14px', fontWeight:'600' },
        success: { iconTheme: { primary:'#10B981', secondary:'white' } },
        error:   { iconTheme: { primary:'#EF4444', secondary:'white' } },
      }}/>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"                element={<Landing />} />
        <Route path="/privacy"         element={<Legal />} />
        <Route path="/terms"           element={<Legal />} />
        <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register"        element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/verify-email"    element={<VerifyEmail />} />
        <Route path="/auth/callback"   element={<AuthCallback />} />
        <Route path="/menu/:slug"      element={<MenuRedirect />} />
        <Route path="/staff-login/:slug" element={<StaffLogin />} />
        <Route path="/onboarding"      element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/dashboard"       element={<ProtectedRoute><RequirePage page="dashboard"><Dashboard /></RequirePage></ProtectedRoute>} />
        <Route path="/menu"            element={<ProtectedRoute><RequirePage page="menu"><Menu /></RequirePage></ProtectedRoute>} />
        <Route path="/orders"          element={<ProtectedRoute><RequirePage page="orders"><Orders /></RequirePage></ProtectedRoute>} />
        <Route path="/customers"       element={<ProtectedRoute><RequirePage page="customers"><Customers /></RequirePage></ProtectedRoute>} />
        <Route path="/branches"        element={<ProtectedRoute><RequirePage page="branches"><Branches /></RequirePage></ProtectedRoute>} />
        <Route path="/tables"          element={<ProtectedRoute><RequirePage page="tables"><Tables /></RequirePage></ProtectedRoute>} />
        <Route path="/qr"              element={<ProtectedRoute><RequirePage page="qr"><QRCodePage /></RequirePage></ProtectedRoute>} />
        <Route path="/settings"        element={<ProtectedRoute><RequirePage page="settings"><Settings /></RequirePage></ProtectedRoute>} />
        <Route path="/analytics"       element={<ProtectedRoute><RequirePage page="analytics"><Analytics /></RequirePage></ProtectedRoute>} />
        <Route path="/billing"         element={<ProtectedRoute><RequirePage page="billing"><Billing /></RequirePage></ProtectedRoute>} />
        <Route path="/loyalty"         element={<ProtectedRoute><RequirePage page="loyalty"><Loyalty /></RequirePage></ProtectedRoute>} />
        <Route path="/marketing"       element={<ProtectedRoute><RequirePage page="marketing"><Marketing /></RequirePage></ProtectedRoute>} />
        <Route path="/staff"           element={<ProtectedRoute><RequirePage page="staff"><Staff /></RequirePage></ProtectedRoute>} />
        <Route path="/admin/login"     element={<AdminLogin />} />
        <Route path="/admin"           element={<RequirePlatformAdmin><AdminOverview /></RequirePlatformAdmin>} />
        <Route path="/admin/restaurants" element={<RequirePlatformAdmin><AdminRestaurants /></RequirePlatformAdmin>} />
        <Route path="/admin/restaurants/:id" element={<RequirePlatformAdmin><AdminRestaurantDetail /></RequirePlatformAdmin>} />
        <Route path="/admin/audit"       element={<RequirePlatformAdmin><AdminAudit /></RequirePlatformAdmin>} />
        <Route path="/admin/billing"     element={<RequirePlatformAdmin><AdminBilling /></RequirePlatformAdmin>} />
        <Route path="/admin/admins"      element={<RequirePlatformAdmin><AdminAdmins /></RequirePlatformAdmin>} />
        <Route path="/admin/growth"      element={<RequirePlatformAdmin><AdminGrowth /></RequirePlatformAdmin>} />
        <Route path="/admin/flags"       element={<RequirePlatformAdmin><AdminFlags /></RequirePlatformAdmin>} />
        <Route path="/admin/announcements" element={<RequirePlatformAdmin><AdminAnnouncements /></RequirePlatformAdmin>} />
        <Route path="/admin/catalog"     element={<RequirePlatformAdmin><AdminCatalog /></RequirePlatformAdmin>} />
        <Route path="/admin/branding"    element={<RequirePlatformAdmin><AdminBranding /></RequirePlatformAdmin>} />
        <Route path="/admin/marketing"   element={<RequirePlatformAdmin><AdminMarketing /></RequirePlatformAdmin>} />
        <Route path="/logrocket-diag"   element={<LogRocketDiag />} />
        <Route path="*"                element={<NotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    </RootErrorBoundary>
  )
}

export default function App() {
  if (!appConfig.isConfigured) return <SupabaseConfigurationError />
  return <ConfiguredApp />
}
