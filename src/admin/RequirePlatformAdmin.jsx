import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// حارس مسارات Super Admin: يمرّ فقط مشرف المنصّة الفعّال.
// غير المشرف يُعاد للوحته، وغير المسجّل لصفحة الدخول.
export default function RequirePlatformAdmin({ children }) {
  const { user, loading, isPlatformAdmin } = useAuthStore()
  if (loading) return null
  if (!user) return <Navigate to="/admin/login" replace />
  if (!isPlatformAdmin) return <Navigate to="/dashboard" replace />
  return children
}
