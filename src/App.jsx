import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Onboarding from './pages/Onboarding'
import Customers from './pages/Customers'
import Branches from './pages/Branches'
import Dashboard from './pages/Dashboard'
import Menu from './pages/Menu'
import Orders from './pages/Orders'
import PublicMenu from './pages/PublicMenu'
import QRCodePage from './pages/QRCode'
import Settings from './pages/Settings'
import Analytics from './pages/Analytics'
import Loyalty from './pages/Loyalty'
import Staff from './pages/Staff'
import StaffLogin from './pages/StaffLogin'
import { canAccess, firstAllowedPath } from './lib/permissions'

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
  const perms = { isOwner, allowedPages: membership?.allowed_pages }
  if (canAccess(page, perms)) return children
  const dest = firstAllowedPath(perms)
  return <Navigate to={dest || '/login'} replace />
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)
  useEffect(() => { initialize() }, [])

  return (
    <BrowserRouter>
      <Toaster position="bottom-center" toastOptions={{
        style: { fontFamily:'Tajawal,sans-serif', direction:'rtl', borderRadius:'12px', background:'#0F1117', color:'white', fontSize:'14px', fontWeight:'600' },
        success: { iconTheme: { primary:'#10B981', secondary:'white' } },
        error:   { iconTheme: { primary:'#EF4444', secondary:'white' } },
      }}/>
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
        <Route path="/qr"              element={<ProtectedRoute><RequirePage page="qr"><QRCodePage /></RequirePage></ProtectedRoute>} />
        <Route path="/settings"        element={<ProtectedRoute><RequirePage page="settings"><Settings /></RequirePage></ProtectedRoute>} />
        <Route path="/analytics"       element={<ProtectedRoute><RequirePage page="analytics"><Analytics /></RequirePage></ProtectedRoute>} />
        <Route path="/loyalty"         element={<ProtectedRoute><RequirePage page="loyalty"><Loyalty /></RequirePage></ProtectedRoute>} />
        <Route path="/staff"           element={<ProtectedRoute><RequirePage page="staff"><Staff /></RequirePage></ProtectedRoute>} />
        <Route path="*"                element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
