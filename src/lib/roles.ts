import { db } from "./db";

/**
 * Central role/permission helpers.
 *
 * Roles in this system:
 *   ADMIN          — full control of the school (students, teachers, classes,
 *                    exams workflow, grading, settings).
 *   Class Teacher  — a TEACHER whose TeacherClass row for a class has
 *                    isPrimary = true. Owns daily attendance, class-teacher
 *                    remarks, and monitors the WHOLE class's marks progress.
 *   Regular Teacher— a TEACHER assigned to a class only via TeacherSubject
 *                    (or a non-primary TeacherClass). Enters marks for their
 *                    subjects and views their classes; cannot mark attendance
 *                    or write class-teacher remarks.
 */

export interface TeacherContext {
  teacherId: string;
  /** Class ids where this teacher is THE class teacher (isPrimary). */
  primaryClassIds: string[];
  /** All class ids linked via TeacherClass (primary or not). */
  assignedClassIds: string[];
  isClassTeacherOf: (classId: string) => boolean;
  /** View access: any TeacherClass link counts. */
  canViewClass: (classId: string) => boolean;
}

/** Load a teacher's class relationships once, then query in memory. */
export async function getTeacherContext(userId: string): Promise<TeacherContext | null> {
  const teacher = await db.teacher.findUnique({
    where: { userId },
    select: {
      id: true,
      classes: { select: { classId: true, isPrimary: true } },
    },
  });
  if (!teacher) return null;

  const primarySet = new Set<string>();
  const assignedSet = new Set<string>();
  for (const tc of teacher.classes) {
    assignedSet.add(tc.classId);
    if (tc.isPrimary) primarySet.add(tc.classId);
  }

  return {
    teacherId: teacher.id,
    primaryClassIds: [...primarySet],
    assignedClassIds: [...assignedSet],
    isClassTeacherOf: (classId: string) => primarySet.has(classId),
    canViewClass: (classId: string) => assignedSet.has(classId),
  };
}
