import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Copy, CopyPlus, Loader2, MessageSquareText, Pencil, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState } from '@/components/EmptyState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { PageHeader } from '@/components/PageHeader'
import { useProfile } from '@/auth/AuthProvider'
import { keys, useCourses, useCourseUnits, useFeedbackTemplates, useUnitEvidence } from '@/hooks/use-data'
import { api } from '@/lib/api'
import { OUTCOMES, OUTCOME_LABEL, PLACEHOLDERS, evidenceFor, renderTemplate, unfilledPrompts } from '@/lib/feedback'
import type { Course, CourseUnit, FeedbackOutcome, FeedbackTemplate, UnitEvidence } from '@/lib/types'

type Draft = Pick<FeedbackTemplate, 'name' | 'outcome' | 'body'> & { id?: string; shared: boolean }

/** Feedback templates for marking: shared ones (admins manage) and each trainer's own. */
export function FeedbackTemplatesPage() {
  const me = useProfile()
  const isAdmin = me.role === 'admin'
  const templates = useFeedbackTemplates()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [params] = useSearchParams()

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/feedback-templates/${id}`),
    onSuccess: () => {
      toast.success('Template removed')
      queryClient.invalidateQueries({ queryKey: keys.feedbackTemplates })
    },
    onError: (err) => toast.error(err.message),
  })

  const canEdit = (t: FeedbackTemplate) => isAdmin || t.owner_id === me.id
  const rows = templates.data ?? []

  return (
    <>
      <PageHeader
        title="Feedback templates"
        description="Start assessment feedback from these in the gradebook. The student, unit and your name are filled in, and for Satisfactory the criteria met come from training.gov.au."
        actions={
          <Button onClick={() => setEditing({ name: '', outcome: 'satisfactory', body: '', shared: isAdmin })}>
            <Plus className="size-4" /> New template
          </Button>
        }
      />

      {templates.data && templates.data.length > 0 && <FeedbackGenerator templates={templates.data} />}

      <h2 className="mt-8 mb-3 text-sm font-semibold">Templates</h2>
      {templates.error ? (
        <ErrorState error={templates.error} />
      ) : templates.isPending ? (
        <ListSkeleton rows={4} />
      ) : !rows.length ? (
        <EmptyState icon={MessageSquareText} title="No templates yet" description="Add the feedback you send most often." />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {t.name}{' '}
                  <Badge variant="outline" className="ml-1 align-middle">
                    {OUTCOME_LABEL[t.outcome]}
                  </Badge>{' '}
                  <Badge variant="secondary" className="align-middle">
                    {t.owner_id ? (t.owner_id === me.id ? 'Mine' : 'A trainer’s') : 'Shared'}
                  </Badge>
                </p>
                <p className="truncate text-xs text-muted-foreground">{t.body.replace(/\s+/g, ' ').slice(0, 160)}</p>
              </div>
              {canEdit(t) ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${t.name}`}
                    onClick={() => setEditing({ id: t.id, name: t.name, outcome: t.outcome, body: t.body, shared: !t.owner_id })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${t.name}`} disabled={remove.isPending} onClick={() => remove.mutate(t.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing({ name: `${t.name} (mine)`, outcome: t.outcome, body: t.body, shared: false })}
                >
                  <CopyPlus className="size-4" /> Make my own copy
                </Button>
              )}
            </div>
          ))}
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          {editing && (
            <TemplateForm key={editing.id ?? 'new'} draft={editing} previewUnit={params.get('unit') || SAMPLE_UNIT} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

const ASSESSMENTS = ['Assessment 1', 'Assessment 2'] as const

/** A course's units, one per code (latest term's title first), in code order. */
function unitsOf(units: CourseUnit[], courseId: string) {
  const byCode = new Map<string, CourseUnit>()
  for (const u of [...units].sort((a, b) => b.term.localeCompare(a.term, undefined, { numeric: true }))) {
    if (u.course_id === courseId && !byCode.has(u.code)) byCode.set(u.code, u)
  }
  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Choose a course, unit, assessment and template to get the feedback written out, with the
 * unit's criteria from training.gov.au, ready to copy. Choices live in the URL.
 */
function FeedbackGenerator({ templates }: { templates: FeedbackTemplate[] }) {
  const me = useProfile()
  const courses = useCourses()
  const units = useCourseUnits()
  const [params, setParams] = useSearchParams()
  const [student, setStudent] = useState('')
  const [introduce, setIntroduce] = useState(false)

  // Only courses that have units listed (under Units) can be chosen.
  const courseOptions = useMemo(() => {
    const withUnits = new Set((units.data ?? []).map((u) => u.course_id))
    return (courses.data ?? []).filter((c) => withUnits.has(c.id))
  }, [courses.data, units.data])
  const course: Course | undefined = courseOptions.find((c) => c.id === params.get('course')) ?? courseOptions[0]
  const unitOptions = useMemo(() => (course ? unitsOf(units.data ?? [], course.id) : []), [units.data, course])
  const unit = unitOptions.find((u) => u.code === params.get('unit')) ?? unitOptions[0]
  const assessment = ASSESSMENTS.find((a) => a === params.get('assessment')) ?? ASSESSMENTS[0]
  const template = templates.find((t) => t.id === params.get('template')) ?? templates.find((t) => t.outcome === 'satisfactory') ?? templates[0]
  const evidence = useUnitEvidence(unit?.code)

  const set = (changes: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(changes)) next.set(key, value)
        return next
      },
      { replace: true },
    )

  const generated = useMemo(
    () =>
      template && unit
        ? renderTemplate(template.body, {
            studentName: student,
            trainerName: me.full_name,
            introduceAssessor: introduce,
            unitCode: unit.code,
            assessment,
            course: course?.name ?? '',
            evidence: evidence.data,
          })
        : '',
    [template, unit, student, me.full_name, introduce, assessment, course, evidence.data],
  )
  const which = evidenceFor(assessment)

  if (courses.error || units.error) return <ErrorState error={(courses.error ?? units.error)!} />
  if (courses.isPending || units.isPending) return <ListSkeleton rows={2} />
  if (!courseOptions.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No units to generate feedback for"
        description="Feedback is generated for a course's units. An administrator lists them under Units."
      />
    )
  }

  return (
    <Card className="gap-4 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Generate feedback</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Course</Label>
          <Select value={course?.id} onValueChange={(v) => set({ course: v, unit: unitsOf(units.data ?? [], v)[0]?.code ?? '' })}>
            <SelectTrigger className="w-full" aria-label="Course">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {courseOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Unit</Label>
          <Select value={unit?.code} onValueChange={(v) => set({ unit: v })}>
            <SelectTrigger className="w-full" aria-label="Unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {unitOptions.map((u) => (
                <SelectItem key={u.code} value={u.code}>
                  <span className="font-mono">{u.code}</span>
                  {u.title && <span className="truncate text-muted-foreground">{u.title}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Assessment</Label>
          <Select value={assessment} onValueChange={(v) => set({ assessment: v })}>
            <SelectTrigger className="w-full" aria-label="Assessment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Assessment 1">Assessment 1 · knowledge evidence</SelectItem>
              <SelectItem value="Assessment 2">Assessment 2 · performance evidence</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Template</Label>
          <Select value={template?.id} onValueChange={(v) => set({ template: v })}>
            <SelectTrigger className="w-full" aria-label="Template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                  {t.owner_id && <span className="text-xs text-muted-foreground">· mine</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-72">
          <Label htmlFor="g-student">Student name (optional)</Label>
          <Input id="g-student" value={student} onChange={(e) => setStudent(e.target.value)} placeholder="Alex Morgan" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <Switch checked={introduce} onCheckedChange={setIntroduce} /> Introduce me as the assessor
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {evidence.isFetching
          ? `Loading ${unit?.code} from training.gov.au…`
          : evidence.error
            ? `Couldn't load ${unit?.code} from training.gov.au (${evidence.error.message}). The criteria are left for you to write.`
            : evidence.data &&
              `Criteria: ${which === 'both' ? 'knowledge and performance' : which} evidence of ${evidence.data.code} ${evidence.data.title} (release ${evidence.data.release}), from training.gov.au.`}
      </p>
      {/* Remounted when a choice changes, which writes the feedback out again; edits are kept until then. */}
      <GeneratedFeedback key={generated} generated={generated} />
    </Card>
  )
}

/** The generated feedback, editable, with what's left to write and a copy button. */
function GeneratedFeedback({ generated }: { generated: string }) {
  const [text, setText] = useState(generated)
  const prompts = unfilledPrompts(text)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Feedback copied')
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.")
    }
  }

  return (
    <>
      <Textarea aria-label="Generated feedback" rows={18} value={text} onChange={(e) => setText(e.target.value)} className="text-sm" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="text-xs text-[oklch(0.45_0.12_60)] sm:mr-auto">
          {prompts.length > 0 &&
            `${prompts.length === 1 ? '1 part' : `${prompts.length} parts`} in [square brackets] still to write: ${prompts.slice(0, 3).join(', ')}${prompts.length > 3 ? '…' : ''}`}
        </p>
        <Button type="button" variant="outline" disabled={text === generated} onClick={() => setText(generated)}>
          <RefreshCw className="size-4" /> Start again
        </Button>
        <Button type="button" disabled={!text.trim()} onClick={copy}>
          <Copy className="size-4" /> Copy feedback
        </Button>
      </div>
    </>
  )
}

const SAMPLE_UNIT = 'ICTWEB519'

function TemplateForm({ draft, previewUnit, onDone }: { draft: Draft; previewUnit: string; onDone: () => void }) {
  const me = useProfile()
  const isAdmin = me.role === 'admin'
  const queryClient = useQueryClient()
  const [name, setName] = useState(draft.name)
  const [outcome, setOutcome] = useState<FeedbackOutcome>(draft.outcome)
  const [body, setBody] = useState(draft.body)
  const [shared, setShared] = useState(draft.shared)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const save = useMutation({
    mutationFn: async () => {
      const row = { name: name.trim(), outcome, body }
      if (draft.id) await api.patch(`/feedback-templates/${draft.id}`, row)
      else await api.post('/feedback-templates', { ...row, ...(isAdmin && { owner_id: shared ? null : me.id }) })
    },
    onSuccess: () => {
      toast.success('Template saved')
      queryClient.invalidateQueries({ queryKey: keys.feedbackTemplates })
      onDone()
    },
    onError: (err) => toast.error(err.message),
  })

  // Insert a placeholder where the cursor is.
  const insert = (placeholder: string) => {
    const el = bodyRef.current
    const token = `{{${placeholder}}}`
    if (!el) return setBody((b) => b + token)
    const { selectionStart: start, selectionEnd: end } = el
    setBody(body.slice(0, start) + token + body.slice(end))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <DialogHeader>
        <DialogTitle>{draft.id ? 'Edit template' : 'New template'}</DialogTitle>
        <DialogDescription>
          Use {'{{placeholders}}'} for details filled in from the gradebook, and [square brackets] for what you'll write for each student.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Name</Label>
              <Input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Satisfactory" />
            </div>
            <div className="space-y-1.5">
              <Label>Suggested for</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as FeedbackOutcome)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {OUTCOME_LABEL[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isAdmin && !draft.id && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={shared} onCheckedChange={setShared} /> Shared with every trainer
            </label>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="t-body">Template</Label>
            <Textarea id="t-body" ref={bodyRef} required rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-xs" />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Placeholders</p>
            <div className="flex flex-wrap gap-1.5">
              {PLACEHOLDERS.map((p) => (
                <Button key={p.name} type="button" variant="outline" size="sm" className="h-7 font-mono text-xs" title={p.description} onClick={() => insert(p.name)}>
                  {`{{${p.name}}}`}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <Preview body={body} initialUnit={previewUnit} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  )
}

/** The template filled in for a sample student and a real unit from training.gov.au. */
function Preview({ body, initialUnit }: { body: string; initialUnit: string }) {
  const me = useProfile()
  const [unit, setUnit] = useState(initialUnit)
  const [assessment, setAssessment] = useState('Assessment 1')
  const evidence = useUnitEvidence(unit)
  const queryClient = useQueryClient()

  const refresh = useMutation({
    mutationFn: () => api.get<UnitEvidence>(`/unit-evidence/${unit.trim().toUpperCase()}`, { refresh: '1' }),
    onSuccess: (data) => queryClient.setQueryData(keys.unitEvidence(data.code), data),
    onError: (err) => toast.error(err.message),
  })

  const text = useMemo(
    () =>
      renderTemplate(body, {
        studentName: 'Alex Morgan',
        trainerName: me.full_name,
        introduceAssessor: true,
        unitCode: unit.trim().toUpperCase(),
        assessment,
        course: 'Diploma of Information Technology',
        evidence: evidence.data,
      }),
    [body, me.full_name, unit, assessment, evidence.data],
  )

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="t-unit">Preview unit</Label>
          <Input id="t-unit" value={unit} onChange={(e) => setUnit(e.target.value.toUpperCase())} className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label>Assessment</Label>
          <Select value={assessment} onValueChange={setAssessment}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Assessment 1">Assessment 1 (knowledge)</SelectItem>
              <SelectItem value="Assessment 2">Assessment 2 (performance)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Fetch the unit again from training.gov.au"
          title="Fetch again from training.gov.au"
          disabled={refresh.isPending || !evidence.data}
          onClick={() => refresh.mutate()}
        >
          <RefreshCw className={refresh.isPending ? 'size-4 animate-spin' : 'size-4'} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {evidence.isFetching
          ? 'Loading from training.gov.au…'
          : evidence.error
            ? evidence.error.message
            : evidence.data
              ? `${evidence.data.code} ${evidence.data.title} · release ${evidence.data.release}`
              : 'Enter a unit code to preview its criteria.'}
      </p>
      <div className="min-h-64 flex-1 overflow-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap" aria-label="Preview" aria-live="polite">
        {text || <span className="text-muted-foreground">The preview appears here.</span>}
      </div>
    </div>
  )
}
