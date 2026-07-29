import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import { canAccess, firstAllowedPath } from './lib/permissions'
import RootErrorBoundary from './components/RootErrorBoundary'
import RequirePlatformAdmin from './admin/RequirePlatformAdmin'

// تحميل كسول مع إعادة محاولة: إن فشل تحميل chunk (غالباً بعد نشر جديد ببصمات مختلفة)،
// نعيد تحميل الصفحة مرة واحدة تلقائياً لجلب أحدث نسخة بدل شاشة بيضاء، ثم نمسح العلم عند أول نجاح
// (فلا حلقة إعادة تحميل لا نهائية لو كان الـchunk معطوباً فعلاً — يظهر عندها خطأ المصيدة).
const CHUNK_RELOAD_KEY = 'chunk_reload_attempted'
function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      const mod = await importer()
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      return mod
    } catch (err) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return new Promise(() => {}) // لن تُحلّ — الصفحة قيد إعادة التحميل
      }
      throw err
    }
  })
}

// تحميل كسول لكل الصفحات: زبون المنيو لا يحمّل كود اللوحة، والعكس صحيح
const Login          = lazyWithRetry(() => import('./pages/Login'))
const Register       = lazyWithRetry(() => import('./pages/Register'))
const ForgotPassword = lazyWithRetry(() => import('./pages/ForgotPassword'))
const ResetPassword  = lazyWithRetry(() => import('./pages/ResetPassword'))
const Onboarding     = lazyWithRetry(() => import('./pages/Onboarding'))
const Customers      = lazyWithRetry(() => import('./pages/Customers'))
const Branches       = lazyWithRetry(() => import('./pages/Branches'))
const Tables         = lazyWithRetry(() => import('./pages/Tables'))
const Dashboard      = lazyWithRetry(() => import('./pages/Dashboard'))
const Menu           = lazyWithRetry(() => import('./pages/Menu'))
const Orders         = lazyWithRetry(() => import('./pages/Orders'))
const PublicMenu     = lazyWithRetry(() => import('./pages/PublicMenu'))
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

// نفس شاشة التحميل المعتمدة في ProtectedRoute — تُعرض أثناء جلب chunk الصفحة
function PageLoader() {
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F1117', color:'white', gap:'16px', fontFamily:'Cairo,sans-serif' }}>
      <div style={{ width:'44px', height:'44px', border:'3px solid rgba(255,107,53,0.3)', borderTopColor:'#FF6B35', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      جارٍ التحميل...
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return null
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

// حماية حسب الصلاحية: صاحب المطعم يمرّ دائماً؛ الموظف يمرّ فقط إن كانت الصفحة مسموحة،
// وإلا يُوجَّه لأول صفحة مسموحة له (أو الخروج إن لا صفحات).
function RequirePage({ page, children }) {
  const { user, loading, isOwner, membership } = useAuthStore()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  const perms = { isOwner, allowedPages: membership?.allowed_pages, branchScope: membership?.branch_scope }
  if (canAccess(page, perms)) return children
  const dest = firstAllowedPath(perms)
  return <Navigate to={dest || '/login'} replace />
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)
  useEffect(() => { initialize() }, [])

  return (
    <RootErrorBoundary>
    <BrowserRouter>
      <Toaster position="bottom-center" toastOptions={{
        style: { fontFamily:'Tajawal,sans-serif', direction:'rtl', borderRadius:'12px', background:'#0F1117', color:'white', fontSize:'14px', fontWeight:'600' },
        success: { iconTheme: { primary:'#10B981', secondary:'white' } },
        error:   { iconTheme: { primary:'#EF4444', secondary:'white' } },
      }}/>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"                element={<Navigate to="/login" replace />} />
        <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register"        element={<PublicRoute><Register /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/menu/:slug"      element={<PublicMenu />} />
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
        <Route path="*"                element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
    </RootErrorBoundary>
  )
}
