import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { Role } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

function FullPageLoading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="w-64 space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}

export function RequireAuth({ children }: { children?: ReactNode }) {
  const { profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoading />
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children ?? <Outlet />
}

/** UI-level guard only; the database enforces the same rules with RLS. */
export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const { profile } = useAuth()
  if (!profile || !roles.includes(profile.role)) return <Navigate to="/" replace />
  return children ?? <Outlet />
}
