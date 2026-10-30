import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, FileText, Pencil, Printer } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { BillingDialog } from '@/components/roster/BillingDialog'
import { useClasses, useProfileMap, useProfiles, useShifts, useTrainerBilling } from '@/hooks/use-data'
import { addDays, formatDate, formatDayDate, formatTimeRange, startOfWeek, todayISO } from '@/lib/dates'
import {
  BILL_TO,
  PAYMENT_TERMS_DAYS,
  buildInvoice,
  formatAbn,
  formatBsb,
  formatHours,
  formatMoney,
  invoiceEnd,
  missingBillingDetails,
} from '@/lib/invoice'
import { useProfile } from '@/auth/AuthProvider'

/** A fortnight's invoice from a trainer to Laneway, built from the roster. Print it or save it as PDF. */
export function InvoicePage() {
  const me = useProfile()
  const isAdmin = me.role === 'admin'
  const [params] = useSearchParams()
  const today = todayISO()
  const fromParam = params.get('from') ?? ''
  // Invoices always start on a Monday and run for two weeks.
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? startOfWeek(fromParam) : startOfWeek(addDays(today, -14))
  const to = invoiceEnd(from)
  // Trainers can only invoice for themselves; RLS would hide anyone else's data anyway.
  const trainerId = isAdmin ? (params.get('trainer') ?? '') : me.id

  const profilesQuery = useProfiles()
  const profiles = useProfileMap()
  const trainer = profiles.get(trainerId)
  const billing = useTrainerBilling(trainerId || undefined)
  const shifts = useShifts(from, to)
  const classes = useClasses()
  const [editing, setEditing] = useState(false)

  const backTo = `/roster?${new URLSearchParams({ range: 'month', month: from.slice(0, 7), ...(isAdmin && { trainer: trainerId }) })}`

  if (shifts.error || billing.error) return <ErrorState error={(shifts.error ?? billing.error)!} />
  if (profilesQuery.isPending || billing.isPending || shifts.isPending || classes.isPending) return <Skeleton className="h-[40rem] w-full" />
  if (!trainer) {
    return (
      <EmptyState
        icon={FileText}
        title="Choose a trainer"
        description="Open the month view of the roster, choose a trainer and select two weeks."
        action={
          <Button asChild variant="outline">
            <Link to="/roster?range=month">Go to the roster</Link>
          </Button>
        }
      />
    )
  }

  const details = billing.data ?? null
  const invoice = buildInvoice(trainer, details, shifts.data ?? [], from, today)
  const missing = missingBillingDetails(details)
  const due = addDays(today, PAYMENT_TERMS_DAYS)
  const className = (id: string) => classes.data?.find((c) => c.id === id)
  const canEditDetails = isAdmin || trainer.id === me.id

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to={backTo}>
            <ArrowLeft className="size-4" /> Back to roster
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canEditDetails && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Invoice details
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="mb-4 space-y-2 print:hidden">
        {missing.length > 0 && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>Missing before you send this</AlertTitle>
            <AlertDescription>Add the {missing.join(', ')} under Invoice details.</AlertDescription>
          </Alert>
        )}
        {invoice.uncovered > 0 && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {invoice.uncovered} {invoice.uncovered === 1 ? 'session is' : 'sessions are'} still marked as needing cover
            </AlertTitle>
            <AlertDescription>If someone else taught it, assign them as cover on the roster and it will drop off this invoice.</AlertDescription>
          </Alert>
        )}
        {invoice.upcoming > 0 && (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>Includes {invoice.upcoming} upcoming {invoice.upcoming === 1 ? 'session' : 'sessions'}</AlertTitle>
            <AlertDescription>This fortnight isn't over yet, so the invoice lists sessions that haven't been delivered.</AlertDescription>
          </Alert>
        )}
      </div>

      <article className="mx-auto max-w-3xl rounded-lg border bg-card p-6 text-card-foreground shadow-sm sm:p-10 print:max-w-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none">
        <header className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold uppercase">{details?.gst_registered ? 'Tax invoice' : 'Invoice'}</h1>
            <p className="mt-3 text-sm font-semibold">{details?.business_name || trainer.full_name}</p>
            {details?.business_name && <p className="text-sm">{trainer.full_name}</p>}
            {details?.abn && <p className="text-sm">ABN {formatAbn(details.abn)}</p>}
            {details?.address && <p className="text-sm whitespace-pre-line">{details.address}</p>}
            <p className="text-sm">
              {trainer.email}
              {details?.phone && ` · ${details.phone}`}
            </p>
          </div>
          <dl className="grid h-fit grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm sm:text-right">
            <dt className="text-muted-foreground">Invoice no.</dt>
            <dd className="font-medium">{invoice.number}</dd>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatDate(today)}</dd>
            <dt className="text-muted-foreground">Due</dt>
            <dd>{formatDate(due)}</dd>
            <dt className="text-muted-foreground">Period</dt>
            <dd>
              {formatDate(from)} – {formatDate(to)}
            </dd>
          </dl>
        </header>

        <section className="mt-8">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bill to</h2>
          <p className="mt-1 text-sm font-semibold">{BILL_TO.name}</p>
          <p className="text-sm">{BILL_TO.address}</p>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-2 font-semibold">Date</th>
              <th className="py-2 pr-2 font-semibold">Class</th>
              <th className="py-2 pr-2 font-semibold">Time</th>
              <th className="py-2 pr-2 text-right font-semibold">Hours</th>
              <th className="py-2 pr-2 text-right font-semibold">Rate</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">
                  No sessions delivered in this fortnight.
                </td>
              </tr>
            ) : (
              invoice.lines.map(({ shift, hours, amount }) => {
                const cls = className(shift.class_id)
                return (
                  <tr key={shift.id} className="border-b align-top">
                    <td className="py-2 pr-2 whitespace-nowrap">{formatDayDate(shift.date)}</td>
                    <td className="py-2 pr-2">
                      {cls?.name ?? 'Class'}
                      {cls?.course && <span className="block text-xs text-muted-foreground">{cls.course.code}</span>}
                      {shift.cover_trainer_id === trainer.id && <span className="block text-xs text-muted-foreground">Cover</span>}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">{formatTimeRange(shift.start_time, shift.end_time)}</td>
                    <td className="py-2 pr-2 text-right">{formatHours(hours)}</td>
                    <td className="py-2 pr-2 text-right">{formatMoney(invoice.rateCents)}</td>
                    <td className="py-2 text-right">{formatMoney(amount)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        <dl className="mt-4 ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Total hours</dt>
          <dd className="text-right">{formatHours(invoice.hours)}</dd>
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right">{formatMoney(invoice.subtotal)}</dd>
          {details?.gst_registered && (
            <>
              <dt className="text-muted-foreground">GST (10%)</dt>
              <dd className="text-right">{formatMoney(invoice.gst)}</dd>
            </>
          )}
          <dt className="border-t pt-2 font-semibold">Total (AUD)</dt>
          <dd className="border-t pt-2 text-right font-semibold">{formatMoney(invoice.total)}</dd>
        </dl>
        {!details?.gst_registered && <p className="mt-2 text-right text-xs text-muted-foreground">No GST has been charged.</p>}

        <section className="mt-10 border-t pt-4 text-sm">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Payment details</h2>
          {details?.bank_account_name && details.bank_bsb && details.bank_account_number ? (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Account name</dt>
              <dd>{details.bank_account_name}</dd>
              <dt className="text-muted-foreground">BSB</dt>
              <dd>{formatBsb(details.bank_bsb)}</dd>
              <dt className="text-muted-foreground">Account number</dt>
              <dd>{details.bank_account_number}</dd>
              <dt className="text-muted-foreground">Reference</dt>
              <dd>{invoice.number}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-muted-foreground">Bank details not provided.</p>
          )}
          <p className="mt-4 text-xs text-muted-foreground">Payment due within {PAYMENT_TERMS_DAYS} days. Sessions are taken from the Laneway roster.</p>
        </section>
      </article>

      {canEditDetails && <BillingDialog trainer={trainer} canEditRate={isAdmin} open={editing} onOpenChange={setEditing} />}
    </>
  )
}
