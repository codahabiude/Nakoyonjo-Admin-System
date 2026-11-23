/**
 * GET /api/performance-reports
 * 
 * Query params:
 *   type = "subject-analysis" | "class-comparison" | "grade-distribution" | "student-trends"
 *   examId (required for subject-analysis, grade-distribution)
 *   term, year (required for class-comparison)
 *   studentId (required for student-trends)
 *   rankingMethod = "points" | "average" (default: "points")
 *   classId (optional, filters by class for some report types)
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { getPointsFromMarks, getDetailedGrade, getGradeColorKey } from "@/lib/grading";

export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const rankingMethod = searchParams.get("rankingMethod") || "points";

    if (!type || !["subject-analysis", "class-comparison", "grade-distribution", "student-trends"].includes(type)) {
      return NextResponse.json({ error: "Invalid or missing report type. Use: subject-analysis, class-comparison, grade-distribution, student-trends" }, { status: 400 });
    }

    if (type === "subject-analysis") return subjectAnalysis(searchParams, user, rankingMethod);
    if (type === "class-comparison") return classComparison(searchParams, user, rankingMethod);
    if (type === "grade-distribution") return gradeDistribution(searchParams, user);
    if (type === "student-trends") return studentTrends(searchParams, user);

    return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
  } catch (error) {
    console.error("GET /api/performance-reports error:", error);
    return NextResponse.json({ error: "Failed to generate performance report" }, { status: 500 });
  }
}

// ─── 1. SUBJECT ANALYSIS ────────────────────────────────────
// Per-subject stats for a specific exam: mean, highest, lowest, grade distribution (8-level CBC)
async function subjectAnalysis(params: URLSearchParams, user: any, rankingMethod: string) {
  const examId = params.get("examId");
  if (!examId) return NextResponse.json({ error: "examId is required" }, { status: 400 });

  const exam = await db.exam.findUnique({
    where: { id: examId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  // Teacher scope check — must resolve Teacher record first (user.id != teacher.id)
  if (user.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
    if (!teacher) return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
    const assignment = await db.teacherClass.findFirst({
      where: { teacherId: teacher.id, classId: exam.classId },
    });
    if (!assignment) {
      const ts = await db.teacherSubject.findFirst({
        where: { teacherId: teacher.id, classId: exam.classId },
      });
      if (!ts) return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const marks = await db.studentMark.findMany({
    where: { examId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      student: { select: { id: true, firstName: true, lastName: true, status: true } },
    },
  });

  // Group by subject
  const subjectMap: Record<string, {
    subjectId: string; subjectName: string; subjectCode: string;
    marksList: number[];
    students: Array<{ studentId: string; name: string; marks: number; points: number }>;
  }> = {};

  for (const m of marks) {
    if (m.student.status !== "ACTIVE") continue;
    if (!subjectMap[m.subjectId]) {
      subjectMap[m.subjectId] = {
        subjectId: m.subject.id,
        subjectName: m.subject.name,
        subjectCode: m.subject.code,
        marksList: [],
        students: [],
      };
    }
    subjectMap[m.subjectId].marksList.push(m.marksObtained);
    subjectMap[m.subjectId].students.push({
      studentId: m.student.id,
      name: `${m.student.firstName} ${m.student.lastName}`,
      marks: m.marksObtained,
      points: getPointsFromMarks(m.marksObtained),
    });
  }

  const subjects = Object.values(subjectMap).map((s) => {
    const sorted = [...s.marksList].sort((a, b) => b - a);
    const total = sorted.reduce((a, b) => a + b, 0);
    const mean = sorted.length > 0 ? total / sorted.length : 0;
    const highest = sorted.length > 0 ? sorted[0] : 0;
    const lowest = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
    const passCount = sorted.filter((m) => m >= 50).length;
    const passRate = sorted.length > 0 ? Math.round((passCount / sorted.length) * 100) : 0;

    // 8-level CBC grade distribution
    const gradeDist: Record<string, number> = { EE: 0, ME: 0, AE: 0, BE: 0 };
    const detailedDist: Record<string, number> = { EE1: 0, EE2: 0, ME1: 0, ME2: 0, AE1: 0, AE2: 0, BE1: 0, BE2: 0 };
    for (const m of sorted) {
      const dg = getDetailedGrade(m);
      const colorKey = getGradeColorKey(dg.grade);
      gradeDist[colorKey]++;
      if (detailedDist[dg.grade] !== undefined) detailedDist[dg.grade]++;
    }

    // Average points for this subject
    const totalPoints = s.students.reduce((sum, st) => sum + st.points, 0);
    const avgPoints = s.students.length > 0 ? Math.round((totalPoints / s.students.length) * 100) / 100 : 0;

    // Top 5 and bottom 5 by marks
    const topStudents = [...s.students].sort((a, b) => b.marks - a.marks).slice(0, 5);
    const bottomStudents = [...s.students].sort((a, b) => a.marks - b.marks).slice(0, 5);

    return {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      totalStudents: sorted.length,
      mean: Math.round(mean * 100) / 100,
      highest,
      lowest,
      passRate,
      avgPoints,
      gradeDistribution: gradeDist,
      detailedDistribution: detailedDist,
      topStudents,
      bottomStudents,
    };
  });

  // Sort by ranking method
  if (rankingMethod === "points") {
    subjects.sort((a, b) => b.avgPoints - a.avgPoints);
  } else {
    subjects.sort((a, b) => b.mean - a.mean);
  }

  return NextResponse.json({
    exam: {
      id: exam.id,
      name: exam.name,
      term: exam.term,
      year: exam.year,
      status: exam.status,
      className: exam.class.name,
      classId: exam.class.id,
    },
    rankingMethod,
    subjects,
  });
}

// ─── 2. CLASS COMPARISON ────────────────────────────────────
// Compare performance across classes for a given term/year (supports points & average)
async function classComparison(params: URLSearchParams, user: any, rankingMethod: string) {
  const term = params.get("term");
  const year = params.get("year");
  if (!term || !year) return NextResponse.json({ error: "term and year are required" }, { status: 400 });

  const exams = await db.exam.findMany({
    where: { term, year },
    include: {
      class: { select: { id: true, name: true } },
      _count: { select: { marks: true } },
    },
  });

  if (exams.length === 0) {
    return NextResponse.json({ term, year: parseInt(year), classes: [], message: "No closed exams found for this term/year" });
  }

  // For each exam, compute class averages and/or points
  const classResults: Record<string, {
    classId: string; className: string;
    exams: Array<{ examId: string; examName: string; avgMarks: number; avgPoints: number; studentCount: number }>;
  }> = {};

  for (const exam of exams) {
    // Teacher scope: skip exams for classes not assigned
    if (user.role === "TEACHER") {
      const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
      if (!teacher) continue;
      const tc = await db.teacherClass.findFirst({
        where: { teacherId: teacher.id, classId: exam.classId },
      });
      if (!tc) continue;
    }

    const marks = await db.studentMark.findMany({
      where: { examId: exam.id },
      include: { student: { select: { status: true } } },
    });
    const activeMarks = marks.filter((m) => m.student.status === "ACTIVE");

    // Compute per-student totals and points
    const studentTotals: Record<string, number[]> = {};
    const studentPoints: Record<string, number[]> = {};
    const studentMarkCounts: Record<string, number> = {};
    for (const m of activeMarks) {
      if (!studentTotals[m.studentId]) { studentTotals[m.studentId] = []; studentPoints[m.studentId] = []; studentMarkCounts[m.studentId] = 0; }
      studentTotals[m.studentId].push(m.marksObtained);
      studentPoints[m.studentId].push(getPointsFromMarks(m.marksObtained));
      studentMarkCounts[m.studentId]++;
    }

    let totalAvgSum = 0;
    let totalPointsSum = 0;
    let totalStudents = 0;
    for (const sid in studentTotals) {
      const sum = studentTotals[sid].reduce((a, b) => a + b, 0);
      const count = studentMarkCounts[sid];
      totalAvgSum += count > 0 ? sum / count : 0;
      totalPointsSum += studentPoints[sid].reduce((a, b) => a + b, 0);
      totalStudents++;
    }
    const avgMarks = totalStudents > 0 ? Math.round((totalAvgSum / totalStudents) * 100) / 100 : 0;
    const avgPoints = totalStudents > 0 ? Math.round((totalPointsSum / totalStudents) * 100) / 100 : 0;

    if (!classResults[exam.classId]) {
      classResults[exam.classId] = {
        classId: exam.class.id,
        className: exam.class.name,
        exams: [],
      };
    }
    classResults[exam.classId].exams.push({
      examId: exam.id,
      examName: exam.name,
      avgMarks,
      avgPoints,
      studentCount: totalStudents,
    });
  }

  const classes = Object.values(classResults).map((c) => {
    const examAvgs = c.exams.map((e) => e.avgMarks);
    const examPts = c.exams.map((e) => e.avgPoints);
    const overallAvg = examAvgs.length > 0 ? Math.round((examAvgs.reduce((a, b) => a + b, 0) / examAvgs.length) * 100) / 100 : 0;
    const overallPoints = examPts.length > 0 ? Math.round((examPts.reduce((a, b) => a + b, 0) / examPts.length) * 100) / 100 : 0;
    const bestExam = c.exams.reduce((best, e) => e.avgMarks > best.avgMarks ? e : best, c.exams[0]);
    const weakExam = c.exams.reduce((worst, e) => e.avgMarks < worst.avgMarks ? e : worst, c.exams[0]);
    return {
      classId: c.classId,
      className: c.className,
      overallAverage: overallAvg,
      overallPoints,
      totalExams: c.exams.length,
      bestExam,
      weakExam,
      exams: c.exams,
    };
  });

  // Sort by ranking method
  if (rankingMethod === "points") {
    classes.sort((a, b) => b.overallPoints - a.overallPoints);
  } else {
    classes.sort((a, b) => b.overallAverage - a.overallAverage);
  }

  return NextResponse.json({ term, year, rankingMethod, classes });
}

// ─── 3. GRADE DISTRIBUTION ──────────────────────────────────
// How many students fall into each grade per subject (8-level CBC, grouped into EE/ME/AE/BE)
async function gradeDistribution(params: URLSearchParams, user: any) {
  const examId = params.get("examId");
  if (!examId) return NextResponse.json({ error: "examId is required" }, { status: 400 });

  const exam = await db.exam.findUnique({
    where: { id: examId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });

  // Teacher scope check — must resolve Teacher record first
  if (user.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
    if (!teacher) return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
    const ts = await db.teacherSubject.findFirst({
      where: { teacherId: teacher.id, classId: exam.classId },
    });
    const tc = await db.teacherClass.findFirst({
      where: { teacherId: teacher.id, classId: exam.classId },
    });
    if (!ts && !tc) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const marks = await db.studentMark.findMany({
    where: { examId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      student: { select: { id: true, status: true } },
    },
  });

  // Active students only
  const activeMarks = marks.filter((m) => m.student.status === "ACTIVE");

  // Group by subject, use 8-level CBC grading
  const subjectMap: Record<string, {
    subjectId: string; subjectName: string; subjectCode: string;
    grades: Record<string, number>;
    detailedGrades: Record<string, number>;
  }> = {};

  for (const m of activeMarks) {
    if (!subjectMap[m.subjectId]) {
      subjectMap[m.subjectId] = {
        subjectId: m.subject.id,
        subjectName: m.subject.name,
        subjectCode: m.subject.code,
        grades: { EE: 0, ME: 0, AE: 0, BE: 0 },
        detailedGrades: { EE1: 0, EE2: 0, ME1: 0, ME2: 0, AE1: 0, AE2: 0, BE1: 0, BE2: 0 },
      };
    }
    const dg = getDetailedGrade(m.marksObtained);
    const colorKey = getGradeColorKey(dg.grade);
    subjectMap[m.subjectId].grades[colorKey]++;
    if (subjectMap[m.subjectId].detailedGrades[dg.grade] !== undefined) {
      subjectMap[m.subjectId].detailedGrades[dg.grade]++;
    }
  }

  const subjects = Object.values(subjectMap).map((s) => {
    const total = s.grades.EE + s.grades.ME + s.grades.AE + s.grades.BE;
    return {
      ...s,
      total,
      percentages: {
        EE: total > 0 ? Math.round((s.grades.EE / total) * 100) : 0,
        ME: total > 0 ? Math.round((s.grades.ME / total) * 100) : 0,
        AE: total > 0 ? Math.round((s.grades.AE / total) * 100) : 0,
        BE: total > 0 ? Math.round((s.grades.BE / total) * 100) : 0,
      },
      detailedPercentages: (() => {
        const dp: Record<string, number> = {};
        for (const k of Object.keys(s.detailedGrades)) {
          dp[k] = total > 0 ? Math.round((s.detailedGrades[k] / total) * 100) : 0;
        }
        return dp;
      })(),
    };
  });

  // Overall summary
  const overallGrades = { EE: 0, ME: 0, AE: 0, BE: 0 };
  const overallDetailed: Record<string, number> = { EE1: 0, EE2: 0, ME1: 0, ME2: 0, AE1: 0, AE2: 0, BE1: 0, BE2: 0 };
  for (const s of subjects) {
    overallGrades.EE += s.grades.EE;
    overallGrades.ME += s.grades.ME;
    overallGrades.AE += s.grades.AE;
    overallGrades.BE += s.grades.BE;
    for (const k of Object.keys(overallDetailed)) {
      overallDetailed[k] += s.detailedGrades[k] || 0;
    }
  }
  const overallTotal = overallGrades.EE + overallGrades.ME + overallGrades.AE + overallGrades.BE;

  return NextResponse.json({
    exam: {
      id: exam.id,
      name: exam.name,
      term: exam.term,
      year: exam.year,
      className: exam.class.name,
      classId: exam.class.id,
    },
    subjects,
    overall: {
      grades: overallGrades,
      detailedGrades: overallDetailed,
      total: overallTotal,
      percentages: {
        EE: overallTotal > 0 ? Math.round((overallGrades.EE / overallTotal) * 100) : 0,
        ME: overallTotal > 0 ? Math.round((overallGrades.ME / overallTotal) * 100) : 0,
        AE: overallTotal > 0 ? Math.round((overallGrades.AE / overallTotal) * 100) : 0,
        BE: overallTotal > 0 ? Math.round((overallGrades.BE / overallTotal) * 100) : 0,
      },
    },
  });
}

// ─── 4. STUDENT TRENDS ──────────────────────────────────────
// Track a single student's performance across all exams (8-level CBC grading)
async function studentTrends(params: URLSearchParams, user: any) {
  const studentId = params.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const student = await db.student.findUnique({
    where: { id: studentId },
    include: { class: { select: { id: true, name: true } } },
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Teacher access check — same rule as subject-analysis: the teacher must
  // have a class link OR a subject assignment in the student's class.
  if (user.role === "TEACHER") {
    const teacher = await db.teacher.findUnique({ where: { userId: user.id } });
    if (!teacher) return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
    const tc = await db.teacherClass.findFirst({
      where: { teacherId: teacher.id, classId: student.classId },
    });
    if (!tc) {
      const ts = await db.teacherSubject.findFirst({
        where: { teacherId: teacher.id, classId: student.classId },
      });
      if (!ts) return NextResponse.json({ error: "Access denied — not your class" }, { status: 403 });
    }
  }

  const marks = await db.studentMark.findMany({
    where: { studentId },
    include: {
      exam: {
        include: { class: { select: { name: true } } },
      },
      subject: true,
    },
    orderBy: { exam: { createdAt: "asc" } },
  });

  if (marks.length === 0) {
    return NextResponse.json({
      student: { id: student.id, name: `${student.firstName} ${student.lastName}`, className: student.class?.name || "N/A" },
      exams: [],
      subjects: [],
      message: "No marks recorded for this student yet",
    });
  }

  // Group by exam
  const examMap: Record<string, {
    examId: string; examName: string; term: string; year: string;
    className: string; status: string;
    subjects: Array<{ subjectId: string; subjectName: string; subjectCode: string; marks: number; grade: string; detailedGrade: string; points: number }>;
  }> = {};

  const subjectSet = new Set<string>();

  for (const m of marks) {
    const eid = m.exam.id;
    if (!examMap[eid]) {
      examMap[eid] = {
        examId: eid,
        examName: m.exam.name,
        term: m.exam.term,
        year: m.exam.year,
        className: m.exam.class.name,
        status: m.exam.status,
        subjects: [],
      };
    }
    const dg = getDetailedGrade(m.marksObtained);
    const colorKey = getGradeColorKey(dg.grade);

    examMap[eid].subjects.push({
      subjectId: m.subject.id,
      subjectName: m.subject.name,
      subjectCode: m.subject.code,
      marks: m.marksObtained,
      grade: colorKey,
      detailedGrade: dg.grade,
      points: dg.points,
    });
    subjectSet.add(m.subject.id);
  }

  // Build exam list with summary stats
  const exams = Object.values(examMap).map((e) => {
    const totalMarks = e.subjects.reduce((s, sub) => s + sub.marks, 0);
    const totalPoints = e.subjects.reduce((s, sub) => s + sub.points, 0);
    const avgMarks = e.subjects.length > 0 ? Math.round((totalMarks / e.subjects.length) * 100) / 100 : 0;
    const avgPoints = e.subjects.length > 0 ? Math.round((totalPoints / e.subjects.length) * 100) / 100 : 0;
    const gradeCounts = { EE: 0, ME: 0, AE: 0, BE: 0 };
    for (const sub of e.subjects) gradeCounts[sub.grade as keyof typeof gradeCounts]++;
    return {
      ...e,
      totalMarks,
      totalPoints,
      averageMarks: avgMarks,
      averagePoints: avgPoints,
      totalSubjects: e.subjects.length,
      gradeCounts,
    };
  });

  // Build subject trend data (for line chart)
  const subjects = marks.reduce((acc, m) => {
    if (!acc[m.subject.id]) {
      acc[m.subject.id] = {
        subjectId: m.subject.id,
        subjectName: m.subject.name,
        subjectCode: m.subject.code,
        dataPoints: [],
      };
    }
    const dg = getDetailedGrade(m.marksObtained);
    acc[m.subject.id].dataPoints.push({
      examId: m.exam.id,
      examName: m.exam.name,
      term: m.exam.term,
      year: m.exam.year,
      marks: m.marksObtained,
      points: dg.points,
      grade: getGradeColorKey(dg.grade),
      detailedGrade: dg.grade,
    });
    return acc;
  }, {} as Record<string, any>);

  // Overall trend
  const overallTrend = exams.map((e) => ({
    examName: e.examName,
    term: e.term,
    year: e.year,
    averageMarks: e.averageMarks,
    averagePoints: e.averagePoints,
    totalMarks: e.totalMarks,
    totalPoints: e.totalPoints,
  }));

  return NextResponse.json({
    student: {
      id: student.id,
      name: `${student.firstName} ${student.lastName}`,
      className: student.class?.name || "N/A",
      classId: student.class?.id,
    },
    exams,
    subjects: Object.values(subjects),
    overallTrend,
  });
}
