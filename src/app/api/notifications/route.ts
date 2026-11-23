import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getGradeFromMarks } from "@/lib/grading";
import { sendSMS } from "@/lib/sms";

// GET /api/notifications — list notification logs (admin only)
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const [logs, total] = await Promise.all([
      db.notificationLog.findMany({
        include: {
          parent: {
            include: {
              user: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.notificationLog.count(),
    ]);

    const result = logs.map((log) => ({
      id: log.id,
      parentName: log.parent.user.name,
      recipient: log.recipient,
      studentId: log.studentId,
      examId: log.examId,
      type: log.type,
      status: log.status,
      message: log.message,
      sentAt: log.sentAt,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({
      notifications: result,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// POST /api/notifications — send notifications (admin only)
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { examId, studentIds, type } = body;

    if (!examId || !type) {
      return NextResponse.json(
        { error: "examId and type are required" },
        { status: 400 }
      );
    }

    // Fetch exam
    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Get active grading scheme
    const scheme = await db.gradingScheme.findFirst({ where: { isActive: true } });

    // Get students — either specified or all in the exam's class
    const students = studentIds && studentIds.length > 0
      ? await db.student.findMany({
          where: { id: { in: studentIds }, status: "ACTIVE" },
          include: { class: true },
        })
      : await db.student.findMany({
          where: { classId: exam.classId, status: "ACTIVE" },
          include: { class: true },
        });

    if (students.length === 0) {
      return NextResponse.json({ error: "No students found" }, { status: 400 });
    }

    // Get school name
    const schoolSetting = await db.schoolSetting.findUnique({ where: { key: "school_name" } });
    const schoolName = schoolSetting?.value || "Nakoyonjo DEB Primary School";

    let sentCount = 0;
    let failedCount = 0;
    const results = [];

    for (const student of students) {
      // Find parents for this student
      const parentLinks = await db.parentStudent.findMany({
        where: { studentId: student.id },
        include: { parent: true },
      });

      if (parentLinks.length === 0) {
        results.push({ student: `${student.firstName} ${student.lastName}`, status: "NO_PARENT" });
        continue;
      }

      // Get student's marks for this exam
      const marks = await db.studentMark.findMany({
        where: { studentId: student.id, examId },
        include: { subject: { select: { name: true } } },
      });

      if (marks.length === 0) {
        results.push({ student: `${student.firstName} ${student.lastName}`, status: "NO_MARKS" });
        continue;
      }

      const totalMarks = marks.reduce((sum, m) => sum + m.marksObtained, 0);
      const maxTotal = marks.length * exam.maxMarks;
      const avg = (totalMarks / marks.length).toFixed(1);
      const { grade } = await getGradeFromMarks(parseFloat(avg));

      // Get rank
      const allClassMarks = await db.studentMark.groupBy({
        by: ["studentId"],
        where: { examId },
        _sum: { marksObtained: true },
        orderBy: { _sum: { marksObtained: "desc" } },
      });
      const rank = allClassMarks.findIndex((m) => m.studentId === student.id) + 1;
      const totalStudents = allClassMarks.length;

      // Build SMS message
      const message =
        `${schoolName}\n` +
        `Results for ${student.firstName} ${student.lastName} (${student.class.name})\n` +
        `Exam: ${exam.name} - ${exam.term} ${exam.year}\n` +
        `Total: ${totalMarks}/${maxTotal} | Avg: ${avg} | Grade: ${grade}\n` +
        `Position: ${rank}/${totalStudents}\n` +
        `Login to portal for details.`;

      // Send to each parent
      for (const link of parentLinks) {
        const parent = link.parent;
        const phone = parent.phone;
        if (!phone) continue;

        // Attempt to send
        let status = "PENDING";
        let sentAt = null;
        let errorMessage = null;

        if (type === "SMS") {
          const smsResult = await sendSMS(phone, message);
          if (smsResult.success) {
            status = "SENT";
            sentAt = new Date();
            sentCount++;
          } else {
            status = "FAILED";
            errorMessage = smsResult.error;
            failedCount++;
          }
        } else {
          // WHATSAPP or other type — log as pending
          status = "PENDING";
        }

        await db.notificationLog.create({
          data: {
            parentId: parent.id,
            studentId: student.id,
            examId,
            type,
            status,
            message,
            recipient: phone,
            sentAt,
            errorMessage,
          },
        });

        results.push({
          student: `${student.firstName} ${student.lastName}`,
          parent: phone,
          status,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      sentCount,
      failedCount,
      results,
    });
  } catch (error) {
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to send notifications" }, { status: 500 });
  }
}
