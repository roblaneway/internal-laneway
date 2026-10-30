import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useProfile } from '@/auth/AuthProvider'
import type {
  Announcement,
  ClassWithCourse,
  ContentPlan,
  Course,
  MarkedAssessment,
  Notification,
  Profile,
  RosterConflict,
  Shift,
  TrainerBilling,
} from '@/lib/types'

// Query keys are shared so mutations can invalidate them.
export const keys = {
  courses: ['courses'] as const,
  classes: ['classes'] as const,
  profiles: ['profiles'] as const,
  enrolments: ['enrolments'] as const,
  shifts: (from: string, to: string) => ['shifts', from, to] as const,
  allShifts: ['shifts'] as const,
  myShiftClassIds: ['shifts', 'my-class-ids'] as const,
  conflicts: (from: string, to: string) => ['conflicts', from, to] as const,
  announcements: ['announcements'] as const,
  notifications: ['notifications'] as const,
  plans: (classId: string) => ['plans', classId] as const,
  allPlans: ['plans'] as const,
  billing: (trainerId: string) => ['billing', trainerId] as const,
  allAssessments: ['marked-assessments'] as const,
  pendingInvites: ['invites', 'pending'] as const,
  assessments: (from: string, to: string, trainerId: string) => ['marked-assessments', from, to, trainerId] as const,
}

export function useCourses() {
  return useQuery({
    queryKey: keys.courses,
    queryFn: () => api.get<Course[]>('/courses'),
  })
}

/** Classes visible to the current user (RLS: staff see all, students their own). */
export function useClasses() {
  return useQuery({
    queryKey: keys.classes,
    queryFn: () => api.get<ClassWithCourse[]>('/classes'),
  })
}

/** Class ids the signed-in trainer holds a live shift for. */
function useMyShiftClassIds(enabled: boolean) {
  const profile = useProfile()
  return useQuery({
    queryKey: [...keys.myShiftClassIds, profile.id],
    enabled,
    queryFn: () => api.get<string[]>('/shifts/my-class-ids'),
  })
}

/**
 * "My classes": everything for admins, lead/rostered classes for trainers,
 * enrolled classes for students. Mirrors public.teaches_class().
 */
export function useMyClasses() {
  const profile = useProfile()
  const classes = useClasses()
  const shiftClassIds = useMyShiftClassIds(profile.role === 'trainer')

  const data = useMemo(() => {
    if (!classes.data) return undefined
    if (profile.role !== 'trainer') return classes.data
    if (!shiftClassIds.data) return undefined
    const ids = new Set(shiftClassIds.data)
    return classes.data.filter((c) => c.trainer_id === profile.id || ids.has(c.id))
  }, [classes.data, shiftClassIds.data, profile])

  return {
    data,
    isPending: classes.isPending || (profile.role === 'trainer' && shiftClassIds.isPending),
    error: classes.error ?? shiftClassIds.error,
  }
}

/** All profiles the current user may read. */
export function useProfiles() {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: () => api.get<Profile[]>('/profiles'),
  })
}

export function useTrainers() {
  const profiles = useProfiles()
  const data = useMemo(() => profiles.data?.filter((p) => p.role === 'trainer'), [profiles.data])
  return { ...profiles, data }
}

export function useProfileMap(): Map<string, Profile> {
  const { data } = useProfiles()
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data])
}

export function useShifts(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: keys.shifts(from, to),
    enabled,
    queryFn: () => api.get<Shift[]>('/shifts', { from, to }),
  })
}

/** A trainer's invoice details (RLS: the trainer themselves or an admin), or null. */
export function useTrainerBilling(trainerId: string | undefined) {
  return useQuery({
    queryKey: keys.billing(trainerId ?? ''),
    enabled: Boolean(trainerId),
    queryFn: () => api.get<TrainerBilling | null>(`/trainer-billing/${trainerId}`),
  })
}

/** Assessments marked between two dates, for one trainer or (admins, with '') everyone. */
export function useMarkedAssessments(from: string, to: string, trainerId = '') {
  return useQuery({
    queryKey: keys.assessments(from, to, trainerId),
    queryFn: () =>
      api.get<MarkedAssessment[]>('/marked-assessments', { from, to, ...(trainerId && { trainer_id: trainerId }) }),
  })
}

/** Users still holding an emailed temporary password, by id → expiry (admins only). */
export function usePendingInvites(enabled = true) {
  return useQuery({
    queryKey: keys.pendingInvites,
    enabled,
    queryFn: async () => {
      const rows = await api.get<{ user_id: string; expires_at: string }[]>('/invites/pending')
      return new Map(rows.map((r) => [r.user_id, r.expires_at]))
    },
  })
}

/** Ids of shifts that overlap another shift for the same trainer. */
export function useRosterConflicts(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: keys.conflicts(from, to),
    enabled,
    queryFn: async () => {
      const rows = await api.get<RosterConflict[]>('/roster-conflicts', { from, to })
      return new Set(rows.map((r) => r.shift_id))
    },
  })
}

export function useAnnouncements() {
  return useQuery({
    queryKey: keys.announcements,
    queryFn: () => api.get<Announcement[]>('/announcements'),
  })
}

export function useNotifications(refetchInterval?: number) {
  const profile = useProfile()
  return useQuery({
    queryKey: [...keys.notifications, profile.id],
    queryFn: () => api.get<Notification[]>('/notifications'),
    refetchInterval,
  })
}

export function useContentPlans(classId: string | undefined) {
  return useQuery({
    queryKey: keys.plans(classId ?? ''),
    enabled: Boolean(classId),
    queryFn: () => api.get<ContentPlan[]>('/content-plans', { class_id: classId }),
  })
}

export function useAllContentPlans(enabled = true) {
  return useQuery({
    queryKey: keys.allPlans,
    enabled,
    queryFn: () => api.get<ContentPlan[]>('/content-plans'),
  })
}
