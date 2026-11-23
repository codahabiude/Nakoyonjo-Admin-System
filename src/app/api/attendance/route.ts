import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getTeacherContext } from "@/lib/roles";

const VALID_ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE"];

// GET /api/attendance?classId=...&date=...
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const date = searchParams.get("date");

    if (!classId || !date) {
      return NextResponse.json(
        { error: "classId and date are required" },
        { status: 400 }
      );
    }

    // Check teacher access
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: user.id },
        include: { classes: { where: { classId } } },
      });
      if (!teacher || teacher.classes.length === 0) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const students = await db.student.findMany({
      where: { classId, status: "ACTIVE" },
      include: {
        attendance: { where: { date }, select: { id: true, status: true, date: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const records = students.map((s) => ({
      id: s.id,
      studentId: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      status: s.attendance[0]?.status || null,
      attendanceId: s.attendance[0]?.id || null,
    }));

    const totalStudents = students.length;
    const markedCount = records.filter((r) => r.status).length;
    const isComplete = markedCount === totalStudents && totalStudents > 0;

    return NextResponse.json({ records, classId, date, totalStudents, markedCount, isComplete });
  } catch (error) {
    console.error("GET /api/attendance error:", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}

// POST /api/attendance — mark or update attendance
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { classId, date, records } = body;

    if (!classId || !date || !records || !Array.isArray(records)) {
      return NextResponse.json(
        { error: "classId, date, and records are required" },
        { status: 400 }
      );
    }

    // ROLE RULE: only the class teacher (isPrimary) of this class — or an
    // admin — may record attendance. Subject teachers get view-only access.
    if (user.role === "TEACHER") {
      const ctx = await getTeacherContext(user.id);
      if (!ctx) {
        return NextResponse.json({ error: "Teacher profile not found" }, { status: 403 });
      }
      if (!ctx.isClassTeacherOf(classId)) {
        return NextResponse.json(
          { error: "Only the class teacher of this class can mark attendance. You have view-only access." },
          { status: 403 }
        );
      }
    }

    // Bug 15: Validate that attendance students belong to the class
    const validStudentIds = new Set(
      (await db.student.findMany({ where: { classId, status: "ACTIVE" }, select: { id: true } })).map(s => s.id)
    );

    const invalidStudents = records.filter((r: { studentId: string }) => !validStudentIds.has(r.studentId));
    if (invalidStudents.length > 0) {
      return NextResponse.json(
        { error: `${invalidStudents.length} student(s) do not belong to this class` },
        { status: 400 }
      );
    }

    // Bug 16: Validate attendance status values
    for (const record of records) {
      if (!VALID_ATTENDANCE_STATUSES.includes(record.status)) {
        return NextResponse.json(
          { error: `Invalid attendance status "${record.status}". Must be one of: ${VALID_ATTENDANCE_STATUSES.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const userId = user.id;

    // Upsert every record inside ONE transaction:
    //  - keyed by the unique (studentId, date) pair so double-submits and
    //    concurrent tabs can never trigger P2002 unique violations
    //  - atomic: all rows save or none do (no partial attendance days)
    //  - the client-supplied attendanceId is ignored — it can go stale or
    //    belong to a different student, which would silently corrupt data
    await db.$transaction(async (tx) => {
      for (const record of records as { studentId: string; status: string }[]) {
        await tx.attendance.upsert({
          where: { studentId_date: { studentId: record.studentId, date } },
          create: {
            studentId: record.studentId,
            classId,
            date,
            status: record.status,
            markedBy: userId,
          },
          update: { status: record.status, markedBy: userId },
        });
      }
    });

    return NextResponse.json({ message: `Attendance saved for ${records.length} students`, count: records.length });
  } catch (error) {
    console.error("POST /api/attendance error:", error);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}
