import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getGradeFromMarks, getPointsFromMarks } from "@/lib/grading";
import { buildReportPDF, type ReportData } from "@/lib/report-builder";
import { getSchoolInfo, formatTermRange } from "@/lib/school-settings";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiver = require("archiver");

// POST /api/report-pdf/all — ZIP of all student PDFs for an exam
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { examId } = await req.json();
    if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });

    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // Teacher access check
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id }, include: { classes: true } });
      const classIds = teacher?.classes.map((c) => c.classId) || [];
      if (!classIds.includes(exam.classId)) return NextResponse.json({ error: "Not your class" }, { status: 403 });
    }

    // Fetch class info ONCE (was N+1: fetched per student)
    const classInfo = await db.class.findUnique({ where: { id: exam.classId } });
    const className = classInfo?.name || "";

    // Fetch class teacher ONCE
    const teacherClass = await db.teacherClass.findFirst({
      where: { classId: exam.classId, isPrimary: true },
      include: { teacher: { include: { user: { select: { name: true } } } } },
    });
    const classTeacherName = teacherClass?.teacher?.user?.name || "";

    // Fetch ALL students for this class
    const students = await db.student.findMany({
      where: { classId: exam.classId, status: "ACTIVE" },
      orderBy: { lastName: "asc" },
    });

    if (students.length === 0) {
      return NextResponse.json({ error: "No active students in this class" }, { status: 400 });
    }

    // Fetch subject count for correct maxTotal
    const subjectCount = await db.classSubject.count({ where: { classId: exam.classId } });

    // School settings — fetched ONCE, printed on every report card in the ZIP
    const school = await getSchoolInfo();
    const termRange = formatTermRange(exam.term, school.termDates);

    // Fetch ALL marks for this exam in ONE query (was N+1: per student)
    const allMarks = await db.studentMark.findMany({
      where: { examId },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { code: "asc" } },
    });

    // Group marks by studentId
    const marksByStudent: Record<string, typeof allMarks> = {};
    for (const m of allMarks) {
      if (!marksByStudent[m.studentId]) marksByStudent[m.studentId] = [];
      marksByStudent[m.studentId].push(m);
    }

    // Compute rank with tie handling (same pattern as report-pdf/route.ts)
    const studentTotals: Record<string, number> = {};
    const studentPoints: Record<string, number> = {};
    const studentMarkCounts: Record<string, number> = {};
    for (const m of allMarks) {
      studentTotals[m.studentId] = (studentTotals[m.studentId] || 0) + m.marksObtained;
      studentPoints[m.studentId] = (studentPoints[m.studentId] || 0) + getPointsFromMarks(m.marksObtained);
      studentMarkCounts[m.studentId] = (studentMarkCounts[m.studentId] || 0) + 1;
    }

    // Rank by total points DESC (default), then by total marks for ties
    const ranked = students
      .map((s) => {
        const total = studentTotals[s.id] || 0;
        const pts = studentPoints[s.id] || 0;
        const mc = studentMarkCounts[s.id] || 0;
        return { studentId: s.id, totalMarks: total, totalPoints: pts, average: mc > 0 ? total / mc : 0 };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || b.totalMarks - a.totalMarks || b.average - a.average);

    const rankMap: Record<string, number> = {};
    let currentRank = 1;
    for (let i = 0; i < ranked.length; i++) {
      if (i > 0 && ranked[i].totalPoints < ranked[i - 1].totalPoints) currentRank = i + 1;
      rankMap[ranked[i].studentId] = currentRank;
    }

    // Build report data for each student
    const reports: ReportData[] = [];
    for (const student of students) {
      const marks = marksByStudent[student.id] || [];
      const totalMarks = marks.reduce((s, m) => s + m.marksObtained, 0);
      const totalPoints = marks.reduce((s, m) => s + getPointsFromMarks(m.marksObtained), 0);
      const maxTotal = subjectCount * exam.maxMarks;
      const maxPoints = subjectCount * 8;
      const average = marks.length > 0 ? (totalMarks / marks.length).toFixed(1) : "0";
      const { grade } = await getGradeFromMarks(parseFloat(average));
      const rank = rankMap[student.id] || students.length;

      reports.push({
        student: {
          firstName: student.firstName,
          lastName: student.lastName,
          gender: student.gender,
        },
        class: { name: className },
        exam: { name: exam.name, term: exam.term, year: exam.year, maxMarks: exam.maxMarks },
        classTeacher: classTeacherName,
        headTeacher: school.headTeacherName,
        school: {
          schoolName: school.schoolName,
          schoolMotto: school.schoolMotto,
          schoolAddress: school.schoolAddress,
          schoolPhone: school.schoolPhone,
        },
        termRange,
        marks: await Promise.all(marks.map(async (m) => {
          const g = await getGradeFromMarks(m.marksObtained);
          return {
            subject: m.subject.name,
            code: m.subject.code,
            marksObtained: m.marksObtained,
            maxMarks: exam.maxMarks,
            grade: g.grade,
            remarks: g.remark || null,
          };
        })),
        summary: { totalMarks, maxTotal, totalPoints, maxPoints, average, grade, rank, totalStudents: students.length },
      });
    }

    // Generate all PDFs and zip them
    const chunks: Buffer[] = [];
    let zipError: Error | null = null;
    const zip = archiver("zip", { zlib: { level: 5 } });
    zip.on("data", (chunk: Buffer) => chunks.push(chunk));
    // Capture errors (an unlistened 'error' event on a stream throws an
    // uncaught exception that kills the whole Node process) then rethrow
    // into the route's try/catch below.
    zip.on("error", (err: Error) => { zipError = err; });
    zip.on("warning", (err: Error) => console.warn("archiver warning:", err.message));

    for (let i = 0; i < reports.length; i++) {
      const r = reports[i];
      const pdfBuffer = await buildReportPDF(r);
      const fileName = `${i + 1}_${r.student.lastName}_${r.student.firstName}.pdf`;
      zip.append(pdfBuffer, { name: fileName });
    }

    await zip.finalize();
    // finalize() resolves on the internal zip module's 'end', which can fire
    // before the transform stream has flushed every 'data' chunk — wait for
    // the outer stream to finish so the ZIP is never truncated.
    await new Promise<void>((resolve) => {
      if (zip.readableEnded) resolve();
      else zip.on("end", () => resolve());
    });
    if (zipError) throw zipError;
    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Report_Cards_${className.replace(/\s+/g, "_")}_${exam.name.replace(/\s+/g, "_")}.zip"`,
      },
    });
  } catch (error) {
    console.error("POST /api/report-pdf/all error:", error);
    return NextResponse.json({ error: "Failed to generate PDFs" }, { status: 500 });
  }
}
