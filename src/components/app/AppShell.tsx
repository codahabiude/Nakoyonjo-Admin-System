"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { AppSidebar } from "./AppSidebar";
import { LoginView } from "./LoginView";
import { DashboardView } from "./DashboardView";
import { StudentsView } from "./StudentsView";
import { TeachersView } from "./TeachersView";
import { ClassesView } from "./ClassesView";
import { AttendanceView } from "./AttendanceView";
import { ExamsView } from "./ExamsView";
import { MarksEntryView } from "./MarksEntryView";
import { ReportCardView } from "./ReportCardView";
import { PerformanceReportsView } from "./PerformanceReportsView";
import { GradingSystemView } from "./GradingSystemView";

import { SettingsView } from "./SettingsView";
import { TeacherProfileView } from "./TeacherProfileView";
import { ParentPortalView } from "./ParentPortalView";

const viewMap: Record<string, React.ComponentType> = {
  dashboard: DashboardView,
  students: StudentsView,
  teachers: TeachersView,
  classes: ClassesView,
  attendance: AttendanceView,
  exams: ExamsView,
  marks: MarksEntryView,
  reports: ReportCardView,
  "performance-reports": PerformanceReportsView,
  grading: GradingSystemView,
  "my-profile": TeacherProfileView,
  settings: SettingsView,
};

/** Views a non-admin (TEACHER) is allowed to render. */
const TEACHER_VIEWS = new Set([
  "dashboard",
  "attendance",
  "exams",
  "marks",
  "reports",
  "performance-reports",
  "my-profile",
]);

export function AppShell() {
  const { isAuthenticated, user, hydrate } = useAuthStore();
  const { currentView, setCurrentView } = useAppStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // ROLE GUARD: if the current view is not allowed for the logged-in role
  // (e.g. stale state after logout/login as a different user), snap back to
  // the dashboard instead of rendering a view whose APIs will all 403.
  const role = user?.role;
  useEffect(() => {
    if (!role || role === "PARENT") return;
    const allowed = role === "ADMIN" ? null : TEACHER_VIEWS;
    if (allowed && !allowed.has(currentView)) {
      setCurrentView("dashboard");
    }
  }, [role, currentView, setCurrentView]);

  if (!isAuthenticated) {
    return <LoginView />;
  }

  // Parents get the dedicated portal — teacher/admin views would 403 on
  // almost every API call for them.
  if (user?.role === "PARENT") {
    return (
      <div className="min-h-screen bg-background">
        <ParentPortalView />
      </div>
    );
  }

  const allowed = role === "ADMIN" ? null : TEACHER_VIEWS;
  const safeView = allowed && !allowed.has(currentView) ? "dashboard" : currentView;
  const ViewComponent = viewMap[safeView] || DashboardView;

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar />
      <main className="flex-1 min-w-0 lg:pl-[260px]">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="h-12 lg:hidden" />
          <div key={safeView}>
            <ViewComponent />
          </div>
        </div>
      </main>
    </div>
  );
}
