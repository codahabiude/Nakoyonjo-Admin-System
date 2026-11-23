import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getTeacherContext } from "@/lib/roles";

// GET /api/attendance/report?classId=...&fromDate=...&toDate=...
// Teachers may only pull reports for classes they are assigned to.
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const studentId = searchParams.get("studentId");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    const where: Record<string, unknown> = {};

    // ROLE RULE: teachers see attendance only for their own classes.
    if (user.role === "TEACHER") {
      const ctx = await getTeacherContext(user.id);
      if (!ctx) {
        return NextResponse.json({ error: "Teacher profile not found" }, { status: 403 });
      }
      if (classId) {
        if (!ctx.canViewClass(classId)) {
          return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
        }
        where.classId = classId;
      } else {
        // No class filter → restrict to the teacher's classes only.
        where.classId = { in: ctx.assignedClassIds.length > 0 ? ctx.assignedClassIds : ["__none__"] };
      }
      if (studentId) {
        const student = await db.student.findUnique({
          where: { id: studentId },
          select: { classId: true },
        });
        if (!student || !ctx.canViewClass(student.classId)) {
          return NextResponse.json({ error: "You are not assigned to this student's class" }, { status: 403 });
        }
      }
    } else {
      if (classId) where.classId = classId;
      if (studentId) where.studentId = studentId;
    }

    if (fromDate || toDate) {
      where.date = {} as Record<string, unknown>;
      if (fromDate) (where.date as Record<string, unknown>).gte = fromDate;
      if (toDate) (where.date as Record<string, unknown>).lte = toDate;
    }

    const attendance = await db.attendance.findMany({
      where,
      include: { student: { select: { firstName: true, lastName: true } } },
      orderBy: [{ date: "desc" }, { student: { lastName: "asc" } }],
    });

    const totalRecords = attendance.length;
    const present = attendance.filter((a) => a.status === "PRESENT").length;
    const absent = attendance.filter((a) => a.status === "ABSENT").length;
    const late = attendance.filter((a) => a.status === "LATE").length;

    type StudentSummaryEntry = { studentId: string; studentName: string; present: number; absent: number; late: number; total: number };
    type DateSummaryEntry = { date: string; present: number; absent: number; late: number; total: number };

    const studentSummary = attendance.reduce(
      (acc: Record<string, StudentSummaryEntry>, a) => {
        const key = a.studentId;
        if (!acc[key]) {
          acc[key] = {
            studentId: key,
            studentName: `${a.student.lastName} ${a.student.firstName}`,
            present: 0, absent: 0, late: 0, total: 0,
          };
        }
        acc[key].total++;
        if (a.status === "PRESENT") acc[key].present++;
        if (a.status === "ABSENT") acc[key].absent++;
        if (a.status === "LATE") acc[key].late++;
        return acc;
      },
      {} as Record<string, StudentSummaryEntry>
    );

    const dateSummary = attendance.reduce(
      (acc: Record<string, DateSummaryEntry>, a) => {
        if (!acc[a.date]) {
          acc[a.date] = { date: a.date, present: 0, absent: 0, late: 0, total: 0 };
        }
        acc[a.date].total++;
        if (a.status === "PRESENT") acc[a.date].present++;
        if (a.status === "ABSENT") acc[a.date].absent++;
        if (a.status === "LATE") acc[a.date].late++;
        return acc;
      },
      {} as Record<string, DateSummaryEntry>
    );

    return NextResponse.json({
      summary: {
        totalRecords, present, absent, late,
        attendanceRate: totalRecords > 0 ? ((present + late) / totalRecords) * 100 : 0,
      },
      studentSummary: Object.values(studentSummary),
      dateSummary: Object.values(dateSummary).sort((a, b) => b.date.localeCompare(a.date)),
      records: attendance,
    });
  } catch (error) {
    console.error("GET /api/attendance/report error:", error);
    return NextResponse.json({ error: "Failed to generate attendance report" }, { status: 500 });
  }
}
