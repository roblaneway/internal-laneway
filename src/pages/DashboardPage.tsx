import { useProfile } from '@/auth/AuthProvider'
import { AdminDashboard } from './dashboards/AdminDashboard'
import { StudentDashboard } from './dashboards/StudentDashboard'
import { TrainerDashboard } from './dashboards/TrainerDashboard'

export function DashboardPage() {
  const { role } = useProfile()
  if (role === 'admin') return <AdminDashboard />
  if (role === 'trainer') return <TrainerDashboard />
  return <StudentDashboard />
}
