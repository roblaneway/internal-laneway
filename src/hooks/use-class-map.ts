import { useMemo } from 'react'
import { useClasses } from './use-data'
import type { ClassWithCourse } from '@/lib/types'

export function useClassMap(): Map<string, ClassWithCourse> {
  const { data } = useClasses()
  return useMemo(() => new Map((data ?? []).map((c) => [c.id, c])), [data])
}
