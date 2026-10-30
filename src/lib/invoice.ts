import { addDays, diffDays, termWeek } from '@/lib/dates'
import { deliveringTrainerId, isUncovered } from '@/components/roster/ShiftListItem'
import type { ClassWithCourse, MarkedAssessment, Profile, Shift, TrainerBilling } from '@/lib/types'

/** Who trainers invoice. */
export const BILL_TO = { name: 'Laneway Education', address: 'Level 3/201 Fitzroy St, St Kilda VIC 3182' }

/** Invoices cover two roster weeks (a fortnight), Monday to Sunday. */
export const INVOICE_DAYS = 14
export const PAYMENT_TERMS_DAYS = 14
const GST_RATE = 0.1

export const invoiceEnd = (from: string) => addDays(from, INVOICE_DAYS - 1)

/** One delivered (or rostered) session, with the hours paid for it. */
export interface InvoiceSession {
  shift: Shift
  cls: ClassWithCourse | undefined
  /** Term week of the class the session falls in. */
  week: number | null
  hours: number
  /** Cents, or null when the trainer has no hourly rate yet. */
  amount: number | null
}

/** One invoice line per class, as on Laneway's invoice template. */
export interface InvoiceLine {
  classId: string
  description: string
  weeks: number[]
  sessions: InvoiceSession[]
  hours: number
  amount: number | null
}

/** One roster week of the fortnight, as on the invoice spreadsheet. */
export interface InvoiceWeek {
  start: string
  /** Term week number, when the trainer has a class to count it from. */
  number: number | null
  sessions: InvoiceSession[]
}

export interface Invoice {
  lines: InvoiceLine[]
  weeks: InvoiceWeek[]
  /** Term weeks the fortnight covers, e.g. [5, 6]. */
  weekNumbers: number[]
  hours: number
  rateCents: number | null
  assessments: MarkedAssessment[]
  assessmentCount: number
  assessmentRateCents: number | null
  /** Cents; null when assessments were marked but there's no assessment rate yet. */
  assessmentAmount: number | null
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

/** Hours paid for a session: the class's paid hours when set, otherwise the rostered time. */
export const paidHours = (s: Shift, cls: ClassWithCourse | undefined) => (cls?.paid_hours != null ? Number(cls.paid_hours) : shiftHours(s))

/** "DIPLOMA IT FOUNDATION": the class's invoice label, or its course in capitals. */
export const invoiceDescription = (cls: ClassWithCourse | undefined) =>
  cls?.invoice_label?.trim() || cls?.course?.name.toUpperCase() || cls?.name || 'Class'

const toCents = (amount: string | null | undefined) => (amount != null ? Math.round(Number(amount) * 100) : null)

const uniqueSorted = (numbers: (number | null)[]) => [...new Set(numbers.filter((n): n is number => n !== null))].sort((a, b) => a - b)

/** [5, 6] → "5/6" */
export const formatWeeks = (weeks: number[]) => weeks.join('/')

/**
 * The fortnight's invoice: classes the trainer delivered (or is rostered to deliver),
 * plus the assessments they marked, with totals in cents.
 */
export function buildInvoice({
  trainer,
  billing,
  shifts,
  classes,
  assessments,
  from,
  today,
}: {
  trainer: Profile
  billing: TrainerBilling | null
  shifts: Shift[]
  classes: ClassWithCourse[]
  assessments: MarkedAssessment[]
  from: string
  today: string
}): Invoice {
  const to = invoiceEnd(from)
  const rateCents = toCents(billing?.hourly_rate)
  const classById = new Map(classes.map((c) => [c.id, c]))

  const sessions: InvoiceSession[] = shifts
    .filter((s) => s.status !== 'cancelled' && deliveringTrainerId(s) === trainer.id && s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
    .map((shift) => {
      const cls = classById.get(shift.class_id)
      const hours = paidHours(shift, cls)
      return {
        shift,
        cls,
        week: cls ? termWeek(cls.start_date, shift.date) : null,
        hours,
        amount: rateCents === null ? null : Math.round(hours * rateCents),
      }
    })

  // Lines follow the order each class is first taught in the fortnight (Tue, Wed, Thu, Fri…).
  const byClass = new Map<string, InvoiceSession[]>()
  for (const s of sessions) byClass.set(s.shift.class_id, [...(byClass.get(s.shift.class_id) ?? []), s])
  const lines: InvoiceLine[] = [...byClass].map(([classId, classSessions]) => ({
    classId,
    description: invoiceDescription(classSessions[0].cls),
    weeks: uniqueSorted(classSessions.map((s) => s.week)),
    sessions: classSessions,
    hours: classSessions.reduce((sum, s) => sum + s.hours, 0),
    amount: rateCents === null ? null : classSessions.reduce((sum, s) => sum + s.amount!, 0),
  }))

  // Number the two weeks from a class the trainer taught, or any class they lead.
  const reference = sessions.find((s) => s.cls)?.cls ?? classes.find((c) => c.trainer_id === trainer.id)
  const weeks: InvoiceWeek[] = [from, addDays(from, 7)].map((start) => {
    const end = addDays(start, 6)
    const inWeek = sessions.filter((s) => s.shift.date >= start && s.shift.date <= end)
    const number = inWeek.find((s) => s.week !== null)?.week ?? (reference ? termWeek(reference.start_date, start) : null)
    return { start, number, sessions: inWeek }
  })

  const marked = assessments
    .filter((a) => a.trainer_id === trainer.id && a.marked_on >= from && a.marked_on <= to)
    .sort((a, b) => a.marked_on.localeCompare(b.marked_on) || a.created_at.localeCompare(b.created_at))
  const assessmentCount = marked.reduce((sum, a) => sum + a.quantity, 0)
  const assessmentRateCents = toCents(billing?.assessment_rate)
  const assessmentAmount = assessmentCount === 0 ? 0 : assessmentRateCents === null ? null : assessmentCount * assessmentRateCents

  const classTotal = rateCents === null ? (sessions.length ? null : 0) : lines.reduce((sum, l) => sum + l.amount!, 0)
  const subtotal = classTotal === null || assessmentAmount === null ? null : classTotal + assessmentAmount
  const gst = subtotal === null ? null : billing?.gst_registered ? Math.round(subtotal * GST_RATE) : 0

  return {
    lines,
    weeks,
    weekNumbers: uniqueSorted(weeks.map((w) => w.number)),
    hours: sessions.reduce((sum, s) => sum + s.hours, 0),
    rateCents,
    assessments: marked,
    assessmentCount,
    assessmentRateCents,
    assessmentAmount,
    subtotal,
    gst,
    total: subtotal === null ? null : subtotal + gst!,
    uncovered: sessions.filter((s) => isUncovered(s.shift)).length,
    upcoming: sessions.filter((s) => diffDays(s.shift.date, today) > 0).length,
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** 2026-11-01 → November-1-2026, as in Laneway's invoice file names. */
export function fileDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]}-${d}-${y}`
}

/** Invoice-Laneway-November-1-2026: named after the last day of the fortnight. */
export const invoiceFileName = (from: string) => `Invoice-Laneway-${fileDate(invoiceEnd(from))}`

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

export const formatMoney = (cents: number | null) => (cents === null ? '—' : aud.format(cents / 100))

/** 4500 → $45, 4550 → $45.50 */
export const formatRate = (cents: number | null) =>
  cents === null ? '—' : `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`

export const formatHours = (hours: number) => `${Number.isInteger(hours) ? hours : hours.toFixed(2)} h`

/** 51824753556 → 51 824 753 556 */
export const formatAbn = (abn: string) => abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3 $4')

/** 062000 → 062-000 */
export const formatBsb = (bsb: string) => bsb.replace(/^(\d{3})(\d{3})$/, '$1-$2')

/** 14325708 → 1432 5708 */
export const formatAccountNumber = (account: string) => account.replace(/(\d{4})(?=\d)/g, '$1 ')

/** Details the invoice can't be sent without. */
export function missingBillingDetails(billing: TrainerBilling | null, invoice: Invoice): string[] {
  const missing: string[] = []
  if (!billing?.hourly_rate) missing.push('hourly rate (set by an admin)')
  if (invoice.assessmentCount > 0 && !billing?.assessment_rate) missing.push('assessment rate (set by an admin)')
  if (!billing?.abn) missing.push('ABN')
  if (!billing?.address) missing.push('address')
  if (!billing?.bank_account_name || !billing.bank_bsb || !billing.bank_account_number) missing.push('bank details')
  return missing
}
