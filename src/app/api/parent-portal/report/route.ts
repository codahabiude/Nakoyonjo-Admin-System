import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getGradeFromMarks } from "@/lib/grading";
import { getSchoolInfo, formatTermRange } from "@/lib/school-settings";

// POST /api/parent-portal/report — get report card for a parent's child
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "PARENT") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await req.json();
    const { studentId, examId } = body;
    if (!studentId || !examId) {
      return NextResponse.json(
        { error: "studentId and examId are required" },
        { status: 400 }
      );
    }

    // Verify this parent is linked to this student
    const parent = await db.parent.findUnique({
      where: { userId: user.id },
      include: { children: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
    }

    const isLinked = parent.children.some((c) => c.studentId === studentId);
    if (!isLinked) {
      return NextResponse.json(
        { error: "This student is not linked to your account" },
        { status: 403 }
      );
    }

    // Fetch student
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });
    if (!student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Fetch exam
    const exam = await db.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }

    // Fetch marks
    const marks = await db.studentMark.findMany({
      where: { studentId, examId },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { code: "asc" } },
    });

    const totalMarks = marks.reduce((sum, m) => sum + m.marksObtained, 0);
    const maxTotal = marks.length * exam.maxMarks;
    const average = marks.length > 0 ? (totalMarks / marks.length).toFixed(1) : "0";
    const { grade } = await getGradeFromMarks(parseFloat(average));

    // Get class teacher
    const teacherClass = await db.teacherClass.findFirst({
      where: { classId: student.classId, isPrimary: true },
      include: { teacher: { include: { user: { select: { name: true } } } } },
    });
    const classTeacherName = teacherClass?.teacher.user.name || "";

    // Get class teacher remark for this student/exam
    const examRemark = await db.examRemark.findUnique({
      where: { examId_studentId: { examId, studentId } },
    });

    // Get rank
    const allClassMarks = await db.studentMark.groupBy({
      by: ["studentId"],
      where: { examId },
      _sum: { marksObtained: true },
      orderBy: { _sum: { marksObtained: "desc" } },
    });
    const totalStudents = allClassMarks.length;
    const rank = allClassMarks.findIndex((m) => m.studentId === studentId) + 1;

    // School settings — shown on the parent portal report card
    const school = await getSchoolInfo();
    const termRange = formatTermRange(exam.term, school.termDates);

    return NextResponse.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNo: student.id, // Use student ID as admission number (field not in schema)
        gender: student.gender,
        dateOfBirth: student.dateOfBirth,
      },
      class: { name: student.class.name },
      exam: { name: exam.name, term: exam.term, year: exam.year, maxMarks: exam.maxMarks },
      classTeacher: classTeacherName,
      classTeacherRemark: examRemark?.remark || null,
      school: {
        schoolName: school.schoolName,
        schoolMotto: school.schoolMotto,
        schoolAddress: school.schoolAddress,
        schoolPhone: school.schoolPhone,
      },
      termRange,
      marks: await Promise.all(marks.map(async (m) => {
        const g = await getGradeFromMarks(m.marksObtained);
        return {
          subject: m.subject.name,
          code: m.subject.code,
          marksObtained: m.marksObtained,
          maxMarks: exam.maxMarks,
          grade: g.grade,
          remarks: m.remarks || g.remark,
        };
      })),
      summary: { totalMarks, maxTotal, average, grade, rank, totalStudents },
    });
  } catch (error) {
    console.error("POST /api/parent-portal/report error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
