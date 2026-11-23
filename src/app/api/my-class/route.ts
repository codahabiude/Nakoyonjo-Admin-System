import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/my-class — returns the teacher's assigned classes and their exams
// For admin, returns all classes
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user.role === "ADMIN") {
      const classes = await db.class.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: { select: { students: true, exams: true } },
          exams: { orderBy: { createdAt: "desc" } },
          teachers: {
            where: { isPrimary: true },
            include: { teacher: { include: { user: { select: { name: true, email: true } } } } },
          },
        },
      });
      return NextResponse.json({ classes });
    }

    // Teacher: get ALL their assigned classes (not just primary)
    const teacher = await db.teacher.findUnique({
      where: { userId: user.id },
      include: {
        classes: {
          include: {
            class: true,
          },
        },
      },
    });

    if (!teacher || teacher.classes.length === 0) {
      return NextResponse.json({ classes: [], message: "No class assigned" });
    }

    // Get subjects assigned to this teacher per class
    const teacherClasses = await Promise.all(
      teacher.classes.map(async (tc) => {
        const cls = tc.class;
        const studentCount = await db.student.count({ where: { classId: cls.id, status: "ACTIVE" } });
        const exams = await db.exam.findMany({
          where: { classId: cls.id },
          orderBy: { createdAt: "desc" },
        });

        // Get subjects this teacher teaches in this class
        const subjectAssignments = await db.teacherSubject.findMany({
          where: { teacherId: teacher.id, classId: cls.id },
          include: { subject: { select: { id: true, name: true, code: true } } },
          orderBy: { subject: { code: "asc" } },
        });

        return {
          ...cls,
          studentCount,
          exams,
          isPrimary: tc.isPrimary,
          teacherName: user.name,
          assignedSubjects: subjectAssignments.map((sa) => sa.subject),
        };
      })
    );

    return NextResponse.json({ classes: teacherClasses });
  } catch (error) {
    console.error("GET /api/my-class error:", error);
    return NextResponse.json({ error: "Failed to fetch class" }, { status: 500 });
  }
}
