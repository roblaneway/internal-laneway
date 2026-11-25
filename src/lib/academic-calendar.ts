import { addDays, diffDays } from '@/lib/dates'

// Laneway's academic calendar (intake dates). To add a year, add its terms, holidays and public
// holidays below; the dashboard calendar and "this term" summary read only from here.

export interface Term {
  name: string
  start: string
  /** Mid-term intake (week 6). */
  midTerm: string
  end: string
}

export interface Break {
  name: string
  start: string
  end: string
  kind: 'term' | 'xmas'
}

export interface PublicHoliday {
  /** null while the date is still to be announced. */
  date: string | null
  name: string
  /** e.g. "Melbourne only" */
  note?: string
}

export const TERMS: Term[] = [
  { name: 'Term 1 2026', start: '2026-01-12', midTerm: '2026-02-16', end: '2026-03-20' },
  { name: 'Term 2 2026', start: '2026-04-06', midTerm: '2026-05-11', end: '2026-06-12' },
  { name: 'Term 3 2026', start: '2026-06-29', midTerm: '2026-08-03', end: '2026-09-04' },
  { name: 'Term 4 2026', start: '2026-09-21', midTerm: '2026-10-26', end: '2026-11-27' },
]

export const BREAKS: Break[] = [
  { name: 'Christmas holidays', start: '2025-12-01', end: '2026-01-09', kind: 'xmas' },
  { name: 'Term 1 holidays', start: '2026-03-23', end: '2026-04-03', kind: 'term' },
  { name: 'Term 2 holidays', start: '2026-06-15', end: '2026-06-26', kind: 'term' },
  { name: 'Term 3 holidays', start: '2026-09-07', end: '2026-09-18', kind: 'term' },
  { name: 'Term 4 holidays', start: '2026-11-30', end: '2027-01-10', kind: 'xmas' },
]

export const PUBLIC_HOLIDAYS: PublicHoliday[] = [
  { date: '2026-01-26', name: 'Australia Day' },
  { date: '2026-03-09', name: 'Labour Day', note: 'Melbourne only' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-04', name: 'Saturday before Easter Sunday' },
  { date: '2026-04-05', name: 'Easter Sunday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-04-25', name: 'Anzac Day' },
  { date: '2026-06-08', name: "King's Birthday" },
  { date: null, name: 'Friday before the AFL Grand Final', note: 'Melbourne only' },
  { date: '2026-10-05', name: 'Labour Day', note: 'Sydney only' },
  { date: '2026-11-03', name: 'Melbourne Cup', note: 'Melbourne only' },
]

/** Years the calendar covers. */
export const CALENDAR_YEARS = [...new Set(TERMS.map((t) => Number(t.start.slice(0, 4))))]

export type DayKind = 'term-start' | 'mid-term' | 'term-end' | 'term-holiday' | 'xmas-holiday'

export const DAY_KIND_LABEL: Record<DayKind, string> = {
  'term-start': 'Term start',
  'mid-term': 'Mid term start',
  'term-end': 'Term end',
  'term-holiday': 'Term holidays',
  'xmas-holiday': 'Xmas holidays',
}

const isWeekday = (iso: string) => {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return day !== 0 && day !== 6
}

/** What a day is in the calendar: an intake date, or a weekday of the holidays. */
export function dayKind(iso: string): DayKind | null {
  for (const t of TERMS) {
    if (iso === t.start) return 'term-start'
    if (iso === t.midTerm) return 'mid-term'
    if (iso === t.end) return 'term-end'
  }
  const brk = BREAKS.find((b) => iso >= b.start && iso <= b.end)
  if (brk && isWeekday(iso)) return brk.kind === 'xmas' ? 'xmas-holiday' : 'term-holiday'
  return null
}

export const publicHoliday = (iso: string) => PUBLIC_HOLIDAYS.find((h) => h.date === iso)

/** The Sunday a week (as the calendar shows it, Sunday first) starts on. */
const sundayOf = (iso: string) => addDays(iso, -new Date(`${iso}T00:00:00Z`).getUTCDay())

/** Term week (1–10) of the calendar row a day is in, or null outside a term. */
export function termWeekOf(iso: string): number | null {
  const sunday = sundayOf(iso)
  const saturday = addDays(sunday, 6)
  const term = TERMS.find((t) => saturday >= t.start && sunday <= t.end)
  return term ? Math.floor(diffDays(sunday, sundayOf(term.start)) / 7) + 1 : null
}

export type Today =
  | { kind: 'term'; term: Term; week: number }
  | { kind: 'break'; brk: Break; next: Term | undefined }
  | { kind: 'between'; next: Term | undefined }

/** Where today falls: a term (and its week), a holiday, or neither. */
export function whereIs(iso: string): Today {
  const term = TERMS.find((t) => iso >= t.start && iso <= t.end)
  const next = TERMS.find((t) => t.start > iso)
  if (term) return { kind: 'term', term, week: Math.floor(diffDays(iso, term.start) / 7) + 1 }
  const brk = BREAKS.find((b) => iso >= b.start && iso <= b.end)
  return brk ? { kind: 'break', brk, next } : { kind: 'between', next }
}

/** The break after a term. */
export const breakAfter = (term: Term) => BREAKS.find((b) => b.start > term.end)
