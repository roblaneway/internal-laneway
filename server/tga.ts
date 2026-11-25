import { HttpError } from './errors.ts'

// Unit details from training.gov.au's public API (the one its unit pages use). A unit's current
// release lists its files; the assessment requirements XML holds the performance and knowledge
// evidence as numbered paragraphs: style 4 is an intro sentence, 13 a list item, 14+ a sub-item.

const BASE = 'https://training.gov.au'
const TIMEOUT_MS = 10_000

export interface EvidenceItem {
  text: string
  items?: string[]
}

export interface UnitEvidence {
  code: string
  title: string
  release: string
  knowledge: EvidenceItem[]
  performance: EvidenceItem[]
}

/** Unit codes are letters and digits, like ICTWEB519 or BSBSTR601. */
export const isUnitCode = (code: string) => /^[A-Z0-9]{5,15}$/.test(code)

async function get(url: string): Promise<Response> {
  // Only ever call training.gov.au, even when a URL comes from one of its responses.
  if (!url.startsWith(`${BASE}/`)) throw new HttpError(502, 'training.gov.au returned an unexpected link')
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json, application/xml' } })
  } catch {
    throw new HttpError(502, "Couldn't reach training.gov.au. Try again in a moment.")
  }
  if (res.status === 404) throw new HttpError(404, 'training.gov.au has no unit with that code')
  if (!res.ok) throw new HttpError(502, `training.gov.au answered with an error (${res.status})`)
  return res
}

export async function fetchUnitEvidence(code: string): Promise<UnitEvidence> {
  const unit = (await (await get(`${BASE}/api/training/${code}`)).json()) as {
    type?: string
    title?: string
    releases?: { releaseNumber: string; currency: string }[]
  }
  if (unit.type !== 'unit') throw new HttpError(404, `${code} isn't a unit of competency on training.gov.au`)
  const release = unit.releases?.find((r) => r.currency === 'current') ?? unit.releases?.[0]
  if (!release) throw new HttpError(404, `training.gov.au has no release of ${code}`)

  const detail = (await (await get(`${BASE}/api/training/${code}/releases/${release.releaseNumber}`)).json()) as {
    assets?: { type: string; url: string; isAvailable: boolean }[]
  }
  const asset = detail.assets?.find((a) => a.type === 'assessment' && a.isAvailable && /\.xml$/i.test(a.url))
  if (!asset) throw new HttpError(404, `training.gov.au doesn't publish the assessment requirements for ${code}`)
  const xml = await (await get(asset.url)).text()

  return {
    code,
    title: unit.title ?? code,
    release: release.releaseNumber,
    knowledge: parseEvidence(xml, 'Knowledge Evidence'),
    performance: parseEvidence(xml, 'Performance Evidence'),
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decode(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === '#') {
        const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : match
      }
      return ENTITIES[entity.toLowerCase()] ?? match
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** "consult with stakeholders;" / "…future planning." → the phrase alone, ready for a bullet list. */
const tidy = (text: string) => text.replace(/[\s;,.:]+(and|or)?$/i, '').replace(/[\s;,.:]+$/, '')

/** The list under a heading ("Knowledge Evidence") in an assessment requirements XML file. */
export function parseEvidence(xml: string, heading: string): EvidenceItem[] {
  for (const [, topic] of xml.matchAll(/<Topic>([\s\S]*?)<\/Topic>/g)) {
    const title = topic.match(/<WebHeading[^>]*>([\s\S]*?)<\/WebHeading>/)?.[1]
    if (!title || decode(title).toLowerCase() !== heading.toLowerCase()) continue
    const text = topic.match(/<Text>([\s\S]*?)<\/Text>/)?.[1]
    if (!text) continue
    const items: EvidenceItem[] = []
    for (const [, style, raw] of text.matchAll(/<p\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)) {
      const line = tidy(decode(raw))
      if (!line) continue
      const level = Number(style)
      if (level === 13) items.push({ text: line })
      else if (level > 13 && items.length) (items[items.length - 1].items ??= []).push(line)
    }
    if (items.length) return items
  }
  return []
}
