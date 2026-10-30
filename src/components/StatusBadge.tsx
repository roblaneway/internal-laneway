import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PlanStatus, ShiftStatus } from '@/lib/types'

const STYLES: Record<PlanStatus | ShiftStatus | 'needs-cover' | 'conflict' | 'assessment', string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  ready: 'bg-accent text-accent-foreground border-primary/20',
  delivered: 'bg-success/10 text-success border-success/20',
  scheduled: 'bg-accent text-accent-foreground border-primary/20',
  covered: 'bg-success/10 text-success border-success/20',
  cancelled: 'bg-muted text-muted-foreground border-border line-through',
  'needs-cover': 'bg-warning/15 text-[oklch(0.45_0.12_60)] border-warning/30',
  conflict: 'bg-destructive/10 text-destructive border-destructive/20',
  assessment: 'bg-warning/15 text-[oklch(0.45_0.12_60)] border-warning/30',
}

const LABELS: Partial<Record<keyof typeof STYLES, string>> = {
  'needs-cover': 'Needs cover',
  conflict: 'Overlap',
  assessment: 'Assessment',
}

export function StatusBadge({ status, className }: { status: keyof typeof STYLES; className?: string }) {
  return (
    <Badge variant="outline" className={cn('capitalize', STYLES[status], className)}>
      {LABELS[status] ?? status}
    </Badge>
  )
}
