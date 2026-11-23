"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, MessageSquare, Check, Save, School, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  UserCircle, Mail, Phone, GraduationCap, BookOpen,
  Calendar, Award, Users, Shield, Crown,
} from "lucide-react";

interface TeacherProfile {
  employeeId: string;
  phone: string | null;
  qualification: string | null;
  dateJoined: string;
  email: string;
  name: string;
}

interface ClassAssignment {
  classId: string;
  className: string;
  isPrimary: boolean;
  studentCount: number;
  assignedSubjects: { id: string; name: string; code: string }[];
  exams?: { id: string; name: string; term: string; status: string }[];
}

interface ClassTeacherOverview {
  classId: string;
  className: string;
  studentCount: number;
  subjects: {
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    teacherName: string;
    examStatus: {
      examId: string;
      examName: string;
      term: string;
      status: string;
      markCount: number;
      studentCount: number;
      isDone: boolean;
    }[];
  }[];
}

interface StudentRemarkRow {
  studentId: string;
  studentName: string;
  remark: string;
  saved: boolean;
}

export function TeacherProfileView() {
  const { user } = useAuthStore();
  const { setCurrentView } = useAppStore();
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [classes, setClasses] = useState<ClassAssignment[]>([]);
  const [classTeacherData, setClassTeacherData] = useState<ClassTeacherOverview[]>([]);
  const [loading, setLoading] = useState(true);

  // Remarks dialog state
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [remarksClassId, setRemarksClassId] = useState("");
  const [remarksExamId, setRemarksExamId] = useState("");
  const [remarksClassName, setRemarksClassName] = useState("");
  const [remarksExamName, setRemarksExamName] = useState("");
  const [remarksData, setRemarksData] = useState<StudentRemarkRow[]>([]);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [savingRemark, setSavingRemark] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const [profileRes, classRes] = await Promise.all([
        apiFetch("/api/teachers/profile"),
        apiFetch("/api/my-class"),
      ]);
      const profileData = await profileRes.json();
      const classData = await classRes.json();

      if (profileData) setProfile(profileData);
      if (classData.classes) setClasses(classData.classes);

      // Fetch class teacher overview for classes where teacher is primary
      const primaryClasses = (classData.classes || []).filter((c: ClassAssignment) => c.isPrimary);
      if (primaryClasses.length > 0) {
        const overviews = await Promise.all(
          primaryClasses.map(async (c: ClassAssignment) => {
            try {
              const res = await apiFetch(`/api/class-teacher-overview?classId=${c.classId}`);
              const data = await res.json();
              // Validate the shape — error responses ({error}) or 401/403/500
              // bodies would crash the render with "cannot read .length of
              // undefined" if stored as data.
              return res.ok && data && Array.isArray(data.subjects) ? data : null;
            } catch {
              return null;
            }
          })
        );
        setClassTeacherData(overviews.filter(Boolean));
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  };

  // Open remarks dialog for a specific class + exam
  const openRemarksDialog = async (classId: string, className: string, examId: string, examName: string) => {
    setRemarksClassId(classId);
    setRemarksClassName(className);
    setRemarksExamId(examId);
    setRemarksExamName(examName);
    setRemarksOpen(true);
    setRemarksLoading(true);

    try {
      // Fetch students in this class
      const studentsRes = await apiFetch(`/api/students?classId=${classId}`);
      const studentsData = await studentsRes.json();
      const students = studentsData.students || [];

      // Fetch existing remarks
      const remarksRes = await apiFetch(`/api/exam-remarks?examId=${examId}`);
      const remarksData = await remarksRes.json();
      const remarkMap = remarksData.remarks || {};

      // Build rows
      const rows: StudentRemarkRow[] = students
        .filter((s: any) => s.status === "ACTIVE")
        .sort((a: any, b: any) => a.lastName.localeCompare(b.lastName))
        .map((s: any) => ({
          studentId: s.id,
          studentName: `${s.lastName}, ${s.firstName}`,
          remark: remarkMap[s.id]?.remark || "",
          saved: !!remarkMap[s.id],
        }));

      setRemarksData(rows);
    } catch (err) {
      console.error("Failed to fetch remarks data:", err);
      toast.error("Failed to load students");
    } finally {
      setRemarksLoading(false);
    }
  };

  // Save a single remark
  const saveRemark = async (studentId: string, remark: string) => {
    if (!remark.trim()) return;
    setSavingRemark(studentId);
    try {
      const res = await apiFetch("/api/exam-remarks", {
        method: "PUT",
        body: JSON.stringify({ examId: remarksExamId, studentId, remark }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setRemarksData((prev) =>
          prev.map((r) => (r.studentId === studentId ? { ...r, saved: true } : r))
        );
      }
    } catch {
      toast.error("Failed to save remark");
    } finally {
      setSavingRemark(null);
    }
  };

  // Save all pending remarks
  const saveAllRemarks = async () => {
    const pending = remarksData.filter((r) => r.remark.trim() && !r.saved);
    if (pending.length === 0) {
      toast.info("No new remarks to save");
      return;
    }
    for (const row of pending) {
      await saveRemark(row.studentId, row.remark);
    }
    toast.success(`Saved ${pending.length} remark${pending.length > 1 ? "s" : ""}`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 bg-muted rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-60 bg-muted rounded-xl animate-pulse" />
          <div className="h-60 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const primaryClasses = classes.filter((c) => c.isPrimary);
  const totalSubjects = classes.reduce((sum, c) => sum + c.assignedSubjects.length, 0);
  const uniqueSubjectNames = [...new Set(classes.flatMap((c) => c.assignedSubjects.map((s) => s.name)))];
  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0);

  // Build a map of classId → exams from classTeacherData
  const classExamsMap: Record<string, { id: string; name: string }[]> = {};
  for (const cto of classTeacherData) {
    // Defensive: skip malformed entries (defends against any shape regression)
    if (!cto?.classId || !Array.isArray(cto.subjects)) continue;
    if (cto.subjects.length > 0 && cto.subjects[0].examStatus.length > 0) {
      const exams = cto.subjects[0].examStatus.map((e) => ({ id: e.examId, name: `${e.examName} (${e.term})` }));
      // deduplicate
      const seen = new Set<string>();
      classExamsMap[cto.classId] = exams.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Profile</h2>
        <p className="text-muted-foreground text-sm mt-1">
          View your assignments, classes, and teaching schedule.
        </p>
      </div>

      {/* Profile Card */}
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-primary">
                {user?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="text-xl font-bold">{user?.name}</h3>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3.5 h-3.5" /> {profile?.email || user?.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                  <UserCircle className="w-3 h-3 mr-1" /> Teacher
                </Badge>
                {primaryClasses.length > 0 ? (
                  <Badge
                    className="bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-950/50"
                    title={
                      primaryClasses.length === 1
                        ? `You are the class teacher of ${primaryClasses[0].className}`
                        : `You are the class teacher of: ${primaryClasses.map((c) => c.className).join(", ")}`
                    }
                  >
                    <Crown className="w-3 h-3 mr-1" />
                    {primaryClasses.length === 1
                      ? `Class Teacher — ${primaryClasses[0].className}`
                      : `Class Teacher (${primaryClasses.length})`}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-muted-foreground"
                    title="You teach only your assigned subjects. Ask the admin to make you a class teacher."
                  >
                    Regular Teacher
                  </Badge>
                )}
                <Badge variant="outline">{profile?.employeeId || "N/A"}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <InfoItem icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={profile?.phone || "Not set"} />
                <InfoItem icon={<GraduationCap className="w-3.5 h-3.5" />} label="Qualification" value={profile?.qualification || "Not set"} />
                <InfoItem icon={<Calendar className="w-3.5 h-3.5" />} label="Joined" value={profile?.dateJoined ? new Date(profile.dateJoined).toLocaleDateString("en-KE", { year: "numeric", month: "short" }) : "N/A"} />
                <InfoItem icon={<BookOpen className="w-3.5 h-3.5" />} label="Subjects" value={`${uniqueSubjectNames.length} unique (${totalSubjects} assignments)`} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStatCard label="My Classes" value={classes.length} icon={<School className="w-5 h-5" />} color="emerald" />
        <MiniStatCard label="Total Students" value={totalStudents} icon={<Users className="w-5 h-5" />} color="blue" />
        <MiniStatCard label="Subjects I Teach" value={uniqueSubjectNames.length} icon={<BookOpen className="w-5 h-5" />} color="violet" />
        <MiniStatCard label="Class Teacher Of" value={primaryClasses.length} icon={primaryClasses.length > 0 ? <Crown className="w-5 h-5" /> : <Award className="w-5 h-5" />} color="amber" />
      </div>

      {/* Class Teacher Section */}
      {classTeacherData.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-500" />
            Class Teacher Overview
          </h3>
          {classTeacherData.map((cto) => (
            <ClassTeacherCard
              key={cto.classId}
              data={cto}
              exams={classExamsMap[cto.classId] || []}
              onGoToMarks={(examId) => {
                useAppStore.getState().setSelectedExamId(examId);
                setCurrentView("marks");
              }}
              onGoToReports={(examId) => {
                // Preselect the class's newest exam so Report Cards opens ready
                if (examId) useAppStore.getState().setSelectedExamId(examId);
                setCurrentView("reports");
              }}
              onWriteRemarks={(examId, examName) => openRemarksDialog(cto.classId, cto.className, examId, examName)}
            />
          ))}
        </div>
      )}

      {/* Subject Assignments by Class */}
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">My Subject Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No classes assigned yet. Contact the admin.</p>
          ) : (
            <div className="space-y-4">
              {classes.map((cls) => (
                <div key={cls.classId} className="p-4 rounded-lg border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <School className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold">{cls.className}</span>
                      <span className="text-xs text-muted-foreground">{cls.studentCount} students</span>
                    </div>
                    {cls.isPrimary && (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60 text-[11px] gap-1 hover:bg-amber-100 dark:hover:bg-amber-950/50">
                        <Crown className="w-3 h-3" /> Class Teacher
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cls.assignedSubjects.map((sub) => (
                      <Badge key={sub.id} variant="outline" className="font-mono text-xs py-0.5 px-2">
                        <span className="font-bold mr-1">{sub.code}</span>{sub.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remarks Dialog */}
      <Dialog open={remarksOpen} onOpenChange={setRemarksOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-amber-500" />
              Class Teacher Remarks
            </DialogTitle>
            <DialogDescription>
              {remarksClassName} &mdash; {remarksExamName}
              <br />Write a general comment for each student. These will appear on report cards.
            </DialogDescription>
          </DialogHeader>

          {remarksLoading ? (
            <div className="space-y-3 py-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {remarksData.map((row) => (
                <div key={row.studentId} className="flex gap-3 p-3 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.studentName}</p>
                    <Textarea
                      placeholder="Write a general remark..."
                      className="mt-1.5 min-h-[60px] text-sm"
                      value={row.remark}
                      onChange={(e) =>
                        setRemarksData((prev) =>
                          prev.map((r) => (r.studentId === row.studentId ? { ...r, remark: e.target.value, saved: false } : r))
                        )
                      }
                      maxLength={500}
                    />
                  </div>
                  <div className="flex flex-col items-end gap-1 pt-5">
                    <Button
                      size="sm"
                      variant={row.saved ? "ghost" : "default"}
                      className="h-8"
                      disabled={!row.remark.trim() || savingRemark === row.studentId}
                      onClick={() => saveRemark(row.studentId, row.remark)}
                    >
                      {savingRemark === row.studentId ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : row.saved ? (
                        <Check className="w-3.5 h-3.5 mr-1" />
                      ) : (
                        <Save className="w-3.5 h-3.5 mr-1" />
                      )}
                      {row.saved ? "Saved" : "Save"}
                    </Button>
                    <span className="text-[10px] text-muted-foreground">{row.remark.length}/500</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemarksOpen(false)}>Close</Button>
            <Button onClick={saveAllRemarks} disabled={savingRemark !== null}>
              <Save className="w-4 h-4 mr-1" /> Save All Pending
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Sub-components ── */

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">{icon} {label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function MiniStatCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode; color: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-400", icon: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" },
    blue: { bg: "bg-sky-50 dark:bg-blue-950/50", text: "text-sky-700 dark:text-blue-400", icon: "bg-sky-100 dark:bg-blue-900/50 text-sky-600 dark:text-blue-400" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/50", text: "text-violet-700 dark:text-violet-400", icon: "bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/50", text: "text-amber-700 dark:text-amber-400", icon: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" },
  };
  const c = colorMap[color] || colorMap.emerald;
  return (
    <Card className="hover:shadow-sm transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
            <p className={`text-2xl font-bold mt-0.5 ${c.text}`}>{value}</p>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.icon}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ClassTeacherCard({ data, exams, onGoToMarks, onGoToReports, onWriteRemarks }: {
  data: ClassTeacherOverview;
  exams: { id: string; name: string }[];
  onGoToMarks: (examId: string) => void;
  onGoToReports: (examId: string) => void;
  onWriteRemarks: (examId: string, examName: string) => void;
}) {
  const subjectSummaries = data.subjects.map((sub) => {
    const latestExam = sub.examStatus[0];
    return {
      ...sub,
      latestExam,
      isFullyDone: latestExam?.isDone,
    };
  });

  const allDone = subjectSummaries.every((s) => s.isFullyDone);
  const anyPending = subjectSummaries.some((s) => !s.isFullyDone);

  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <School className="w-4 h-4" />
            {data.className}
            <Badge variant="outline" className="text-[11px]">{data.studentCount} students</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            {allDone ? (
              <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[11px] hover:bg-emerald-100 dark:hover:bg-emerald-900/60">All Complete</Badge>
            ) : anyPending ? (
              <Badge className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[11px] hover:bg-amber-100 dark:hover:bg-amber-900/60 dark:bg-amber-900/50 dark:hover:bg-amber-900/60">In Progress</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Subject progress */}
        <div className="space-y-2">
          {subjectSummaries.map((sub) => (
            <div key={sub.subjectId} className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/30 transition-colors">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sub.isFullyDone ? "bg-emerald-500" : "bg-amber-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold">{sub.subjectCode}</span>
                  <span className="text-sm font-medium truncate">{sub.subjectName}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Teacher: {sub.teacherName || "Not assigned"}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {sub.latestExam && (
                  <>
                    <span className={`text-xs font-medium ${sub.isFullyDone ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {sub.latestExam.markCount}/{sub.latestExam.studentCount}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{sub.latestExam.examName}</span>
                    {!sub.isFullyDone && sub.latestExam.examId && (
                      <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={() => onGoToMarks(sub.latestExam.examId)}>Enter</Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            disabled={exams.length === 0}
            onClick={() => exams[0] && onGoToReports(exams[0].id)}
          >
            Reports <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
          {exams.length > 0 && (
            <Button size="sm" className="text-xs" onClick={() => onWriteRemarks(exams[0].id, exams[0].name)}>
              <MessageSquare className="w-3 h-3 mr-1" /> Write Remarks
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}