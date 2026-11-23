import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/class-teacher-overview?classId=xxx
// Returns subject-by-subject marks entry progress for a class (class teacher view)
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    if (!classId) return NextResponse.json({ error: "classId required" }, { status: 400 });

    // Verify teacher is the class teacher (isPrimary) for this class
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
      if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

      const tc = await db.teacherClass.findFirst({
        where: { teacherId: teacher.id, classId, isPrimary: true },
      });
      if (!tc) {
        return NextResponse.json({ error: "You are not the class teacher of this class" }, { status: 403 });
      }
    }

    // Get the class info
    const cls = await db.class.findUnique({
      where: { id: classId },
      include: {
        _count: { select: { students: { where: { status: "ACTIVE" } } } },
      },
    });
    if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

    const studentCount = cls._count.students;

    // Get all subjects offered in this class
    const classSubjects = await db.classSubject.findMany({
      where: { classId },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: { subject: { code: "asc" } },
    });

    // Get all teacher-subject assignments for this class
    const teacherAssignments = await db.teacherSubject.findMany({
      where: { classId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        teacher: { include: { user: { select: { name: true } } } },
      },
    });

    // Build a map: subjectId → teacherName
    const subjectTeacherMap: Record<string, string> = {};
    for (const ta of teacherAssignments) {
      subjectTeacherMap[ta.subjectId] = ta.teacher.user.name;
    }

    // Get all exams for this class
    const exams = await db.exam.findMany({
      where: { classId },
      orderBy: { createdAt: "desc" },
    });

    // For each subject, get marks entry status per exam
    const subjects = await Promise.all(
      classSubjects.map(async (cs) => {
        const examStatus = await Promise.all(
          exams.map(async (exam) => {
            const markCount = await db.studentMark.count({
              where: { examId: exam.id, subjectId: cs.subjectId },
            });
            return {
              examId: exam.id,
              examName: exam.name,
              term: `${exam.term} ${exam.year}`,
              status: exam.status,
              markCount,
              studentCount,
              isDone: markCount >= studentCount && studentCount > 0,
            };
          })
        );

        return {
          subjectId: cs.subject.id,
          subjectName: cs.subject.name,
          subjectCode: cs.subject.code,
          teacherName: subjectTeacherMap[cs.subject.id] || "Not assigned",
          examStatus,
        };
      })
    );

    return NextResponse.json({
      classId: cls.id,
      className: cls.name,
      studentCount,
      subjects,
    });
  } catch (error) {
    console.error("GET /api/class-teacher-overview error:", error);
    return NextResponse.json({ error: "Failed to fetch class teacher overview" }, { status: 500 });
  }
}
