import type { Announcement, ClassWithCourse, Course } from '@/lib/types'

export function audienceLabel(a: Pick<Announcement, 'audience' | 'target_id'>, courses: Course[] = [], classes: ClassWithCourse[] = []) {
  if (a.audience === 'all') return 'All students'
  if (a.audience === 'course') {
    const course = courses.find((c) => c.id === a.target_id)
    return course ? course.name : 'Course'
  }
  const cls = classes.find((c) => c.id === a.target_id)
  return cls ? cls.name : 'Class'
}
