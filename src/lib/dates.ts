// All dates are shown in Australian format (DD/MM/YYYY) in Melbourne time.
// Roster dates and times are stored as Melbourne wall-clock `date` / `time`
// values, so most helpers work on 'YYYY-MM-DD' strings without timezone maths.

export const TIMEZONE = 'Australia/Melbourne'

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Today's date in Melbourne as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return isoFormatter.format(now)
}

/** Current Melbourne time as HH:MM. */
export function nowTimeHHMM(now = new Date()): string {
  return timeFormatter.format(now).replace(/^24/, '00')
}

function toUTCDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUTCDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const d = toUTCDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return fromUTCDate(d)
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const day = toUTCDate(iso).getUTCDay() // 0 = Sunday
  return addDays(iso, day === 0 ? -6 : 1 - day)
}

/** Week to show by default: this week, or next week once it's the weekend. */
export function defaultWeekStart(today = todayISO()): string {
  const day = toUTCDate(today).getUTCDay()
  return day === 0 || day === 6 ? addDays(startOfWeek(today), 7) : startOfWeek(today)
}

export function isWeekend(iso: string): boolean {
  const day = toUTCDate(iso).getUTCDay()
  return day === 0 || day === 6
}

export function weekDays(weekStart: string, count = 7): string[] {
  return Array.from({ length: count }, (_, i) => addDays(weekStart, i))
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUTCDate(a).getTime() - toUTCDate(b).getTime()) / 86_400_000)
}

/** Month as YYYY-MM, moved by `months` (negative goes back). */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return d.toISOString().slice(0, 7)
}

const monthFormatter = new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** 2026-10 → October 2026 */
export function formatMonth(month: string): string {
  return monthFormatter.format(toUTCDate(`${month}-01`))
}

/** 26/10/2026 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function weekdayShort(iso: string): string {
  return WEEKDAYS[toUTCDate(iso).getUTCDay()]
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS_LONG[toUTCDate(iso).getUTCDay()]
}

/** Mon 26/10/2026 */
export function formatDayDate(iso: string): string {
  return `${weekdayShort(iso)} ${formatDate(iso)}`
}

/** 13:30:00 → 1:30 pm */
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} – ${formatTime(end)}`
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

/** Timestamp → 26/10/2026, 1:30 pm (Melbourne) */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return '—'
  return dateTimeFormatter.format(new Date(ts))
}

/** Timestamp → Melbourne date DD/MM/YYYY */
export function formatTimestampDate(ts: string | null | undefined): string {
  if (!ts) return '—'
  return formatDate(todayISO(new Date(ts)))
}

export function timeAgo(ts: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(ts).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return formatTimestampDate(ts)
}

/** Number of weeks in a term, and so in each class's content plan. */
export const TERM_WEEKS = 10

/** Whether a term week number falls inside the term. */
export const inTerm = (week: number) => week >= 1 && week <= TERM_WEEKS

/** Term week (1-based) that `iso` falls in for a class starting on `startDate`. */
export function termWeek(startDate: string, iso: string): number {
  return Math.floor(diffDays(iso, startDate) / 7) + 1
}

/** Shorten HH:MM:SS to HH:MM for <input type="time">. */
export function toTimeInput(time: string): string {
  return time.slice(0, 5)
}

/** Times may be HH:MM or HH:MM:SS; compare on HH:MM. */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const [as, ae, bs, be] = [aStart, aEnd, bStart, bEnd].map(toTimeInput)
  return as < be && bs < ae
}
