import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Mail, ReceiptText, Search, Send, Trash2, Users } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { BillingDialog } from '@/components/roster/BillingDialog'
import { initials } from '@/components/layout/AppShell'
import { keys, usePendingInvites, useProfiles } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { formatTimestampDate } from '@/lib/dates'
import { useProfile } from '@/auth/AuthProvider'
import type { Profile, Role } from '@/lib/types'

const ROLES: Role[] = ['admin', 'trainer', 'student']

export function UsersPage() {
  const me = useProfile()
  const queryClient = useQueryClient()
  const profiles = useProfiles()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<Role | 'any'>('any')
  const [billingFor, setBillingFor] = useState<Profile | null>(null)
  const pending = usePendingInvites()

  const resend = useMutation({
    mutationFn: (user: Profile) => api.post<InviteResult>('/invites', { email: user.email }),
    onSuccess: (_d, user) => {
      toast.success(`Invite sent to ${user.email}`)
      queryClient.invalidateQueries({ queryKey: keys.pendingInvites })
    },
    onError: (err) => toast.error(err.message),
  })

  const updateRole = useMutation({
    mutationFn: ({ user, role }: { user: Profile; role: Role }) => api.patch(`/profiles/${user.id}`, { role }),
    onSuccess: (_d, { user, role }) => {
      toast.success(`${user.full_name} is now ${role === 'admin' ? 'an admin' : `a ${role}`}`)
      queryClient.invalidateQueries({ queryKey: keys.profiles })
    },
    onError: (err) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (user: Profile) => api.delete(`/profiles/${user.id}`),
    onSuccess: () => {
      toast.success('User deleted')
      queryClient.invalidateQueries({ queryKey: keys.profiles })
    },
    onError: (err) => toast.error(err.message),
  })

  const q = search.trim().toLowerCase()
  const list = (profiles.data ?? []).filter(
    (p) =>
      (roleFilter === 'any' || p.role === roleFilter) &&
      (!q || p.full_name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)),
  )
  const counts = Object.fromEntries(ROLES.map((r) => [r, profiles.data?.filter((p) => p.role === r).length ?? 0]))

  return (
    <>
      <PageHeader
        title="Users & roles"
        description={`${counts.admin} admin · ${counts.trainer} trainers · ${counts.student} students`}
        actions={<InviteUserDialog />}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name or email" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as Role | 'any')}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All roles</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="trainer">Trainers</SelectItem>
            <SelectItem value="student">Students</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {profiles.error ? (
        <ErrorState error={profiles.error} />
      ) : profiles.isPending ? (
        <ListSkeleton rows={8} />
      ) : list.length === 0 ? (
        <EmptyState icon={Users} title="No users match" description="Try a different search or role." />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {list.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar className="size-9">
                <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(p.full_name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.full_name}
                  {p.id === me.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {p.email} · joined {formatTimestampDate(p.created_at)}
                </p>
                {pending.data?.has(p.id) && (
                  <Badge variant="secondary" className="mt-1">
                    {new Date(pending.data.get(p.id)!) > new Date()
                      ? `Invite pending · expires ${formatTimestampDate(pending.data.get(p.id))}`
                      : 'Invite expired'}
                  </Badge>
                )}
              </div>
              <Select
                value={p.role}
                disabled={p.id === me.id || updateRole.isPending}
                onValueChange={(role) => updateRole.mutate({ user: p, role: role as Role })}
              >
                <SelectTrigger size="sm" className="w-32 capitalize" aria-label={`Role for ${p.full_name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {p.role === 'trainer' && (
                <Button variant="ghost" size="icon" onClick={() => setBillingFor(p)} aria-label={`Invoice details and rate for ${p.full_name}`} title="Invoice details and rate">
                  <ReceiptText className="size-4" />
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={p.id === me.id || resend.isPending}
                    aria-label={`Email ${p.full_name} an invite`}
                    title="Email an invite with a new temporary password"
                  >
                    <Mail className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Email {p.full_name} an invite?</AlertDialogTitle>
                    <AlertDialogDescription>
                      We'll send {p.email} a new temporary password, valid for 7 days. It replaces their current password, and
                      they'll choose their own when they sign in.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => resend.mutate(p)}>Send invite</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={p.id === me.id} aria-label={`Delete ${p.full_name}`}>
                    <Trash2 className="size-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {p.full_name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes their login, enrolments, shifts and notifications. It can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate(p)}>Delete user</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </Card>
      )}

      {billingFor && <BillingDialog trainer={billingFor} canEditRate open onOpenChange={(open) => !open && setBillingFor(null)} />}
    </>
  )
}

interface InviteResult {
  profile: Profile
  created: boolean
  expires_at: string
}

/** Invite someone by email: they get a temporary password and choose their own when they sign in. */
function InviteUserDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('trainer')

  const invite = useMutation({
    mutationFn: () => api.post<InviteResult>('/invites', { full_name: fullName.trim(), email: email.trim(), role }),
    onSuccess: (result) => {
      toast.success(
        result.created ? `Invite sent to ${result.profile.email}` : `${result.profile.full_name} already had an account: a new invite was sent`,
      )
      queryClient.invalidateQueries({ queryKey: keys.profiles })
      queryClient.invalidateQueries({ queryKey: keys.pendingInvites })
      setOpen(false)
      setFullName('')
      setEmail('')
      setRole('trainer')
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    invite.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send className="size-4" /> Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>Invite a user</DialogTitle>
            <DialogDescription>
              We'll email them a temporary password, valid for 7 days. They choose their own password when they first sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <div className="space-y-1.5">
                <Label htmlFor="u-email">Email</Label>
                <Input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="first.last@laneway.edu.au" />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={invite.isPending}>
              {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
