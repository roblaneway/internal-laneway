import type { Fill, Font, Worksheet } from 'exceljs'
import { formatTime, weekdayLong } from '@/lib/dates'
import { fileDate, invoiceDescription, invoiceEnd, type Invoice } from '@/lib/invoice'
import type { Profile } from '@/lib/types'

// Laneway's invoice spreadsheet: a block per roster week, then extra activities
// (marked assessments), then the invoice total. Totals are formulas so the
// trainer can still adjust hours or prices in Excel; each also carries its
// computed result so previews that don't recalculate still show the numbers.

const FONT: Partial<Font> = { name: 'Arial', size: 10 }
const BOLD: Partial<Font> = { ...FONT, bold: true }
const MONEY = '"$"#,##0.00'
const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const TITLE = fill('FF999999')
const HEADER = fill('FFD9D9D9')
const ROW = fill('FFF3F3F3')
const TOTAL = fill('FFCCCCCC')
const COLUMNS = 'ABCDEFGH'.split('')
const WIDTHS = [18.38, 10.25, 15.38, 27.88, 40.88, 6.25, 6.13, 8.38]
const BLANK_ROWS = 2
const EXTRA_ROWS = 12

/** 10:00:00, 17:00:00 → 10:00am to 5:00pm */
const timeRange = (start: string, end: string) => `${formatTime(start).replace(' ', '')} to ${formatTime(end).replace(' ', '')}`

const excelDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "Intermediate CSS - Part 2 · Intro - Bootstrap Part 1" → one topic per line. */
const topicLines = (topic: string | undefined) => (topic ?? '').split(' · ').join('\n')

function styleRow(ws: Worksheet, row: number, rowFill: Fill, font: Partial<Font> = FONT) {
  for (const col of COLUMNS) {
    const cell = ws.getCell(`${col}${row}`)
    cell.fill = rowFill
    cell.font = font
  }
}

function sectionTitle(ws: Worksheet, row: number, title: string) {
  ws.mergeCells(`A${row}:H${row}`)
  ws.getCell(`A${row}`).value = title
  styleRow(ws, row, TITLE, BOLD)
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
}

function headerRow(ws: Worksheet, row: number, headers: Record<string, string>) {
  styleRow(ws, row, HEADER, BOLD)
  for (const [col, text] of Object.entries(headers)) {
    const cell = ws.getCell(`${col}${row}`)
    cell.value = text
    cell.alignment = { horizontal: 'center' }
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

function totalRow(
  ws: Worksheet,
  row: number,
  label: string,
  first: number,
  last: number,
  sums: { count: number; amount: number },
) {
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = label
  styleRow(ws, row, TOTAL, BOLD)
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  ws.getCell(`F${row}`).value = { formula: `SUM(F${first}:F${last})`, result: sums.count }
  ws.getCell(`F${row}`).alignment = { horizontal: 'center' }
  const total = ws.getCell(`H${row}`)
  total.value = { formula: `SUM(H${first}:H${last})`, result: round2(sums.amount) }
  total.numFmt = MONEY
  total.alignment = { horizontal: 'center' }
}

/** Builds the spreadsheet and downloads it, e.g. "Invoice Spreadsheet - November-1-2026 - Robson.xlsx". */
export async function downloadInvoiceSpreadsheet({
  invoice,
  trainer,
  from,
  topicFor,
}: {
  invoice: Invoice
  trainer: Profile
  from: string
  /** The content plan topic for a class in a term week. */
  topicFor: (classId: string, week: number | null) => string | undefined
}) {
  const { Workbook } = (await import('exceljs')).default
  const wb = new Workbook()
  const ws = wb.addWorksheet('Sheet1')
  WIDTHS.forEach((width, i) => (ws.getColumn(i + 1).width = width))
  const rate = invoice.rateCents === null ? null : invoice.rateCents / 100

  let row = 1
  const totalCells: string[] = []
  let grandTotal = 0
  for (const week of invoice.weeks) {
    sectionTitle(ws, row, week.number === null ? 'WEEK' : `WEEK ${week.number}`)
    headerRow(ws, row + 1, { A: 'Day of Week', B: 'Date', C: 'Time', D: 'Course', E: 'Class Type', F: 'Hours ', G: 'Price', H: 'TOTAL' })
    const first = row + 2
    week.sessions.forEach((session, i) => {
      const r = first + i
      const { shift } = session
      styleRow(ws, r, ROW)
      const values: Record<string, ExcelJSValue> = {
        A: weekdayLong(shift.date),
        B: excelDate(shift.date),
        C: timeRange(shift.start_time, shift.end_time),
        D: invoiceDescription(session.cls),
        E: topicLines(topicFor(shift.class_id, session.week)),
        F: session.hours,
        G: rate,
        H: { formula: `G${r}*F${r}`, result: rate === null ? 0 : round2(session.hours * rate) },
      }
      for (const [col, value] of Object.entries(values)) ws.getCell(`${col}${r}`).value = value
      for (const col of 'ABCDF') ws.getCell(`${col}${r}`).alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getCell(`D${r}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      ws.getCell(`E${r}`).alignment = { vertical: 'middle', wrapText: true }
      ws.getCell(`B${r}`).numFmt = 'd-mmm-yyyy'
      ws.getCell(`G${r}`).numFmt = MONEY
      ws.getCell(`G${r}`).alignment = { horizontal: 'right', vertical: 'middle' }
      ws.getCell(`H${r}`).numFmt = MONEY
      ws.getCell(`H${r}`).alignment = { horizontal: 'center', vertical: 'middle' }
    })
    const last = first + week.sessions.length + BLANK_ROWS - 1
    for (let r = first + week.sessions.length; r <= last; r++) styleRow(ws, r, ROW)
    const hours = week.sessions.reduce((sum, s) => sum + s.hours, 0)
    const amount = rate === null ? 0 : hours * rate
    totalRow(ws, last + 1, 'TOTAL HOURS WEEK', first, last, { count: hours, amount })
    totalCells.push(`H${last + 1}`)
    grandTotal += amount
    row = last + 3
  }

  sectionTitle(ws, row, 'EXTRA ACTIVITIES')
  ws.mergeCells(`C${row + 1}:E${row + 1}`)
  headerRow(ws, row + 1, { A: 'Activity', B: 'Number', C: 'Course', F: 'Qtd', G: 'Price', H: 'TOTAL' })
  const first = row + 2
  const assessmentRate = invoice.assessmentRateCents === null ? null : invoice.assessmentRateCents / 100
  const last = first + Math.max(EXTRA_ROWS, invoice.assessments.length) - 1
  for (let r = first; r <= last; r++) {
    styleRow(ws, r, ROW)
    for (const col of 'GH') ws.getCell(`${col}${r}`).numFmt = MONEY
  }
  invoice.assessments.forEach((a, i) => {
    const r = first + i
    const values: Record<string, ExcelJSValue> = {
      A: a.activity,
      B: a.unit_code,
      C: a.term ?? '',
      D: a.course,
      E: a.kind,
      F: a.quantity,
      G: assessmentRate,
      H: { formula: `F${r}*G${r}`, result: assessmentRate === null ? 0 : a.quantity * assessmentRate },
    }
    for (const [col, value] of Object.entries(values)) ws.getCell(`${col}${r}`).value = value
    ws.getCell(`D${r}`).alignment = { horizontal: 'center' }
    for (const col of 'FGH') ws.getCell(`${col}${r}`).alignment = { horizontal: 'right' }
  })
  const extra = assessmentRate === null ? 0 : invoice.assessmentCount * assessmentRate
  totalRow(ws, last + 1, 'TOTAL EXTRA', first, last, { count: invoice.assessmentCount, amount: extra })
  grandTotal += extra
  ws.getCell(`F${last + 1}`).alignment = { horizontal: 'right' }
  totalCells.push(`H${last + 1}`)

  const grand = last + 3
  ws.mergeCells(`A${grand}:E${grand}`)
  ws.getCell(`A${grand}`).value = 'TOTAL INVOICE'
  styleRow(ws, grand, TOTAL, BOLD)
  ws.getCell(`A${grand}`).alignment = { horizontal: 'center' }
  const total = ws.getCell(`H${grand}`)
  total.value = { formula: `SUM(${totalCells.join(',')})`, result: round2(grandTotal) }
  total.numFmt = MONEY
  total.alignment = { horizontal: 'center' }

  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `Invoice Spreadsheet - ${fileDate(invoiceEnd(from))} - ${trainer.full_name.split(/\s+/)[0]}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type ExcelJSValue = string | number | Date | null | { formula: string; result: number }
