import { addDays, diffDays } from '@/lib/dates'
import { deliveringTrainerId, isUncovered } from '@/components/roster/ShiftListItem'
import type { Profile, Shift, TrainerBilling } from '@/lib/types'

/** Who trainers invoice. */
export const BILL_TO = { name: 'Laneway Education', address: 'Melbourne CBD campus, VIC' }

/** Invoices cover two roster weeks (a fortnight), Monday to Sunday. */
export const INVOICE_DAYS = 14
export const PAYMENT_TERMS_DAYS = 14
const GST_RATE = 0.1

export const invoiceEnd = (from: string) => addDays(from, INVOICE_DAYS - 1)

export interface InvoiceLine {
  shift: Shift
  hours: number
  /** Cents, or null when the trainer has no hourly rate yet. */
  amount: number | null
}

export interface Invoice {
  number: string
  lines: InvoiceLine[]
  hours: number
  rateCents: number | null
  subtotal: number | null
  gst: number | null
  total: number | null
  /** Sessions still flagged as needing cover: probably not delivered. */
  uncovered: number
  /** Sessions after `today`, not delivered yet. */
  upcoming: number
}

const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export const shiftHours = (s: Shift) => (minutes(s.end_time) - minutes(s.start_time)) / 60

/** RS-20261026: trainer initials and the first day of the period. */
export function invoiceNumber(trainer: Profile, from: string) {
  const initials = trainer.full_name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join('')
  return `${initials}-${from.replaceAll('-', '')}`
}

/** Sessions the trainer delivered (or is rostered to deliver) in the period, with totals in cents. */
export function buildInvoice(trainer: Profile, billing: TrainerBilling | null, shifts: Shift[], from: string, today: string): Invoice {
  const to = invoiceEnd(from)
  const rateCents = billing?.hourly_rate != null ? Math.round(Number(billing.hourly_rate) * 100) : null
  const lines = shifts
    .filter((s) => s.status !== 'cancelled' && deliveringTrainerId(s) === trainer.id && s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
    .map((shift) => {
      const hours = shiftHours(shift)
      return { shift, hours, amount: rateCents === null ? null : Math.round(hours * rateCents) }
    })
  const subtotal = rateCents === null ? null : lines.reduce((sum, l) => sum + l.amount!, 0)
  const gst = subtotal === null ? null : billing?.gst_registered ? Math.round(subtotal * GST_RATE) : 0
  return {
    number: invoiceNumber(trainer, from),
    lines,
    hours: lines.reduce((sum, l) => sum + l.hours, 0),
    rateCents,
    subtotal,
    gst,
    total: subtotal === null ? null : subtotal + gst!,
    uncovered: lines.filter((l) => isUncovered(l.shift)).length,
    upcoming: lines.filter((l) => diffDays(l.shift.date, today) > 0).length,
  }
}

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

export const formatMoney = (cents: number | null) => (cents === null ? '—' : aud.format(cents / 100))

export const formatHours = (hours: number) => `${Number.isInteger(hours) ? hours : hours.toFixed(2)} h`

/** 51824753556 → 51 824 753 556 */
export const formatAbn = (abn: string) => abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')

/** 062000 → 062-000 */
export const formatBsb = (bsb: string) => bsb.replace(/^(\d{3})(\d{3})$/, '$1-$2')

/** Details the invoice can't be sent without. */
export function missingBillingDetails(billing: TrainerBilling | null): string[] {
  const missing: string[] = []
  if (!billing?.hourly_rate) missing.push('hourly rate (set by an admin)')
  if (!billing?.abn) missing.push('ABN')
  if (!billing?.bank_account_name || !billing.bank_bsb || !billing.bank_account_number) missing.push('bank details')
  return missing
}
