"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { useShortSchoolName } from "@/stores/branding-store";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users, School, UserCheck, TrendingUp,
  CheckCircle2, Clock, ArrowRight, PenTool, FileText,
  BookOpen, AlertCircle, Printer, ShieldCheck, Award,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

interface DashboardStats {
  totalStudents: number;
  totalClasses: number;
  totalTeachers: number;
  todayPresent: number;
  todayAbsent: number;
  todayLate: number;
  todayTotal: number;
  attendanceRate: number;
  classDistribution: { name: string; students: number }[];
  // Teacher-specific
  pendingEntries?: number;
  totalSubjectAssignments?: number;
  uniqueSubjectsTaught?: number;
  // Admin-specific
  pendingApproval?: number;
}

interface ExamProgress {
  id: string;
  name: string;
  className: string;
  term: string;
  year: string;
  status: string;
  subjects?: { subjectId: string; subjectCode: string; subjectName: string; markCount: number; studentCount: number; isDone: boolean }[];
  completedSubjects: number;
  totalSubjects: number;
  isComplete: boolean;
  isClosed: boolean;
  isApproved: boolean;
}

interface TeacherClass {
  id: string;
  name: string;
  isPrimary: boolean;
  studentCount: number;
  subjectCount: number;
}

interface PendingClass {
  id: string;
  name: string;
}

/** Whole-class marks monitoring for classes where the teacher is class teacher. */
interface ClassResponsibility {
  classId: string;
  className: string;
  studentCount: number;
  subjects: {
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    teacherName: string;
    exams: { examId: string; examName: string; term: string; status: string; markCount: number; studentCount: number; isDone: boolean }[];
  }[];
}

const COLORS = ["#059669", "#0d9488", "#0891b2", "#7c3aed", "#d97706", "#dc2626", "#2563eb", "#db2777", "#65a30d"];

export function DashboardView() {
  const { user } = useAuthStore();
  const { setCurrentView, setSelectedExamId } = useAppStore();
  const shortName = useShortSchoolName();
  const isTeacher = user?.role === "TEACHER";

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [examProgress, setExamProgress] = useState<ExamProgress[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [classResponsibilities, setClassResponsibilities] = useState<ClassResponsibility[]>([]);
  const [pendingClasses, setPendingClasses] = useState<PendingClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const primaryClasses = teacherClasses.filter((c) => c.isPrimary);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await apiFetch("/api/dashboard");
      if (!res.ok) {
        if (res.status === 401) {
          setError("Session expired. Please log in again.");
          return;
        }
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || `Server error (${res.status})`);
        return;
      }
      const data = await res.json();
      if (!data.stats) {
        setError("No data returned from server.");
        return;
      }
      setStats(data.stats);
      setExamProgress(data.examProgress || []);
      setTeacherClasses(data.teacherClasses || []);
      setClassResponsibilities(data.classResponsibilities || []);
      setPendingClasses(data.pendingClasses || []);
    } catch (err) {
      console.error("Failed to fetch dashboard:", err);
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="h-72 bg-muted rounded-xl animate-pulse lg:col-span-2" />
          <div className="h-72 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-destructive" />
          <p className="text-muted-foreground mb-1">Failed to load dashboard data.</p>
          {error && <p className="text-sm text-destructive mb-4">{error}</p>}
          <Button variant="outline" onClick={() => { setLoading(true); setError(""); setStats(null); fetchDashboard(); }}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── TEACHER DASHBOARD ───────────────────────────────────
  if (isTeacher) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Welcome back, {user?.name?.split(" ")[0] ?? "there"}! Here’s your teaching overview.
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="My Classes" value={stats.totalClasses} icon={<School className="w-5 h-5" />} color="emerald" />
          <StatCard title="My Students" value={stats.totalStudents} icon={<Users className="w-5 h-5" />} color="blue" />
          <StatCard title="Subjects I Teach" value={stats.uniqueSubjectsTaught || 0} icon={<BookOpen className="w-5 h-5" />} color="violet" subtitle={`${stats.totalSubjectAssignments || 0} total assignments`} />
          <StatCard
            title="Pending Entries"
            value={stats.pendingEntries || 0}
            icon={(stats.pendingEntries || 0) > 0 ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            color={(stats.pendingEntries || 0) > 0 ? "amber" : "emerald"}
            subtitle="subject-exam combinations"
          />
        </div>

        {/* My Classes + Quick Marks Entry */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">My Classes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {teacherClasses.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No classes assigned yet.</p>
                ) : (
                  teacherClasses.map((cls) => (
                    <div key={cls.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <School className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{cls.name}</p>
                          <p className="text-xs text-muted-foreground">{cls.studentCount} students &middot; {cls.subjectCount} subjects</p>
                        </div>
                      </div>
                      {cls.isPrimary && (
                        <Badge className="bg-primary/10 text-primary text-[11px] hover:bg-primary/10">Class Teacher</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <PenTool className="w-4 h-4" />
                Marks Entry Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {examProgress.length === 0 ? (
                <div className="text-center py-6">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No exams yet for your classes.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {examProgress.slice(0, 5).map((ep) => {
                    const pct = ep.totalSubjects > 0 ? Math.round((ep.completedSubjects / ep.totalSubjects) * 100) : 0;
                    return (
                      <div key={ep.id} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">{ep.name}</p>
                            <p className="text-xs text-muted-foreground">{ep.className}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {ep.isClosed && <Badge variant="secondary" className="text-[10px]">Closed</Badge>}
                            <span className={`text-xs font-semibold ${pct === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{pct}%</span>
                          </div>
                        </div>
                        <Progress value={pct} className={`h-1.5 ${pct === 100 ? "[&>div]:bg-emerald-500 dark:[&>div]:bg-emerald-500" : ""}`} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Class Teacher Section — only if they are a class teacher */}
        {primaryClasses.length > 0 && (
          <Card className="border-amber-200/60 dark:border-amber-800/40 bg-amber-50/30 dark:bg-amber-950/30 hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  Class Teacher Responsibilities
                </CardTitle>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setCurrentView("my-profile")}>
                  View Details <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Monitor marks entry for <span className="font-semibold text-foreground">all subjects</span> in your class — including those entered by other subject teachers.
              </p>
              <div className="space-y-3">
                {classResponsibilities.length > 0 ? classResponsibilities.map((cr) => {
                  // Use the most recent exam for this class (same list on every subject)
                  const latestExam = cr.subjects[0]?.exams[0];
                  const doneCount = latestExam
                    ? cr.subjects.filter((s) => s.exams.find((e) => e.examId === latestExam.examId)?.isDone).length
                    : 0;
                  const allDone = latestExam ? doneCount === cr.subjects.length && cr.subjects.length > 0 : false;
                  return (
                    <div key={cr.classId} className="p-3 rounded-lg border border-amber-200/50 dark:border-amber-800/40 bg-card space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                            <School className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{cr.className}</p>
                            <p className="text-xs text-muted-foreground">
                              {cr.studentCount} students
                              {latestExam && <> · {latestExam.examName}</>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!latestExam ? (
                            <Badge variant="secondary" className="text-[11px]">No exams</Badge>
                          ) : allDone ? (
                            <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[11px] hover:bg-emerald-100 dark:hover:bg-emerald-900/60">All Entered</Badge>
                          ) : (
                            <Badge className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/60">
                              {doneCount}/{cr.subjects.length} subjects done
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => setCurrentView("my-profile")}
                          >
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      {/* Per-subject progress with the responsible teacher */}
                      {cr.subjects.length > 0 && latestExam && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                          {cr.subjects.map((sub) => {
                            const examStat = sub.exams.find((e) => e.examId === latestExam.examId);
                            const done = examStat?.isDone;
                            return (
                              <div
                                key={sub.subjectId}
                                className={`rounded-md border px-2 py-1.5 ${
                                  done
                                    ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/30"
                                    : "border-border bg-background"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono font-bold text-[11px]">{sub.subjectCode}</span>
                                  {done ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground">
                                      {examStat ? `${examStat.markCount}/${examStat.studentCount}` : ""}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={sub.teacherName}>
                                  {sub.teacherName}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }) : primaryClasses.map((cls) => (
                  // Fallback while class responsibilities load or if empty
                  <div key={cls.id} className="flex items-center justify-between p-3 rounded-lg border border-amber-200/50 dark:border-amber-800/40 bg-card">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                        <School className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{cls.name}</p>
                        <p className="text-xs text-muted-foreground">{cls.studentCount} students</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setCurrentView("my-profile")}
                    >
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Exam Subjects Detail — where to enter marks */}
        {examProgress.length > 0 && (
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">My Exam Subjects</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setCurrentView("exams")}>
                  View All Exams <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {examProgress.map((ep) => (
                  <div key={ep.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold">{ep.name}</span>
                      <span className="text-xs text-muted-foreground">{ep.className} &middot; {ep.term}</span>
                      {ep.isClosed && <Badge variant="secondary" className="text-[10px]">Locked</Badge>}
                      {ep.isApproved && <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] hover:bg-blue-100 dark:hover:bg-blue-900/60">Approved</Badge>}
                      {ep.isComplete && !ep.isClosed && !ep.isApproved && <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] hover:bg-emerald-100 dark:hover:bg-emerald-900/60">Complete</Badge>}
                    </div>
                    {ep.subjects && ep.subjects.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {ep.subjects.map((sub) => (
                          <Button
                            key={sub.subjectId}
                            variant={sub.isDone ? "outline" : "default"}
                            size="sm"
                            className={`h-auto py-2 justify-start text-left ${sub.isDone ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:text-emerald-700 dark:text-emerald-400" : ""}`}
                            disabled={ep.isClosed || ep.isApproved}
                            onClick={() => { setSelectedExamId(ep.id); setCurrentView("marks"); }}
                          >
                            <span className="font-mono font-bold text-xs">{sub.subjectCode}</span>
                            <span className="ml-1.5 text-xs truncate">{sub.subjectName}</span>
                            <span className="ml-auto text-[10px] opacity-70">
                              {sub.isDone ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : `${sub.markCount}/${sub.studentCount}`}
                            </span>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── ADMIN DASHBOARD ─────────────────────────────────────
  const attendanceData = stats.todayTotal > 0
    ? [
        { name: "Present", value: stats.todayPresent, color: "#059669" },
        { name: "Absent", value: stats.todayAbsent, color: "#dc2626" },
        { name: "Late", value: stats.todayLate, color: "#d97706" },
      ]
    : [];

  const classData = stats.classDistribution || [];

  // Admin: exams overview
  const activeExams = examProgress.filter((e) => !e.isClosed && !e.isComplete && !e.isApproved);
  const closedExams = examProgress.filter((e) => e.isClosed);
  const pendingApproval = examProgress.filter((e) => e.isComplete && e.status === "ACTIVE");
  const approvedExams = examProgress.filter((e) => e.isApproved);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Overview of {shortName} school operations
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Students" value={stats.totalStudents} icon={<Users className="w-5 h-5" />} color="emerald" />
        <StatCard title="Total Classes" value={stats.totalClasses} icon={<School className="w-5 h-5" />} color="blue" />
        <StatCard title="Teachers" value={stats.totalTeachers} icon={<UserCheck className="w-5 h-5" />} color="violet" />
        <StatCard title="Attendance Rate" value={`${stats.attendanceRate}%`} icon={<TrendingUp className="w-5 h-5" />} color="amber" subtitle="Last 7 days" />
      </div>

      {/* Pending Approvals Card */}
      {(stats.pendingApproval || 0) > 0 && (
        <Card className="border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/50 hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Exams Ready for Approval
              </CardTitle>
              <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[11px] hover:bg-blue-100 dark:hover:bg-blue-900/60">{stats.pendingApproval} pending</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApproval.map((ep) => (
                <div key={ep.id} className="flex items-center justify-between p-3 rounded-lg border border-blue-200/60 dark:border-blue-800/40 bg-card">
                  <div>
                    <p className="text-sm font-medium">{ep.name}</p>
                    <p className="text-xs text-muted-foreground">{ep.className} &middot; {ep.term} &middot; All {ep.totalSubjects} subjects entered</p>
                  </div>
                  <Button size="sm" onClick={() => setCurrentView("exams")}>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Review
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Students per Class</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {classData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "13px" }} />
                    <Bar dataKey="students" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {classData.map((_, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No class data available</div>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Today&apos;s Attendance</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {attendanceData.length > 0 ? (
              <div className="flex flex-col items-center">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={attendanceData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                        {attendanceData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: "8px", fontSize: "13px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-2">
                  {attendanceData.map((item) => (
                    <div key={item.name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="font-semibold">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No attendance recorded today</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Exam Marks Progress (Admin) */}
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              {activeExams.length > 0 ? <Clock className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
              Exam Marks Progress
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setCurrentView("exams")}>
              Manage Exams <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {examProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No exams created yet.</p>
          ) : (
            <div className="space-y-3">
              {examProgress.map((ep) => {
                const pct = ep.totalSubjects > 0 ? Math.round((ep.completedSubjects / ep.totalSubjects) * 100) : 0;
                return (
                  <div key={ep.id} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{ep.name}</span>
                        <span className="text-xs text-muted-foreground">{ep.className} &middot; {ep.term}</span>
                        {ep.isClosed && <Badge variant="secondary" className="text-[10px]">Closed</Badge>}
                        {ep.isApproved && <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] hover:bg-blue-100 dark:hover:bg-blue-900/60">Approved</Badge>}
                        {ep.isComplete && !ep.isClosed && !ep.isApproved && <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] hover:bg-emerald-100 dark:hover:bg-emerald-900/60">Complete</Badge>}
                      </div>
                      <Progress value={pct} className={`h-1.5 mt-2 ${pct === 100 ? "[&>div]:bg-emerald-500 dark:[&>div]:bg-emerald-500" : ""}`} />
                    </div>
                    <span className={`text-sm font-semibold flex-shrink-0 ${pct === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{ep.completedSubjects}/{ep.totalSubjects}</span>
                    <Button
                      variant={ep.isClosed || ep.isApproved ? "ghost" : "outline"}
                      size="sm"
                      className="flex-shrink-0"
                      onClick={() => { setSelectedExamId(ep.id); setCurrentView(ep.isClosed || ep.isApproved ? "reports" : "marks"); }}
                    >
                      {ep.isClosed || ep.isApproved ? <><Printer className="w-3.5 h-3.5 mr-1" /> Report</> : <><PenTool className="w-3.5 h-3.5 mr-1" /> Marks</>}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Attendance */}
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {pendingClasses.length > 0 ? <Clock className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-primary" />}
            Attendance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingClasses.length === 0 ? (
            <p className="text-sm text-primary font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> All classes have attendance recorded for today.
            </p>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">The following classes still need attendance marked:</p>
              <div className="flex flex-wrap gap-2">
                {pendingClasses.map((cls) => (
                  <span key={cls.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40">
                    <ArrowRight className="w-3 h-3" /> {cls.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon, color, subtitle }: {
  title: string; value: string | number; icon: React.ReactNode; color: string; subtitle?: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", icon: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" },
    blue: { bg: "bg-sky-50 dark:bg-blue-950/50", text: "text-sky-700 dark:text-sky-400", icon: "bg-sky-100 dark:bg-blue-900/50 text-sky-600 dark:text-blue-400" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/50", text: "text-violet-700 dark:text-violet-400", icon: "bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", icon: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" },
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
            <p className={`text-3xl font-bold tracking-tight ${c.text}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.icon}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}
