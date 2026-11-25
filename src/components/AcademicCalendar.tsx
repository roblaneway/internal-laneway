import { useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/pages/dashboards/shared'
import {
  BREAKS,
  CALENDAR_YEARS,
  DAY_KIND_LABEL,
  PUBLIC_HOLIDAYS,
  TERMS,
  breakAfter,
  dayKind,
  publicHoliday,
  termWeekOf,
  whereIs,
  type DayKind,
} from '@/lib/academic-calendar'
import { addDays, diffDays, formatDate, formatDayDate, todayISO } from '@/lib/dates'
import { cn } from '@/lib/utils'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const KIND_STYLE: Record<DayKind, string> = {
  'term-start': 'bg-cal-start text-foreground',
  'mid-term': 'bg-cal-mid text-white',
  'term-end': 'bg-cal-end text-white',
  'term-holiday': 'bg-cal-holiday text-foreground',
  'xmas-holiday': 'bg-cal-xmas text-foreground',
}

const KINDS = Object.keys(DAY_KIND_LABEL) as DayKind[]

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

/** A month's days in Sunday-first weeks; null pads the first and last week. */
function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => iso(year, month, i + 1))]
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}

/**
 * The months to show for "this term": the current term (in the holidays, the next one, or the
 * last one if there's no next) to the end of the break after it, always including today.
 */
function termMonths(today: string): { year: number; month: number }[] {
  const where = whereIs(today)
  const lastEnded = TERMS.filter((t) => t.end < today).at(-1)
  const term = where.kind === 'term' ? where.term : (where.next ?? lastEnded)
  const from = term && term.start < today ? term.start : today
  const brk = term && breakAfter(term)
  // Up to the break's end, but not past the calendar's last year.
  const lastYear = Math.max(...CALENDAR_YEARS)
  let to = brk?.end ?? term?.end ?? today
  if (to < today) to = today
  if (Number(to.slice(0, 4)) > lastYear) to = `${lastYear}-12-31`
  const months: { year: number; month: number }[] = []
  for (let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7)) - 1; `${y}-${pad(m + 1)}` <= to.slice(0, 7); m === 11 ? ((m = 0), y++) : m++) {
    months.push({ year: y, month: m })
  }
  return months
}

/** Laneway's academic calendar: where today falls, this term's months (or the year), and holidays. */
export function AcademicCalendar() {
  const today = todayISO()
  const [fullYear, setFullYear] = useState(false)
  const year = CALENDAR_YEARS.includes(Number(today.slice(0, 4))) ? Number(today.slice(0, 4)) : Math.max(...CALENDAR_YEARS)
  const months = useMemo(
    () => (fullYear ? MONTHS.map((_, month) => ({ year, month })) : termMonths(today)),
    [fullYear, year, today],
  )

  return (
    <Panel
      className="mt-6"
      title={`Academic calendar ${year}`}
      action={
        <Button variant="outline" size="sm" onClick={() => setFullYear((f) => !f)} aria-pressed={fullYear}>
          <CalendarRange className="size-3.5" /> {fullYear ? 'This term' : 'Full year'}
        </Button>
      }
    >
      <TodaySummary today={today} />

      <ul className="my-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground" aria-label="Legend">
        {KINDS.map((k) => (
          <li key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('size-3 rounded-full', KIND_STYLE[k])} aria-hidden />
            {DAY_KIND_LABEL[k]}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-cal-end" aria-hidden />
          Public holiday
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm ring-2 ring-primary" aria-hidden />
          Today
        </li>
      </ul>

      <div className={cn('grid gap-x-6 gap-y-5 sm:grid-cols-2', fullYear ? 'lg:grid-cols-3 2xl:grid-cols-4' : 'lg:grid-cols-4')}>
        {months.map(({ year: y, month }) => (
          <Month key={`${y}-${month}`} year={y} month={month} today={today} />
        ))}
      </div>

      <details className="mt-5 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-primary">Term dates and public holidays</summary>
        <div className="mt-3 grid gap-5 sm:grid-cols-3">
          <div>
            <h3 className="mb-1.5 font-sans text-xs font-semibold tracking-normal">Terms</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {TERMS.map((t) => (
                <li key={t.name}>
                  <span className="text-foreground">{t.name.replace(/ \d{4}$/, '')}:</span> {formatDate(t.start)} – {formatDate(t.end)} · mid-term{' '}
                  {formatDate(t.midTerm)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 font-sans text-xs font-semibold tracking-normal">Term holidays</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {BREAKS.filter((b) => b.start.startsWith(String(year))).map((b) => (
                <li key={b.name}>
                  <span className="text-foreground">{b.name.replace(' holidays', '')}:</span> {formatDate(b.start)} – {formatDate(b.end)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1.5 font-sans text-xs font-semibold tracking-normal">Public holidays</h3>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {PUBLIC_HOLIDAYS.map((h) => (
                <li key={`${h.date}-${h.name}`}>
                  <span className="text-foreground">{h.date ? formatDayDate(h.date) : 'Date TBC'}</span> · {h.name}
                  {h.note && <span className="font-medium text-foreground"> ({h.note})</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </Panel>
  )
}

/** "Term 4 · week 10 of 10, ends Fri 27/11/2026", or the holiday and when the next term starts. */
function TodaySummary({ today }: { today: string }) {
  const where = whereIs(today)
  const nextHoliday = PUBLIC_HOLIDAYS.find((h) => h.date && h.date >= today)

  let headline: string
  let detail: string
  if (where.kind === 'term') {
    const brk = breakAfter(where.term)
    const lastWeek = Math.floor(diffDays(where.term.end, where.term.start) / 7) + 1
    headline = `${where.term.name.replace(/ \d{4}$/, '')} · week ${where.week} of ${lastWeek}`
    detail =
      today === where.term.end
        ? 'Last day of term'
        : `Ends ${formatDayDate(where.term.end)}${brk ? `, then holidays until ${formatDayDate(brk.end)}` : ''}`
  } else {
    headline = where.kind === 'break' ? where.brk.name : 'Between terms'
    detail = where.next
      ? `${where.next.name} starts ${formatDayDate(where.next.start)}`
      : where.kind === 'break'
        ? `Until ${formatDayDate(where.brk.end)} · next year's dates aren't in the calendar yet`
        : "Next year's dates aren't in the calendar yet"
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <p className="font-heading text-2xl leading-tight tracking-wide uppercase">{headline}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
      {nextHoliday?.date && (
        <p className="text-xs text-muted-foreground sm:text-right">
          Next public holiday
          <br />
          <span className="text-sm font-medium text-foreground">
            {nextHoliday.name}, {formatDayDate(nextHoliday.date)}
          </span>
          {nextHoliday.note && ` (${nextHoliday.note})`}
        </p>
      )}
    </div>
  )
}

function Month({ year, month, today }: { year: number; month: number; today: string }) {
  const weeks = monthWeeks(year, month)
  return (
    <table className="w-full table-fixed border-separate border-spacing-y-0.5 text-center text-xs tabular-nums">
      <caption className="mb-1.5 font-heading text-lg tracking-wide text-cal-heading uppercase">
        {MONTHS[month]}
        {year !== Number(today.slice(0, 4)) && ` ${year}`}
      </caption>
      <thead>
        <tr className="text-[0.65rem] font-semibold text-muted-foreground">
          <th className="w-5" aria-label="Term week" />
          {WEEKDAYS.map((d, i) => (
            <th key={i} scope="col" className="font-semibold">
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week, w) => {
          const firstDay = week.find(Boolean)!
          const termWeek = termWeekOf(firstDay)
          return (
            <tr key={w}>
              <td className="pr-1 text-left text-[0.6rem] text-cal-heading" title={termWeek ? `Term week ${termWeek}` : undefined}>
                {termWeek ?? ''}
              </td>
              {week.map((day, d) => (day ? <Day key={day} day={day} today={today} /> : <td key={`pad-${d}`} />))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Day({ day, today }: { day: string; today: string }) {
  const kind = dayKind(day)
  const holiday = publicHoliday(day)
  const label = [kind && DAY_KIND_LABEL[kind], holiday && `${holiday.name}${holiday.note ? ` (${holiday.note})` : ''}`]
    .filter(Boolean)
    .join(' · ')
  // Holiday runs read as one band: square off the sides that meet the next or previous day.
  const prevSame = kind?.endsWith('holiday') && dayKind(addDays(day, -1)) === kind && new Date(`${day}T00:00:00Z`).getUTCDay() !== 0
  const nextSame = kind?.endsWith('holiday') && dayKind(addDays(day, 1)) === kind && new Date(`${day}T00:00:00Z`).getUTCDay() !== 6
  return (
    <td className="p-0">
      <span
        title={label || undefined}
        aria-label={`${formatDayDate(day)}${label ? `: ${label}` : ''}`}
        className={cn(
          'relative mx-auto flex h-6 items-center justify-center rounded-md',
          kind && KIND_STYLE[kind],
          prevSame && 'rounded-l-none',
          nextSame && 'rounded-r-none',
          day === today && 'font-bold ring-2 ring-primary',
        )}
      >
        {Number(day.slice(8))}
        {holiday && (
          <span
            className={cn('absolute bottom-0.5 size-1 rounded-full', kind === 'term-end' || kind === 'mid-term' ? 'bg-white' : 'bg-cal-end')}
            aria-hidden
          />
        )}
      </span>
    </td>
  )
}
