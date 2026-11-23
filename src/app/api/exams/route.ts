import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { Prisma } from "@prisma/client";
import { getSchoolInfo, examDateOutsideTerm } from "@/lib/school-settings";

// GET /api/exams — list exams (filtered by role) with per-subject progress
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");

    let whereClause: Record<string, unknown> = {};

    // ── Teacher-specific setup ──────────────────────────────────────
    // subjectIds assigned to THIS teacher, keyed by classId
    const teacherSubjectIdsByClass: Record<string, Set<string>> = {};
    // subjectIds that have ANY teacher assigned, keyed by classId
    const allAssignedSubjectIdsByClass: Record<string, Set<string>> = {};

    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: user.id },
        include: { classes: true, subjects: true },
      });
      if (!teacher) return NextResponse.json({ exams: [] });

      const classIds = teacher.classes.map((c) => c.classId);
      if (classIds.length === 0) return NextResponse.json({ exams: [] });
      whereClause.classId = { in: classIds };

      // Subjects assigned to THIS teacher per class
      for (const ts of teacher.subjects) {
        if (!teacherSubjectIdsByClass[ts.classId]) teacherSubjectIdsByClass[ts.classId] = new Set();
        teacherSubjectIdsByClass[ts.classId].add(ts.subjectId);
      }

      // ALL teacher-subject assignments for these classes (to find unassigned subjects)
      const allAssignments = await db.teacherSubject.findMany({
        where: { classId: { in: classIds } },
        select: { classId: true, subjectId: true },
      });
      for (const a of allAssignments) {
        if (!allAssignedSubjectIdsByClass[a.classId]) allAssignedSubjectIdsByClass[a.classId] = new Set();
        allAssignedSubjectIdsByClass[a.classId].add(a.subjectId);
      }
    } else if (classId) {
      whereClause.classId = classId;
    }

    // ── Fetch exams ─────────────────────────────────────────────────
    const exams = await db.exam.findMany({
      where: whereClause,
      include: { class: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { term: "asc" }, { createdAt: "desc" }],
    });

    if (exams.length === 0) return NextResponse.json({ exams: [] });

    const examIds = exams.map((e) => e.id);
    const uniqueClassIds = [...new Set(exams.map((e) => e.classId))];

    // ── Batch: class subjects with subject details ──────────────────
    const classSubjects = await db.classSubject.findMany({
      where: { classId: { in: uniqueClassIds } },
      include: { subject: { select: { id: true, code: true, name: true } } },
    });

    // Index by classId for fast lookup
    const subjectsByClass: Record<string, Array<{ subjectId: string; subjectCode: string; subjectName: string }>> = {};
    for (const cs of classSubjects) {
      if (!subjectsByClass[cs.classId]) subjectsByClass[cs.classId] = [];
      subjectsByClass[cs.classId].push({
        subjectId: cs.subject.id,
        subjectCode: cs.subject.code,
        subjectName: cs.subject.name,
      });
    }

    // ── Batch: active student count per class ───────────────────────
    const studentsPerClass = await db.student.groupBy({
      by: ["classId"],
      where: { classId: { in: uniqueClassIds }, status: "ACTIVE" },
      _count: { id: true },
    });
    const studentCountMap: Record<string, number> = {};
    for (const s of studentsPerClass) studentCountMap[s.classId] = s._count.id;

    // ── Batch: mark progress (count + most recent gradedBy) ─────────
    const markProgress = await db.$queryRaw<
      Array<{ examId: string; subjectId: string; markCount: bigint; latestGradedBy: string | null }>
    >`
      SELECT
        examId,
        subjectId,
        COUNT(*) as markCount,
        (SELECT gradedBy FROM student_marks sm2
         WHERE sm2.examId = student_marks.examId
         AND sm2.subjectId = student_marks.subjectId
         ORDER BY sm2.gradedAt DESC LIMIT 1) as latestGradedBy
      FROM student_marks
      WHERE examId IN (${Prisma.join(examIds)})
      GROUP BY examId, subjectId
    `;

    // Index: "examId-subjectId" -> { markCount, latestGradedBy }
    const progressMap = new Map<string, { markCount: number; latestGradedBy: string | null }>();
    for (const mp of markProgress) {
      progressMap.set(`${mp.examId}-${mp.subjectId}`, {
        markCount: Number(mp.markCount),
        latestGradedBy: mp.latestGradedBy,
      });
    }

    // ── Batch: resolve userIds to names (gradedBy, approvedBy, closedBy) ─────
    const allUserIds = new Set<string>();
    for (const [, val] of progressMap) {
      if (val.latestGradedBy) allUserIds.add(val.latestGradedBy);
    }
    for (const e of exams) {
      if (e.approvedBy) allUserIds.add(e.approvedBy);
      if (e.closedBy) allUserIds.add(e.closedBy);
    }
    const userNames: Record<string, string> = {};
    if (allUserIds.size > 0) {
      const users = await db.user.findMany({
        where: { id: { in: [...allUserIds] } },
        select: { id: true, name: true },
      });
      for (const u of users) userNames[u.id] = u.name;
    }

    // ── Total mark count (preserve existing field) ──────────────────
    const countMap: Record<string, number> = {};
    for (const mp of markProgress) {
      countMap[mp.examId] = (countMap[mp.examId] || 0) + Number(mp.markCount);
    }

    // ── Build response ──────────────────────────────────────────────
    const response = exams.map((e) => {
      const classSubjectsList = subjectsByClass[e.classId] || [];
      const studentCount = studentCountMap[e.classId] || 0;

      // For teachers: filter subjects to their assignments + unassigned
      let visibleSubjects = classSubjectsList;
      if (user.role === "TEACHER") {
        const mySubjects = teacherSubjectIdsByClass[e.classId];
        const allAssigned = allAssignedSubjectIdsByClass[e.classId];
        visibleSubjects = classSubjectsList.filter((s) => {
          // Include if assigned to this teacher
          if (mySubjects?.has(s.subjectId)) return true;
          // Include if no teacher is assigned at all (unassigned)
          if (allAssigned && !allAssigned.has(s.subjectId)) return true;
          return false;
        });
      }

      const subjectProgress = visibleSubjects.map((s) => {
        const key = `${e.id}-${s.subjectId}`;
        const progress = progressMap.get(key);
        const markCount = progress?.markCount || 0;
        return {
          subjectId: s.subjectId,
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          enteredBy: progress?.latestGradedBy ? userNames[progress.latestGradedBy] || progress.latestGradedBy : null,
          markCount,
          studentCount,
        };
      });

      const completedSubjects = subjectProgress.filter((sp) => sp.markCount >= sp.studentCount && sp.studentCount > 0).length;
      const totalSubjects = visibleSubjects.length;

      // Resolve approver/closer names from batch
      const approvedByName = e.approvedBy ? (userNames[e.approvedBy] || null) : null;
      const closedByName = e.closedBy ? (userNames[e.closedBy] || null) : null;

      return {
        id: e.id,
        name: e.name,
        term: e.term,
        year: e.year,
        examDate: e.examDate,
        maxMarks: e.maxMarks,
        status: e.status,
        classId: e.classId,
        className: e.class.name,
        totalMarks: countMap[e.id] || 0,
        subjectProgress,
        completedSubjects,
        totalSubjects,
        isComplete: totalSubjects > 0 && completedSubjects === totalSubjects,
        approvedBy: e.approvedBy,
        approvedAt: e.approvedAt,
        approvedByName,
        closedBy: e.closedBy,
        closedAt: e.closedAt,
        closedByName,
      };
    });

    return NextResponse.json({ exams: response });
  } catch (error) {
    console.error("GET /api/exams error:", error);
    return NextResponse.json({ error: "Failed to fetch exams" }, { status: 500 });
  }
}

// POST /api/exams — create an exam
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Only admins can create exams" }, { status: 403 });

    const body = await req.json();
    const { name, term, year, classId, maxMarks, examDate } = body;

    if (!name || !term || !year || !classId) {
      return NextResponse.json({ error: "Name, term, year, and classId are required" }, { status: 400 });
    }

    // Validate classId exists
    const cls = await db.class.findUnique({ where: { id: classId } });
    if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 400 });

    // Validate maxMarks: the whole grading pipeline (CBC scale, 50-pass
    // threshold, report formats) is built for 100-mark exams, so lock it.
    const resolvedMaxMarks = maxMarks ?? 100;
    if (
      typeof resolvedMaxMarks !== "number" ||
      !Number.isInteger(resolvedMaxMarks) ||
      resolvedMaxMarks < 1 ||
      resolvedMaxMarks > 100
    ) {
      return NextResponse.json({ error: "maxMarks must be a whole number between 1 and 100" }, { status: 400 });
    }

    // Validate term format
    if (!/^Term\s+[1-3]$/.test(term) && !/^(Term [1-3]|term [1-3])$/.test(term)) {
      // Allow free-form terms but warn — don't block
    }

    // Term-date validation from Settings: if the admin has set the term
    // calendar, an exam dated outside its own term is rejected with the
    // allowed window in the message.
    if (examDate) {
      const parsedDate = new Date(`${examDate}T00:00:00`);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: "Invalid exam date" }, { status: 400 });
      }
      const school = await getSchoolInfo();
      const outsideMsg = examDateOutsideTerm(term, parsedDate, school.termDates);
      if (outsideMsg) {
        return NextResponse.json({ error: outsideMsg }, { status: 400 });
      }
    }

    const exam = await db.exam.create({
      data: {
        name,
        term,
        year,
        classId,
        maxMarks: resolvedMaxMarks,
        examDate: examDate ? new Date(examDate) : null,
        status: "ACTIVE",
      },
    });

    return NextResponse.json({ exam }, { status: 201 });
  } catch (error) {
    console.error("POST /api/exams error:", error);
    return NextResponse.json({ error: "Failed to create exam" }, { status: 500 });
  }
}
