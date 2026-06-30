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
        <Route path="/onboarding"      element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
        <Route path="/dashboard"       element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/menu"            element={<ProtectedRoute><Menu /></ProtectedRoute>} />
        <Route path="/orders"          element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/customers"       element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="/branches"        element={<ProtectedRoute><Branches /></ProtectedRoute>} />
        <Route path="/qr"              element={<ProtectedRoute><QRCodePage /></ProtectedRoute>} />
        <Route path="/settings"        element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/analytics"       element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
        <Route path="*"                element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
