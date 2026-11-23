"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingUp, PieChartIcon, UserSearch,
  Download, Loader2, ArrowUpDown, Trophy, AlertTriangle,
  Target, BarChart2, Users, BookOpen, GraduationCap, FileText, Scale,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────

type ReportTab = "subject-analysis" | "class-comparison" | "grade-distribution" | "student-trends";

interface ExamOption {
  id: string; name: string; term: string; year: string;
  className: string; classId: string; status: string;
}

interface SubjectAnalysisData {
  rankingMethod?: string;
  exam: { id: string; name: string; term: string; year: string; status: string; className: string; classId: string };
  subjects: Array<{
    subjectId: string; subjectName: string; subjectCode: string;
    totalStudents: number; mean: number; highest: number; lowest: number;
    passRate: number; avgPoints: number;
    gradeDistribution: { EE: number; ME: number; AE: number; BE: number };
    detailedDistribution?: Record<string, number>;
    topStudents: Array<{ studentId: string; name: string; marks: number; points?: number }>;
    bottomStudents: Array<{ studentId: string; name: string; marks: number; points?: number }>;
  }>;
}

interface ClassComparisonData {
  term: string; year: string; rankingMethod?: string;
  /** Present when the API returns an empty-data explanation. */
  message?: string;
  classes: Array<{
    classId: string; className: string; overallAverage: number; overallPoints: number;
    totalExams: number; bestExam: { examId: string; examName: string; avgMarks: number; avgPoints: number; studentCount: number };
    weakExam: { examId: string; examName: string; avgMarks: number; avgPoints: number; studentCount: number };
    exams: Array<{ examId: string; examName: string; avgMarks: number; avgPoints: number; studentCount: number }>;
  }>;
}

interface GradeDistData {
  exam: { id: string; name: string; term: string; year: string; className: string; classId: string };
  subjects: Array<{
    subjectId: string; subjectName: string; subjectCode: string;
    total: number; grades: { EE: number; ME: number; AE: number; BE: number };
    percentages: { EE: number; ME: number; AE: number; BE: number };
  }>;
  overall: {
    grades: { EE: number; ME: number; AE: number; BE: number };
    total: number;
    percentages: { EE: number; ME: number; AE: number; BE: number };
  };
}

interface StudentTrendData {
  student: { id: string; name: string; className: string; classId?: string };
  /** Present when the API returns an empty-data explanation. */
  message?: string;
  exams: Array<{
    examId: string; examName: string; term: string; year: number;
    className: string; status: string;
    subjects: Array<{ subjectId: string; subjectName: string; subjectCode: string; marks: number; grade: string; detailedGrade?: string; points?: number }>;
    totalMarks: number; totalPoints: number; averageMarks: number; averagePoints: number; totalSubjects: number;
    gradeCounts: { EE: number; ME: number; AE: number; BE: number };
  }>;
  subjects: Array<{
    subjectId: string; subjectName: string; subjectCode: string;
    dataPoints: Array<{ examId: string; examName: string; term: string; year: number; marks: number; points?: number; grade?: string; detailedGrade?: string }>;
  }>;
  overallTrend: Array<{ examName: string; term: string; year: number; averageMarks: number; averagePoints: number; totalMarks: number; totalPoints: number }>;
}

interface StudentOption {
  id: string; name: string; className: string;
}

// ─── Color constants ────────────────────────────────────────
const GRADE_COLORS: Record<string, string> = {
  EE: "#059669",
  ME: "#2563EB",
  AE: "#D97706",
  BE: "#DC2626",
};

const GRADE_LABELS: Record<string, string> = {
  EE: "Exceeding Expectations",
  ME: "Meeting Expectations",
  AE: "Approaching Expectations",
  BE: "Below Expectations",
};

const DETAILED_GRADE_COLORS: Record<string, string> = {
  EE1: "#047857", EE2: "#059669", ME1: "#1D4ED8", ME2: "#2563EB",
  AE1: "#B45309", AE2: "#D97706", BE1: "#B91C1C", BE2: "#DC2626",
};

const CHART_COLORS = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2", "#C026D3", "#EA580C"];

// Theme-aware Recharts tooltip styles (work in light + dark mode)
const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "13px",
  },
  itemStyle: { color: "var(--color-foreground)" },
  labelStyle: { color: "var(--color-muted-foreground)" },
  cursor: { fill: "var(--color-muted)", opacity: 0.5 },
};

// ─── Component ──────────────────────────────────────────────

export function PerformanceReportsView() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";

  // State
  const [activeTab, setActiveTab] = useState<ReportTab>("subject-analysis");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Selector data
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [terms, setTerms] = useState<{ term: string; year: string }[]>([]);

  // Selected filters
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  // Report data
  const [subjectData, setSubjectData] = useState<SubjectAnalysisData | null>(null);
  const [classData, setClassData] = useState<ClassComparisonData | null>(null);
  const [gradeData, setGradeData] = useState<GradeDistData | null>(null);
  const [trendData, setTrendData] = useState<StudentTrendData | null>(null);

  // Ranking method: points (CBC 8-level) or average
  const [rankingMethod, setRankingMethod] = useState<"points" | "average">("points");

  // Sort state
  const [subjectSort, setSubjectSort] = useState<"name" | "mean" | "avgPoints" | "highest" | "passRate">("avgPoints");
  const [subjectSortDir, setSubjectSortDir] = useState<"asc" | "desc">("desc");

  // ─── Fetch exams ───────────────────────────────────────
  const fetchExams = useCallback(async () => {
    try {
      const res = await apiFetch("/api/exams");
      if (!res.ok) return;
      const data = await res.json();
      const examList: ExamOption[] = (data.exams || []).map((e: any) => ({
        id: e.id, name: e.name, term: e.term, year: e.year,
        // /api/exams returns className as a flat field (not a nested class object)
        className: e.className || e.class?.name || "", classId: e.classId, status: e.status,
      }));
      setExams(examList);

      // Extract unique term/year combos
      const seen = new Set<string>();
      const tList: { term: string; year: string }[] = [];
      for (const e of examList) {
        const key = `${e.term}-${e.year}`;
        if (!seen.has(key)) {
          seen.add(key);
          tList.push({ term: e.term, year: e.year });
        }
      }
      setTerms(tList);
    } catch (err) {
      console.error("Failed to fetch exams:", err);
    }
  }, []);

  // ─── Fetch students ────────────────────────────────────
  const fetchStudents = useCallback(async (search: string) => {
    if (search.length < 1) { setStudents([]); return; }
    try {
      const res = await apiFetch(`/api/students?search=${encodeURIComponent(search)}&status=ACTIVE&limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      setStudents((data.students || []).map((s: any) => ({
        id: s.id, name: `${s.firstName} ${s.lastName}`, className: s.class?.name || "",
      })));
    } catch (err) {
      console.error("Failed to fetch students:", err);
    }
  }, []);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  // Debounced student search
  useEffect(() => {
    const t = setTimeout(() => { fetchStudents(studentSearch); }, 300);
    return () => clearTimeout(t);
  }, [studentSearch, fetchStudents]);

  // ─── Fetch reports ─────────────────────────────────────
  const fetchReport = useCallback(async (type: ReportTab) => {
    setLoading(true);
    setError("");
    try {
      let url = `/api/performance-reports?type=${type}`;
      // Pass ranking method for applicable report types
      if (type === "subject-analysis" || type === "class-comparison") {
        url += `&rankingMethod=${rankingMethod}`;
      }
      if (type === "subject-analysis" || type === "grade-distribution") {
        if (!selectedExamId) { setError("Please select an exam"); setLoading(false); return; }
        url += `&examId=${selectedExamId}`;
      } else if (type === "class-comparison") {
        if (!selectedTerm || !selectedYear) { setError("Please select a term and year"); setLoading(false); return; }
        url += `&term=${encodeURIComponent(selectedTerm)}&year=${selectedYear}`;
      } else if (type === "student-trends") {
        if (!selectedStudentId) { setError("Please select a student"); setLoading(false); return; }
        url += `&studentId=${selectedStudentId}`;
      }

      const res = await apiFetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to fetch report" }));
        setError(err.error || "Failed to fetch report");
        setLoading(false);
        return;
      }
      const data = await res.json();

      if (type === "subject-analysis") setSubjectData(data);
      else if (type === "class-comparison") setClassData(data);
      else if (type === "grade-distribution") setGradeData(data);
      else if (type === "student-trends") setTrendData(data);
    } catch (err) {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }, [selectedExamId, selectedTerm, selectedYear, selectedStudentId, rankingMethod]);

  // Auto-fetch when tab changes and filters are set
  useEffect(() => {
    if (activeTab === "subject-analysis" || activeTab === "grade-distribution") {
      if (selectedExamId) fetchReport(activeTab);
    } else if (activeTab === "class-comparison") {
      if (selectedTerm && selectedYear) fetchReport(activeTab);
    } else if (activeTab === "student-trends") {
      if (selectedStudentId) fetchReport(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Re-fetch when ranking method changes (admin toggle)
  useEffect(() => {
    if (activeTab === "subject-analysis" && selectedExamId) fetchReport("subject-analysis");
    else if (activeTab === "class-comparison" && selectedTerm && selectedYear) fetchReport("class-comparison");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankingMethod]);

  // ─── Export helpers ────────────────────────────────────
  const exportCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportSubjectAnalysisCSV = () => {
    if (!subjectData) return;
    let csv = "Subject,Code,Students,Mean,Avg Points,Highest,Lowest,Pass Rate%,EE,ME,AE,BE\n";
    for (const s of subjectData.subjects) {
      csv += `"${s.subjectName}",${s.subjectCode},${s.totalStudents},${s.mean},${s.avgPoints},${s.highest},${s.lowest},${s.passRate},${s.gradeDistribution.EE},${s.gradeDistribution.ME},${s.gradeDistribution.AE},${s.gradeDistribution.BE}\n`;
    }
    exportCSV(csv, `subject-analysis-${subjectData.exam.name}.csv`);
  };

  const exportGradeDistCSV = () => {
    if (!gradeData) return;
    let csv = "Subject,Code,Total,EE,EE%,ME,ME%,AE,AE%,BE,BE%\n";
    for (const s of gradeData.subjects) {
      csv += `"${s.subjectName}",${s.subjectCode},${s.total},${s.grades.EE},${s.percentages.EE},${s.grades.ME},${s.percentages.ME},${s.grades.AE},${s.percentages.AE},${s.grades.BE},${s.percentages.BE}\n`;
    }
    csv += `\nOVERALL,${gradeData.overall.total},${gradeData.overall.grades.EE},${gradeData.overall.percentages.EE},${gradeData.overall.grades.ME},${gradeData.overall.percentages.ME},${gradeData.overall.grades.AE},${gradeData.overall.percentages.AE},${gradeData.overall.grades.BE},${gradeData.overall.percentages.BE}\n`;
    exportCSV(csv, `grade-distribution-${gradeData.exam.name}.csv`);
  };

  const exportClassComparisonCSV = () => {
    if (!classData) return;
    let csv = "Class,Overall Average,Overall Points,Total Exams,Best Exam,Best Avg,Weakest Exam,Weakest Avg\n";
    for (const c of classData.classes) {
      csv += `"${c.className}",${c.overallAverage},${c.overallPoints},${c.totalExams},"${c.bestExam.examName}",${c.bestExam.avgMarks},"${c.weakExam.examName}",${c.weakExam.avgMarks}\n`;
    }
    exportCSV(csv, `class-comparison-${classData.term}-${classData.year}.csv`);
  };

  const exportStudentTrendCSV = () => {
    if (!trendData) return;
    let csv = `Student: ${trendData.student.name} (${trendData.student.className})\n`;
    csv += "Exam,Term,Year,Total Marks,Total Points,Average,Avg Points,Subjects,EE,ME,AE,BE\n";
    for (const e of trendData.exams) {
      csv += `"${e.examName}",${e.term},${e.year},${e.totalMarks},${e.totalPoints},${e.averageMarks},${e.averagePoints},${e.totalSubjects},${e.gradeCounts.EE},${e.gradeCounts.ME},${e.gradeCounts.AE},${e.gradeCounts.BE}\n`;
    }
    csv += "\nSubject Trends\n";
    for (const s of trendData.subjects) {
      csv += `\n${s.subjectName}\nExam,Marks\n`;
      for (const dp of s.dataPoints) {
        csv += `"${dp.examName}",${dp.marks}\n`;
      }
    }
    exportCSV(csv, `student-trends-${trendData.student.name.replace(/\s+/g, "-")}.csv`);
  };

  // ─── PDF/Excel download ─────────────────────────────
  const [downloading, setDownloading] = useState(false);

  const downloadReport = async (fmt: "pdf" | "excel") => {
    setDownloading(true);
    try {
      const body: Record<string, string> = { type: activeTab, format: fmt };
      if (activeTab === "subject-analysis" || activeTab === "grade-distribution") body.examId = selectedExamId;
      else if (activeTab === "class-comparison") { body.term = selectedTerm; body.year = selectedYear; }
      else if (activeTab === "student-trends") body.studentId = selectedStudentId;

      const res = await apiFetch("/api/performance-reports/download", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="(.+)"/);
      const filename = match ? match[1] : `report.${fmt === "pdf" ? "pdf" : "xlsx"}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to download file. Try again.");
    }
    setDownloading(false);
  };

  // ─── Render helpers ────────────────────────────────────

  const GradeBadge = ({ grade }: { grade: string }) => (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-md text-xs font-bold" style={{ backgroundColor: `${GRADE_COLORS[grade]}20`, color: GRADE_COLORS[grade] }}>
      {grade}
    </span>
  );

  const renderFilters = () => (
    <div className="flex flex-wrap gap-3 items-end">
      {(activeTab === "subject-analysis" || activeTab === "grade-distribution") && (
        <div className="min-w-[200px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select Exam</label>
          <Select value={selectedExamId} onValueChange={(v) => { setSelectedExamId(v); fetchReport(activeTab); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Choose an exam..." /></SelectTrigger>
            <SelectContent>
              {exams.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.name} — {e.className} ({e.term} {e.year})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {activeTab === "class-comparison" && (
        <>
          <div className="min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Term</label>
            <Select value={selectedTerm} onValueChange={(v) => { setSelectedTerm(v); if (selectedYear) fetchReport("class-comparison"); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Term" /></SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={`${t.term}-${t.year}`} value={t.term}>{t.term}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[120px]">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Year</label>
            <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); if (selectedTerm) fetchReport("class-comparison"); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                {[...new Set(terms.map((t) => t.year))].map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {activeTab === "student-trends" && (
        <div className="min-w-[260px]">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Search Student</label>
          <Input
            placeholder="Type student name..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
          />
          {students.length > 0 && !selectedStudentId && (
            <div className="mt-1 border rounded-md bg-card shadow-sm max-h-48 overflow-y-auto">
              {students.map((s) => (
                <button key={s.id} className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-0"
                  onClick={() => { setSelectedStudentId(s.id); setStudentSearch(`${s.name} (${s.className})`); fetchReport("student-trends"); }}>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{s.className}</span>
                </button>
              ))}
            </div>
          )}
          {selectedStudentId && (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {students.find((s) => s.id === selectedStudentId)?.name || "Selected"}
              </Badge>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setSelectedStudentId(""); setStudentSearch(""); setTrendData(null); }}>
                Change
              </Button>
            </div>
          )}
        </div>
      )}

      <Button onClick={() => fetchReport(activeTab)} disabled={loading} size="sm">
        {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-1.5" />}
        Generate Report
      </Button>

      {/* Ranking method toggle (admin only) */}
      {isAdmin && (activeTab === "subject-analysis" || activeTab === "class-comparison") && (
        <div className="flex items-center gap-1.5 ml-auto">
          <Scale className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <button
              onClick={() => { setRankingMethod("points"); setSubjectSort("avgPoints"); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${rankingMethod === "points" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Points (CBC)
            </button>
            <button
              onClick={() => { setRankingMethod("average"); setSubjectSort("mean"); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${rankingMethod === "average" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Average
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ─── 1. Subject Analysis Tab ───────────────────────────
  const renderSubjectAnalysis = () => {
    if (!subjectData) return null;
    const sorted = [...subjectData.subjects].sort((a, b) => {
      const mul = subjectSortDir === "asc" ? 1 : -1;
      if (subjectSort === "name") return mul * a.subjectName.localeCompare(b.subjectName);
      return mul * ((a[subjectSort] || 0) - (b[subjectSort] || 0));
    });

    const toggleSort = (col: typeof subjectSort) => {
      if (subjectSort === col) setSubjectSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else { setSubjectSort(col); setSubjectSortDir("desc"); }
    };

    const SortIcon = ({ col }: { col: typeof subjectSort }) => (
      <ArrowUpDown className={`w-3.5 h-3.5 ml-1 ${subjectSort === col ? "text-primary" : "text-muted-foreground/50"}`} />
    );

    // Chart data - show points or mean based on ranking method
    const primaryMetric = rankingMethod === "points" ? "avgPoints" : "mean";
    const barData = sorted.map((s) => ({ name: s.subjectCode, [primaryMetric]: s[primaryMetric], mean: s.mean, avgPoints: s.avgPoints, passRate: s.passRate, highest: s.highest }));

    // Stacked bar for grade distribution
    const gradeBarData = sorted.map((s) => ({
      name: s.subjectCode,
      EE: s.gradeDistribution.EE,
      ME: s.gradeDistribution.ME,
      AE: s.gradeDistribution.AE,
      BE: s.gradeDistribution.BE,
    }));

    return (
      <div className="space-y-6">
        {/* Exam info header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg">{subjectData.exam.name}</h3>
            <p className="text-sm text-muted-foreground">{subjectData.exam.className} &middot; {subjectData.exam.term} {subjectData.exam.year}</p>
          </div>
          <DownloadButtons onExportCSV={exportSubjectAnalysisCSV} csvLabel="Export CSV" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Subjects</span>
            </div>
            <p className="text-2xl font-bold">{subjectData.subjects.length}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-xs text-muted-foreground font-medium">Best Subject</span>
            </div>
            <p className="text-lg font-bold">{sorted[0]?.subjectCode || "N/A"}</p>
            <p className="text-xs text-muted-foreground">Mean: {sorted[0]?.mean} &middot; Avg Points: {sorted[0]?.avgPoints}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground font-medium">Weakest Subject</span>
            </div>
            <p className="text-lg font-bold">{sorted[sorted.length - 1]?.subjectCode || "N/A"}</p>
            <p className="text-xs text-muted-foreground">Mean: {sorted[sorted.length - 1]?.mean} &middot; Avg Points: {sorted[sorted.length - 1]?.avgPoints}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-xs text-muted-foreground font-medium">Avg Pass Rate</span>
            </div>
            <p className="text-2xl font-bold">{Math.round(sorted.reduce((s, sub) => s + sub.passRate, 0) / (sorted.length || 1))}%</p>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{rankingMethod === "points" ? "Avg Points by Subject (CBC Scale)" : "Mean Marks by Subject"}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis domain={rankingMethod === "points" ? [0, 8] : [0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [`${value}`, rankingMethod === "points" ? "Avg Points" : "Mean Marks"]} />
                  <Bar dataKey={primaryMetric} fill={rankingMethod === "points" ? "#7C3AED" : "#2563EB"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Grade Distribution by Subject</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={gradeBarData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="EE" stackId="a" fill={GRADE_COLORS.EE} />
                  <Bar dataKey="ME" stackId="a" fill={GRADE_COLORS.ME} />
                  <Bar dataKey="AE" stackId="a" fill={GRADE_COLORS.AE} />
                  <Bar dataKey="BE" stackId="a" fill={GRADE_COLORS.BE} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Detailed table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Subject Breakdown</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>Subject <SortIcon col="name" /></TableHead>
                    <TableHead className="text-center">Students</TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("mean")}>Mean <SortIcon col="mean" /></TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("avgPoints")}>Avg Pts <SortIcon col="avgPoints" /></TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("highest")}>Highest <SortIcon col="highest" /></TableHead>
                    <TableHead className="text-center">Lowest</TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("passRate")}>Pass Rate <SortIcon col="passRate" /></TableHead>
                    <TableHead className="text-center">EE</TableHead>
                    <TableHead className="text-center">ME</TableHead>
                    <TableHead className="text-center">AE</TableHead>
                    <TableHead className="text-center">BE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((s, i) => (
                    <TableRow key={s.subjectId}>
                      <TableCell className="font-medium text-sm">{s.subjectName} <span className="text-muted-foreground text-xs ml-1">({s.subjectCode})</span></TableCell>
                      <TableCell className="text-center text-sm">{s.totalStudents}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold ${s.mean >= 50 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{s.mean}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-purple-700 dark:text-purple-300">{s.avgPoints}</span>
                        <span className="text-[10px] text-muted-foreground">/8</span>
                      </TableCell>
                      <TableCell className="text-center font-semibold text-green-700 dark:text-green-400">{s.highest}</TableCell>
                      <TableCell className="text-center text-red-600 dark:text-red-400">{s.lowest}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={s.passRate} className="w-16 h-2" />
                          <span className="text-xs font-medium w-10 text-right">{s.passRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.EE }}>{s.gradeDistribution.EE}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.ME }}>{s.gradeDistribution.ME}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.AE }}>{s.gradeDistribution.AE}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.BE }}>{s.gradeDistribution.BE}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top & Bottom performers per subject */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" /> Top Performers per Subject</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sorted.slice(0, 5).map((s) => (
                <div key={s.subjectId}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{s.subjectName}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.topStudents.slice(0, 3).map((st, i) => (
                      <Badge key={st.studentId} variant={i === 0 ? "default" : "secondary"} className="text-xs">
                        {i + 1}. {st.name} <span className="ml-1 opacity-70">{st.marks}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Needs Improvement per Subject</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sorted.slice(0, 5).map((s) => (
                <div key={s.subjectId}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{s.subjectName}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.bottomStudents.slice(0, 3).map((st) => (
                      <Badge key={st.studentId} variant="outline" className="text-xs border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400">
                        {st.name} <span className="ml-1 opacity-70">{st.marks}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ─── 2. Class Comparison Tab ───────────────────────────
  const renderClassComparison = () => {
    if (!classData) return null;
    if (classData.classes.length === 0) {
      return (
        <Card className="p-8 text-center">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">{classData.message || "No closed exams found for the selected term and year."}</p>
          <p className="text-xs text-muted-foreground mt-1">Only closed exams are included in class comparisons.</p>
        </Card>
      );
    }

    const classMetric = rankingMethod === "points" ? "overallPoints" : "overallAverage";
    const barData = classData.classes.map((c) => ({ name: c.className.replace("Grade ", "G"), value: c[classMetric] }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg">Class Comparison</h3>
            <p className="text-sm text-muted-foreground">{classData.term} — {classData.year}</p>
          </div>
          <DownloadButtons onExportCSV={exportClassComparisonCSV} csvLabel="Export CSV" />
        </div>

        {/* Chart */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{rankingMethod === "points" ? "Overall Points by Class (CBC Scale)" : "Overall Average by Class"}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis domain={rankingMethod === "points" ? [0, 8] : [0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [`${value}`, rankingMethod === "points" ? "Avg Points" : "Overall Average"]} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Class cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {classData.classes.map((c, i) => (
            <Card key={c.classId} className={i === 0 ? "border-green-200 dark:border-green-800/40 bg-green-50/30 dark:bg-green-950/30" : ""}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm">{c.className}</h4>
                  {i === 0 && <Badge className="bg-green-600 text-white text-[10px]">Best Performer</Badge>}
                </div>
                <p className="text-3xl font-bold mb-1" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>{rankingMethod === "points" ? c.overallPoints : c.overallAverage}</p>
                <p className="text-xs text-muted-foreground mb-3">{rankingMethod === "points" ? "Avg Points / 8" : "Overall Average"} &middot; {c.totalExams} exam(s)</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Best Exam</span><span className="font-medium text-green-700 dark:text-green-400">{c.bestExam.examName} ({c.bestExam.avgMarks})</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Weakest Exam</span><span className="font-medium text-red-600 dark:text-red-400">{c.weakExam.examName} ({c.weakExam.avgMarks})</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Students</span><span className="font-medium">{c.exams[0]?.studentCount || 0}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // ─── 3. Grade Distribution Tab ──────────────────────────
  const renderGradeDistribution = () => {
    if (!gradeData) return null;

    const overallPie = [
      { name: "EE", value: gradeData.overall.grades.EE, color: GRADE_COLORS.EE },
      { name: "ME", value: gradeData.overall.grades.ME, color: GRADE_COLORS.ME },
      { name: "AE", value: gradeData.overall.grades.AE, color: GRADE_COLORS.AE },
      { name: "BE", value: gradeData.overall.grades.BE, color: GRADE_COLORS.BE },
    ].filter((d) => d.value > 0);

    const subjectBarData = gradeData.subjects.map((s) => ({
      name: s.subjectCode,
      EE: s.percentages.EE,
      ME: s.percentages.ME,
      AE: s.percentages.AE,
      BE: s.percentages.BE,
    }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg">Grade Distribution</h3>
            <p className="text-sm text-muted-foreground">{gradeData.exam.name} — {gradeData.exam.className}</p>
          </div>
          <DownloadButtons onExportCSV={exportGradeDistCSV} csvLabel="Export CSV" />
        </div>

        {/* Overall summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["EE", "ME", "AE", "BE"] as const).map((g) => (
            <Card key={g} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <GradeBadge grade={g} />
                <span className="text-xs text-muted-foreground">{GRADE_LABELS[g]}</span>
              </div>
              <p className="text-2xl font-bold mt-1" style={{ color: GRADE_COLORS[g] }}>{gradeData.overall.percentages[g]}%</p>
              <p className="text-xs text-muted-foreground">{gradeData.overall.grades[g]} entries</p>
            </Card>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Overall Grade Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={overallPie} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }}>
                    {overallPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number, name: string) => [`${value} entries`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Grade Percentages by Subject</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={subjectBarData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [`${value}%`]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="EE" stackId="a" fill={GRADE_COLORS.EE} />
                  <Bar dataKey="ME" stackId="a" fill={GRADE_COLORS.ME} />
                  <Bar dataKey="AE" stackId="a" fill={GRADE_COLORS.AE} />
                  <Bar dataKey="BE" stackId="a" fill={GRADE_COLORS.BE} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Detailed table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Per-Subject Breakdown</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center" style={{ color: GRADE_COLORS.EE }}>EE</TableHead>
                    <TableHead className="text-center" style={{ color: GRADE_COLORS.ME }}>ME</TableHead>
                    <TableHead className="text-center" style={{ color: GRADE_COLORS.AE }}>AE</TableHead>
                    <TableHead className="text-center" style={{ color: GRADE_COLORS.BE }}>BE</TableHead>
                    <TableHead className="text-center">Visual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gradeData.subjects.map((s) => (
                    <TableRow key={s.subjectId}>
                      <TableCell className="font-medium text-sm">{s.subjectName}</TableCell>
                      <TableCell className="text-center text-sm">{s.total}</TableCell>
                      <TableCell className="text-center text-sm font-medium" style={{ color: GRADE_COLORS.EE }}>{s.grades.EE} <span className="text-xs opacity-60">({s.percentages.EE}%)</span></TableCell>
                      <TableCell className="text-center text-sm font-medium" style={{ color: GRADE_COLORS.ME }}>{s.grades.ME} <span className="text-xs opacity-60">({s.percentages.ME}%)</span></TableCell>
                      <TableCell className="text-center text-sm font-medium" style={{ color: GRADE_COLORS.AE }}>{s.grades.AE} <span className="text-xs opacity-60">({s.percentages.AE}%)</span></TableCell>
                      <TableCell className="text-center text-sm font-medium" style={{ color: GRADE_COLORS.BE }}>{s.grades.BE} <span className="text-xs opacity-60">({s.percentages.BE}%)</span></TableCell>
                      <TableCell className="w-40">
                        <div className="flex h-5 rounded overflow-hidden bg-muted">
                          <div style={{ width: `${s.percentages.EE}%`, backgroundColor: GRADE_COLORS.EE }} />
                          <div style={{ width: `${s.percentages.ME}%`, backgroundColor: GRADE_COLORS.ME }} />
                          <div style={{ width: `${s.percentages.AE}%`, backgroundColor: GRADE_COLORS.AE }} />
                          <div style={{ width: `${s.percentages.BE}%`, backgroundColor: GRADE_COLORS.BE }} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── 4. Student Trends Tab ─────────────────────────────
  const renderStudentTrends = () => {
    if (!trendData) return null;
    if (trendData.exams.length === 0) {
      return (
        <Card className="p-8 text-center">
          <UserSearch className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-muted-foreground">{trendData.message || "No exam data available for this student."}</p>
        </Card>
      );
    }

    // Overall trend chart data
    const trendChartData = trendData.overallTrend.map((t) => ({
      name: `${t.examName} (${t.year})`,
      average: t.averageMarks,
      avgPoints: t.averagePoints,
      total: t.totalMarks,
      totalPoints: t.totalPoints,
    }));

    // Grade trend (stacked)
    const gradeTrendData = trendData.exams.map((e) => ({
      name: `${e.examName.substring(0, 15)}`,
      EE: e.gradeCounts.EE,
      ME: e.gradeCounts.ME,
      AE: e.gradeCounts.AE,
      BE: e.gradeCounts.BE,
    }));

    // Subject line chart data
    const subjectLineData: Record<string, string> = {};
    const lineChartData: Array<Record<string, any>> = [];
    for (const e of trendData.exams) {
      const point: Record<string, any> = { name: `${e.examName.substring(0, 12)}` };
      for (const sub of e.subjects) {
        if (!subjectLineData[sub.subjectCode]) subjectLineData[sub.subjectCode] = sub.subjectCode;
        point[sub.subjectCode] = sub.marks;
      }
      lineChartData.push(point);
    }
    const subjectCodes = Object.keys(subjectLineData);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-lg">{trendData.student.name}</h3>
            <p className="text-sm text-muted-foreground">{trendData.student.className} &middot; {trendData.exams.length} exam(s) recorded</p>
          </div>
          <DownloadButtons onExportCSV={exportStudentTrendCSV} csvLabel="Export CSV" />
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <span className="text-xs text-muted-foreground font-medium">Total Exams</span>
            <p className="text-2xl font-bold mt-1">{trendData.exams.length}</p>
          </Card>
          <Card className="p-4">
            <span className="text-xs text-muted-foreground font-medium">Latest Average</span>
            <p className="text-2xl font-bold mt-1">{trendData.overallTrend[trendData.overallTrend.length - 1]?.averageMarks || 0}</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">{trendData.overallTrend[trendData.overallTrend.length - 1]?.averagePoints || 0} pts</p>
          </Card>
          <Card className="p-4">
            <span className="text-xs text-muted-foreground font-medium">Best Performance</span>
            <p className="text-2xl font-bold mt-1 text-green-700 dark:text-green-400">{Math.max(...trendData.overallTrend.map((t) => t.averageMarks))}</p>
          </Card>
          <Card className="p-4">
            <span className="text-xs text-muted-foreground font-medium">Subjects Tracked</span>
            <p className="text-2xl font-bold mt-1">{trendData.subjects.length}</p>
          </Card>
        </div>

        {/* Overall trend chart */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Performance Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis yAxisId="right" domain={[0, 8]} orientation="right" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="average" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 4 }} name="Average Marks" />
                <Line yAxisId="right" type="monotone" dataKey="avgPoints" stroke="#7C3AED" strokeWidth={2.5} dot={{ r: 4 }} name="Avg Points (CBC)" />
                <Line yAxisId="left" type="monotone" dataKey="total" stroke="#059669" strokeWidth={1.5} strokeDasharray="5 5" dot={{ r: 3 }} name="Total Marks" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Grade counts trend + Subject trends */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Grade Counts per Exam</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={gradeTrendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="EE" fill={GRADE_COLORS.EE} />
                  <Bar dataKey="ME" fill={GRADE_COLORS.ME} />
                  <Bar dataKey="AE" fill={GRADE_COLORS.AE} />
                  <Bar dataKey="BE" fill={GRADE_COLORS.BE} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Subject Marks Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={lineChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                  {subjectCodes.map((code, i) => (
                    <Line key={code} type="monotone" dataKey={code} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Exam-by-exam detail table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Exam History</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Exam</TableHead>
                    <TableHead className="text-center">Term</TableHead>
                    <TableHead className="text-center">Year</TableHead>
                    <TableHead className="text-center">Subjects</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Points</TableHead>
                    <TableHead className="text-center">Average</TableHead>
                    <TableHead className="text-center">EE</TableHead>
                    <TableHead className="text-center">ME</TableHead>
                    <TableHead className="text-center">AE</TableHead>
                    <TableHead className="text-center">BE</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trendData.exams.map((e) => (
                    <TableRow key={e.examId}>
                      <TableCell className="font-medium text-sm">{e.examName}</TableCell>
                      <TableCell className="text-center text-sm">{e.term}</TableCell>
                      <TableCell className="text-center text-sm">{e.year}</TableCell>
                      <TableCell className="text-center text-sm">{e.totalSubjects}</TableCell>
                      <TableCell className="text-center font-semibold">{e.totalMarks}</TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-purple-700 dark:text-purple-300">{e.totalPoints}</span>
                        <span className="text-[10px] text-muted-foreground">/8</span>
                      </TableCell>
                      <TableCell className="text-center font-bold">{e.averageMarks}</TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.EE }}>{e.gradeCounts.EE}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.ME }}>{e.gradeCounts.ME}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.AE }}>{e.gradeCounts.AE}</span></TableCell>
                      <TableCell className="text-center"><span className="text-xs font-bold" style={{ color: GRADE_COLORS.BE }}>{e.gradeCounts.BE}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Per-subject detailed marks */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Detailed Marks by Subject</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    {trendData.exams.map((e) => (
                      <TableHead key={e.examId} className="text-center text-xs">{e.examName.substring(0, 12)}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trendData.subjects.map((s) => (
                    <TableRow key={s.subjectId}>
                      <TableCell className="font-medium text-sm">{s.subjectName}</TableCell>
                      {trendData.exams.map((e) => {
                        const mark = e.subjects.find((sub) => sub.subjectId === s.subjectId);
                        if (!mark) return <TableCell key={e.examId} className="text-center text-muted-foreground text-xs">—</TableCell>;
                        return (
                          <TableCell key={e.examId} className="text-center">
                            <span className={`text-sm font-medium ${mark.marks >= 50 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{mark.marks}</span>
                            <GradeBadge grade={mark.grade} />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ─── Download buttons row ───────────────────────────
  const DownloadButtons = ({ onExportCSV, csvLabel }: { onExportCSV: () => void; csvLabel?: string }) => (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onExportCSV}>
        <Download className="w-4 h-4 mr-1.5" /> {csvLabel || "CSV"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => downloadReport("pdf")} disabled={downloading}>
        {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileText className="w-4 h-4 mr-1.5" />}
        PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => downloadReport("excel")} disabled={downloading}>
        {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <BarChart2 className="w-4 h-4 mr-1.5" />}
        Excel
      </Button>
    </div>
  );

  // ─── Main Render ───────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Performance Reports</h2>
        <p className="text-muted-foreground mt-1">Analyze exam performance, compare classes, track student trends, and review grade distributions.</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ReportTab)}>
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="subject-analysis" className="text-xs sm:text-sm gap-1.5">
            <BarChart2 className="w-4 h-4" /> Subject Analysis
          </TabsTrigger>
          <TabsTrigger value="class-comparison" className="text-xs sm:text-sm gap-1.5">
            <GraduationCap className="w-4 h-4" /> Class Comparison
          </TabsTrigger>
          <TabsTrigger value="grade-distribution" className="text-xs sm:text-sm gap-1.5">
            <PieChartIcon className="w-4 h-4" /> Grade Distribution
          </TabsTrigger>
          <TabsTrigger value="student-trends" className="text-xs sm:text-sm gap-1.5">
            <UserSearch className="w-4 h-4" /> Student Trends
          </TabsTrigger>
        </TabsList>

        {/* Filters bar */}
        <div className="mt-4 p-4 bg-muted/30 rounded-lg border">
          {renderFilters()}
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-6 h-6 mr-2 animate-spin" />
            Generating report...
          </div>
        )}

        {/* Report content */}
        {!loading && !error && (
          <>
            <TabsContent value="subject-analysis">{renderSubjectAnalysis()}</TabsContent>
            <TabsContent value="class-comparison">{renderClassComparison()}</TabsContent>
            <TabsContent value="grade-distribution">{renderGradeDistribution()}</TabsContent>
            <TabsContent value="student-trends">{renderStudentTrends()}</TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
