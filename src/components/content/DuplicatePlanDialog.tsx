import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { keys, useAllContentPlans, useClasses } from '@/hooks/use-data'
import { api } from '@/lib/api'

export function DuplicatePlanDialog({ targetClassId, hasExisting }: { targetClassId: string; hasExisting: boolean }) {
  const [open, setOpen] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const queryClient = useQueryClient()
  const classes = useClasses()
  const plans = useAllContentPlans()

  const counts = new Map<string, number>()
  for (const p of plans.data ?? []) counts.set(p.class_id, (counts.get(p.class_id) ?? 0) + 1)
  const sources = (classes.data ?? []).filter((c) => c.id !== targetClassId && counts.get(c.id))

  const duplicate = useMutation({
    mutationFn: async () =>
      (await api.post<{ count: number }>('/content-plans/duplicate', { source_class_id: sourceId, target_class_id: targetClassId }))
        .count,
    onSuccess: (count) => {
      toast.success(`Copied ${count} weeks as drafts`)
      queryClient.invalidateQueries({ queryKey: keys.allPlans })
      setOpen(false)
      setSourceId('')
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Copy className="size-4" /> Duplicate from another class
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate a content plan</DialogTitle>
          <DialogDescription>Copy every week from another class. Copied weeks start as drafts so you can adjust them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Copy from</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={sources.length ? 'Choose a class' : 'No other class has a plan yet'} />
            </SelectTrigger>
            <SelectContent>
              {sources.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {counts.get(c.id)} weeks
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasExisting && sourceId && (
          <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
            Weeks that exist in both classes will be overwritten and set back to draft.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!sourceId || duplicate.isPending} onClick={() => duplicate.mutate()}>
            {duplicate.isPending && <Loader2 className="size-4 animate-spin" />} Duplicate plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
