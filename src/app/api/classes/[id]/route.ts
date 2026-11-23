import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/classes/:id
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const singleClass = await db.class.findUnique({
      where: { id },
      include: {
        students: { orderBy: [{ lastName: "asc" }, { firstName: "asc" }] },
        subjects: { include: { subject: true } },
        teachers: { include: { teacher: { include: { user: { select: { name: true, email: true } } } } } },
      },
    });

    if (!singleClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    return NextResponse.json({ class: singleClass });
  } catch (error) {
    console.error("GET /api/classes/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch class" }, { status: 500 });
  }
}

// PUT /api/classes/:id (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    if (body.subjectIds !== undefined) {
      if (!Array.isArray(body.subjectIds)) {
        return NextResponse.json({ error: "subjectIds must be an array" }, { status: 400 });
      }
      // Validate subject ids exist BEFORE deleting anything, and run
      // delete+create atomically so a failure cannot wipe the class's subjects.
      const uniqueSubjectIds = [...new Set(body.subjectIds as string[])];
      const existing = await db.subject.count({ where: { id: { in: uniqueSubjectIds } } });
      if (existing !== uniqueSubjectIds.length) {
        return NextResponse.json({ error: "One or more subject IDs do not exist" }, { status: 400 });
      }
      await db.$transaction(async (tx) => {
        await tx.classSubject.deleteMany({ where: { classId: id } });
        if (uniqueSubjectIds.length > 0) {
          await tx.classSubject.createMany({
            data: uniqueSubjectIds.map((subjectId) => ({ classId: id, subjectId })),
          });
        }
      });
    }

    const updatedClass = await db.class.update({
      where: { id },
      data: { name: body.name, academicYear: body.academicYear },
      include: { subjects: { include: { subject: true } }, _count: { select: { students: true } } },
    });

    return NextResponse.json({ class: updatedClass });
  } catch (error) {
    console.error("PUT /api/classes/[id] error:", error);
    return NextResponse.json({ error: "Failed to update class" }, { status: 500 });
  }
}

// DELETE /api/classes/:id (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    // Check for dependent students before deleting
    const studentCount = await db.student.count({ where: { classId: id } });
    if (studentCount > 0) {
      return NextResponse.json({ error: `Cannot delete class with ${studentCount} enrolled student(s). Transfer or remove students first.` }, { status: 400 });
    }

    // Check for exams before deleting — Exam.class FK would otherwise fail with a cryptic 500
    const examCount = await db.exam.count({ where: { classId: id } });
    if (examCount > 0) {
      return NextResponse.json({ error: `Cannot delete class with ${examCount} exam(s). Delete its exams first.` }, { status: 400 });
    }

    await db.class.delete({ where: { id } });

    return NextResponse.json({ message: "Class deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/classes/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete class" }, { status: 500 });
  }
}
