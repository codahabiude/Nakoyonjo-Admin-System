"use client";

import { useAuthStore } from "@/stores/auth-store";
import { useAppStore, ViewType } from "@/stores/app-store";
import { useShortSchoolName, useSchoolInitial, useBrandingStore } from "@/stores/branding-store";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  School,
  ClipboardCheck,
  FileText,
  PenTool,
  Printer,
  SlidersHorizontal,
  LogOut,
  Shield,
  Settings,
  Menu,
  X,
  ChevronRight,
  KeyRound,
  UserCircle,
  BarChart3,
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/app/ChangePasswordDialog";
import { ThemeToggle } from "@/components/theme-toggle";

interface NavItem {
  view: ViewType;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const mainNav: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  { view: "students", label: "Students", icon: <Users className="w-[18px] h-[18px]" />, adminOnly: true },
  { view: "teachers", label: "Teachers", icon: <UserCheck className="w-[18px] h-[18px]" />, adminOnly: true },
  { view: "classes", label: "Classes & Subjects", icon: <School className="w-[18px] h-[18px]" />, adminOnly: true },
];

const academicNav: NavItem[] = [
  { view: "attendance", label: "Attendance", icon: <ClipboardCheck className="w-[18px] h-[18px]" /> },
  { view: "exams", label: "Exams", icon: <FileText className="w-[18px] h-[18px]" /> },
  { view: "marks", label: "Enter Marks", icon: <PenTool className="w-[18px] h-[18px]" /> },
  { view: "reports", label: "Report Cards", icon: <Printer className="w-[18px] h-[18px]" /> },
  { view: "performance-reports", label: "Performance Reports", icon: <BarChart3 className="w-[18px] h-[18px]" /> },
  { view: "grading", label: "Grading System", icon: <SlidersHorizontal className="w-[18px] h-[18px]" />, adminOnly: true },
];

const adminNav: NavItem[] = [
  { view: "settings", label: "Settings", icon: <Settings className="w-[18px] h-[18px]" />, adminOnly: true },
];

const teacherOnlyNav: NavItem[] = [
  { view: "my-profile", label: "My Profile", icon: <UserCircle className="w-[18px] h-[18px]" /> },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  );
}

export function AppSidebar() {
  const { user, logout } = useAuthStore();
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen } = useAppStore();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [primaryClassNames, setPrimaryClassNames] = useState<string[]>([]);
  const schoolName = useBrandingStore((s) => s.schoolName);
  const shortName = useShortSchoolName();
  const initial = useSchoolInitial();
  const userRole = user?.role || "TEACHER";

  const isTeacher = userRole === "TEACHER";
  const isClassTeacher = isTeacher && primaryClassNames.length > 0;

  // A teacher is a CLASS TEACHER of any class where they are the primary
  // teacher. Load once so the badge reflects their real responsibility.
  useEffect(() => {
    if (userRole !== "TEACHER") {
      setPrimaryClassNames([]);
      return;
    }
    let cancelled = false;
    apiFetch("/api/my-class")
      .then((res) => (res.ok ? res.json() : { classes: [] }))
      .then((data) => {
        if (cancelled) return;
        const names = (data.classes || [])
          .filter((c: { isPrimary?: boolean }) => c.isPrimary)
          .map((c: { name: string }) => c.name);
        setPrimaryClassNames(names);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userRole]);

  const filterAdmin = (items: NavItem[]) =>
    items.filter((item) => !item.adminOnly || userRole === "ADMIN");

  const renderNavGroup = (items: NavItem[]) => (
    <nav className="space-y-0.5">
      {items.map((item) => (
        <button
          key={item.view}
          onClick={() => {
            setCurrentView(item.view);
            setSidebarOpen(false);
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 text-left group relative ${
            currentView === item.view
              ? "bg-primary/10 text-primary font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <span className={currentView === item.view ? "text-primary" : "text-muted-foreground group-hover:text-foreground transition-colors"}>
            {item.icon}
          </span>
          {item.label}
          {currentView === item.view && (
            <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary/60" />
          )}
        </button>
      ))}
    </nav>
  );

  const roleBadge = userRole === "ADMIN" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
      <Shield className="w-3 h-3" /> Admin
    </span>
  ) : isClassTeacher ? (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold"
      title={`Class teacher of ${primaryClassNames.join(", ")}`}
    >
      <School className="w-3 h-3" /> Class Teacher
      {primaryClassNames.length === 1 && (
        <span className="font-normal opacity-80">· {primaryClassNames[0]}</span>
      )}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[11px] font-semibold">
      <UserCheck className="w-3 h-3" /> Teacher
    </span>
  );

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-3.5 left-3.5 z-50 lg:hidden w-9 h-9 rounded-lg bg-card border shadow-sm flex items-center justify-center hover:bg-accent transition-colors"
        aria-label="Toggle menu"
      >
        {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-full w-[260px] bg-card border-r shadow-sm transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Brand — driven by Settings → School Name */}
          <div className="px-4 h-14 flex items-center gap-3 border-b flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-base font-bold text-primary-foreground leading-none">{initial}</span>
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm truncate leading-tight" title={schoolName}>{shortName}</h1>
              <p className="text-[11px] text-muted-foreground truncate">Administration System</p>
            </div>
          </div>

          {/* Navigation - needs min-h-0 so ScrollArea can constrain height */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="px-3 py-2">
              <>
                  {isTeacher && <>
                    <SectionLabel>My Account</SectionLabel>
                    {renderNavGroup(teacherOnlyNav)}
                  </>}
                  <SectionLabel>Main</SectionLabel>
                  {renderNavGroup(filterAdmin(mainNav))}
                  <SectionLabel>Academic</SectionLabel>
                  {renderNavGroup(filterAdmin(academicNav))}
                  {filterAdmin(adminNav).length > 0 && <>
                    <SectionLabel>Admin</SectionLabel>
                    {renderNavGroup(filterAdmin(adminNav))}
                  </>}
              </>
            </div>
            </ScrollArea>
          </div>

          {/* User section */}
          <div className="border-t flex-shrink-0 bg-muted/30">
            {/* User profile card */}
            <div className="p-3 pb-2">
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-card border shadow-sm">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-xs font-bold text-primary-foreground">
                    {user?.name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate leading-tight">{user?.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
                </div>
              </div>
              {roleBadge}
            </div>
            {/* Action buttons */}
            <div className="px-3 pb-3 space-y-1.5">
              <ThemeToggle />
              <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                onClick={() => setPasswordDialogOpen(true)}
              >
                <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                Password
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-[12px] font-medium text-destructive/80 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                onClick={() => { if (!window.confirm("Are you sure you want to sign out?")) return; logout(); }}
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Sign Out
              </Button>
              </div>
            </div>
            <ChangePasswordDialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen} />
          </div>
        </div>
      </aside>
    </>
  );
}
