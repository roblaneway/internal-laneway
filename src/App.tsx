import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, RequireRole } from '@/auth/guards'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'

// Route-level code splitting keeps the editor and admin screens out of the first load.
const RosterPage = lazy(() => import('@/pages/RosterPage').then((m) => ({ default: m.RosterPage })))
const InvoicePage = lazy(() => import('@/pages/InvoicePage').then((m) => ({ default: m.InvoicePage })))
const AssessmentsPage = lazy(() => import('@/pages/AssessmentsPage').then((m) => ({ default: m.AssessmentsPage })))
const TimetablePage = lazy(() => import('@/pages/TimetablePage').then((m) => ({ default: m.TimetablePage })))
const AnnouncementsPage = lazy(() => import('@/pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })))
const AnnouncementDetailPage = lazy(() => import('@/pages/AnnouncementsPage').then((m) => ({ default: m.AnnouncementDetailPage })))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const ClassesPage = lazy(() => import('@/pages/ClassesPage').then((m) => ({ default: m.ClassesPage })))
const ClassDetailPage = lazy(() => import('@/pages/ClassDetailPage').then((m) => ({ default: m.ClassDetailPage })))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })))
const CoursesPage = lazy(() => import('@/pages/admin/CoursesPage').then((m) => ({ default: m.CoursesPage })))
const AdminClassesPage = lazy(() => import('@/pages/admin/AdminClassesPage').then((m) => ({ default: m.AdminClassesPage })))

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="announcements/:id" element={<AnnouncementDetailPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="classes" element={<ClassesPage />} />
          <Route path="classes/:id" element={<ClassDetailPage />} />
          <Route element={<RequireRole roles={['student']} />}>
            <Route path="timetable" element={<TimetablePage />} />
          </Route>
          <Route element={<RequireRole roles={['admin', 'trainer']} />}>
            <Route path="roster" element={<RosterPage />} />
            <Route path="roster/invoice" element={<InvoicePage />} />
            <Route path="assessments" element={<AssessmentsPage />} />
          </Route>
          <Route path="admin" element={<RequireRole roles={['admin']} />}>
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="classes" element={<AdminClassesPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}
