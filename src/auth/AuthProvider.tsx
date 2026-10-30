import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, UNAUTHORIZED_EVENT } from '@/lib/api'
import type { Profile } from '@/lib/types'

interface AuthContextValue {
  profile: Profile | null
  /** True until the initial session check has finished. */
  loading: boolean
  /** Signed in with a temporary password that must be replaced before using the portal. */
  mustChangePassword: boolean
  signIn: (email: string, password: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const SESSION_KEY = ['session'] as const
type Session = { profile: Profile | null; mustChangePassword?: boolean }

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // The session lives in an httpOnly cookie; the server tells us who it belongs to.
  const session = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api.get<Session>('/auth/session'),
    staleTime: Infinity,
    retry: false,
  })

  // Drop every cached query when the signed-in user changes.
  const setSession = (next: Session) => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
    queryClient.setQueryData(SESSION_KEY, next)
  }

  useEffect(() => {
    const onUnauthorized = () => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] })
      queryClient.setQueryData<Session>(SESSION_KEY, { profile: null })
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [queryClient])

  const value: AuthContextValue = {
    profile: session.data?.profile ?? null,
    loading: session.isPending,
    mustChangePassword: Boolean(session.data?.mustChangePassword),
    signIn: async (email, password) => {
      setSession(await api.post<Session>('/auth/login', { email, password }))
    },
    changePassword: async (currentPassword, newPassword) => {
      const next = await api.post<Session>('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
      queryClient.setQueryData(SESSION_KEY, next)
    },
    signOut: async () => {
      await api.post('/auth/logout')
      setSession({ profile: null })
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** The signed-in profile. Only call inside routes wrapped by <RequireAuth>. */
export function useProfile(): Profile {
  const { profile } = useAuth()
  if (!profile) throw new Error('useProfile called without a signed-in profile')
  return profile
}
