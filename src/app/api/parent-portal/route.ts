import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getGradeFromMarks } from "@/lib/grading";

// GET /api/parent-portal — get parent's children with latest exam results
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "PARENT") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Find parent linked to this user
    const parent = await db.parent.findUnique({
      where: { userId: user.id },
      include: {
        children: {
          include: {
            student: {
              include: {
                class: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
    }

    // For each child, find their latest exam results
    const childrenData = await Promise.all(
      parent.children.map(async (link) => {
        const student = link.student;

        // Find the latest exam for this student's class
        const latestExam = await db.exam.findFirst({
          where: { classId: student.classId },
          orderBy: { createdAt: "desc" },
        });

        let examSummary = null;
        if (latestExam) {
          const marks = await db.studentMark.findMany({
            where: { studentId: student.id, examId: latestExam.id },
            include: { subject: { select: { name: true, code: true } } },
          });

          if (marks.length > 0) {
            const totalMarks = marks.reduce((sum, m) => sum + m.marksObtained, 0);
            const maxTotal = marks.length * latestExam.maxMarks;
            const average = marks.length > 0 ? (totalMarks / marks.length).toFixed(1) : "0";
            const { grade } = await getGradeFromMarks(parseFloat(average));

            // Get rank
            const allClassMarks = await db.studentMark.groupBy({
              by: ["studentId"],
              where: { examId: latestExam.id },
              _sum: { marksObtained: true },
              orderBy: { _sum: { marksObtained: "desc" } },
            });
            const totalStudents = allClassMarks.length;
            const rank = allClassMarks.findIndex((m) => m.studentId === student.id) + 1;

            examSummary = {
              examId: latestExam.id,
              examName: latestExam.name,
              term: latestExam.term,
              year: latestExam.year,
              totalMarks,
              maxTotal,
              average,
              grade,
              rank,
              totalStudents,
            };
          }
        }

        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          admissionNo: student.id, // Use student ID as admission number (field not in schema)
          gender: student.gender,
          className: student.class.name,
          relation: link.relation,
          latestExam: examSummary,
        };
      })
    );

    return NextResponse.json({ children: childrenData });
  } catch (error) {
    console.error("GET /api/parent-portal error:", error);
    return NextResponse.json({ error: "Failed to fetch children" }, { status: 500 });
  }
}
