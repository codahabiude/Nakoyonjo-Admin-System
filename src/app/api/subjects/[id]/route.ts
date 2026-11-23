import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// PUT /api/subjects/:id (admin only)
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

    const subject = await db.subject.update({
      where: { id },
      data: { code: body.code, name: body.name, category: body.category, description: body.description },
    });

    return NextResponse.json({ subject });
  } catch (error) {
    console.error("PUT /api/subjects/[id] error:", error);
    return NextResponse.json({ error: "Failed to update subject" }, { status: 500 });
  }
}

// DELETE /api/subjects/:id (admin only)
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

    // Check for dependent class subjects before deleting
    const classSubjectCount = await db.classSubject.count({ where: { subjectId: id } });
    if (classSubjectCount > 0) {
      return NextResponse.json({ error: `Cannot delete subject assigned to ${classSubjectCount} class(es). Remove from classes first.` }, { status: 400 });
    }

    // Guard against silent historical-data loss: StudentMark.subject is a
    // cascade relation, so deleting a subject that still has marks would
    // irreversibly erase every mark ever recorded for it.
    const markCount = await db.studentMark.count({ where: { subjectId: id } });
    if (markCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete subject with ${markCount} recorded mark(s). Export or clear the marks first.` },
        { status: 400 }
      );
    }

    await db.subject.delete({ where: { id } });

    return NextResponse.json({ message: "Subject deleted successfully" });
  } catch (error) {
    console.error("DELETE /api/subjects/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete subject" }, { status: 500 });
  }
}