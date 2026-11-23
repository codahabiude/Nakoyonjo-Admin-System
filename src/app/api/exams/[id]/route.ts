import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

const VALID_STATUSES = ["ACTIVE", "APPROVED", "CLOSED"] as const;
type ExamStatus = (typeof VALID_STATUSES)[number];

// PATCH /api/exams/[id] — update exam (including approval workflow)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Only admins can update exams" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { name, term, year, maxMarks, status, examDate } = body;

    // Check exam exists
    const existing = await db.exam.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (term) updateData.term = term;
    if (year) updateData.year = year;
    if (maxMarks !== undefined) {
      // Validate: the grading pipeline (CBC scale, 50-pass threshold, report
      // formats) assumes 100-mark exams — a bad maxMarks (0, negative, >100,
      // non-integer) would corrupt every marks/range calculation.
      if (
        typeof maxMarks !== "number" ||
        !Number.isInteger(maxMarks) ||
        maxMarks < 1 ||
        maxMarks > 100
      ) {
        return NextResponse.json(
          { error: "maxMarks must be a whole number between 1 and 100" },
          { status: 400 }
        );
      }
      updateData.maxMarks = maxMarks;
    }

    // Bug 9: Allow clearing examDate by checking !== undefined instead of truthy
    if (examDate !== undefined) {
      updateData.examDate = examDate ? new Date(examDate) : null;
    }

    // Handle status transitions with validation
    if (status !== undefined && status !== null && status !== "") {
      const newStatus = String(status).toUpperCase();
      if (!VALID_STATUSES.includes(newStatus as ExamStatus)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }

      // Validate transitions: ACTIVE → APPROVED → CLOSED
      const current = existing.status;
      if (newStatus === "APPROVED" && current !== "ACTIVE") {
        return NextResponse.json({ error: "Only ACTIVE exams can be approved" }, { status: 400 });
      }
      if (newStatus === "CLOSED" && current !== "APPROVED" && current !== "ACTIVE") {
        return NextResponse.json({ error: "Only ACTIVE or APPROVED exams can be closed" }, { status: 400 });
      }
      if (newStatus === "ACTIVE" && current === "CLOSED") {
        // Reopening a closed exam — clear audit fields
        updateData.closedBy = null;
        updateData.closedAt = null;
      }
      if (newStatus === "ACTIVE" && current === "APPROVED") {
        // Reverting approval
        updateData.approvedBy = null;
        updateData.approvedAt = null;
      }

      updateData.status = newStatus;

      // Set audit fields
      if (newStatus === "APPROVED") {
        updateData.approvedBy = user.id;
        updateData.approvedAt = new Date();
      }
      if (newStatus === "CLOSED") {
        updateData.closedBy = user.id;
        updateData.closedAt = new Date();
      }
    }

    const exam = await db.exam.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ exam });
  } catch (error) {
    console.error("PATCH /api/exams/[id] error:", error);
    return NextResponse.json({ error: "Failed to update exam" }, { status: 500 });
  }
}

// DELETE /api/exams/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Only admins can delete exams" }, { status: 403 });

    const { id } = await params;

    // Bug 8: Only allow deleting ACTIVE exams
    const existing = await db.exam.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    if (existing.status !== 'ACTIVE') {
      return NextResponse.json({ error: `Cannot delete a ${existing.status.toLowerCase()} exam. Reopen it first.` }, { status: 400 });
    }

    await db.exam.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/exams/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete exam" }, { status: 500 });
  }
}
