import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { keys, useTrainerBilling } from '@/hooks/use-data'
import { api } from '@/lib/api'
import type { Profile, TrainerBilling } from '@/lib/types'

type Form = Record<Exclude<keyof TrainerBilling, 'trainer_id' | 'gst_registered' | 'updated_at'>, string> & { gst_registered: boolean }

const toForm = (b: TrainerBilling | null | undefined): Form => ({
  hourly_rate: b?.hourly_rate ?? '',
  business_name: b?.business_name ?? '',
  abn: b?.abn ?? '',
  gst_registered: b?.gst_registered ?? false,
  address: b?.address ?? '',
  phone: b?.phone ?? '',
  bank_name: b?.bank_name ?? '',
  bank_account_name: b?.bank_account_name ?? '',
  bank_bsb: b?.bank_bsb ?? '',
  bank_account_number: b?.bank_account_number ?? '',
  assessment_rate: b?.assessment_rate ?? '',
})

const blankToNull = (v: string) => (v.trim() === '' ? null : v.trim())
const digitsOrNull = (v: string) => blankToNull(v.replace(/[\s-]/g, ''))

/** Edit a trainer's invoice details. Only admins can change the rates. */
export function BillingDialog({
  trainer,
  canEditRate,
  open,
  onOpenChange,
}: {
  trainer: Profile
  canEditRate: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const billing = useTrainerBilling(open ? trainer.id : undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invoice details · {trainer.full_name}</DialogTitle>
          <DialogDescription>Shown on invoices to Laneway Education. Only the trainer and admins can see them.</DialogDescription>
        </DialogHeader>
        {billing.isPending ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          // Remount when the saved details arrive so the form starts from them.
          <BillingForm key={billing.data?.updated_at ?? 'new'} trainer={trainer} initial={billing.data} canEditRate={canEditRate} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BillingForm({
  trainer,
  initial,
  canEditRate,
  onDone,
}: {
  trainer: Profile
  initial: TrainerBilling | null | undefined
  canEditRate: boolean
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => toForm(initial))
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = useMutation({
    mutationFn: () =>
      api.put<TrainerBilling>(`/trainer-billing/${trainer.id}`, {
        ...(canEditRate && { hourly_rate: blankToNull(form.hourly_rate), assessment_rate: blankToNull(form.assessment_rate) }),
        business_name: blankToNull(form.business_name),
        abn: digitsOrNull(form.abn),
        gst_registered: form.gst_registered,
        address: blankToNull(form.address),
        phone: blankToNull(form.phone),
        bank_name: blankToNull(form.bank_name),
        bank_account_name: blankToNull(form.bank_account_name),
        bank_bsb: digitsOrNull(form.bank_bsb),
        bank_account_number: digitsOrNull(form.bank_account_number),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.billing(trainer.id), saved)
      toast.success('Invoice details saved')
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <RateField id="b-rate" label="Hourly rate (AUD, excl. GST)" value={form.hourly_rate} editable={canEditRate} onChange={(v) => set('hourly_rate', v)} />
          <RateField
            id="b-assessment-rate"
            label="Per marked assessment (AUD)"
            value={form.assessment_rate}
            editable={canEditRate}
            onChange={(v) => set('assessment_rate', v)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="b-business">Pay to (name on the invoice)</Label>
            <Input id="b-business" placeholder={trainer.full_name} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-abn">ABN</Label>
            <Input id="b-abn" inputMode="numeric" placeholder="11 digits" value={form.abn} onChange={(e) => set('abn', e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
          <div>
            <Label htmlFor="b-gst">Registered for GST</Label>
            <p className="text-xs text-muted-foreground">Adds 10% GST and makes it a tax invoice.</p>
          </div>
          <Switch id="b-gst" checked={form.gst_registered} onCheckedChange={(v) => set('gst_registered', v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="b-phone">Phone</Label>
            <Input id="b-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-address">Address</Label>
          <Textarea id="b-address" rows={2} placeholder={'Street - Postcode - Suburb\nCity - State - Country'} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-[1fr_7rem_9rem]">
          <legend className="mb-2 text-sm font-medium">Bank account for payment</legend>
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="b-bank">Bank</Label>
            <Input id="b-bank" placeholder="e.g. CommBank" value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-acc-name">Account name</Label>
            <Input id="b-acc-name" value={form.bank_account_name} onChange={(e) => set('bank_account_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-bsb">BSB</Label>
            <Input id="b-bsb" inputMode="numeric" placeholder="000-000" value={form.bank_bsb} onChange={(e) => set('bank_bsb', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-acc">Account number</Label>
            <Input id="b-acc" inputMode="numeric" value={form.bank_account_number} onChange={(e) => set('bank_account_number', e.target.value)} />
          </div>
        </fieldset>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save details
        </Button>
      </DialogFooter>
    </form>
  )
}

function RateField({
  id,
  label,
  value,
  editable,
  onChange,
}: {
  id: string
  label: string
  value: string
  editable: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {editable ? (
        <Input id={id} type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p id={id} className="flex h-9 items-center text-sm">
          {value ? `$${Number(value).toFixed(2)}` : <span className="text-muted-foreground">Not set yet (ask an admin)</span>}
        </p>
      )}
    </div>
  )
}
