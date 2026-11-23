import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getGradeFromMarks, getPointsFromMarks } from "@/lib/grading";

// GET /api/marks/ranking?examId=xxx — full class ranking for an exam
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    if (!examId) return NextResponse.json({ error: "examId is required" }, { status: 400 });

    // Verify exam exists
    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // Teacher access check
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: user.id },
        include: { classes: true },
      });
      const classIds = teacher?.classes.map((c) => c.classId) || [];
      if (!classIds.includes(exam.classId)) {
        return NextResponse.json({ error: "Not your class" }, { status: 403 });
      }
    }

    // Get the class name
    const cls = await db.class.findUnique({ where: { id: exam.classId } });

    // Get all students in the class
    const students = await db.student.findMany({
      where: { classId: exam.classId, status: "ACTIVE" },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, gender: true },
    });

    // Get all marks for this exam
    const allMarks = await db.studentMark.findMany({
      where: { examId },
      select: { studentId: true, marksObtained: true },
    });

    // Build per-student totals and points
    const studentTotals: Record<string, number> = {};
    const studentPoints: Record<string, number> = {};
    const studentMarkCounts: Record<string, number> = {};
    for (const m of allMarks) {
      studentTotals[m.studentId] = (studentTotals[m.studentId] || 0) + m.marksObtained;
      studentPoints[m.studentId] = (studentPoints[m.studentId] || 0) + getPointsFromMarks(m.marksObtained);
      studentMarkCounts[m.studentId] = (studentMarkCounts[m.studentId] || 0) + 1;
    }

    // Build ranking data sorted by total points desc (default), then by total marks
    const rankingData = students.map((s) => {
      const total = studentTotals[s.id] || 0;
      const pts = studentPoints[s.id] || 0;
      const markCount = studentMarkCounts[s.id] || 0;
      const avg = markCount > 0 ? total / markCount : 0;
      return {
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        gender: s.gender,
        totalMarks: total,
        totalPoints: pts,
        average: avg.toFixed(1),
        grade: "" as string,
        rank: 0,
      };
    });

    // Sort by total points descending, then by total marks for ties
    rankingData.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.totalMarks !== a.totalMarks) return b.totalMarks - a.totalMarks;
      return parseFloat(b.average) - parseFloat(a.average);
    });

    // Assign ranks with tie handling (by points)
    let currentRank = 1;
    for (let i = 0; i < rankingData.length; i++) {
      if (i > 0 && rankingData[i].totalPoints < rankingData[i - 1].totalPoints) {
        currentRank = i + 1;
      }
      rankingData[i].rank = currentRank;
    }

    // Fetch grades for each student
    const ranked = await Promise.all(
      rankingData.map(async (r) => {
        const { grade } = await getGradeFromMarks(parseFloat(r.average));
        return { ...r, grade };
      })
    );

    // Get subject count for maxTotal
    const subjectsCount = await db.classSubject.count({
      where: { classId: exam.classId },
    });

    return NextResponse.json({
      examId,
      className: cls?.name || "",
      examName: exam.name,
      term: exam.term,
      year: exam.year,
      maxMarks: exam.maxMarks,
      subjectCount: subjectsCount,
      maxTotal: subjectsCount * exam.maxMarks,
      ranking: ranked,
      totalStudents: ranked.length,
    });
  } catch (error) {
    console.error("GET /api/marks/ranking error:", error);
    return NextResponse.json({ error: "Failed to fetch ranking" }, { status: 500 });
  }
}
