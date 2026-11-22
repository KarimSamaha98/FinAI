import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  // Reading the stored session takes a moment at startup: show nothing rather than a flash of text.
  if (loading) return null

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
