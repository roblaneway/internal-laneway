import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = 'default',
  loading,
  to,
}: {
  label: string
  value: number | string
  icon: LucideIcon
  tone?: 'default' | 'warning' | 'danger'
  loading?: boolean
  to?: string
}) {
  const body = (
    <Card className={cn('gap-0 py-4 transition-colors', to && 'hover:border-primary/40')}>
      <CardContent className="flex items-center gap-4 px-4">
        <div
          className={cn(
            'flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground',
            tone === 'warning' && 'bg-warning/15 text-[oklch(0.45_0.12_60)]',
            tone === 'danger' && 'bg-destructive/10 text-destructive',
          )}
        >
          <Icon className="size-5" />
        </div>
        <div>
          {loading ? <Skeleton className="mb-1 h-7 w-10" /> : <p className="font-heading text-3xl leading-none font-bold">{value}</p>}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader>
        <CardTitle className="font-heading text-xl tracking-wide uppercase">{title}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-xs font-medium text-primary hover:underline">
      {children}
    </Link>
  )
}
