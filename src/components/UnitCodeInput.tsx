import { Input } from '@/components/ui/input'
import type { CourseUnit } from '@/lib/types'

export function unitWeeks(u: Pick<CourseUnit, 'start_week' | 'end_week'>) {
  if (!u.start_week) return null
  return !u.end_week || u.end_week === u.start_week ? `Week ${u.start_week}` : `Weeks ${u.start_week}–${u.end_week}`
}

/** A unit code field that suggests the course's units for the term, while still allowing any code. */
export function UnitCodeInput({
  id,
  value,
  onChange,
  units,
  placeholder,
  required,
}: {
  id: string
  value: string
  onChange: (code: string) => void
  units: CourseUnit[]
  placeholder?: string
  required?: boolean
}) {
  return (
    <>
      <Input
        id={id}
        required={required}
        list={units.length ? `${id}-units` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder ?? units[0]?.code}
        autoComplete="off"
      />
      {units.length > 0 && (
        <datalist id={`${id}-units`}>
          {units.map((u) => (
            <option key={u.id} value={u.code}>
              {[u.title, unitWeeks(u)].filter(Boolean).join(' · ')}
            </option>
          ))}
        </datalist>
      )}
    </>
  )
}
