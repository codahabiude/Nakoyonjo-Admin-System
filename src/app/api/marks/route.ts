import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getGradeFromMarks, getPointsFromMarks, invalidateGradingCache } from "@/lib/grading";
import { getSchoolInfo, formatTermRange } from "@/lib/school-settings";

// GET /api/marks?examId=xxx — get marks for an exam
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    if (!examId) return NextResponse.json({ error: "examId is required" }, { status: 400 });

    // Check access
    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // For teachers: check class access AND get their assigned subjects for this class
    let teacherSubjectIds: string[] | null = null; // null = all subjects (admin)
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: user.id },
        include: { classes: true },
      });
      if (!teacher) return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
      const classIds = teacher.classes.map((c) => c.classId) || [];
      if (!classIds.includes(exam.classId)) {
        return NextResponse.json({ error: "Not your class" }, { status: 403 });
      }

      // Get the subjects this teacher teaches in this class
      const assignments = await db.teacherSubject.findMany({
        where: { teacherId: teacher.id, classId: exam.classId },
        select: { subjectId: true },
      });
      teacherSubjectIds = assignments.map((a) => a.subjectId);

      // If teacher has no subject assignments for this class, they see nothing
      if (teacherSubjectIds.length === 0) {
        teacherSubjectIds = ["__none__"]; // ensure no subjects match
      }
    }

    // Get students in the class with their marks for this exam
    const students = await db.student.findMany({
      where: { classId: exam.classId, status: "ACTIVE" },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, gender: true },
    });

    // Get subjects — filtered to teacher's assignments if applicable
    const subjectsWhere: Record<string, unknown> = { classId: exam.classId };
    if (teacherSubjectIds) {
      subjectsWhere.subjectId = { in: teacherSubjectIds };
    }

    const subjects = await db.classSubject.findMany({
      where: subjectsWhere,
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: { subject: { code: "asc" } },
    });

    const marks = await db.studentMark.findMany({
      where: { examId },
      select: { studentId: true, subjectId: true, marksObtained: true, remarks: true },
    });

    // Build a lookup: studentId_subjectId -> mark
    const markMap: Record<string, { marksObtained: number; remarks: string | null }> = {};
    for (const m of marks) {
      markMap[`${m.studentId}_${m.subjectId}`] = { marksObtained: m.marksObtained, remarks: m.remarks };
    }

    return NextResponse.json({
      exam: { id: exam.id, name: exam.name, term: exam.term, year: exam.year, maxMarks: exam.maxMarks, classId: exam.classId, status: exam.status },
      students,
      subjects: subjects.map((cs) => cs.subject),
      marks: markMap,
    });
  } catch (error) {
    console.error("GET /api/marks error:", error);
    return NextResponse.json({ error: "Failed to fetch marks" }, { status: 500 });
  }
}

// PUT /api/marks — save marks (bulk upsert)
export async function PUT(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { examId, marks } = body; // marks: [{ studentId, subjectId, marksObtained, remarks }]
    if (!examId || !marks || !Array.isArray(marks)) {
      return NextResponse.json({ error: "examId and marks array are required" }, { status: 400 });
    }

    // Verify teacher owns this class
    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    const isLocked = exam.status === 'CLOSED' || exam.status === 'APPROVED';
    if (isLocked && user.role !== 'ADMIN') {
      const statusLabel = exam.status === 'APPROVED' ? 'approved' : 'closed';
      return NextResponse.json({ error: `This exam has been ${statusLabel}. Marks can no longer be edited.` }, { status: 403 });
    }

    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: user.id },
        include: { classes: true },
      });
      if (!teacher) return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
      const classIds = teacher.classes.map((c) => c.classId) || [];
      if (!classIds.includes(exam.classId)) {
        return NextResponse.json({ error: "Not your class" }, { status: 403 });
      }

      // Verify teacher is assigned to all subjects they're trying to save marks for
      const assignments = await db.teacherSubject.findMany({
        where: { teacherId: teacher.id, classId: exam.classId },
        select: { subjectId: true },
      });
      const allowedSubjectIds = new Set(assignments.map((a) => a.subjectId));

      const disallowed = marks.filter((m: { subjectId: string }) => !allowedSubjectIds.has(m.subjectId));
      if (disallowed.length > 0) {
        return NextResponse.json({
          error: "You can only enter marks for subjects assigned to you",
        }, { status: 403 });
      }
    }

    // Validate that studentIds belong to the exam's class and subjectIds belong to the class's subjects
    const validStudentIds = new Set((await db.student.findMany({ where: { classId: exam.classId, status: "ACTIVE" }, select: { id: true } })).map(s => s.id));
    const validSubjectIds = new Set((await db.classSubject.findMany({ where: { classId: exam.classId }, select: { subjectId: true } })).map(cs => cs.subjectId));
    const skippedDetails: Array<{ studentId: string; subjectId: string; reason: string }> = [];
    const validMarks = marks.filter((m: any) => {
      if (!validStudentIds.has(m.studentId)) {
        skippedDetails.push({ studentId: m.studentId, subjectId: m.subjectId, reason: 'Student not found or not in class' });
        return false;
      }
      if (!validSubjectIds.has(m.subjectId)) {
        skippedDetails.push({ studentId: m.studentId, subjectId: m.subjectId, reason: 'Subject not assigned to this class' });
        return false;
      }
      if (typeof m.marksObtained !== 'number' || isNaN(m.marksObtained)) {
        skippedDetails.push({ studentId: m.studentId, subjectId: m.subjectId, reason: 'marksObtained is not a valid number' });
        return false;
      }
      // StudentMark.marksObtained is an Int — a decimal like 85.5 would fail
      // the whole transaction. Skip it with a clear reason instead.
      if (!Number.isInteger(m.marksObtained)) {
        skippedDetails.push({ studentId: m.studentId, subjectId: m.subjectId, reason: 'Marks must be whole numbers (no decimals)' });
        return false;
      }
      if (m.marksObtained < 0 || m.marksObtained > exam.maxMarks) {
        skippedDetails.push({ studentId: m.studentId, subjectId: m.subjectId, reason: `Marks must be between 0 and ${exam.maxMarks}` });
        return false;
      }
      return true;
    });

    // Bulk upsert using a transaction
    await db.$transaction(
      validMarks.map((m: { studentId: string; subjectId: string; marksObtained: number; remarks?: string }) =>
        db.studentMark.upsert({
          where: { examId_studentId_subjectId: { examId, studentId: m.studentId, subjectId: m.subjectId } },
          create: {
            examId,
            studentId: m.studentId,
            subjectId: m.subjectId,
            marksObtained: m.marksObtained,
            remarks: m.remarks || null,
            gradedBy: user.id,
          },
          update: {
            marksObtained: m.marksObtained,
            remarks: m.remarks || null,
            gradedBy: user.id,
            gradedAt: new Date(),
          },
        })
      )
    );

    return NextResponse.json({ ok: true, saved: validMarks.length, skipped: marks.length - validMarks.length, skippedDetails });
  } catch (error) {
    console.error("PUT /api/marks error:", error);
    return NextResponse.json({ error: "Failed to save marks" }, { status: 500 });
  }
}

// POST /api/marks — report card data
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { studentId, examId } = body;
    if (!studentId || !examId) {
      return NextResponse.json({ error: "studentId and examId are required" }, { status: 400 });
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

    // Access check for teachers
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: user.id },
        include: { classes: true },
      });
      const classIds = teacher?.classes.map((c) => c.classId) || [];
      if (!classIds.includes(student.classId)) {
        return NextResponse.json({ error: "Not your class" }, { status: 403 });
      }
    }

    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // Get subject count for the class to compute correct maxTotal
    const subjectCount = await db.classSubject.count({ where: { classId: student.classId } });

    const marks = await db.studentMark.findMany({
      where: { studentId, examId },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { code: "asc" } },
    });

    const totalMarks = marks.reduce((sum, m) => sum + m.marksObtained, 0);
    const totalPoints = marks.reduce((sum, m) => sum + getPointsFromMarks(m.marksObtained), 0);
    const maxTotal = subjectCount * exam.maxMarks;
    const maxPoints = subjectCount * 8;
    const average = marks.length > 0 ? (totalMarks / marks.length).toFixed(1) : "0";
    const { grade } = await getGradeFromMarks(parseFloat(average));

    // Get teacher's name for this class
    const teacherClass = await db.teacherClass.findFirst({
      where: { classId: student.classId, isPrimary: true },
      include: { teacher: { include: { user: { select: { name: true } } } } },
    });
    const classTeacherName = teacherClass?.teacher?.user?.name || "";

    // Get class rank — use ALL active students, not just those with marks
    const allStudents = await db.student.findMany({
      where: { classId: student.classId, status: "ACTIVE" },
      select: { id: true },
    });

    // Fetch all marks for the exam and compute totals per student with tie handling
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
    const ranked = allStudents
      .map((s) => {
        const total = studentTotals[s.id] || 0;
        const pts = studentPoints[s.id] || 0;
        const mc = studentMarkCounts[s.id] || 0;
        return { studentId: s.id, totalMarks: total, totalPoints: pts, average: mc > 0 ? total / mc : 0 };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints || b.totalMarks - a.totalMarks || b.average - a.average);

    // Find the rank for the student (by points)
    let rank = ranked.length;
    let tempRank = 1;
    for (let i = 0; i < ranked.length; i++) {
      if (i > 0 && ranked[i].totalPoints < ranked[i - 1].totalPoints) tempRank = i + 1;
      if (ranked[i].studentId === studentId) { rank = tempRank; break; }
    }
    const totalStudents = allStudents.length;

    // School settings — shown on the on-screen report card and the print view
    const school = await getSchoolInfo();
    const termRange = formatTermRange(exam.term, school.termDates);

    return NextResponse.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        dateOfBirth: student.dateOfBirth,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
      },
      class: { name: student.class.name },
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
          remarks: m.remarks || g.remark,
        };
      })),
      summary: { totalMarks, maxTotal, totalPoints, maxPoints, average, grade, rank, totalStudents },
    });
  } catch (error) {
    console.error("POST /api/marks error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
