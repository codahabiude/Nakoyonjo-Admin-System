// FILE: MarksEntryView.tsx — Enhanced with CBC grades, read-only mode, status banner
"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, ArrowLeft, Lock, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
}

interface Subject {
  id: string;
  name: string;
  code: string;
}

interface ExamInfo {
  id: string;
  name: string;
  term: string;
  year: string;
  maxMarks: number;
  classId: string;
  status: string;
}

// CBC grade lookup (matches grading.ts fallback)
function getCbcGrade(marks: number, maxMarks: number): { grade: string; color: string } {
  // Normalize to percentage for consistent grading
  const pct = maxMarks > 0 ? (marks / maxMarks) * 100 : 0;
  if (pct >= 80) return { grade: "EE", color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" };
  if (pct >= 50) return { grade: "ME", color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" };
  if (pct >= 30) return { grade: "AE", color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" };
  if (marks > 0) return { grade: "BE", color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" };
  return { grade: "—", color: "bg-muted text-muted-foreground" };
}

export function MarksEntryView() {
  const { user } = useAuthStore();
  const { selectedExamId, setSelectedExamId, setCurrentView } = useAppStore();
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [marksData, setMarksData] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isLocked = exam?.status === "CLOSED" || exam?.status === "APPROVED";
  const isAdmin = user?.role === "ADMIN";

  const fetchData = useCallback(async () => {
    if (!selectedExamId) {
      // No exam preselected: auto-open the most recent exam that the current
      // user can actually work with.
      //  - Teachers: prefer a class where they have assigned subjects
      //    (otherwise they land on an empty "no subjects" screen).
      //  - Admins: /api/my-class now includes each class's exams too.
      try {
        const res = await apiFetch("/api/my-class");
        const data = await res.json();
        const classes: Array<{ exams?: Array<{ id: string }>; assignedSubjects?: unknown[] }> = data.classes || [];
        const withSubjects = classes.filter((c) => (c.assignedSubjects?.length || 0) > 0);
        const pool = withSubjects.length > 0 ? withSubjects : classes;
        for (const cls of pool) {
          if (cls.exams && cls.exams.length > 0) {
            setSelectedExamId(cls.exams[0].id);
            return;
          }
        }
      } catch { /* */ }
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch(`/api/marks?examId=${selectedExamId}`);
      const data = await res.json();
      if (data.error) { toast.error(data.error); setLoading(false); return; }

      setExam(data.exam);
      setStudents(data.students);
      setSubjects(data.subjects);

      // Build marks grid: "studentId_subjectId" -> marksObtained (null = not yet entered)
      const grid: Record<string, number | null> = {};
      for (const student of data.students) {
        for (const subject of data.subjects) {
          const key = `${student.id}_${subject.id}`;
          const mark = data.marks[key];
          grid[key] = mark ? mark.marksObtained : null;
        }
      }
      setMarksData(grid);
    } catch { toast.error("Failed to load marks"); }
    setLoading(false);
  }, [selectedExamId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateMark = (studentId: string, subjectId: string, value: string) => {
    if (isLocked && !isAdmin) return;
    const max = exam?.maxMarks || 100;
    const num = value === '' ? null : Math.max(0, Math.min(max, parseInt(value) || 0));
    setMarksData((prev) => ({ ...prev, [`${studentId}_${subjectId}`]: num }));
  };

  const handleSave = async () => {
    if (!selectedExamId || (isLocked && !isAdmin)) return;
    setSaving(true);

    const marks: { studentId: string; subjectId: string; marksObtained: number }[] = [];
    for (const student of students) {
      for (const subject of subjects) {
        const val = marksData[`${student.id}_${subject.id}`];
        // Only send marks that were actually entered (not null)
        if (val !== null && val !== undefined) {
          marks.push({
            studentId: student.id,
            subjectId: subject.id,
            marksObtained: val,
          });
        }
      }
    }

    try {
      const res = await apiFetch("/api/marks", {
        method: "PUT",
        body: JSON.stringify({ examId: selectedExamId, marks }),
      });
      const data = await res.json();
      if (res.ok) {
        const msg = `Marks saved! (${data.saved || marks.length} entries)`;
        if (data.skipped > 0) {
          toast.warning(`${msg} ${data.skipped} marks were skipped.`, { description: data.skippedDetails?.map((s: any) => s.reason).join('; ') });
        } else {
          toast.success(msg);
        }
      } else { toast.error(data.error || "Failed to save marks"); }
    } catch { toast.error("Failed to save marks"); }
    setSaving(false);
  };

  const fillRandom = () => {
    const max = exam?.maxMarks || 100;
    const grid: Record<string, number> = {};
    for (const student of students) {
      for (const subject of subjects) {
        grid[`${student.id}_${subject.id}`] = Math.floor(Math.random() * (max - 30 + 1)) + 30;
      }
    }
    setMarksData(grid);
    toast.info("Random marks filled — click Save to keep them");
  };

  if (loading) {
    return (
      <div className="view-enter space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-20" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="view-enter space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Enter Marks</h2>
            <p className="text-muted-foreground text-sm mt-1">Record student scores for an exam</p>
          </div>
        </div>
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No exam selected. Go to Exams and click &quot;Enter Marks&quot; on an exam.</p>
            <Button onClick={() => setCurrentView("exams")}>Go to Exams</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (subjects.length === 0 && user?.role === "TEACHER") {
    return (
      <div className="view-enter space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setCurrentView("exams")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{exam.name}</h2>
            <p className="text-muted-foreground text-sm mt-1">{exam.term} — {exam.year}</p>
          </div>
        </div>
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No subjects assigned to you for this class.</p>
            <p className="text-muted-foreground text-sm">Contact the admin to be assigned subjects you teach.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusLabel = exam.status === "APPROVED" ? "Approved" : exam.status === "CLOSED" ? "Closed" : null;
  const statusIcon = exam.status === "APPROVED" ? <ShieldCheck className="w-4 h-4" /> : <Lock className="w-4 h-4" />;

  return (
    <div className="view-enter space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setCurrentView("exams")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">{exam.name}</h2>
              {statusLabel && (
                <Badge variant="secondary" className="text-[11px]">
                  {statusIcon} {statusLabel}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-1">{exam.term} — {exam.year} | Max: {exam.maxMarks} marks per subject</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && !isLocked && (
            <Button variant="outline" size="sm" onClick={() => { if (!window.confirm('This will overwrite ALL marks with random data. Are you sure?')) return; fillRandom(); }}>Fill Random</Button>
          )}
          {!isLocked && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? "Saving..." : "Save All Marks"}
            </Button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      {isLocked && (
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${
          exam.status === "APPROVED"
            ? "bg-blue-50 dark:bg-blue-950/50 border-blue-200/60 dark:border-blue-800/40 text-blue-800 dark:text-blue-300"
            : "bg-muted/50 border-border text-muted-foreground"
        }`}>
          {exam.status === "APPROVED" ? <ShieldCheck className="w-5 h-5 flex-shrink-0" /> : <Lock className="w-5 h-5 flex-shrink-0" />}
          <div>
            <p className="text-sm font-medium">
              {exam.status === "APPROVED"
                ? "This exam has been approved by the admin. Marks are locked."
                : "This exam has been closed. Marks can no longer be edited."}
            </p>
            {!isAdmin && (
              <p className="text-xs mt-0.5 opacity-75">
                Contact the admin if you need to make corrections.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-3 font-semibold text-foreground sticky left-0 bg-muted/50 min-w-[180px]">Student</th>
              {subjects.map((s) => (
                <th key={s.id} className="text-center px-3 py-3 font-semibold text-foreground min-w-[90px]">
                  <div>{s.code}</div>
                  <div className="text-xs font-normal text-muted-foreground">{s.name}</div>
                </th>
              ))}
              <th className="text-center px-3 py-3 font-semibold text-foreground min-w-[80px]">Total</th>
              <th className="text-center px-3 py-3 font-semibold text-foreground min-w-[80px]">Avg</th>
              <th className="text-center px-3 py-3 font-semibold text-foreground min-w-[60px]">Level</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const studentMarks = subjects.map((s) => marksData[`${student.id}_${s.id}`]).filter((v): v is number => v !== null && v !== undefined);
              const total = studentMarks.reduce((a, b) => a + b, 0);
              const maxTotal = subjects.length * (exam?.maxMarks || 100);
              const avg = studentMarks.length > 0 ? (total / studentMarks.length).toFixed(1) : "—";
              const avgGrade = getCbcGrade(parseFloat(avg), 100);

              return (
                <tr key={student.id} className="hover:bg-muted/50">
                  <td className="px-3 py-2 sticky left-0 bg-background hover:bg-muted/50">
                    <div className="font-medium text-foreground">{student.lastName}, {student.firstName}</div>
                  </td>
                  {subjects.map((subject) => {
                    const key = `${student.id}_${subject.id}`;
                    const val = marksData[key];
                    const grade = val !== null && val !== undefined ? getCbcGrade(val, exam?.maxMarks || 100) : { grade: "—", color: "bg-muted text-muted-foreground" };
                    return (
                      <td key={subject.id} className="px-1 py-1">
                        <div className="flex flex-col items-center gap-0.5">
                          <input
                            type="number"
                            min={0}
                            max={exam.maxMarks}
                            value={val != null ? String(val) : ""}
                            onChange={(e) => updateMark(student.id, subject.id, e.target.value)}
                            placeholder="-"
                            readOnly={isLocked && !isAdmin}
                            className={`w-full text-center px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background ${
                              isLocked && !isAdmin ? "bg-muted/50 cursor-not-allowed text-muted-foreground" : ""
                            }`}
                          />
                          <span className={`text-[10px] font-bold px-1.5 rounded ${grade.color} leading-tight`}>
                            {val != null && val > 0 ? grade.grade : ""}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-2 font-semibold">{total}</td>
                  <td className={`text-center px-3 py-2 font-semibold ${
                    parseFloat(avg) >= 70 ? "text-emerald-600 dark:text-emerald-400" : parseFloat(avg) >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                  }`}>{avg}</td>
                  <td className="text-center px-2 py-2">
                    <span className={`inline-block w-8 h-8 rounded-full text-sm font-bold leading-8 ${avgGrade.color}`}>
                      {avgGrade.grade}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Save Bar */}
      {!isLocked && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            {saving ? "Saving..." : "Save All Marks"}
          </Button>
        </div>
      )}
    </div>
  );
}