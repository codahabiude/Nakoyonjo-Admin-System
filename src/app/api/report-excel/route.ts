import { NextRequest, NextResponse } from "next/server";
import { verifyRequest } from "@/lib/token-auth";
import { buildReportExcel, buildClassMarksheetExcel, type MultiStudentData } from "@/lib/report-builder";
import { getSchoolInfo, formatTermRange } from "@/lib/school-settings";

// POST /api/report-excel — generates an Excel file for one student
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { studentId, examId } = body;
    if (!studentId || !examId) {
      return NextResponse.json({ error: "studentId and examId required" }, { status: 400 });
    }

    // Access check (duplicated from buildReportData to fail fast before heavy work)
    const { db } = await import("@/lib/db");
    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id }, include: { classes: true } });
      const classIds = teacher?.classes.map((c) => c.classId) || [];
      if (!classIds.includes(student.classId)) return NextResponse.json({ error: "Not your class" }, { status: 403 });
    }

    const { buildReportData } = await import("../report-pdf/route");
    const report = await buildReportData(studentId, examId);
    if (!report) return NextResponse.json({ error: "Failed to build report" }, { status: 500 });

    const excelBuffer = await buildReportExcel(report);
    const fileName = `Report_${student.lastName}_${report.exam.name.replace(/\s+/g, "_")}.xlsx`;

    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("POST /api/report-excel error:", error);
    return NextResponse.json({ error: "Failed to generate Excel" }, { status: 500 });
  }
}

// GET /api/report-excel?examId=xxx — class-wide marksheet (used by "Download All Excel" button)
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });

    const { db } = await import("@/lib/db");
    const { getGradeFromMarks, getPointsFromMarks } = await import("@/lib/grading");

    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // Teacher access check
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id }, include: { classes: true } });
      const classIds = teacher?.classes.map((c) => c.classId) || [];
      if (!classIds.includes(exam.classId)) return NextResponse.json({ error: "Not your class" }, { status: 403 });
    }

    // Fetch class info
    const classInfo = await db.class.findUnique({ where: { id: exam.classId } });
    const className = classInfo?.name || "";

    // Fetch class teacher
    const teacherClass = await db.teacherClass.findFirst({
      where: { classId: exam.classId, isPrimary: true },
      include: { teacher: { include: { user: { select: { name: true } } } } },
    });

    // Fetch all students (no order — sorting will be by rank in Excel builder)
    const students = await db.student.findMany({
      where: { classId: exam.classId, status: "ACTIVE" },
    });

    if (students.length === 0) {
      return NextResponse.json({ error: "No active students in this class" }, { status: 400 });
    }

    // Fetch all marks for this exam in one query
    const allMarks = await db.studentMark.findMany({
      where: { examId },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { code: "asc" } },
    });

    // School settings (title row + term range on the marksheet)
    const school = await getSchoolInfo();
    const termRange = formatTermRange(exam.term, school.termDates);

    // Group marks by studentId
    const marksByStudent: Record<string, typeof allMarks> = {};
    for (const m of allMarks) {
      if (!marksByStudent[m.studentId]) marksByStudent[m.studentId] = [];
      marksByStudent[m.studentId].push(m);
    }

    // Compute totals and ranks with proper tie handling (JS-based, not DB groupBy)
    const studentTotals: Record<string, number> = {};
    const studentPoints: Record<string, number> = {};
    const studentMarkCounts: Record<string, number> = {};
    for (const m of allMarks) {
      studentTotals[m.studentId] = (studentTotals[m.studentId] || 0) + m.marksObtained;
      studentPoints[m.studentId] = (studentPoints[m.studentId] || 0) + getPointsFromMarks(m.marksObtained);
      studentMarkCounts[m.studentId] = (studentMarkCounts[m.studentId] || 0) + 1;
    }

    // Build ranked list sorted by total points descending (default), then by total marks
    const rankedList = students
      .map((s) => {
        const total = studentTotals[s.id] || 0;
        const pts = studentPoints[s.id] || 0;
        const mc = studentMarkCounts[s.id] || 0;
        const avg = mc > 0 ? total / mc : 0;
        return { studentId: s.id, total, pts, avg };
      })
      .sort((a, b) => b.pts !== a.pts ? b.pts - a.pts : b.total !== a.total ? b.total - a.total : b.avg - a.avg);

    // Assign ranks with tie handling (by points)
    const rankMap: Record<string, number> = {};
    let currentRank = 1;
    for (let i = 0; i < rankedList.length; i++) {
      if (i > 0 && rankedList[i].pts < rankedList[i - 1].pts) {
        currentRank = i + 1;
      }
      rankMap[rankedList[i].studentId] = currentRank;
    }
    const totalStudentsRanked = rankedList.length;

    // Get unique subjects from marks (ordered by code)
    const subjectMap = new Map<string, { name: string; code: string }>();
    allMarks.forEach((m) => {
      if (!subjectMap.has(m.subject.code)) {
        subjectMap.set(m.subject.code, { name: m.subject.name, code: m.subject.code });
      }
    });
    const subjects = Array.from(subjectMap.values()).sort((a, b) => a.code.localeCompare(b.code));

    // Build multi-student data
    const studentData: MultiStudentData["students"] = [];
    for (const student of students) {
      const marks = marksByStudent[student.id] || [];
      const totalMarks = marks.reduce((s, m) => s + m.marksObtained, 0);
      const totalPoints = marks.reduce((s, m) => s + getPointsFromMarks(m.marksObtained), 0);
      const maxTotal = marks.length * exam.maxMarks;
      const maxPoints = marks.length * 8;
      const average = marks.length > 0 ? (totalMarks / marks.length).toFixed(1) : "0";
      const { grade } = await getGradeFromMarks(parseFloat(average));
      const rank = rankMap[student.id] || totalStudentsRanked;

      studentData.push({
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        marks: await Promise.all(marks.map(async (m) => {
          const g = await getGradeFromMarks(m.marksObtained);
          return {
            subject: m.subject.name,
            code: m.subject.code,
            marksObtained: m.marksObtained,
            maxMarks: exam.maxMarks,
            grade: g.grade,
            remarks: m.remarks || g.remark || null,
          };
        })),
        summary: { totalMarks, maxTotal, totalPoints, maxPoints, average, grade, rank, totalStudents: totalStudentsRanked },
      });
    }

    const multiData: MultiStudentData = {
      className,
      examName: exam.name,
      term: exam.term,
      year: exam.year,
      maxMarks: exam.maxMarks,
      schoolName: school.schoolName,
      termRange,
      students: studentData,
      subjects,
    };

    const excelBuffer = await buildClassMarksheetExcel(multiData);
    const fileName = `Marksheet_${className.replace(/\s+/g, "_")}_${exam.name.replace(/\s+/g, "_")}.xlsx`;

    return new NextResponse(excelBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/report-excel error:", error);
    return NextResponse.json({ error: "Failed to generate Excel" }, { status: 500 });
  }
}
