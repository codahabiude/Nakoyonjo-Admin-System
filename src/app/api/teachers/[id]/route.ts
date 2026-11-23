import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/teachers/:id
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
    const teacher = await db.teacher.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, name: true, role: true, isActive: true } },
        classes: { include: { class: { include: { students: true } } } },
        subjects: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            class: { select: { id: true, name: true } },
          },
          orderBy: [{ class: { name: "asc" } }, { subject: { code: "asc" } }],
        },
      },
    });

    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    return NextResponse.json({ teacher });
  } catch (error) {
    console.error("GET /api/teachers/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch teacher" }, { status: 500 });
  }
}

// PUT /api/teachers/:id
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

    // Ensure the teacher exists first (404, not a Prisma 500)
    const existingTeacher = await db.teacher.findUnique({ where: { id } });
    if (!existingTeacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    const teacher = await db.teacher.update({
      where: { id },
      data: { phone: body.phone, qualification: body.qualification },
      include: {
        user: { select: { email: true, name: true, role: true, isActive: true } },
        classes: { include: { class: true } },
      },
    });

    if (body.name) {
      await db.user.update({ where: { id: teacher.userId }, data: { name: body.name } });
    }

    if (body.classIds !== undefined) {
      if (!Array.isArray(body.classIds)) {
        return NextResponse.json({ error: "classIds must be an array" }, { status: 400 });
      }
      // Validate class ids exist first, then replace atomically
      const uniqueClassIds = [...new Set(body.classIds as string[])];
      if (uniqueClassIds.length > 0) {
        const existingClasses = await db.class.count({ where: { id: { in: uniqueClassIds } } });
        if (existingClasses !== uniqueClassIds.length) {
          return NextResponse.json({ error: "One or more class IDs do not exist" }, { status: 400 });
        }
      }

      // Resolve the CLASS TEACHER (isPrimary) flags for the new class list:
      // 1. explicit request: body.primaryClassId ("null"/"" → regular teacher)
      // 2. otherwise: preserve existing primary classes that remain assigned
      //    (so an edit never silently strips a teacher's class-teacher role).
      const currentPrimaryRows = await db.teacherClass.findMany({
        where: { teacherId: id, isPrimary: true },
        select: { classId: true },
      });
      let primaryClassIds: string[];
      if (body.primaryClassId !== undefined) {
        const requested =
          typeof body.primaryClassId === "string" && body.primaryClassId.length > 0
            ? body.primaryClassId
            : null;
        if (requested && !uniqueClassIds.includes(requested)) {
          return NextResponse.json(
            { error: "primaryClassId must be one of the assigned classes" },
            { status: 400 }
          );
        }
        primaryClassIds = requested ? [requested] : [];
      } else {
        primaryClassIds = currentPrimaryRows
          .map((r) => r.classId)
          .filter((classId) => uniqueClassIds.includes(classId));
      }

      await db.$transaction(async (tx) => {
        await tx.teacherClass.deleteMany({ where: { teacherId: id } });
        if (uniqueClassIds.length > 0) {
          await tx.teacherClass.createMany({
            data: uniqueClassIds.map((classId) => ({
              teacherId: id,
              classId,
              isPrimary: primaryClassIds.includes(classId),
            })),
          });
        }
        // BUSINESS RULE: a class can have only ONE class teacher. Demote any
        // OTHER teacher still flagged as primary for the same class(es).
        for (const classId of primaryClassIds) {
          await tx.teacherClass.updateMany({
            where: { classId, isPrimary: true, teacherId: { not: id } },
            data: { isPrimary: false },
          });
        }
      });
    } else if (body.primaryClassId !== undefined) {
      // Class-teacher change WITHOUT touching the class list.
      if (
        typeof body.primaryClassId === "string" &&
        body.primaryClassId.length > 0
      ) {
        const classId = body.primaryClassId as string;
        const membership = await db.teacherClass.findUnique({
          where: { teacherId_classId: { teacherId: id, classId } },
        });
        if (!membership) {
          return NextResponse.json(
            { error: "Teacher is not assigned to that class" },
            { status: 400 }
          );
        }
        await db.$transaction(async (tx) => {
          await tx.teacherClass.updateMany({
            where: { teacherId: id },
            data: { isPrimary: false },
          });
          await tx.teacherClass.update({
            where: { teacherId_classId: { teacherId: id, classId } },
            data: { isPrimary: true },
          });
          await tx.teacherClass.updateMany({
            where: { classId, isPrimary: true, teacherId: { not: id } },
            data: { isPrimary: false },
          });
        });
      } else {
        // null/"" → revoke class-teacher role (becomes a regular teacher)
        await db.teacherClass.updateMany({
          where: { teacherId: id },
          data: { isPrimary: false },
        });
      }
    }

    if (body.subjectAssignments !== undefined) {
      if (!Array.isArray(body.subjectAssignments)) {
        return NextResponse.json({ error: "subjectAssignments must be an array" }, { status: 400 });
      }
      // body.subjectAssignments: { classId: string, subjectIds: string[] }[]
      // Replace atomically per class so a failure never wipes assignments.
      await db.$transaction(async (tx) => {
        for (const assignment of body.subjectAssignments) {
          if (!assignment?.classId || !Array.isArray(assignment.subjectIds)) continue;
          const uniqueSubjectIds = [...new Set(assignment.subjectIds as string[])];
          await tx.teacherSubject.deleteMany({ where: { teacherId: id, classId: assignment.classId } });
          if (uniqueSubjectIds.length > 0) {
            await tx.teacherSubject.createMany({
              data: uniqueSubjectIds.map((subjectId) => ({ teacherId: id, classId: assignment.classId, subjectId })),
            });
          }
        }
      });
    }

    const updatedTeacher = await db.teacher.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, name: true, role: true, isActive: true } },
        classes: { include: { class: true } },
        subjects: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            class: { select: { id: true, name: true } },
          },
          orderBy: [{ class: { name: "asc" } }, { subject: { code: "asc" } }],
        },
      },
    });

    return NextResponse.json({ teacher: updatedTeacher });
  } catch (error) {
    console.error("PUT /api/teachers/[id] error:", error);
    return NextResponse.json({ error: "Failed to update teacher" }, { status: 500 });
  }
}

// DELETE /api/teachers/:id
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

    // Fetch teacher with user; delete the USER (cascades to Teacher +
    // TeacherClass/TeacherSubject via relation cascades) in ONE atomic step.
    const teacher = await db.teacher.findUnique({ where: { id }, include: { user: true } });
    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    await db.user.delete({ where: { id: teacher.userId } });

    return NextResponse.json({ message: "Teacher deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/teachers/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete teacher" }, { status: 500 });
  }
}
