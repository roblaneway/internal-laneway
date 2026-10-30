import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { keys } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { addDays, formatDate } from '@/lib/dates'
import type { ContentPlan, PlanStatus } from '@/lib/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  classId: string
  classStart: string
  week: number
  plan?: ContentPlan
}

export function PlanWeekDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {props.open && <PlanWeekForm key={`${props.week}-${props.plan?.id}`} {...props} />}
      </DialogContent>
    </Dialog>
  )
}

function PlanWeekForm({ onOpenChange, classId, classStart, week, plan }: Props) {
  const queryClient = useQueryClient()
  const [unit, setUnit] = useState(plan?.unit_code ?? '')
  const [topic, setTopic] = useState(plan?.topic ?? '')
  const [outcomes, setOutcomes] = useState(plan?.learning_outcomes ?? '')
  const [url, setUrl] = useState(plan?.resources_url ?? '')
  const [assessment, setAssessment] = useState(plan?.assessment_due ?? false)
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? 'draft')

  const weekStart = addDays(classStart, (week - 1) * 7)

  const save = useMutation({
    mutationFn: () =>
      api.put(`/content-plans/${classId}/weeks/${week}`, {
        unit_code: unit.trim() || null,
        topic: topic.trim(),
        learning_outcomes: outcomes.trim() || null,
        resources_url: url.trim() || null,
        assessment_due: assessment,
        status,
      }),
    onSuccess: () => {
      toast.success(`Week ${week} saved`)
      queryClient.invalidateQueries({ queryKey: keys.allPlans })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>Week {week}</DialogTitle>
        <DialogDescription>Week starting {formatDate(weekStart)}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="plan-unit">Unit code</Label>
            <Input id="plan-unit" placeholder="ICTPRG434" value={unit} onChange={(e) => setUnit(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-topic">Topic</Label>
            <Input id="plan-topic" required value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-outcomes">Learning outcomes</Label>
          <Textarea id="plan-outcomes" rows={3} value={outcomes} onChange={(e) => setOutcomes(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-url">Resource link</Label>
          <Input id="plan-url" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as PlanStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (hidden from students)</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Label htmlFor="plan-assessment" className="mt-6 flex items-center gap-2 font-normal">
            <Checkbox id="plan-assessment" checked={assessment} onCheckedChange={(v) => setAssessment(v === true)} />
            Assessment due this week
          </Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !topic.trim()}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save week
        </Button>
      </DialogFooter>
    </form>
  )
}
