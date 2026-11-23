import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/dashboard — stats overview (role-aware)
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.role;
    const userId = user.id;

    // ── TEACHER DASHBOARD ───────────────────────────────────────
    if (userRole === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId },
        include: {
          classes: { include: { class: { select: { id: true, name: true } } } },
          subjects: { include: { subject: { select: { id: true, name: true, code: true } }, class: { select: { id: true, name: true } } } },
        },
      });

      if (!teacher) return NextResponse.json({ stats: null });

      const classIds = teacher.classes.map((c) => c.classId);
      const myClassIds = new Set(classIds);

      // Student count across my classes
      const totalStudents = await db.student.count({
        where: { classId: { in: classIds }, status: "ACTIVE" },
      });

      // Exams for my classes with subject-level progress
      const exams = await db.exam.findMany({
        where: { classId: { in: classIds } },
        include: { class: { select: { name: true } } },
        orderBy: [{ year: "desc" }, { term: "asc" }, { createdAt: "desc" }],
      });

      const examIds = exams.map((e) => e.id);

      // Get my subject IDs per class
      const mySubjectsByClass: Record<string, Set<string>> = {};
      for (const ts of teacher.subjects) {
        if (!mySubjectsByClass[ts.classId]) mySubjectsByClass[ts.classId] = new Set();
        mySubjectsByClass[ts.classId].add(ts.subjectId);
      }

      // Student count per class
      const studentsPerClass = await db.student.groupBy({
        by: ["classId"],
        where: { classId: { in: classIds }, status: "ACTIVE" },
        _count: { id: true },
      });
      const studentCountMap: Record<string, number> = {};
      for (const s of studentsPerClass) studentCountMap[s.classId] = s._count.id;

      // Mark progress per (exam, subject)
      const markProgress = examIds.length > 0
        ? await db.studentMark.groupBy({
            by: ["examId", "subjectId"],
            where: { examId: { in: examIds } },
            _count: { id: true },
          })
        : [];
      const markCountMap = new Map<string, number>();
      for (const mp of markProgress) {
        markCountMap.set(`${mp.examId}-${mp.subjectId}`, mp._count.id);
      }

      // Build exam progress for teacher
      const examProgress = exams.map((exam) => {
        const mySubs = mySubjectsByClass[exam.classId];
        const studentCount = studentCountMap[exam.classId] || 0;

        const subjects = teacher.subjects
          .filter((ts) => ts.classId === exam.classId)
          .map((ts) => {
            const mc = markCountMap.get(`${exam.id}-${ts.subjectId}`) || 0;
            return {
              subjectId: ts.subject.id,
              subjectCode: ts.subject.code,
              subjectName: ts.subject.name,
              markCount: mc,
              studentCount,
              isDone: mc >= studentCount && studentCount > 0,
            };
          });

        const completed = subjects.filter((s) => s.isDone).length;
        const total = subjects.length;

        return {
          id: exam.id,
          name: exam.name,
          className: exam.class.name,
          term: exam.term,
          year: exam.year,
          status: exam.status,
          subjects,
          completedSubjects: completed,
          totalSubjects: total,
          isComplete: total > 0 && completed === total,
          isClosed: exam.status === "CLOSED",
          isApproved: exam.status === "APPROVED",
        };
      });

      // Count pending entries (subjects not yet complete across all exams)
      let pendingEntries = 0;
      for (const ep of examProgress) {
        if (!ep.isClosed) pendingEntries += (ep.totalSubjects - ep.completedSubjects);
      }

      // My assigned subjects summary (unique subjects across all classes)
      const uniqueSubjects = new Map<string, { code: string; name: string; classCount: number }>();
      for (const ts of teacher.subjects) {
        const key = ts.subject.code;
        if (!uniqueSubjects.has(key)) {
          uniqueSubjects.set(key, { code: ts.subject.code, name: ts.subject.name, classCount: 0 });
        }
        uniqueSubjects.get(key)!.classCount++;
      }

      // ── CLASS TEACHER RESPONSIBILITIES ─────────────────────────
      // For classes where this teacher is THE class teacher (isPrimary),
      // report marks-entry progress for ALL subjects of the class (not just
      // the teacher's own subjects) so they can chase subject teachers.
      const primaryClassIds = teacher.classes.filter((tc) => tc.isPrimary).map((tc) => tc.classId);
      const classResponsibilities: Array<{
        classId: string;
        className: string;
        studentCount: number;
        subjects: Array<{
          subjectId: string;
          subjectCode: string;
          subjectName: string;
          teacherName: string;
          exams: Array<{ examId: string; examName: string; term: string; status: string; markCount: number; studentCount: number; isDone: boolean }>;
        }>;
      }> = [];

      if (primaryClassIds.length > 0) {
        const [primaryClasses, classSubjects, assignments, primaryExams, studentsByClass] = await Promise.all([
          db.class.findMany({ where: { id: { in: primaryClassIds } }, select: { id: true, name: true } }),
          db.classSubject.findMany({
            where: { classId: { in: primaryClassIds } },
            include: { subject: { select: { id: true, code: true, name: true } } },
            orderBy: { subject: { code: "asc" } },
          }),
          db.teacherSubject.findMany({
            where: { classId: { in: primaryClassIds } },
            include: { teacher: { include: { user: { select: { name: true } } } } },
          }),
          db.exam.findMany({
            where: { classId: { in: primaryClassIds } },
            orderBy: [{ createdAt: "desc" }],
            take: 20,
            select: { id: true, name: true, term: true, year: true, status: true, classId: true },
          }),
          db.student.groupBy({
            by: ["classId"],
            where: { classId: { in: primaryClassIds }, status: "ACTIVE" },
            _count: { id: true },
          }),
        ]);

        const studentCountMap: Record<string, number> = {};
        for (const s of studentsByClass) studentCountMap[s.classId] = s._count.id;

        // subjectId → teacher name (per class)
        const teacherNameByClassSubject = new Map<string, string>();
        for (const a of assignments) {
          teacherNameByClassSubject.set(`${a.classId}_${a.subjectId}`, a.teacher.user.name);
        }

        const primaryExamIds = primaryExams.map((e) => e.id);
        const markProgress = primaryExamIds.length > 0
          ? await db.studentMark.groupBy({
              by: ["examId", "subjectId"],
              where: { examId: { in: primaryExamIds } },
              _count: { id: true },
            })
          : [];
        const mcMap = new Map<string, number>();
        for (const mp of markProgress) mcMap.set(`${mp.examId}-${mp.subjectId}`, mp._count.id);

        for (const cls of primaryClasses) {
          const sc = studentCountMap[cls.id] || 0;
          const clsExams = primaryExams.filter((e) => e.classId === cls.id).slice(0, 4);
          const clsSubjects = classSubjects.filter((cs) => cs.classId === cls.id);
          classResponsibilities.push({
            classId: cls.id,
            className: cls.name,
            studentCount: sc,
            subjects: clsSubjects.map((cs) => ({
              subjectId: cs.subject.id,
              subjectCode: cs.subject.code,
              subjectName: cs.subject.name,
              teacherName: teacherNameByClassSubject.get(`${cls.id}_${cs.subject.id}`) || "Not assigned",
              exams: clsExams.map((exam) => {
                const mc = mcMap.get(`${exam.id}-${cs.subject.id}`) || 0;
                return {
                  examId: exam.id,
                  examName: exam.name,
                  term: `${exam.term} ${exam.year}`,
                  status: exam.status,
                  markCount: mc,
                  studentCount: sc,
                  isDone: sc > 0 && mc >= sc,
                };
              }),
            })),
          });
        }
      }

      return NextResponse.json({
        stats: {
          totalStudents,
          totalClasses: classIds.length,
          totalTeachers: 1,
          todayPresent: 0,
          todayAbsent: 0,
          todayLate: 0,
          todayTotal: 0,
          attendanceRate: 0,
          classDistribution: [],
          // Teacher-specific stats
          pendingEntries,
          totalSubjectAssignments: teacher.subjects.length,
          uniqueSubjectsTaught: uniqueSubjects.size,
        },
        examProgress,
        teacherClasses: teacher.classes.map((tc) => ({
          id: tc.class.id,
          name: tc.class.name,
          isPrimary: tc.isPrimary,
          studentCount: studentCountMap[tc.class.id] || 0,
          subjectCount: (mySubjectsByClass[tc.classId] || new Set()).size,
        })),
        classResponsibilities,
        pendingClasses: [],
      });
    }

    // ── ADMIN DASHBOARD ─────────────────────────────────────────
    const [totalStudents, totalClasses, totalTeachers] = await Promise.all([
      db.student.count({ where: { status: "ACTIVE" } }),
      db.class.count(),
      db.teacher.count(),
    ]);

    // Today's attendance overview — use Nairobi timezone
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
    const todayAttendance = await db.attendance.groupBy({
      by: ["status"],
      where: { date: today },
      _count: true,
    });
    const attendanceMap: Record<string, number> = {};
    for (const a of todayAttendance) attendanceMap[a.status] = a._count;

    // Recent attendance rate (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentDateStr = sevenDaysAgo.toISOString().split("T")[0];
    const recentAttendance = await db.attendance.findMany({
      where: { date: { gte: recentDateStr } },
      select: { status: true },
    });
    const recentTotal = recentAttendance.length;
    const recentPresent = recentAttendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
    const attendanceRate = recentTotal > 0 ? Math.round((recentPresent / recentTotal) * 100) : 0;

    // Classes with attendance not yet marked today
    const allClasses = await db.class.findMany({ select: { id: true, name: true } });
    const classesMarkedToday = await db.attendance.groupBy({
      by: ["classId"],
      where: { date: today },
    });
    const markedClassIds = new Set(classesMarkedToday.map((c) => c.classId));
    const pendingClasses = allClasses.filter((c) => !markedClassIds.has(c.id)).map((c) => ({ id: c.id, name: c.name }));

    // Class distribution for chart
    const classDistribution = await db.class.findMany({
      select: { name: true, _count: { select: { students: { where: { status: "ACTIVE" } } } } },
      orderBy: { name: "asc" },
    }).then((cls) => cls.map((c) => ({ name: c.name.replace("Grade ", "G"), students: c._count.students })));

    // Exam marks entry progress for admin overview
    const allExams = await db.exam.findMany({
      include: { class: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { term: "asc" }, { createdAt: "desc" }],
    });
    const allExamIds = allExams.map((e) => e.id);
    const allUniqueClassIds = [...new Set(allExams.map((e) => e.classId))];

    const studentsPerClass = await db.student.groupBy({
      by: ["classId"], where: { classId: { in: allUniqueClassIds }, status: "ACTIVE" }, _count: { id: true },
    });
    const scMap: Record<string, number> = {};
    for (const s of studentsPerClass) scMap[s.classId] = s._count.id;

    const classSubjects = await db.classSubject.findMany({
      where: { classId: { in: allUniqueClassIds } },
      include: { subject: { select: { id: true, code: true, name: true } } },
    });
    const subjectsByClass: Record<string, Array<{ subjectId: string }>> = {};
    for (const cs of classSubjects) {
      if (!subjectsByClass[cs.classId]) subjectsByClass[cs.classId] = [];
      subjectsByClass[cs.classId].push({ subjectId: cs.subject.id });
    }

    const markProgress = allExamIds.length > 0
      ? await db.studentMark.groupBy({
          by: ["examId", "subjectId"],
          where: { examId: { in: allExamIds } },
          _count: { id: true },
        })
      : [];
    const mcMap = new Map<string, number>();
    for (const mp of markProgress) mcMap.set(`${mp.examId}-${mp.subjectId}`, mp._count.id);

    const examProgress = allExams.map((exam) => {
      const subs = subjectsByClass[exam.classId] || [];
      const sc = scMap[exam.classId] || 0;
      let completed = 0;
      for (const sub of subs) {
        const mc = mcMap.get(`${exam.id}-${sub.subjectId}`) || 0;
        if (mc >= sc && sc > 0) completed++;
      }
      return {
        id: exam.id,
        name: exam.name,
        className: exam.class.name,
        term: exam.term,
        year: exam.year,
        status: exam.status,
        completedSubjects: completed,
        totalSubjects: subs.length,
        isComplete: subs.length > 0 && completed === subs.length,
        isClosed: exam.status === "CLOSED",
        isApproved: exam.status === "APPROVED",
      };
    });

    // Count exams pending approval (complete but not yet approved/closed)
    const pendingApproval = examProgress.filter((e) => e.isComplete && e.status === "ACTIVE").length;

    return NextResponse.json({
      stats: {
        totalStudents,
        totalClasses,
        totalTeachers,
        todayPresent: attendanceMap["PRESENT"] || 0,
        todayAbsent: attendanceMap["ABSENT"] || 0,
        todayLate: attendanceMap["LATE"] || 0,
        todayTotal: (attendanceMap["PRESENT"] || 0) + (attendanceMap["ABSENT"] || 0) + (attendanceMap["LATE"] || 0),
        attendanceRate,
        classDistribution,
        pendingApproval,
      },
      examProgress,
      pendingClasses,
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
