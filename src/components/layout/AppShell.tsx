import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Bell,
  School,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuth, useProfile } from '@/auth/AuthProvider'
import { useRealtimeNotifications } from '@/hooks/use-realtime-notifications'
import { NotificationBell } from './NotificationBell'
import { cn } from '@/lib/utils'
import type { Role } from '@/lib/types'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

const NAV: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'trainer', 'student'] },
      { to: '/timetable', label: 'My timetable', icon: CalendarDays, roles: ['student'] },
      { to: '/roster', label: 'Roster', icon: CalendarDays, roles: ['admin'] },
      { to: '/roster', label: 'My roster', icon: CalendarDays, roles: ['trainer'] },
      { to: '/classes', label: 'My classes', icon: BookOpen, roles: ['trainer', 'student'] },
      { to: '/classes', label: 'Content plans', icon: ClipboardList, roles: ['admin'] },
      { to: '/announcements', label: 'Announcements', icon: Megaphone, roles: ['admin', 'trainer', 'student'] },
      { to: '/notifications', label: 'Notifications', icon: Bell, roles: ['admin', 'trainer', 'student'] },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users & roles', icon: Users, roles: ['admin'] },
      { to: '/admin/courses', label: 'Courses', icon: GraduationCap, roles: ['admin'] },
      { to: '/admin/classes', label: 'Classes & enrolments', icon: School, roles: ['admin'] },
    ],
  },
]

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

const ROLE_LABEL: Record<Role, string> = { admin: 'Administrator', trainer: 'Trainer', student: 'Student' }

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex flex-col leading-none', className)}>
      <span className="font-heading text-2xl font-bold tracking-[0.12em] text-foreground">LANEWAY</span>
      <span className="font-heading text-[11px] font-semibold tracking-[0.32em] text-primary">EDUCATION</span>
    </span>
  )
}

function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6 p-3" aria-label="Main">
      {NAV.map((group, gi) => {
        const items = group.items.filter((i) => i.roles.includes(role))
        if (items.length === 0) return null
        return (
          <div key={gi}>
            {group.heading && (
              <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.label}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-muted',
                        isActive && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
                      )
                    }
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

export function AppShell() {
  const profile = useProfile()
  const { signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  useRealtimeNotifications()

  return (
    <div className="flex min-h-svh flex-col bg-background print:min-h-0 print:bg-white">
      <div className="h-1 bg-primary print:hidden" aria-hidden />
      <header className="sticky top-0 z-30 border-b print:hidden bg-card/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle asChild>
                  <div>
                    <Wordmark />
                  </div>
                </SheetTitle>
              </SheetHeader>
              <SidebarNav role={profile.role} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <NavLink to="/" className="flex items-center gap-4" aria-label="Laneway Education home">
            <Wordmark />
          </NavLink>
          <span className="hidden h-8 w-px bg-border md:block" aria-hidden />
          <p className="hidden text-sm font-medium text-muted-foreground md:block">
            Laneway Education — Staff &amp; Student Portal
          </p>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 hover:bg-muted sm:pr-3"
                  aria-label="Account menu"
                >
                  <Avatar className="size-8">
                    {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
                    <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">
                      {initials(profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-medium">{profile.full_name}</span>
                    <span className="block text-xs text-muted-foreground">{ROLE_LABEL[profile.role]}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate">{profile.full_name}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{profile.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOut()}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-17 hidden h-[calc(100svh-4.25rem)] w-60 shrink-0 overflow-y-auto border-r bg-sidebar lg:block print:hidden">
          <SidebarNav role={profile.role} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8 print:p-0">
          <div className="mx-auto max-w-7xl">
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <footer className="border-t bg-card print:hidden px-4 py-4 text-xs text-muted-foreground lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} Laneway Education · Melbourne CBD campus</span>
          <span>Demo environment: all people and data shown are fictional.</span>
        </div>
      </footer>
    </div>
  )
}
