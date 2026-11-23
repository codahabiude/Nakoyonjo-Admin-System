/**
 * POST /api/performance-reports/download
 * 
 * Body: { type, format, examId?, term?, year?, studentId? }
 * type: subject-analysis | class-comparison | grade-distribution | student-trends
 * format: pdf | excel
 */
import { NextResponse } from "next/server";
import { verifyRequest } from "@/lib/token-auth";
import { db } from "@/lib/db";
import { getDetailedGrade, getGradeColorKey, getPointsFromMarks } from "@/lib/grading";
import {
  buildSubjectAnalysisPDF, buildSubjectAnalysisExcel,
  buildClassComparisonPDF, buildClassComparisonExcel,
  buildGradeDistributionPDF, buildGradeDistributionExcel,
  buildStudentTrendPDF, buildStudentTrendExcel,
  setPerformanceReportSchoolName,
} from "@/lib/performance-report-builder";
import { getSchoolInfo } from "@/lib/school-settings";

export async function POST(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { type, format } = body;
    if (!type || !format || !["subject-analysis", "class-comparison", "grade-distribution", "student-trends"].includes(type) || !["pdf", "excel"].includes(format)) {
      return NextResponse.json({ error: "Invalid type or format. Use type=subject-analysis|class-comparison|grade-distribution|student-trends, format=pdf|excel" }, { status: 400 });
    }

    // Fetch the report data (reuse same logic as GET but internal)
    let reportData: any;

    if (type === "subject-analysis") {
      const examId = body.examId;
      if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });
      const exam = await db.exam.findUnique({ where: { id: examId }, include: { class: { select: { id: true, name: true } } } });
      if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
      if (user.role === "TEACHER") {
        const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
        if (!teacher) return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
        const tc = await db.teacherClass.findFirst({ where: { teacherId: teacher.id, classId: exam.classId } });
        if (!tc) {
          const ts = await db.teacherSubject.findFirst({ where: { teacherId: teacher.id, classId: exam.classId } });
          if (!ts) return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
      }

      const marks = await db.studentMark.findMany({
        where: { examId },
        include: { subject: { select: { id: true, name: true, code: true } }, student: { select: { id: true, firstName: true, lastName: true, status: true } } },
      });

      const subjectMap: Record<string, any> = {};
      for (const m of marks) {
        if (m.student.status !== "ACTIVE") continue;
        if (!subjectMap[m.subjectId]) subjectMap[m.subjectId] = { subjectId: m.subject.id, subjectName: m.subject.name, subjectCode: m.subject.code, marksList: [], students: [] };
        subjectMap[m.subjectId].marksList.push(m.marksObtained);
        subjectMap[m.subjectId].students.push({ name: `${m.student.firstName} ${m.student.lastName}`, marks: m.marksObtained });
      }

      const subjects = Object.values(subjectMap).map((s: any) => {
        const sorted = [...s.marksList].sort((a: number, b: number) => b - a);
        const mean = sorted.length > 0 ? sorted.reduce((a: number, b: number) => a + b, 0) / sorted.length : 0;
        const passRate = sorted.length > 0 ? Math.round(sorted.filter((m: number) => m >= 50).length / sorted.length * 100) : 0;
        const gd: Record<string, number> = { EE: 0, ME: 0, AE: 0, BE: 0 };
        for (const m of sorted) { const dg = getDetailedGrade(m); const ck = getGradeColorKey(dg.grade); gd[ck]++; }
        const topStudents = [...s.students].sort((a: any, b: any) => b.marks - a.marks).slice(0, 5);
        return { ...s, marksList: undefined, students: undefined, totalStudents: sorted.length, mean: Math.round(mean * 100) / 100, highest: sorted[0] || 0, lowest: sorted[sorted.length - 1] || 0, passRate, gradeDistribution: gd, topStudents };
      }).sort((a: any, b: any) => b.mean - a.mean);

      reportData = { exam: { name: exam.name, term: exam.term, year: exam.year, className: exam.class.name }, subjects };
    }

    else if (type === "class-comparison") {
      const { term, year } = body;
      if (!term || !year) return NextResponse.json({ error: "term and year required" }, { status: 400 });

      const exams = await db.exam.findMany({ where: { term, year }, include: { class: { select: { id: true, name: true } } } });
      const classResults: Record<string, any> = {};

      for (const exam of exams) {
        if (user.role === "TEACHER") {
          const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
          if (!teacher) continue;
          const tc = await db.teacherClass.findFirst({ where: { teacherId: teacher.id, classId: exam.classId } });
          if (!tc) continue;
        }
        const marks = await db.studentMark.findMany({ where: { examId: exam.id }, include: { student: { select: { status: true } } } });
        const activeMarks = marks.filter((m) => m.student.status === "ACTIVE");
        const studentTotals: Record<string, number[]> = {};
        const studentCounts: Record<string, number> = {};
        for (const m of activeMarks) {
          if (!studentTotals[m.studentId]) { studentTotals[m.studentId] = []; studentCounts[m.studentId] = 0; }
          studentTotals[m.studentId].push(m.marksObtained);
          studentCounts[m.studentId]++;
        }
        let totalSum = 0; let totalStudents = 0;
        for (const sid in studentTotals) { totalSum += studentCounts[sid] > 0 ? studentTotals[sid].reduce((a, b) => a + b, 0) / studentCounts[sid] : 0; totalStudents++; }
        const avgMarks = totalStudents > 0 ? Math.round((totalSum / totalStudents) * 100) / 100 : 0;
        if (!classResults[exam.classId]) classResults[exam.classId] = { classId: exam.class.id, className: exam.class.name, exams: [] };
        classResults[exam.classId].exams.push({ examId: exam.id, examName: exam.name, avgMarks, studentCount: totalStudents });
      }

      const classes = Object.values(classResults).map((c: any) => {
        const avgs = c.exams.map((e: any) => e.avgMarks);
        const oa = avgs.length > 0 ? Math.round(avgs.reduce((a: number, b: number) => a + b, 0) / avgs.length * 100) / 100 : 0;
        return { className: c.className, overallAverage: oa, totalExams: c.exams.length, bestExam: c.exams.reduce((b: any, e: any) => e.avgMarks > b.avgMarks ? e : b, c.exams[0]), weakExam: c.exams.reduce((w: any, e: any) => e.avgMarks < w.avgMarks ? e : w, c.exams[0]) };
      }).sort((a: any, b: any) => b.overallAverage - a.overallAverage);

      reportData = { term, year, classes };
    }

    else if (type === "grade-distribution") {
      const examId = body.examId;
      if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });
      const exam = await db.exam.findUnique({ where: { id: examId }, include: { class: { select: { id: true, name: true } } } });
      if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

      const marks = await db.studentMark.findMany({ where: { examId }, include: { subject: { select: { id: true, name: true, code: true } }, student: { select: { id: true, status: true } } } });
      const activeMarks = marks.filter((m) => m.student.status === "ACTIVE");
      const subjectMap: Record<string, any> = {};
      for (const m of activeMarks) {
        if (!subjectMap[m.subjectId]) subjectMap[m.subjectId] = { subjectId: m.subject.id, subjectName: m.subject.name, subjectCode: m.subject.code, grades: { EE: 0, ME: 0, AE: 0, BE: 0 } };
        const dg = getDetailedGrade(m.marksObtained);
        const ck = getGradeColorKey(dg.grade);
        subjectMap[m.subjectId].grades[ck]++;
      }
      const subjects = Object.values(subjectMap).map((s: any) => {
        const t = s.grades.EE + s.grades.ME + s.grades.AE + s.grades.BE;
        return { ...s, total: t, percentages: { EE: t > 0 ? Math.round(s.grades.EE / t * 100) : 0, ME: t > 0 ? Math.round(s.grades.ME / t * 100) : 0, AE: t > 0 ? Math.round(s.grades.AE / t * 100) : 0, BE: t > 0 ? Math.round(s.grades.BE / t * 100) : 0 } };
      });
      const og: Record<string, number> = { EE: 0, ME: 0, AE: 0, BE: 0 };
      for (const s of subjects) { og.EE += s.grades.EE; og.ME += s.grades.ME; og.AE += s.grades.AE; og.BE += s.grades.BE; }
      const ot = og.EE + og.ME + og.AE + og.BE;

      reportData = { exam: { name: exam.name, term: exam.term, year: exam.year, className: exam.class.name }, subjects, overall: { grades: og, total: ot, percentages: { EE: ot > 0 ? Math.round(og.EE / ot * 100) : 0, ME: ot > 0 ? Math.round(og.ME / ot * 100) : 0, AE: ot > 0 ? Math.round(og.AE / ot * 100) : 0, BE: ot > 0 ? Math.round(og.BE / ot * 100) : 0 } } };
    }

    else if (type === "student-trends") {
      const studentId = body.studentId;
      if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });
      const student = await db.student.findUnique({ where: { id: studentId }, include: { class: { select: { id: true, name: true } } } });
      if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

      const marks = await db.studentMark.findMany({ where: { studentId }, include: { exam: { include: { class: { select: { name: true } } } }, subject: true }, orderBy: { exam: { createdAt: "asc" } } });

      const examMap: Record<string, any> = {};
      for (const m of marks) {
        if (!examMap[m.exam.id]) examMap[m.exam.id] = { examId: m.exam.id, examName: m.exam.name, term: m.exam.term, year: m.exam.year, className: m.exam.class.name, subjects: [] };
        let grade = "BE"; const dg = getDetailedGrade(m.marksObtained); grade = getGradeColorKey(dg.grade);
        examMap[m.exam.id].subjects.push({ subjectName: m.subject.name, subjectCode: m.subject.code, marks: m.marksObtained, grade });
      }

      const exams = Object.values(examMap).map((e: any) => {
        const total = e.subjects.reduce((s: number, sub: any) => s + sub.marks, 0);
        const avg = e.subjects.length > 0 ? Math.round(total / e.subjects.length * 100) / 100 : 0;
        const gc: Record<string, number> = { EE: 0, ME: 0, AE: 0, BE: 0 };
        for (const sub of e.subjects) gc[sub.grade]++;
        return { ...e, totalMarks: total, averageMarks: avg, totalSubjects: e.subjects.length, gradeCounts: gc };
      });
      const overallTrend = exams.map((e: any) => ({ examName: e.examName, averageMarks: e.averageMarks, totalMarks: e.totalMarks }));

      reportData = { student: { name: `${student.firstName} ${student.lastName}`, className: student.class?.name || "N/A" }, exams, overallTrend };
    }

    // Generate the file
    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    // Apply the school name from Settings to every PDF/Excel header/footer
    const { schoolName } = await getSchoolInfo();
    setPerformanceReportSchoolName(schoolName);

    if (format === "pdf") {
      contentType = "application/pdf";
      if (type === "subject-analysis") { buffer = await buildSubjectAnalysisPDF(reportData); filename = `subject-analysis-${reportData.exam.name.replace(/\s+/g, "-")}.pdf`; }
      else if (type === "class-comparison") { buffer = await buildClassComparisonPDF(reportData); filename = `class-comparison-${reportData.term}-${reportData.year}.pdf`; }
      else if (type === "grade-distribution") { buffer = await buildGradeDistributionPDF(reportData); filename = `grade-distribution-${reportData.exam.name.replace(/\s+/g, "-")}.pdf`; }
      else { buffer = await buildStudentTrendPDF(reportData); filename = `student-trends-${reportData.student.name.replace(/\s+/g, "-")}.pdf`; }
    } else {
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (type === "subject-analysis") { buffer = await buildSubjectAnalysisExcel(reportData); filename = `subject-analysis-${reportData.exam.name.replace(/\s+/g, "-")}.xlsx`; }
      else if (type === "class-comparison") { buffer = await buildClassComparisonExcel(reportData); filename = `class-comparison-${reportData.term}-${reportData.year}.xlsx`; }
      else if (type === "grade-distribution") { buffer = await buildGradeDistributionExcel(reportData); filename = `grade-distribution-${reportData.exam.name.replace(/\s+/g, "-")}.xlsx`; }
      else { buffer = await buildStudentTrendExcel(reportData); filename = `student-trends-${reportData.student.name.replace(/\s+/g, "-")}.xlsx`; }
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("POST /api/performance-reports/download error:", error);
    return NextResponse.json({ error: "Failed to generate download" }, { status: 500 });
  }
}
