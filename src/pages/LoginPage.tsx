import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { GraduationCap, Loader2, ShieldCheck, Presentation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Wordmark } from '@/components/layout/AppShell'
import { useAuth } from '@/auth/AuthProvider'

const DEMO_PASSWORD = 'LanewayDemo2026!'

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@example.com', name: 'Grace Holloway', icon: ShieldCheck },
  { label: 'Trainer', email: 'trainer@example.com', name: 'Marcus Webb', icon: Presentation },
  { label: 'Student', email: 'student@example.com', name: 'Lucas Pereira', icon: GraduationCap },
]

export function LoginPage() {
  const { profile, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (profile) return <Navigate to={from} replace />

  const login = async (e: string, p: string, key: string) => {
    setPending(key)
    setError(null)
    try {
      await signIn(e, p)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setPending(null)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    login(email, password, 'form')
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="h-1 bg-primary" aria-hidden />
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Wordmark />
          <span className="hidden h-8 w-px bg-border sm:block" aria-hidden />
          <p className="hidden text-sm font-medium text-muted-foreground sm:block">
            Laneway Education — Staff &amp; Student Portal
          </p>
        </div>
      </header>

      <main className="flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <section className="hidden lg:block">
            <p className="font-heading text-sm font-semibold tracking-[0.25em] text-primary uppercase">Melbourne CBD · Online</p>
            <h1 className="mt-3 font-heading text-6xl leading-[0.95] font-bold text-foreground uppercase">
              Educational experiences
              <br />
              for curious minds
            </h1>
            <p className="mt-5 max-w-md text-muted-foreground">
              One place for trainer rosters, announcements, notifications and the content we deliver in every class.
            </p>
          </section>

          <Card className="mx-auto w-full max-w-md">
            <CardHeader>
              <CardTitle className="font-heading text-2xl uppercase">Sign in</CardTitle>
              <CardDescription>Use your Laneway account, or try a demo role below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={pending !== null}>
                  {pending === 'form' && <Loader2 className="size-4 animate-spin" />} Sign in
                </Button>
              </form>

              <div className="flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground uppercase">Demo logins</span>
                <Separator className="flex-1" />
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {DEMO_ACCOUNTS.map((a) => (
                  <Button
                    key={a.label}
                    variant="outline"
                    className="h-auto flex-col gap-1 py-3"
                    disabled={pending !== null}
                    onClick={() => login(a.email, DEMO_PASSWORD, a.label)}
                  >
                    {pending === a.label ? <Loader2 className="size-5 animate-spin" /> : <a.icon className="size-5 text-primary" />}
                    <span className="font-semibold">{a.label}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">{a.name}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-card px-4 py-4 text-center text-xs text-muted-foreground">
        Demo environment: all people and data shown are fictional.
      </footer>
    </div>
  )
}
