import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/students/:id
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
    const student = await db.student.findUnique({
      where: { id },
      include: {
        class: true,
        attendance: { orderBy: { date: "desc" }, take: 30 },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    return NextResponse.json({ student });
  } catch (error) {
    console.error("GET /api/students/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch student" }, { status: 500 });
  }
}

// PUT /api/students/:id
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

    // Validate classId if provided (FK target must exist → clean 400, not 500)
    if (body.classId) {
      const cls = await db.class.findUnique({ where: { id: body.classId } });
      if (!cls) {
        return NextResponse.json({ error: "Class not found" }, { status: 400 });
      }
    }
    // Reject an unparseable dateOfBirth instead of crashing on Invalid Date
    if (body.dateOfBirth) {
      const d = new Date(body.dateOfBirth);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
      }
    }

    // Build update data ONLY from provided fields — never null out values
    // that were omitted (a partial PUT must not wipe e.g. dateOfBirth).
    const updateData: Record<string, unknown> = {};
    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.lastName !== undefined) updateData.lastName = body.lastName;
    if (body.dateOfBirth !== undefined)
      updateData.dateOfBirth = body.dateOfBirth ? new Date(body.dateOfBirth) : null;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.classId !== undefined) updateData.classId = body.classId;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.guardianName !== undefined) updateData.guardianName = body.guardianName;
    if (body.guardianPhone !== undefined) updateData.guardianPhone = body.guardianPhone;
    if (body.guardianRelation !== undefined) updateData.guardianRelation = body.guardianRelation;
    if (body.guardianIdNumber !== undefined) updateData.guardianIdNumber = body.guardianIdNumber;

    const student = await db.student.update({
      where: { id },
      data: updateData,
      include: { class: true },
    });

    return NextResponse.json({ student });
  } catch (error: unknown) {
    console.error("PUT /api/students/[id] error:", error);
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
  }
}

// DELETE /api/students/:id
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
    await db.student.delete({ where: { id } });

    return NextResponse.json({ message: "Student deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/students/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
  }
}
