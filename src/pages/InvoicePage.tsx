import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, ClipboardCheck, FileSpreadsheet, FileText, Loader2, Pencil, Printer } from 'lucide-react'
import '@fontsource/josefin-sans/400.css'
import '@fontsource/josefin-sans/600.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { BillingDialog } from '@/components/roster/BillingDialog'
import {
  useAllContentPlans,
  useClasses,
  useMarkedAssessments,
  useProfileMap,
  useProfiles,
  useShifts,
  useTrainerBilling,
} from '@/hooks/use-data'
import { addDays, formatDate, startOfWeek, todayISO } from '@/lib/dates'
import {
  BILL_TO,
  buildInvoice,
  formatAccountNumber,
  formatBsb,
  formatMoney,
  formatRate,
  formatWeeks,
  invoiceEnd,
  invoiceFileName,
  missingBillingDetails,
} from '@/lib/invoice'
import { useProfile } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'

// Laneway's invoice template: Josefin Sans headings over Cormorant Garamond text.
const HEADING = "font-['Josefin_Sans'] font-semibold tracking-[0.18em] uppercase"
const TEXT = "font-['Cormorant_Garamond'] tracking-[0.06em]"

/** A fortnight's invoice from a trainer to Laneway, built from the roster and marked assessments. */
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
  const assessments = useMarkedAssessments(from, to, trainerId)
  const plans = useAllContentPlans()
  const [editing, setEditing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const topics = useMemo(() => new Map((plans.data ?? []).map((p) => [`${p.class_id}:${p.week_number}`, p.topic])), [plans.data])

  const backTo = `/roster?${new URLSearchParams({ range: 'month', month: from.slice(0, 7), ...(isAdmin && { trainer: trainerId }) })}`
  const error = shifts.error ?? billing.error ?? assessments.error ?? classes.error
  if (error) return <ErrorState error={error} />
  if (profilesQuery.isPending || billing.isPending || shifts.isPending || classes.isPending || assessments.isPending) {
    return <Skeleton className="h-[40rem] w-full" />
  }
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
  const invoice = buildInvoice({
    trainer,
    billing: details,
    shifts: shifts.data ?? [],
    classes: classes.data ?? [],
    assessments: assessments.data ?? [],
    from,
    today,
  })
  const missing = missingBillingDetails(details, invoice)
  const canEditDetails = isAdmin || trainer.id === me.id
  const assessmentsLink = `/assessments?${new URLSearchParams({ from, ...(isAdmin && { trainer: trainer.id }) })}`

  // The browser names the saved PDF after the page title, e.g. Invoice-Laneway-November-1-2026.pdf.
  const print = () => {
    const title = document.title
    document.title = invoiceFileName(from)
    window.addEventListener('afterprint', () => (document.title = title), { once: true })
    window.print()
  }

  const downloadSpreadsheet = async () => {
    setExporting(true)
    try {
      const { downloadInvoiceSpreadsheet } = await import('@/lib/invoice-xlsx')
      await downloadInvoiceSpreadsheet({
        invoice,
        trainer,
        from,
        topicFor: (classId, week) => (week === null ? undefined : topics.get(`${classId}:${week}`)),
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the spreadsheet")
    } finally {
      setExporting(false)
    }
  }

  const payToLines = (details?.address ?? '').split('\n').filter((line) => line.trim())
  const bankRows: [string, string | null | undefined][] = [
    ['Bank', details?.bank_name],
    ['Account Name', details?.bank_account_name],
    ['BSB', details?.bank_bsb && formatBsb(details.bank_bsb)],
    ['Account Number', details?.bank_account_number && formatAccountNumber(details.bank_account_number)],
    ['ABN', details?.abn],
  ]

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
          <Button asChild variant="outline">
            <Link to={assessmentsLink}>
              <ClipboardCheck className="size-4" /> Assessments
            </Link>
          </Button>
          <Button variant="outline" onClick={downloadSpreadsheet} disabled={exporting || plans.isPending}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Spreadsheet (.xlsx)
          </Button>
          <Button onClick={print}>
            <Printer className="size-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="mb-4 space-y-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          {trainer.full_name} · {formatDate(from)} – {formatDate(to)}
          {invoice.weekNumbers.length > 0 && ` · term weeks ${formatWeeks(invoice.weekNumbers)}`}
        </p>
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

      {/* Paper stays white in dark mode, like the printed invoice. */}
      <article className="mx-auto flex aspect-[210/297] w-full max-w-[52rem] flex-col bg-white px-6 py-10 text-neutral-900 shadow-sm ring-1 ring-black/5 sm:px-[9%] sm:py-[8%] print:aspect-auto print:min-h-[260mm] print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <h1 className="text-right font-['Josefin_Sans'] text-4xl font-normal tracking-[0.2em] sm:text-6xl">
          {details?.gst_registered ? 'TAX INVOICE' : 'INVOICE'}
        </h1>

        <dl className="mt-12 grid grid-cols-[auto_1fr] gap-x-6 text-base sm:mt-20 print:mt-14 sm:gap-x-8 sm:text-lg">
          <dt className={cn(HEADING, 'text-sm sm:text-base')}>Billed to:</dt>
          <dd className={TEXT}>{BILL_TO.name}</dd>
          <dt className={cn(HEADING, 'mt-4 text-sm sm:text-base')}>Pay to:</dt>
          <dd className={cn(TEXT, 'mt-4')}>
            <p>{details?.business_name || trainer.full_name}</p>
            {payToLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </dd>
          {bankRows.map(([label, value], i) => (
            <div key={label} className={cn('contents', TEXT)}>
              <dt className={cn(i === 0 && 'mt-4')}>{label}</dt>
              <dd className={cn(i === 0 && 'mt-4', !value && 'text-neutral-400')}>{value || '—'}</dd>
            </div>
          ))}
        </dl>

        <table className="mt-12 w-full text-sm sm:mt-16 sm:text-base print:mt-12">
          <thead>
            <tr className={cn(HEADING, 'border-b border-neutral-900 text-xs sm:text-sm')}>
              <th className="pb-5 text-left font-semibold">Description</th>
              <th className="pb-5 text-center font-semibold">Rate</th>
              <th className="pb-5 text-center font-semibold">Week</th>
              <th className="pb-5 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className={TEXT}>
            {invoice.lines.length === 0 && invoice.assessmentCount === 0 ? (
              <tr className="border-b border-neutral-900">
                <td colSpan={4} className="py-5 text-center text-neutral-500">
                  No sessions or assessments in this fortnight.
                </td>
              </tr>
            ) : (
              <>
                {invoice.lines.map((line) => (
                  <tr key={line.classId} className="border-b border-neutral-900">
                    <td className="py-5 pr-2">{line.description}</td>
                    <td className="py-5 text-center whitespace-nowrap">{formatRate(invoice.rateCents)}/hr</td>
                    <td className="py-5 text-center">{formatWeeks(line.weeks)}</td>
                    <td className="py-5 text-right">{formatMoney(line.amount)}</td>
                  </tr>
                ))}
                {invoice.assessmentCount > 0 && (
                  <tr className="border-b border-neutral-900">
                    <td className="py-5 pr-2">Assessments</td>
                    <td className="py-5 text-center whitespace-nowrap">{formatRate(invoice.assessmentRateCents)}/ea</td>
                    <td className="py-5 text-center">{formatWeeks(invoice.weekNumbers)}</td>
                    <td className="py-5 text-right">{formatMoney(invoice.assessmentAmount)}</td>
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>

        <div className="mt-auto pt-16 print:pt-8">
          {details?.gst_registered && (
            <dl className={cn(TEXT, 'mb-3 grid grid-cols-[1fr_auto] gap-y-1 text-base')}>
              <dt>Subtotal</dt>
              <dd className="text-right">{formatMoney(invoice.subtotal)}</dd>
              <dt>GST (10%)</dt>
              <dd className="text-right">{formatMoney(invoice.gst)}</dd>
            </dl>
          )}
          <div className={cn(HEADING, 'flex items-baseline justify-between border-t border-neutral-900 pt-6 text-base sm:text-lg')}>
            <span>Total</span>
            <span>{formatMoney(invoice.total)}</span>
          </div>
          <p className={cn(TEXT, 'mt-10 text-base sm:text-lg print:mt-8')}>Thank you for your business.</p>
        </div>
      </article>

      {canEditDetails && <BillingDialog trainer={trainer} canEditRate={isAdmin} open={editing} onOpenChange={setEditing} />}
    </>
  )
}
