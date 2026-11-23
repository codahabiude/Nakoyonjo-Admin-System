// FILE: ReportCardView.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/stores/app-store";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Printer, Download, FileDown, FileSpreadsheet, GraduationCap, Save, MessageSquare, Trophy, ArrowUpCircle, Medal } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface ExamOption {
  id: string;
  name: string;
  term: string;
  year: string;
  className: string;
  classId?: string;
}

interface StudentOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface RankingEntry {
  rank: number;
  studentId: string;
  firstName: string;
  lastName: string;
  gender: string;
  totalMarks: number;
  totalPoints: number;
  average: string;
  grade: string;
}

interface RankingData {
  examId: string;
  className: string;
  examName: string;
  term: string;
  year: string;
  maxMarks: number;
  subjectCount: number;
  maxTotal: number;
  ranking: RankingEntry[];
  totalStudents: number;
}

interface ReportData {
  student: {
    firstName: string;
    lastName: string;
    gender: string;
    dateOfBirth: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
  };
  class: { name: string };
  exam: { name: string; term: string; year: string; maxMarks: number };
  classTeacher: string;
  classTeacherRemark?: string;
  /** School identity from Settings */
  school?: {
    schoolName: string;
    schoolMotto: string;
    schoolAddress: string;
    schoolPhone: string;
  };
  /** Term calendar range from Settings, e.g. "06 Jan 2026 – 04 Apr 2026" */
  termRange?: string;
  headTeacher?: string;
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
    totalPoints: number;
    maxPoints: number;
    average: string;
    grade: string;
    rank: number;
    totalStudents: number;
  };
}

export function ReportCardView() {
  const { selectedExamId } = useAppStore();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role || "TEACHER";
  const isTeacher = userRole === "TEACHER";
  const isAdmin = userRole === "ADMIN";

  const [exams, setExams] = useState<ExamOption[]>([]);
  // Classes where the logged-in teacher is THE class teacher (isPrimary).
  const [primaryClassIds, setPrimaryClassIds] = useState<string[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedExam, setSelectedExam] = useState(selectedExamId || "");
  const [selectedStudent, setSelectedStudent] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingAllExcel, setDownloadingAllExcel] = useState(false);
  const [downloadingAllPrint, setDownloadingAllPrint] = useState(false);

  // Class teacher remark state
  const [remark, setRemark] = useState("");
  const [remarkSaved, setRemarkSaved] = useState(true);
  const [savingRemark, setSavingRemark] = useState(false);

  // Class ranking state
  const [ranking, setRanking] = useState<RankingData | null>(null);
  const [loadingRanking, setLoadingRanking] = useState(false);

  // ROLE RULE: only the class teacher of the exam's class — or an admin —
  // may write class-teacher remarks. Subject teachers see the remark
  // read-only instead of discovering a 403 after typing.
  const selectedExamClassId = exams.find((e) => e.id === selectedExam)?.classId ?? null;
  const canWriteRemark =
    isAdmin || (isTeacher && selectedExamClassId !== null && primaryClassIds.includes(selectedExamClassId));

  // Fetch exams list
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await apiFetch("/api/exams");
        const data = await res.json();
        if (data.exams) {
          setExams(data.exams);
          if (selectedExamId) setSelectedExam(selectedExamId);
        }
      } catch { toast.error("Failed to fetch exams"); }
      setLoading(false);
    }
    load();
  }, [selectedExamId]);

  // Fetch which classes this teacher is the class teacher of
  useEffect(() => {
    if (userRole !== "TEACHER") { setPrimaryClassIds([]); return; }
    let cancelled = false;
    apiFetch("/api/my-class")
      .then((res) => (res.ok ? res.json() : { classes: [] }))
      .then((data) => {
        if (cancelled) return;
        setPrimaryClassIds(
          (data.classes || [])
            .filter((c: { isPrimary?: boolean }) => c.isPrimary)
            .map((c: { classId: string }) => c.classId)
        );
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userRole]);

  // Fetch students when exam is selected
  useEffect(() => {
    setSelectedStudent("");
    setReport(null);
    if (!selectedExam) { setStudents([]); return; }
    async function load() {
      try {
        const res = await apiFetch(`/api/marks?examId=${selectedExam}`);
        const data = await res.json();
        if (data.students) {
          setStudents(data.students);
          setReport(null);
        }
      } catch { /* */ }
    }
    load();
  }, [selectedExam]);

  // Fetch report when exam + student selected
  const fetchReport = useCallback(async () => {
    if (!selectedExam || !selectedStudent) return;
    setLoadingReport(true);
    try {
      const res = await apiFetch("/api/marks", {
        method: "POST",
        body: JSON.stringify({ studentId: selectedStudent, examId: selectedExam }),
      });
      const data = await res.json();
      if (data.error) { toast.error(data.error); } else { setReport(data); }
    } catch { toast.error("Failed to load report"); }
    setLoadingReport(false);
  }, [selectedExam, selectedStudent]);

  useEffect(() => {
    if (selectedExam && selectedStudent) fetchReport();
  }, [fetchReport, selectedExam, selectedStudent]);

  // Fetch class ranking when exam is selected
  useEffect(() => {
    if (!selectedExam) { setRanking(null); return; }
    async function loadRanking() {
      setLoadingRanking(true);
      try {
        const res = await apiFetch(`/api/marks/ranking?examId=${selectedExam}`);
        const data = await res.json();
        if (data.ranking) setRanking(data);
      } catch { /* silent */ }
      setLoadingRanking(false);
    }
    loadRanking();
  }, [selectedExam]);

  // Fetch class teacher remark when report loads
  useEffect(() => {
    if (!selectedExam || !selectedStudent) { setRemark(""); return; }
    async function loadRemark() {
      try {
        const res = await apiFetch(`/api/exam-remarks?examId=${selectedExam}`);
        const data = await res.json();
        if (data.remarks && data.remarks[selectedStudent]) {
          setRemark(data.remarks[selectedStudent].remark);
        } else {
          setRemark("");
        }
        setRemarkSaved(true);
      } catch { /* silent */ }
    }
    loadRemark();
  }, [selectedExam, selectedStudent]);

  const saveRemark = async () => {
    if (!selectedExam || !selectedStudent || !remark.trim()) return;
    setSavingRemark(true);
    try {
      const res = await apiFetch("/api/exam-remarks", {
        method: "PUT",
        body: JSON.stringify({ examId: selectedExam, studentId: selectedStudent, remark: remark.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Remark saved");
        setRemarkSaved(true);
      } else {
        toast.error(data.error || "Failed to save remark");
      }
    } catch { toast.error("Failed to save remark"); }
    setSavingRemark(false);
  };

  const escHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const handlePrint = () => {
    if (!report) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.warning("Pop-up blocked. Please allow pop-ups for this site to print."); return; }

    const gradeColor = (g: string) => {
      if (g.startsWith("EE")) return "#059669";
      if (g.startsWith("ME")) return "#2563eb";
      if (g.startsWith("AE")) return "#d97706";
      return "#dc2626";
    };

    const rankingRows = ranking ? ranking.ranking.map((r) => {
      const isCurrent = r.studentId === selectedStudent;
      const isTop3 = r.rank <= 3;
      return `<tr style="${isCurrent ? 'background:#eff6ff;font-weight:600;' : r.rank % 2 === 0 ? 'background:#f9fafb;' : ''}">
        <td style="text-align:center;padding:6px 10px;font-size:12px;${isTop3 ? 'font-weight:700;color:' + (r.rank === 1 ? '#d97706;' : r.rank === 2 ? '#6b7280;' : '#92400e;') : ''}">${r.rank}</td>
        <td style="padding:6px 10px;font-size:12px;${isCurrent ? 'font-weight:700;' : ''}">${isCurrent ? '&#9654; ' : ''}${escHtml(r.lastName)}, ${escHtml(r.firstName)}</td>
        <td style="text-align:center;padding:6px 10px;font-size:12px;font-weight:600;color:#7c3aed">${r.totalPoints}</td>
        <td style="text-align:center;padding:6px 10px;font-size:12px;">${r.totalMarks}/${ranking.maxTotal}</td>
        <td style="text-align:center;padding:6px 10px;font-size:12px;">${r.average}</td>
        <td style="text-align:center;padding:6px 10px;font-size:12px;font-weight:700;color:${gradeColor(r.grade)}">${r.grade}</td>
      </tr>`;
    }).join("") : "";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head><title>Report Card - ${escHtml(report.student.firstName)} ${escHtml(report.student.lastName)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 30px; color: #1a1a1a; }
        .header { text-align: center; border-bottom: 3px double #166534; padding-bottom: 15px; margin-bottom: 20px; }
        .header h1 { font-size: 20px; color: #166534; }
        .header h2 { font-size: 14px; color: #555; margin-top: 4px; }
        .header p { font-size: 11px; color: #888; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 20px; font-size: 13px; }
        .info-grid .label { color: #666; }
        .info-grid .value { font-weight: 600; }
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
        .ranking-section { margin-top: 20px; page-break-inside: avoid; }
        .ranking-section h3 { font-size: 14px; color: #166534; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #d97706; }
        .ranking-section td:first-child, .ranking-section td:nth-child(2) { text-align: left; }
        .footer { display: flex; justify-content: space-between; margin-top: 50px; font-size: 12px; color: #666; }
        .sign-line { border-top: 1px solid #ccc; padding-top: 4px; min-width: 180px; text-align: center; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      <div class="header">
        <h1>${escHtml(report.school?.schoolName || "NAKOYONJO DEB PRIMARY SCHOOL")}</h1>
        ${report.school?.schoolMotto ? `<h2 style="font-style:italic">${escHtml(report.school.schoolMotto)}</h2>` : ""}
        <h2>Student Report Card</h2>
        <p>${escHtml(report.school?.schoolAddress || "Bungoma, Kenya")}${report.school?.schoolPhone ? ` | Tel: ${escHtml(report.school.schoolPhone)}` : ""}</p>
      </div>
      <div class="info-grid">
        <div><span class="label">Name: </span><span class="value">${escHtml(report.student.firstName)} ${escHtml(report.student.lastName)}</span></div>
        <div><span class="label">Class: </span><span class="value">${escHtml(report.class.name)}</span></div>
        <div><span class="label">Gender: </span><span class="value">${escHtml(report.student.gender)}</span></div>
        <div><span class="label">Exam: </span><span class="value">${escHtml(report.exam.name)} (${escHtml(report.exam.term)}, ${escHtml(String(report.exam.year))})${report.termRange ? ` — ${escHtml(report.termRange)}` : ""}</span></div>
        <div><span class="label">Class Teacher: </span><span class="value">${escHtml(report.classTeacher)}</span></div>
      </div>
      <table>
        <thead><tr><th style="text-align:left">Subject</th><th style="text-align:left">Code</th><th>Marks</th><th>Performance Level</th><th>Remarks</th></tr></thead>
        <tbody>
          ${report.marks.map((m) => `
            <tr><td>${escHtml(m.subject)}</td><td>${escHtml(m.code)}</td><td><strong>${m.marksObtained}</strong> / ${m.maxMarks}</td><td style="color:${gradeColor(m.grade)};font-weight:700">${escHtml(m.grade)}</td><td>${escHtml(m.remarks || "")}</td></tr>
          `).join("")}
        </tbody>
      </table>
      <div class="summary">
        <div class="summary-item"><div class="num">${report.summary.totalMarks}</div><div class="lbl">Total Marks / ${report.summary.maxTotal}</div></div>
        <div class="summary-item"><div class="num" style="color:#7c3aed">${report.summary.totalPoints}</div><div class="lbl">Points / ${report.summary.maxPoints}</div></div>
        <div class="summary-item"><div class="num">${report.summary.average}</div><div class="lbl">Average</div></div>
        <div class="summary-item"><div class="num grade-big" style="color:${gradeColor(report.summary.grade)}">${report.summary.grade}</div><div class="lbl">Performance Level</div></div>
        <div class="summary-item"><div class="num">${report.summary.rank} / ${report.summary.totalStudents}</div><div class="lbl">Position in Class</div></div>
      </div>
      ${remark.trim() ? `
      <div style="margin-top:16px;padding:12px 16px;background:#f0fdf4;border-left:3px solid #166534;border-radius:4px;">
        <div style="font-size:11px;font-weight:600;color:#166534;margin-bottom:4px;">Class Teacher Remark</div>
        <div style="font-size:13px;font-style:italic;color:#333;">"${escHtml(remark)}"</div>
      </div>` : ""}
      ${ranking && rankingRows ? `
      <div class="ranking-section">
        <h3>Class Ranking — ${ranking.className} (${ranking.examName})</h3>
        <table>
          <thead><tr><th style="text-align:center">Pos.</th><th style="text-align:left">Student</th><th>Pts</th><th>Total Marks</th><th>Average</th><th>Level</th></tr></thead>
          <tbody>${rankingRows}</tbody>
        </table>
      </div>` : ""}
      <div class="footer">
        <div class="sign-line">Class Teacher</div>
        <div class="sign-line">${report.headTeacher ? `${escHtml(report.headTeacher)}<br/>Head Teacher` : "Head Teacher"}</div>
      </div>
      <script>window.onload = function() { window.print(); }<\/script>
      </body></html>
    `);
    printWindow.document.close();
  };

  const handlePrintAll = async () => {
    if (!selectedExam || students.length === 0) return;
    setDownloadingAllPrint(true);
    toast.info(`Generating ${students.length} report cards...`);

    try {
      const allReports: ReportData[] = [];
    for (const s of students) {
      try {
        const res = await apiFetch("/api/marks", {
          method: "POST",
          body: JSON.stringify({ studentId: s.id, examId: selectedExam }),
        });
        const data = await res.json();
        if (!data.error) allReports.push(data);
      } catch { /* skip */ }
    }

    if (allReports.length === 0) { setDownloadingAllPrint(false); toast.error("No reports generated"); return; }

    const gradeColor = (g: string) => {
      if (g.startsWith("EE")) return "#059669"; if (g.startsWith("ME")) return "#2563eb";
      if (g.startsWith("AE")) return "#d97706"; return "#dc2626";
    };

    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.warning("Pop-up blocked. Please allow pop-ups for this site to print."); setDownloadingAllPrint(false); return; }
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>All Report Cards</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; }
        .report { padding: 25px 30px; page-break-after: always; }
        .header { text-align: center; border-bottom: 3px double #166534; padding-bottom: 12px; margin-bottom: 15px; }
        .header h1 { font-size: 18px; color: #166534; }
        .header h2 { font-size: 13px; color: #555; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 15px; font-size: 12px; }
        .info-grid .label { color: #666; } .info-grid .value { font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        th { background: #166534; color: white; padding: 6px 10px; text-align: center; font-size: 11px; }
        td { padding: 5px 10px; text-align: center; border-bottom: 1px solid #e5e5e5; font-size: 11px; }
        tr:nth-child(even) { background: #f9fafb; }
        td:first-child, td:nth-child(2) { text-align: left; }
        .summary { display: flex; justify-content: space-between; border-top: 2px solid #166534; padding-top: 10px; margin-bottom: 15px; }
        .summary-item { text-align: center; }
        .summary-item .num { font-size: 20px; font-weight: 700; color: #166534; }
        .summary-item .lbl { font-size: 10px; color: #666; }
        .grade-big { font-size: 30px; font-weight: 800; }
        .footer { display: flex; justify-content: space-between; margin-top: 40px; font-size: 11px; color: #666; }
        .sign-line { border-top: 1px solid #ccc; padding-top: 4px; min-width: 160px; text-align: center; }
        @media print { .report { page-break-after: always; } }
      </style></head><body>
      ${allReports.map((r) => `
        <div class="report">
          <div class="header">
            <h1>${escHtml(r.school?.schoolName || "NAKOYONJO DEB PRIMARY SCHOOL")}</h1>
            ${r.school?.schoolMotto ? `<h2 style="font-style:italic">${escHtml(r.school.schoolMotto)}</h2>` : ""}
            <h2>Student Report Card</h2>
          </div>
          <div class="info-grid">
            <div><span class="label">Name: </span><span class="value">${escHtml(r.student.firstName)} ${escHtml(r.student.lastName)}</span></div>
            <div><span class="label">Class: </span><span class="value">${escHtml(r.class.name)}</span></div>
            <div><span class="label">Exam: </span><span class="value">${escHtml(r.exam.name)} (${escHtml(r.exam.term)})</span></div>
          </div>
          <table><thead><tr><th style="text-align:left">Subject</th><th style="text-align:left">Code</th><th>Marks</th><th>Level</th></tr></thead>
          <tbody>${r.marks.map((m) => `<tr><td>${escHtml(m.subject)}</td><td>${escHtml(m.code)}</td><td>${m.marksObtained}/${m.maxMarks}</td><td style="color:${gradeColor(m.grade)};font-weight:700">${escHtml(m.grade)}</td></tr>`).join("")}</tbody></table>
          <div class="summary">
            <div class="summary-item"><div class="num">${r.summary.totalMarks}/${r.summary.maxTotal}</div><div class="lbl">Total</div></div>
            <div class="summary-item"><div class="num" style="color:#7c3aed">${r.summary.totalPoints}/${r.summary.maxPoints}</div><div class="lbl">Points</div></div>
            <div class="summary-item"><div class="num">${r.summary.average}</div><div class="lbl">Average</div></div>
            <div class="summary-item"><div class="num grade-big" style="color:${gradeColor(r.summary.grade)}">${r.summary.grade}</div><div class="lbl">Performance Level</div></div>
            <div class="summary-item"><div class="num">${r.summary.rank}/${r.summary.totalStudents}</div><div class="lbl">Position</div></div>
          </div>
          <div class="footer"><div class="sign-line">Class Teacher</div><div class="sign-line">${r.headTeacher ? `${escHtml(r.headTeacher)}<br/>Head Teacher` : "Head Teacher"}</div></div>
        </div>
      `).join("")}
      <script>window.onload = function() { window.print(); }<\/script>
      </body></html>
    `);
    printWindow.document.close();
    toast.success(`${allReports.length} report cards generated!`);
    } catch {
      toast.error("Failed to generate report cards");
    }
    setDownloadingAllPrint(false);
  };

  // Helper to download a blob
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
    if (!report || !selectedExam || !selectedStudent) return;
    setDownloadingPdf(true);
    try {
      const ok = await downloadBlob(
        "/api/report-pdf",
        { method: "POST", body: JSON.stringify({ studentId: selectedStudent, examId: selectedExam }) },
        `Report_${report.student.lastName}_${report.exam.name.replace(/\s+/g, "_")}.pdf`
      );
      if (ok) toast.success("PDF downloaded!");
    } catch { toast.error("Download failed"); }
    setDownloadingPdf(false);
  };

  const handleDownloadExcel = async () => {
    if (!report || !selectedExam || !selectedStudent) return;
    setDownloadingExcel(true);
    try {
      const ok = await downloadBlob(
        "/api/report-excel",
        { method: "POST", body: JSON.stringify({ studentId: selectedStudent, examId: selectedExam }) },
        `Report_${report.student.lastName}_${report.exam.name.replace(/\s+/g, "_")}.xlsx`
      );
      if (ok) toast.success("Excel downloaded!");
    } catch { toast.error("Download failed"); }
    setDownloadingExcel(false);
  };

  const handleDownloadAllPdf = async () => {
    if (!selectedExam || students.length === 0) return;
    setDownloadingAll(true);
    toast.info(`Generating PDFs for ${students.length} students...`);
    try {
      const ok = await downloadBlob(
        "/api/report-pdf/all",
        { method: "POST", body: JSON.stringify({ examId: selectedExam }) },
        `Report_Cards_${selectedExam}.zip`
      );
      if (ok) toast.success(`ZIP with ${students.length} report cards downloaded!`);
    } catch { toast.error("Download failed"); }
    setDownloadingAll(false);
  };

  const handleDownloadAllExcel = async () => {
    if (!selectedExam || students.length === 0) return;
    setDownloadingAllExcel(true);
    toast.info("Generating class marksheet...");
    try {
      const ok = await downloadBlob(
        `/api/report-excel?examId=${selectedExam}`,
        { method: "GET" },
        `Marksheet_${selectedExam}.xlsx`
      );
      if (ok) toast.success("Class marksheet (Excel) downloaded!");
    } catch { toast.error("Download failed"); }
    setDownloadingAllExcel(false);
  };

  if (loading) {
    return (
      <div className="view-enter space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
        </div>
        <Card>
          <CardContent className="py-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="view-enter space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Report Cards</h2>
          <p className="text-muted-foreground text-sm mt-1">View and download student report cards (PDF & Excel)</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="hover:shadow-md transition-shadow duration-200">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="block text-sm font-medium mb-1">Select Exam</Label>
              <Select value={selectedExam} onValueChange={(v) => { setSelectedExam(v); setSelectedStudent(""); }}>
                <SelectTrigger><SelectValue placeholder="Choose an exam" /></SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} — {e.className} ({e.term})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="block text-sm font-medium mb-1">Select Student</Label>
              <Select value={selectedStudent} onValueChange={setSelectedStudent} disabled={!selectedExam}>
                <SelectTrigger><SelectValue placeholder="Choose a student" /></SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.lastName}, {s.firstName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleDownloadPdf} disabled={!report || downloadingPdf}>
                {downloadingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
                PDF
              </Button>
              <Button variant="outline" onClick={handleDownloadExcel} disabled={!report || downloadingExcel}>
                {downloadingExcel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                Excel
              </Button>
              <Button variant="outline" onClick={handlePrint} disabled={!report}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Download Card */}
      {selectedExam && students.length > 0 && (
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">Download All Students</h3>
                <p className="text-xs text-muted-foreground">{students.length} students in this exam</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={handleDownloadAllPdf} disabled={downloadingAll}>
                  {downloadingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  All PDFs (ZIP)
                </Button>
                <Button variant="outline" onClick={handleDownloadAllExcel} disabled={downloadingAllExcel}>
                  {downloadingAllExcel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                  Class Marksheet (Excel)
                </Button>
                <Button variant="outline" onClick={handlePrintAll} disabled={downloadingAllPrint}>
                  {downloadingAllPrint ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
                  {downloadingAllPrint ? "Generating..." : "Print All"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Card Preview */}
      {loadingReport ? (
        <Card>
          <CardContent className="py-6 space-y-4">
            <Skeleton className="h-20 w-full rounded-t-lg" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </CardContent>
        </Card>
      ) : report ? (
        <div ref={reportRef}>
          <Card className="overflow-hidden">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mb-6 text-sm bg-muted/50 p-4 rounded-lg">
                <div><span className="text-muted-foreground">Name:</span> <strong>{report.student.firstName} {report.student.lastName}</strong></div>
                <div><span className="text-muted-foreground">Class:</span> <strong>{report.class.name}</strong></div>
                <div><span className="text-muted-foreground">Exam:</span> <strong>{report.exam.name} ({report.exam.term})</strong></div>
                <div><span className="text-muted-foreground">Class Teacher:</span> <strong>{report.classTeacher}</strong></div>
                <div><span className="text-muted-foreground">Gender:</span> <strong>{report.student.gender}</strong></div>
              </div>

              {/* Marks Table */}
              <div className="overflow-x-auto rounded-lg border mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left px-4 py-3 font-semibold">Subject</th>
                      <th className="text-left px-4 py-3 font-semibold">Code</th>
                      <th className="text-center px-4 py-3 font-semibold">Marks</th>
                      <th className="text-center px-4 py-3 font-semibold">Performance Level</th>
                      <th className="text-center px-4 py-3 font-semibold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.marks.map((m) => (
                      <tr key={m.code} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 font-medium">{m.subject}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{m.code}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="font-semibold">{m.marksObtained}</span>
                          <span className="text-muted-foreground">/{m.maxMarks}</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block min-w-[2.5rem] h-8 rounded-full text-xs font-bold leading-8 px-1 ${
                            m.grade.startsWith("EE") ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                            m.grade.startsWith("ME") ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" :
                            m.grade.startsWith("AE") ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                            "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 dark:text-red-300"
                          }`}>
                            {m.grade}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center text-muted-foreground">{m.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-5 gap-3 bg-primary/10 p-4 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{report.summary.totalMarks}</div>
                  <div className="text-xs text-muted-foreground">/ {report.summary.maxTotal} Total</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{report.summary.totalPoints}</div>
                  <div className="text-xs text-muted-foreground">/ {report.summary.maxPoints} Points</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{report.summary.average}</div>
                  <div className="text-xs text-muted-foreground">Average</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-extrabold ${
                    report.summary.grade.startsWith("EE") ? "text-emerald-600 dark:text-emerald-400" :
                    report.summary.grade.startsWith("ME") ? "text-blue-600 dark:text-blue-400" :
                    report.summary.grade.startsWith("AE") ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {report.summary.grade}
                  </div>
                  <div className="text-xs text-muted-foreground">Performance Level</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{report.summary.rank}<span className="text-base font-normal text-muted-foreground">/{report.summary.totalStudents}</span></div>
                  <div className="text-xs text-muted-foreground">Position</div>
                </div>
              </div>

              {/* Class Teacher Remark */}
              <div className="mt-6 border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Class Teacher Remark</span>
                  </div>
                  {canWriteRemark && remark.trim() && (
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${remarkSaved ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"}`}>
                      {remarkSaved ? "Saved" : "Unsaved"}
                    </span>
                  )}
                </div>
                {canWriteRemark ? (
                  <>
                    <textarea
                      className="w-full min-h-[80px] text-sm bg-background border rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                      placeholder="Write a general remark about this student's performance, behaviour, and areas for improvement..."
                      value={remark}
                      onChange={(e) => { setRemark(e.target.value); setRemarkSaved(false); }}
                      maxLength={500}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] text-muted-foreground">{remark.length}/500 characters</span>
                      <Button
                        size="sm"
                        disabled={remarkSaved || savingRemark || !remark.trim()}
                        onClick={saveRemark}
                        className="h-8 text-xs"
                      >
                        {savingRemark ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                        {savingRemark ? "Saving..." : "Save Remark"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className={`text-sm ${remark ? "text-foreground italic" : "text-muted-foreground"}`}>
                      {remark ? `"${remark}"` : "No remark written yet."}
                    </p>
                    {isTeacher && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Only the class teacher of this class can write remarks.
                      </p>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="hover:shadow-md transition-shadow duration-200">
          <CardContent className="py-12 text-center text-muted-foreground">
            Select an exam and student to view their report card.
          </CardContent>
        </Card>
      )}

      {/* Class Ranking Table */}
      {selectedExam && ranking && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Class Ranking</h3>
                  <p className="text-sm text-muted-foreground">
                    {ranking.className} — {ranking.examName} ({ranking.term}, {ranking.year})
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {ranking.totalStudents} students
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-center px-3 py-3 font-semibold w-14">Pos.</th>
                    <th className="text-left px-3 py-3 font-semibold">Student Name</th>
                    <th className="text-center px-3 py-3 font-semibold">Gender</th>
                    <th className="text-center px-3 py-3 font-semibold">Points</th>
                    <th className="text-center px-3 py-3 font-semibold">Total Marks</th>
                    <th className="text-center px-3 py-3 font-semibold">Average</th>
                    <th className="text-center px-2 py-3 font-semibold">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.ranking.map((entry) => {
                    const isCurrentStudent = entry.studentId === selectedStudent;
                    const isFirst = entry.rank === 1;
                    const isSecond = entry.rank === 2;
                    const isThird = entry.rank === 3;

                    return (
                      <tr
                        key={entry.studentId}
                        className={`border-b transition-colors ${
                          isCurrentStudent
                            ? "bg-primary/10 font-semibold"
                            : entry.rank % 2 === 0
                              ? "bg-muted/20"
                              : ""
                        } hover:bg-muted/50 cursor-pointer ${isCurrentStudent ? "ring-2 ring-primary/30 ring-inset" : ""}`}
                        onClick={() => setSelectedStudent(entry.studentId)}
                      >
                        <td className="text-center px-4 py-2.5">
                          {isFirst ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                              <Medal className="w-4 h-4" /> 1
                            </span>
                          ) : isSecond ? (
                            <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 font-bold">
                              <Medal className="w-4 h-4" /> 2
                            </span>
                          ) : isThird ? (
                            <span className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-300 font-bold">
                              <Medal className="w-4 h-4" /> 3
                            </span>
                          ) : (
                            <span className="text-muted-foreground font-medium">{entry.rank}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {isCurrentStudent && (
                              <ArrowUpCircle className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                            <span>{entry.lastName}, {entry.firstName}</span>
                          </div>
                        </td>
                        <td className="text-center px-4 py-2.5 text-muted-foreground">
                          {entry.gender === "MALE" ? "Boy" : "Girl"}
                        </td>
                        <td className="text-center px-3 py-2.5 font-bold text-violet-600 dark:text-violet-400">
                          {entry.totalPoints}
                        </td>
                        <td className="text-center px-3 py-2.5 font-semibold">
                          {entry.totalMarks}<span className="text-muted-foreground font-normal">/{ranking.maxTotal}</span>
                        </td>
                        <td className={`text-center px-3 py-2.5 font-semibold ${
                          parseFloat(entry.average) >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                          parseFloat(entry.average) >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"
                        }`}>
                          {entry.average}
                        </td>
                        <td className="text-center px-2 py-2.5">
                          <span className={`inline-block min-w-[2.5rem] h-7 rounded-full text-xs font-bold leading-7 px-1 ${
                            entry.grade.startsWith("EE") ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" :
                            entry.grade.startsWith("ME") ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" :
                            entry.grade.startsWith("AE") ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                            "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 dark:text-red-300"
                          }`}>
                            {entry.grade}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      {selectedExam && loadingRanking && (
        <Card>
          <CardContent className="py-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}