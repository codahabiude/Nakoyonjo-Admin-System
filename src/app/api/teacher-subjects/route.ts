import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/teacher-subjects?teacherId=xxx — get subject assignments for a teacher
// If no teacherId, returns all assignments (admin)
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const teacherId = searchParams.get("teacherId");
    const classId = searchParams.get("classId");

    // Teachers can only see their own assignments
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
      if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

      const where: Record<string, unknown> = { teacherId: teacher.id };
      if (classId) where.classId = classId;

      const assignments = await db.teacherSubject.findMany({
        where,
        include: {
          subject: { select: { id: true, name: true, code: true } },
          class: { select: { id: true, name: true } },
        },
        orderBy: [{ class: { name: "asc" } }, { subject: { code: "asc" } }],
      });

      return NextResponse.json({ assignments });
    }

    // Admin: can query any teacher, or get all
    const where: Record<string, unknown> = {};
    if (teacherId) where.teacherId = teacherId;
    if (classId) where.classId = classId;

    const assignments = await db.teacherSubject.findMany({
      where,
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
      },
      orderBy: [{ teacher: { employeeId: "asc" } }, { class: { name: "asc" } }, { subject: { code: "asc" } }],
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("GET /api/teacher-subjects error:", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }
}

// PUT /api/teacher-subjects — set subject assignments for a teacher
// Body: { teacherId, classId, subjectIds: string[] }
// Replaces all subject assignments for that teacher+class combo
export async function PUT(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { teacherId, classId, subjectIds } = body;

    if (!teacherId || !classId || !Array.isArray(subjectIds)) {
      return NextResponse.json({ error: "teacherId, classId, and subjectIds are required" }, { status: 400 });
    }

    // Verify teacher and class exist
    const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

    const cls = await db.class.findUnique({ where: { id: classId } });
    if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

    // Verify all subjects exist and are linked to this class
    if (subjectIds.length > 0) {
      const classSubjects = await db.classSubject.findMany({
        where: { classId, subjectId: { in: subjectIds } },
        select: { subjectId: true },
      });
      const validSubjectIds = classSubjects.map((cs) => cs.subjectId);
      const invalidIds = subjectIds.filter((id: string) => !validSubjectIds.includes(id));
      if (invalidIds.length > 0) {
        return NextResponse.json({
          error: "Some subjects are not assigned to this class",
          invalidSubjectIds: invalidIds,
        }, { status: 400 });
      }
    }

    // Delete existing assignments for this teacher+class, then create new ones
    await db.teacherSubject.deleteMany({ where: { teacherId, classId } });

    if (subjectIds.length > 0) {
      await db.teacherSubject.createMany({
        data: subjectIds.map((subjectId: string) => ({ teacherId, classId, subjectId })),
      });
    }

    // Return updated assignments for this teacher+class
    const assignments = await db.teacherSubject.findMany({
      where: { teacherId, classId },
      include: { subject: { select: { id: true, name: true, code: true } }, class: { select: { id: true, name: true } } },
      orderBy: { subject: { code: "asc" } },
    });

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("PUT /api/teacher-subjects error:", error);
    return NextResponse.json({ error: "Failed to update assignments" }, { status: 500 });
  }
}

// POST /api/teacher-subjects — add a single assignment
// Body: { teacherId, classId, subjectId }
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { teacherId, classId, subjectId } = body;

    if (!teacherId || !classId || !subjectId) {
      return NextResponse.json({ error: "teacherId, classId, and subjectId are required" }, { status: 400 });
    }

    const assignment = await db.teacherSubject.create({
      data: { teacherId, classId, subjectId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/teacher-subjects error:", error);
    if (String(error).includes("Unique constraint")) {
      return NextResponse.json({ error: "Assignment already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}

// DELETE /api/teacher-subjects — remove a single assignment
// Body: { teacherId, classId, subjectId }
export async function DELETE(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { teacherId, classId, subjectId } = body;

    if (!teacherId || !classId || !subjectId) {
      return NextResponse.json({ error: "teacherId, classId, and subjectId are required" }, { status: 400 });
    }

    await db.teacherSubject.deleteMany({ where: { teacherId, classId, subjectId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/teacher-subjects error:", error);
    return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
  }
}
