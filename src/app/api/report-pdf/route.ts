import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getGradeFromMarks, getPointsFromMarks } from "@/lib/grading";
import { buildReportPDF, type ReportData } from "@/lib/report-builder";
import { getSchoolInfo, formatTermRange } from "@/lib/school-settings";

// POST /api/report-pdf — generates a PDF for one student
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { studentId, examId } = body;
    if (!studentId || !examId) {
      return NextResponse.json({ error: "studentId and examId required" }, { status: 400 });
    }

    const student = await db.student.findUnique({ where: { id: studentId }, include: { class: true } });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id }, include: { classes: true } });
      const classIds = teacher?.classes.map((c) => c.classId) || [];
      if (!classIds.includes(student.classId)) return NextResponse.json({ error: "Not your class" }, { status: 403 });
    }

    const report = await buildReportData(studentId, examId);
    if (!report) return NextResponse.json({ error: "Failed to build report" }, { status: 500 });

    const pdfBuffer = await buildReportPDF(report);
    const fileName = `Report_${student.lastName}_${report.exam.name.replace(/\s+/g, "_")}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("POST /api/report-pdf error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}

// ============================================================
// SHARED DATA BUILDER (used by single + all routes)
// ============================================================

export async function buildReportData(studentId: string, examId: string): Promise<ReportData | null> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: { class: true },
  });
  if (!student) return null;

  const exam = await db.exam.findUnique({ where: { id: examId } });
  if (!exam) return null;

  // Get subject count for correct maxTotal
  const subjectCount = await db.classSubject.count({ where: { classId: student.classId } });

  const marks = await db.studentMark.findMany({
    where: { studentId, examId },
    include: { subject: { select: { name: true, code: true } } },
    orderBy: { subject: { code: "asc" } },
  });

  const totalMarks = marks.reduce((s, m) => s + m.marksObtained, 0);
  const totalPoints = marks.reduce((s, m) => s + getPointsFromMarks(m.marksObtained), 0);
  const maxTotal = subjectCount * exam.maxMarks;
  const maxPoints = subjectCount * 8;
  const average = marks.length > 0 ? (totalMarks / marks.length).toFixed(1) : "0";
  const { grade } = await getGradeFromMarks(parseFloat(average));

  const teacherClass = await db.teacherClass.findFirst({
    where: { classId: student.classId, isPrimary: true },
    include: { teacher: { include: { user: { select: { name: true } } } } },
  });

  // Fetch class teacher remark
  const examRemark = await db.examRemark.findUnique({
    where: { examId_studentId: { examId, studentId } },
    select: { remark: true },
  });

  // School settings (name, motto, contact, head teacher, term calendar) —
  // ONE query, applied to every report card.
  const school = await getSchoolInfo();
  const termRange = formatTermRange(exam.term, school.termDates);

  // Fetch class ranking for the full class
  const classStudents = await db.student.findMany({
    where: { classId: student.classId, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true },
  });

  const allExamMarks = await db.studentMark.findMany({
    where: { examId },
    select: { studentId: true, marksObtained: true },
  });

  const studentTotals: Record<string, number> = {};
  const studentPoints: Record<string, number> = {};
  const studentMarkCounts: Record<string, number> = {};
  for (const m of allExamMarks) {
    studentTotals[m.studentId] = (studentTotals[m.studentId] || 0) + m.marksObtained;
    studentPoints[m.studentId] = (studentPoints[m.studentId] || 0) + getPointsFromMarks(m.marksObtained);
    studentMarkCounts[m.studentId] = (studentMarkCounts[m.studentId] || 0) + 1;
  }

  // Rank by total points DESC (default), then by total marks for ties
  const classRanking = classStudents
    .map((s) => {
      const total = studentTotals[s.id] || 0;
      const pts = studentPoints[s.id] || 0;
      const mc = studentMarkCounts[s.id] || 0;
      return { studentId: s.id, firstName: s.firstName, lastName: s.lastName, totalMarks: total, totalPoints: pts, average: (mc > 0 ? (total / mc).toFixed(1) : "0"), grade: "" as string, rank: 0 };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.totalMarks - a.totalMarks || parseFloat(b.average) - parseFloat(a.average));

  let currentRank = 1;
  for (let i = 0; i < classRanking.length; i++) {
    if (i > 0 && classRanking[i].totalPoints < classRanking[i - 1].totalPoints) currentRank = i + 1;
    classRanking[i].rank = currentRank;
  }

  // Find this student's rank from the ranked list
  let rank = classStudents.length;
  for (const r of classRanking) {
    if (r.studentId === studentId) { rank = r.rank; break; }
  }

  // Fetch grades for ranking
  const gradedRanking = await Promise.all(
    classRanking.map(async (r) => {
      const { grade } = await getGradeFromMarks(parseFloat(r.average));
      return { ...r, grade };
    })
  );

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
    },
    class: { name: student.class.name },
    exam: { name: exam.name, term: exam.term, year: exam.year, maxMarks: exam.maxMarks },
    classTeacher: teacherClass?.teacher?.user?.name || "",
    headTeacher: school.headTeacherName,
    school: {
      schoolName: school.schoolName,
      schoolMotto: school.schoolMotto,
      schoolAddress: school.schoolAddress,
      schoolPhone: school.schoolPhone,
    },
    termRange,
    classTeacherRemark: examRemark?.remark || undefined,
    marks: await Promise.all(
      marks.map(async (m) => {
        const g = await getGradeFromMarks(m.marksObtained);
        return {
          subject: m.subject.name,
          code: m.subject.code,
          marksObtained: m.marksObtained,
          maxMarks: exam.maxMarks,
          grade: g.grade,
          remarks: m.remarks || g.remark,
        };
      })
    ),
    summary: { totalMarks, maxTotal, totalPoints, maxPoints, average, grade, rank, totalStudents: classStudents.length },
    classRanking: gradedRanking,
    maxTotal,
    maxPoints,
  };
}
