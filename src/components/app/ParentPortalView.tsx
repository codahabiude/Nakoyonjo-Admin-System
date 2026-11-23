// FILE: ParentPortalView.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, GraduationCap, ArrowLeft, User, FileDown, FileSpreadsheet, Printer, ClipboardCheck, CalendarDays } from "lucide-react";
import { toast } from "sonner";

interface ChildExamSummary {
  examId: string;
  examName: string;
  term: string;
  year: string;
  totalMarks: number;
  maxTotal: number;
  average: string;
  grade: string;
  rank: number;
  totalStudents: number;
}

interface ChildItem {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  gender: string;
  className: string;
  relation: string;
  latestExam: ChildExamSummary | null;
}

interface ExamOption {
  id: string;
  name: string;
  term: string;
  year: string;
}

interface ReportData {
  student: {
    firstName: string;
    lastName: string;
    admissionNo: string;
    gender: string;
    dateOfBirth: string | null;
  };
  class: { name: string };
  exam: { name: string; term: string; year: string; maxMarks: number };
  classTeacher: string;
  classTeacherRemark: string | null;
  /** School identity from Settings */
  school?: {
    schoolName: string;
    schoolMotto: string;
    schoolAddress: string;
    schoolPhone: string;
  };
  /** Term calendar range from Settings */
  termRange?: string;
  marks: {
    subject: string;
    code: string;
    marksObtained: number;
    maxMarks: number;
    grade: string;
    remarks: string | null;
  }[];
  summary: {
    totalMarks: number;
    maxTotal: number;
    average: string;
    grade: string;
    rank: number;
    totalStudents: number;
  };
}

type View = "list" | "exams" | "report" | "attendance";

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  rate: number;
}

interface AttendanceRecord {
  date: string;
  status: string;
}

interface MonthlyAttendance {
  month: string;
  label: string;
  present: number;
  absent: number;
  late: number;
  total: number;
  rate: number;
}

export function ParentPortalView() {
  const [children, setChildren] = useState<ChildItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [selectedChild, setSelectedChild] = useState<ChildItem | null>(null);
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [selectedExam, setSelectedExam] = useState<ExamOption | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  // Attendance state
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<MonthlyAttendance[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  const fetchChildren = useCallback(async () => {
    try {
      const res = await apiFetch("/api/parent-portal");
      const data = await res.json();
      setChildren(data.children || []);
    } catch {
      toast.error("Failed to load your children");
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchChildren();
      setLoading(false);
    };
    load();
  }, [fetchChildren]);

  const handleSelectChild = async (child: ChildItem) => {
    setSelectedChild(child);
    setView("exams");
    setReport(null);

    try {
      const res = await apiFetch("/api/exams");
      const data = await res.json();
      // Filter exams to only this child's class
      const allExams = data.exams || [];
      // We need classId — fetch from students API or use class name matching
      // The child data has className but not classId, so we filter by className
      const childExams = allExams.filter((e: { className: string }) => e.className === child.className);
      setExams(childExams);
    } catch {
      /* ignore */
    }
  };

  const handleSelectExam = async (exam: ExamOption) => {
    if (!selectedChild) return;
    setSelectedExam(exam);
    setView("report");
    setLoadingReport(true);

    try {
      const res = await apiFetch("/api/parent-portal/report", {
        method: "POST",
        body: JSON.stringify({ studentId: selectedChild.id, examId: exam.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setView("exams");
      } else {
        setReport(data);
      }
    } catch {
      toast.error("Failed to load report");
      setView("exams");
    }
    setLoadingReport(false);
  };

  const handleViewAttendance = async (child: ChildItem) => {
    setSelectedChild(child);
    setView("attendance");
    setLoadingAttendance(true);

    try {
      const res = await apiFetch(`/api/parent-portal/attendance?studentId=${child.id}`);
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        setView("list");
      } else {
        setAttendanceSummary(data.summary);
        setAttendanceRecords(data.records || []);
        setMonthlyAttendance(data.monthlyData || []);
      }
    } catch {
      toast.error("Failed to load attendance");
      setView("list");
    }
    setLoadingAttendance(false);
  };

  // Download helper
  const downloadBlob = async (url: string, options: RequestInit, fallbackName: string) => {
    const res = await apiFetch(url, options);
    if (!res.ok) { toast.error("Download failed"); return false; }
    const blob = await res.blob();
    const contentDisposition = res.headers.get("content-disposition");
    let fileName = fallbackName;
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";]+)"?/);
      if (match) fileName = match[1];
    }
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    return true;
  };

  const handleDownloadPdf = async () => {
    if (!report || !selectedChild || !selectedExam) return;
    setDownloadingPdf(true);
    try {
      const ok = await downloadBlob(
        "/api/report-pdf",
        { method: "POST", body: JSON.stringify({ studentId: selectedChild.id, examId: selectedExam.id }) },
        `Report_${selectedChild.lastName}_${selectedExam.name.replace(/\s+/g, "_")}.pdf`
      );
      if (ok) toast.success("PDF downloaded!");
    } catch { toast.error("Download failed"); }
    setDownloadingPdf(false);
  };

  const handleDownloadExcel = async () => {
    if (!report || !selectedChild || !selectedExam) return;
    setDownloadingExcel(true);
    try {
      const ok = await downloadBlob(
        "/api/report-excel",
        { method: "POST", body: JSON.stringify({ studentId: selectedChild.id, examId: selectedExam.id }) },
        `Report_${selectedChild.lastName}_${selectedExam.name.replace(/\s+/g, "_")}.xlsx`
      );
      if (ok) toast.success("Excel downloaded!");
    } catch { toast.error("Download failed"); }
    setDownloadingExcel(false);
  };

  const handlePrint = () => {
    if (!report || !selectedChild || !selectedExam) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const gradeColor = (g: string) => {
      if (g.startsWith("EE")) return "#059669";
      if (g.startsWith("ME")) return "#2563eb";
      if (g.startsWith("AE")) return "#d97706";
      return "#dc2626";
    };

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Report Card - ${report.student.firstName} ${report.student.lastName}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 30px; color: #1a1a1a; }
        .header { text-align: center; border-bottom: 3px double #166534; padding-bottom: 15px; margin-bottom: 20px; }
        .header h1 { font-size: 20px; color: #166534; }
        .header h2 { font-size: 14px; color: #555; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #166534; color: white; padding: 8px 12px; text-align: center; font-size: 12px; }
        td { padding: 7px 12px; text-align: center; border-bottom: 1px solid #e5e5e5; font-size: 12px; }
        tr:nth-child(even) { background: #f9fafb; }
        td:first-child, td:nth-child(2) { text-align: left; }
        .summary { display: flex; justify-content: space-between; border-top: 2px solid #166534; padding-top: 12px; margin-bottom: 20px; }
        .summary-item { text-align: center; }
        .summary-item .num { font-size: 24px; font-weight: 700; color: #166534; }
        .summary-item .lbl { font-size: 11px; color: #666; }
        .grade-big { font-size: 36px; font-weight: 800; }
        .footer { display: flex; justify-content: space-between; margin-top: 50px; font-size: 12px; color: #666; }
        .sign-line { border-top: 1px solid #ccc; padding-top: 4px; min-width: 180px; text-align: center; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <h1>${report.school?.schoolName || "NAKOYONJO DEB PRIMARY SCHOOL"}</h1>
        ${report.school?.schoolMotto ? `<h2 style="font-style:italic">${report.school.schoolMotto}</h2>` : ""}
        <h2>Student Report Card</h2>
        <p style="font-size:11px;color:#888">${report.school?.schoolAddress || "Bungoma, Kenya"}${report.school?.schoolPhone ? ` | Tel: ${report.school.schoolPhone}` : ""}</p>
      </div>
      <div class="info-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;font-size:13px">
        <div><span style="color:#666">Name: </span><strong>${report.student.firstName} ${report.student.lastName}</strong></div>
        <div><span style="color:#666">Class: </span><strong>${report.class.name}</strong></div>
        <div><span style="color:#666">Exam: </span><strong>${report.exam.name} (${report.exam.term}, ${report.exam.year})${report.termRange ? ` — ${report.termRange}` : ""}</strong></div>
        <div><span style="color:#666">Class Teacher: </span><strong>${report.classTeacher}</strong></div>
      </div>
      <table>
        <thead><tr><th style="text-align:left">Subject</th><th style="text-align:left">Code</th><th>Marks</th><th>Performance Level</th><th>Remarks</th></tr></thead>
        <tbody>
          ${report.marks.map((m) => `
            <tr><td>${m.subject}</td><td>${m.code}</td><td><strong>${m.marksObtained}</strong> / ${m.maxMarks}</td><td style="color:${gradeColor(m.grade)};font-weight:700">${m.grade}</td><td>${m.remarks || ""}</td></tr>
          `).join("")}
        </tbody>
      </table>
      <div class="summary">
        <div class="summary-item"><div class="num">${report.summary.totalMarks}</div><div class="lbl">Total / ${report.summary.maxTotal}</div></div>
        <div class="summary-item"><div class="num">${report.summary.average}</div><div class="lbl">Average</div></div>
        <div class="summary-item"><div class="num grade-big" style="color:${gradeColor(report.summary.grade)}">${report.summary.grade}</div><div class="lbl">Performance Level</div></div>
        <div class="summary-item"><div class="num">${report.summary.rank} / ${report.summary.totalStudents}</div><div class="lbl">Position</div></div>
      </div>
      <div class="footer">
        <div class="sign-line">Class Teacher</div>
        <div class="sign-line">Head Teacher</div>
      </div>
      <script>window.onload = function() { window.print(); }<\/script>
      </body></html>
    `);
    printWindow.document.close();
  };

  // Semantic grade color coding
  const gradeColor = (g: string) => {
    if (g.startsWith("EE")) return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300";
    if (g.startsWith("ME")) return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300";
    if (g.startsWith("AE")) return "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
    return "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 dark:text-red-300";
  };

  if (loading) {
    return (
      <div className="view-enter flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Children list
  if (view === "list") {
    return (
      <div className="view-enter space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">My Children</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Select a child to view their academic performance
            </p>
          </div>
        </div>

        {children.length === 0 ? (
          <Card className="hover:shadow-md transition-shadow duration-200">
            <CardContent className="py-12 text-center text-muted-foreground">
              No children linked to your account. Please contact the school.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {children.map((child) => (
              <Card
                key={child.id}
                className="cursor-pointer hover:shadow-md transition-shadow duration-200 border-l-4 border-l-primary"
                onClick={() => handleSelectChild(child)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground">
                        {child.firstName} {child.lastName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {child.className}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {child.relation}
                      </p>
                      {child.latestExam && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge variant="secondary" className="text-xs">
                            {child.latestExam.examName}
                          </Badge>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${gradeColor(
                              child.latestExam.grade
                            )}`}
                          >
                            {child.latestExam.grade} ({child.latestExam.average})
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Rank {child.latestExam.rank}/{child.latestExam.totalStudents}
                          </span>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={(e) => { e.stopPropagation(); handleSelectChild(child); }}
                        >
                          <GraduationCap className="w-3 h-3 mr-1" /> Reports
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={(e) => { e.stopPropagation(); handleViewAttendance(child); }}
                        >
                          <ClipboardCheck className="w-3 h-3 mr-1" /> Attendance
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Exam selection
  if (view === "exams" && selectedChild) {
    return (
      <div className="view-enter space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setView("list");
              setSelectedChild(null);
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {selectedChild.firstName} {selectedChild.lastName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selectedChild.className} • Select an exam to view report
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {exams.map((exam) => (
            <Card
              key={exam.id}
              className="cursor-pointer hover:shadow-md transition-shadow duration-200"
              onClick={() => handleSelectExam(exam)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{exam.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {exam.term} • {exam.year}
                  </p>
                </div>
                <div className="text-primary">
                  <GraduationCap className="w-5 h-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Report card view
  if (view === "report" && selectedChild && selectedExam) {
    return (
      <div className="view-enter space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setView("exams");
              setReport(null);
              setSelectedExam(null);
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-xl font-bold tracking-tight">
              {selectedChild.firstName} {selectedChild.lastName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selectedExam.name} • {selectedExam.term}
            </p>
          </div>
          {/* Download buttons for parents */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf}>
              {downloadingPdf ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 mr-1.5" />}
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadExcel} disabled={downloadingExcel}>
              {downloadingExcel ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />}
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
            </Button>
          </div>
        </div>

        {loadingReport ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : report ? (
          <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200">
            {/* Report Header */}
            <div className="bg-primary text-primary-foreground text-center py-6 px-4">
              <GraduationCap className="w-8 h-8 mx-auto mb-2" />
              <h3 className="text-xl font-bold">{report.school?.schoolName || "NAKOYONJO DEB PRIMARY SCHOOL"}</h3>
              {report.school?.schoolMotto && (
                <p className="text-primary-foreground/80 text-sm italic">{report.school.schoolMotto}</p>
              )}
              <p className="text-primary-foreground/70 text-xs mt-0.5">
                {report.school?.schoolAddress || "Bungoma, Kenya"}
                {report.school?.schoolPhone ? ` | Tel: ${report.school.schoolPhone}` : ""}
              </p>
            </div>

            <CardContent className="py-6">
              {/* Student Info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mb-6 text-sm bg-primary/10 p-4 rounded-lg">
                <div>
                  <span className="text-muted-foreground">Name:</span>{" "}
                  <strong>
                    {report.student.firstName} {report.student.lastName}
                  </strong>
                </div>
                <div></div>
                <div>
                  <span className="text-muted-foreground">Class:</span>{" "}
                  <strong>{report.class.name}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Exam:</span>{" "}
                  <strong>
                    {report.exam.name} ({report.exam.term})
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Class Teacher:</span>{" "}
                  <strong>{report.classTeacher}</strong>
                </div>
              </div>

              {/* Marks Table */}
              <div className="overflow-x-auto rounded-lg border mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Subject
                      </th>
                      <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                        Code
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">
                        Marks
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">
                        Performance Level
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-muted-foreground">
                        Remarks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.marks.map((m, i) => (
                      <tr
                        key={m.code}
                        className="hover:bg-muted/50"
                      >
                        <td className="px-4 py-2.5 font-medium">{m.subject}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {m.code}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="font-semibold">{m.marksObtained}</span>
                          <span className="text-muted-foreground">/{m.maxMarks}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-block w-8 h-8 rounded-full text-sm font-bold leading-8 ${gradeColor(
                              m.grade
                            )}`}
                          >
                            {m.grade}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-muted-foreground">
                          {m.remarks || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-4 gap-4 bg-primary/10 p-4 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {report.summary.totalMarks}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    / {report.summary.maxTotal} Total
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {report.summary.average}
                  </div>
                  <div className="text-xs text-muted-foreground">Average</div>
                </div>
                <div className="text-center">
                  <div
                    className={`text-3xl font-extrabold ${
                      report.summary.grade.startsWith("EE")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : report.summary.grade.startsWith("ME")
                        ? "text-blue-600 dark:text-blue-400"
                        : report.summary.grade.startsWith("AE")
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {report.summary.grade}
                  </div>
                  <div className="text-xs text-muted-foreground">Performance Level</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {report.summary.rank}
                    <span className="text-base font-normal text-muted-foreground">
                      /{report.summary.totalStudents}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">Position</div>
                </div>
              </div>

              {/* Class Teacher Remark */}
              {report.classTeacherRemark && (
                <div className="mt-4 p-4 rounded-lg border border-amber-200/60 dark:border-amber-800/40 bg-amber-50/40 dark:bg-amber-950/40">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1.5">
                    Class Teacher Remark
                  </p>
                  <p className="text-sm text-foreground italic leading-relaxed">
                    &ldquo;{report.classTeacherRemark}&rdquo;
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  // Attendance view
  if (view === "attendance" && selectedChild) {
    return (
      <div className="view-enter space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setView("list");
              setSelectedChild(null);
              setAttendanceSummary(null);
            }}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {selectedChild.firstName} {selectedChild.lastName}
            </h2>
            <p className="text-sm text-muted-foreground">
              {selectedChild.className} • Attendance History (Last 90 Days)
            </p>
          </div>
        </div>

        {loadingAttendance ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : attendanceSummary ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Attendance Rate</p>
                  <p className={`text-2xl font-bold mt-1 ${attendanceSummary.rate >= 80 ? "text-emerald-600 dark:text-emerald-400" : attendanceSummary.rate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                    {attendanceSummary.rate}%
                  </p>
                </CardContent>
              </Card>
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Days Present</p>
                  <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{attendanceSummary.present}</p>
                </CardContent>
              </Card>
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Days Absent</p>
                  <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{attendanceSummary.absent}</p>
                </CardContent>
              </Card>
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Days Late</p>
                  <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">{attendanceSummary.late}</p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Breakdown */}
            {monthlyAttendance.length > 0 && (
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <p className="text-base font-semibold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    Monthly Breakdown
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs">Month</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground text-xs">Present</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground text-xs">Absent</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground text-xs">Late</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground text-xs">Total</th>
                          <th className="text-center px-3 py-2 font-semibold text-muted-foreground text-xs">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyAttendance.map((m) => (
                          <tr key={m.month} className="hover:bg-muted/50">
                            <td className="px-3 py-2 font-medium">{m.label}</td>
                            <td className="px-3 py-2 text-center text-emerald-600 dark:text-emerald-400">{m.present}</td>
                            <td className="px-3 py-2 text-center text-red-600 dark:text-red-400">{m.absent}</td>
                            <td className="px-3 py-2 text-center text-amber-600 dark:text-amber-400">{m.late}</td>
                            <td className="px-3 py-2 text-center">{m.total}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`font-semibold ${m.rate >= 80 ? "text-emerald-600 dark:text-emerald-400" : m.rate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                                {m.rate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Records */}
            {attendanceRecords.length > 0 && (
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <p className="text-base font-semibold flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" />
                    Recent Attendance
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {attendanceRecords.slice(0, 20).map((r) => (
                      <div key={r.date} className="flex items-center justify-between px-3 py-2 rounded-lg border">
                        <span className="text-sm text-muted-foreground">
                          {new Date(r.date + "T00:00:00").toLocaleDateString("en-KE", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        <Badge
                          className={`text-[11px] ${
                            r.status === "PRESENT"
                              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200/80 dark:hover:bg-emerald-900/60"
                              : r.status === "LATE"
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200/80 dark:hover:bg-amber-900/60"
                              : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 dark:text-red-300 hover:bg-red-200/80 dark:hover:bg-red-900/60"
                          }`}
                        >
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {attendanceRecords.length === 0 && (
              <Card className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p>No attendance records found for the last 90 days.</p>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </div>
    );
  }

  return null;
}
