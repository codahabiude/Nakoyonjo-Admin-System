import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/exam-remarks?examId=xxx — fetch all remarks for an exam
// Class teachers and admins can access
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const examId = searchParams.get("examId");
    if (!examId) return NextResponse.json({ error: "examId required" }, { status: 400 });

    // Verify access
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
      if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

      // Must be class teacher of the exam's class, OR have subject assignments
      const exam = await db.exam.findUnique({ where: { id: examId } });
      if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

      const isClassTeacher = await db.teacherClass.findFirst({
        where: { teacherId: teacher.id, classId: exam.classId, isPrimary: true },
      });
      const hasSubject = await db.teacherSubject.findFirst({
        where: { teacherId: teacher.id, classId: exam.classId },
      });

      if (!isClassTeacher && !hasSubject) {
        return NextResponse.json({ error: "Not your class" }, { status: 403 });
      }
    }

    const remarks = await db.examRemark.findMany({
      where: { examId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { student: { lastName: "asc" } },
    });

    // Return as a map: studentId → remark
    const remarkMap: Record<string, { id: string; remark: string; studentName: string }> = {};
    for (const r of remarks) {
      remarkMap[r.studentId] = {
        id: r.id,
        remark: r.remark,
        studentName: `${r.student.lastName}, ${r.student.firstName}`,
      };
    }

    return NextResponse.json({ remarks: remarkMap, total: remarks.length });
  } catch (error) {
    console.error("GET /api/exam-remarks error:", error);
    return NextResponse.json({ error: "Failed to fetch remarks" }, { status: 500 });
  }
}

// PUT /api/exam-remarks — save/upsert a remark (class teacher only)
export async function PUT(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { examId, studentId, remark } = await req.json();
    if (!examId || !studentId) {
      return NextResponse.json({ error: "examId and studentId required" }, { status: 400 });
    }
    // remark must be a string (a number/object would crash .trim() below)
    if (remark !== undefined && remark !== null && typeof remark !== "string") {
      return NextResponse.json({ error: "Remark must be text" }, { status: 400 });
    }
    if (remark && remark.length > 500) {
      return NextResponse.json({ error: "Remark must be 500 characters or less" }, { status: 400 });
    }

    // Verify class teacher access
    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

    // Block remark edits when exam is locked (APPROVED or CLOSED)
    const isLocked = exam.status === 'APPROVED' || exam.status === 'CLOSED';
    if (isLocked && user.role !== 'ADMIN') {
      const statusLabel = exam.status === 'APPROVED' ? 'approved' : 'closed';
      return NextResponse.json(
        { error: `This exam has been ${statusLabel}. Remarks can no longer be edited.` },
        { status: 403 }
      );
    }

    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
      if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

      const isClassTeacher = await db.teacherClass.findFirst({
        where: { teacherId: teacher.id, classId: exam.classId, isPrimary: true },
      });
      if (!isClassTeacher) {
        return NextResponse.json({ error: "Only the class teacher can write remarks" }, { status: 403 });
      }
    }

    // If remark is empty, delete it; otherwise upsert
    if (!remark || remark.trim().length === 0) {
      await db.examRemark.deleteMany({ where: { examId, studentId } });
      return NextResponse.json({ ok: true, deleted: true });
    }

    // Upsert the remark
    const result = await db.examRemark.upsert({
      where: { examId_studentId: { examId, studentId } },
      create: { examId, studentId, remark: remark.trim(), writtenBy: user.id },
      update: { remark: remark.trim(), writtenBy: user.id },
    });

    return NextResponse.json({ ok: true, id: result.id });
  } catch (error) {
    console.error("PUT /api/exam-remarks error:", error);
    return NextResponse.json({ error: "Failed to save remark" }, { status: 500 });
  }
}
