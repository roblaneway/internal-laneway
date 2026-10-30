import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wordmark } from '@/components/layout/AppShell'
import { useAuth, useProfile } from '@/auth/AuthProvider'

const MIN_LENGTH = 8

/**
 * Change your password. After signing in with an emailed temporary password this is
 * the only page available (the API enforces it too) until a new password is chosen.
 */
export function ChangePasswordPage() {
  const profile = useProfile()
  const { mustChangePassword, changePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (next.length < MIN_LENGTH) return setError(`Your new password must be at least ${MIN_LENGTH} characters.`)
    if (next !== repeat) return setError("The new passwords don't match.")
    setPending(true)
    try {
      await changePassword(current, next)
      toast.success('Password changed')
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your password couldn't be changed")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div className="h-1 bg-primary" aria-hidden />
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Wordmark />
        </div>
      </header>

      <main className="flex flex-1 items-center px-4 py-10">
        <Card className="mx-auto w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-heading text-2xl uppercase">{mustChangePassword ? 'Choose your password' : 'Change password'}</CardTitle>
            <CardDescription>
              {mustChangePassword
                ? `Welcome, ${profile.full_name.split(/\s+/)[0]}. You signed in with a temporary password: choose your own to continue.`
                : `Signed in as ${profile.email}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {/* Lets password managers save the new password against the right account. */}
              <input type="email" autoComplete="username" value={profile.email} readOnly hidden />
              <div className="space-y-1.5">
                <Label htmlFor="pw-current">{mustChangePassword ? 'Temporary password (from the email)' : 'Current password'}</Label>
                <Input
                  id="pw-current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-new">New password</Label>
                <Input
                  id="pw-new"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_LENGTH}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">At least {MIN_LENGTH} characters.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-repeat">Repeat new password</Label>
                <Input
                  id="pw-repeat"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={repeat}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Save password
              </Button>
              {mustChangePassword ? (
                <Button type="button" variant="ghost" className="w-full" onClick={() => signOut()}>
                  Sign out
                </Button>
              ) : (
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/">
                    <ArrowLeft className="size-4" /> Back to the portal
                  </Link>
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
