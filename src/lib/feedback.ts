import type { EvidenceItem, FeedbackOutcome, TaskResultValue, UnitEvidence } from '@/lib/types'

// Feedback templates: {{placeholders}} are filled in from the student, unit and trainer;
// [square brackets] mark what the trainer still has to write.

export const OUTCOME_LABEL: Record<FeedbackOutcome, string> = {
  satisfactory: 'Satisfactory',
  reassessment: 'Reassessment',
  not_satisfactory_final: 'Not satisfactory after 2nd reassessment',
  not_submitted: 'Not submitted',
  other: 'Other',
}

export const OUTCOMES = Object.keys(OUTCOME_LABEL) as FeedbackOutcome[]

export const PLACEHOLDERS: { name: string; description: string }[] = [
  { name: 'student_first_name', description: "Student's first name" },
  { name: 'student_name', description: "Student's full name" },
  { name: 'trainer_name', description: 'Your full name' },
  { name: 'trainer_first_name', description: 'Your first name' },
  {
    name: 'assessor_intro',
    description: "\"My name is … and I'm the assessor responsible for marking your work.\" Only when you're not the class's trainer",
  },
  { name: 'unit_code', description: 'Unit code, like ICTWEB519' },
  { name: 'unit_title', description: 'Unit title from training.gov.au' },
  { name: 'assessment', description: 'Assessment name, like Assessment 1' },
  { name: 'course', description: 'Course' },
  {
    name: 'criteria',
    description: 'Criteria met, from training.gov.au: knowledge evidence for Assessment 1, performance evidence for Assessment 2',
  },
  { name: 'knowledge_evidence', description: "The unit's knowledge evidence" },
  { name: 'performance_evidence', description: "The unit's performance evidence" },
]

/** The template to suggest for a result: S, NYS (by attempt) or not submitted. */
export function suggestedOutcome(result: TaskResultValue | '', attempt: number): FeedbackOutcome | null {
  if (result === 'S') return 'satisfactory'
  if (result === 'NYS') return attempt >= 3 ? 'not_satisfactory_final' : 'reassessment'
  if (result === 'NS') return 'not_submitted'
  return null
}

/** Assessment 1 is knowledge evidence and Assessment 2 performance evidence; otherwise both. */
export function evidenceFor(assessment: string): 'knowledge' | 'performance' | 'both' {
  const n = assessment.match(/\b(?:assessment|AT)\s*(\d+)/i)?.[1]
  return n === '1' ? 'knowledge' : n === '2' ? 'performance' : 'both'
}

const bullets = (items: EvidenceItem[]) =>
  items.map((item) => [`- ${item.text}${item.items?.length ? ':' : ''}`, ...(item.items ?? []).map((sub) => `    - ${sub}`)].join('\n')).join('\n')

const knowledgeList = (e: UnitEvidence) => (e.knowledge.length ? `You have demonstrated knowledge of:\n${bullets(e.knowledge)}` : '')
const performanceList = (e: UnitEvidence) =>
  e.performance.length ? `You have demonstrated the ability to:\n${bullets(e.performance)}` : ''

export interface FeedbackContext {
  studentName: string
  trainerName: string
  /** The person marking isn't the class's trainer, so introduces themselves. */
  introduceAssessor: boolean
  unitCode: string
  assessment: string
  course: string
  evidence: UnitEvidence | undefined
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''

/** Fill a template's placeholders. Unknown ones are left as they are. */
export function renderTemplate(body: string, ctx: FeedbackContext): string {
  const evidence = ctx.evidence
  const criteriaMissing = '[The criteria met, according to the mapping document]'
  const which = evidenceFor(ctx.assessment)
  const values: Record<string, string> = {
    // Without a student (generating from the templates page), leave their name to fill in.
    student_first_name: firstName(ctx.studentName) || '[Student first name]',
    student_name: ctx.studentName.trim() || '[Student name]',
    trainer_name: ctx.trainerName.trim(),
    trainer_first_name: firstName(ctx.trainerName),
    assessor_intro: ctx.introduceAssessor ? `My name is ${ctx.trainerName.trim()} and I'm the assessor responsible for marking your work.` : '',
    unit_code: ctx.unitCode || '[unit code]',
    unit_title: evidence?.title ?? '[unit title]',
    assessment: ctx.assessment,
    course: ctx.course,
    criteria: !evidence
      ? criteriaMissing
      : (which === 'knowledge'
          ? knowledgeList(evidence)
          : which === 'performance'
            ? performanceList(evidence)
            : [knowledgeList(evidence), performanceList(evidence)].filter(Boolean).join('\n\n')) || criteriaMissing,
    knowledge_evidence: evidence ? knowledgeList(evidence) || criteriaMissing : criteriaMissing,
    performance_evidence: evidence ? performanceList(evidence) || criteriaMissing : criteriaMissing,
  }
  return body
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) => values[name] ?? match)
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n') // an empty placeholder on its own line leaves no gap
    .trim()
}

/** The [square bracket] prompts still to be written over. */
export const unfilledPrompts = (text: string) => text.match(/\[[^\]\n]{2,}\]/g) ?? []
