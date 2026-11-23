// Import all data from JSON files into Supabase PostgreSQL
// Run AFTER: npx prisma db push
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const DATA = path.join(__dirname, 'migration-data');

function load(name: string) {
  return JSON.parse(fs.readFileSync(path.join(DATA, `${name}.json`), 'utf-8'));
}

function stripIds(rows: any[], fields: string[]) {
  // Keep id so foreign keys work, but strip relation fields
  return rows.map(r => {
    const clean = { ...r };
    for (const f of fields) delete clean[f];
    return clean;
  });
}

async function main() {
  console.log('Importing data into Supabase PostgreSQL...\n');

  // 1. School Settings (no dependencies)
  const settings = load('schoolSettings');
  for (const s of settings) {
    await prisma.schoolSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, updatedAt: new Date(s.updatedAt) },
      create: { id: s.id, key: s.key, value: s.value, updatedAt: new Date(s.updatedAt) },
    });
  }
  console.log(`  ✓ schoolSettings: ${settings.length}`);

  // 2. Grading Schemes
  const schemes = load('gradingSchemes');
  for (const s of schemes) {
    await prisma.gradingScheme.create({ data: {
      id: s.id, name: s.name, isActive: s.isActive,
      description: s.description,
      createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt),
    }});
  }
  console.log(`  ✓ gradingSchemes: ${schemes.length}`);

  // 3. Grade Rules
  const rules = load('gradeRules');
  for (const r of rules) {
    await prisma.gradeRule.create({ data: {
      id: r.id, schemeId: r.schemeId, minMarks: r.minMarks,
      maxMarks: r.maxMarks, grade: r.grade, remark: r.remark, sortOrder: r.sortOrder,
    }});
  }
  console.log(`  ✓ gradeRules: ${rules.length}`);

  // 4. Users
  const users = load('users');
  for (const u of users) {
    await prisma.user.create({ data: {
      id: u.id, email: u.email, password: u.password, name: u.name,
      role: u.role, phone: u.phone, isActive: u.isActive,
      createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt),
    }});
  }
  console.log(`  ✓ users: ${users.length}`);

  // 5. Teachers (depends on users)
  const teachers = load('teachers');
  for (const t of teachers) {
    await prisma.teacher.create({ data: {
      id: t.id, employeeId: t.employeeId, phone: t.phone,
      qualification: t.qualification, userId: t.userId,
      dateJoined: new Date(t.dateJoined),
      createdAt: new Date(t.createdAt), updatedAt: new Date(t.updatedAt),
    }});
  }
  console.log(`  ✓ teachers: ${teachers.length}`);

  // 6. Classes
  const classes = load('classes');
  for (const c of classes) {
    await prisma.class.create({ data: {
      id: c.id, name: c.name, academicYear: c.academicYear,
      createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt),
    }});
  }
  console.log(`  ✓ classes: ${classes.length}`);

  // 7. Subjects
  const subjects = load('subjects');
  for (const s of subjects) {
    await prisma.subject.create({ data: {
      id: s.id, code: s.code, name: s.name,
      category: s.category, description: s.description,
    }});
  }
  console.log(`  ✓ subjects: ${subjects.length}`);

  // 8. ClassSubjects (junction)
  const classSubjects = load('classSubjects');
  for (const cs of classSubjects) {
    await prisma.classSubject.create({ data: {
      id: cs.id, classId: cs.classId, subjectId: cs.subjectId,
      createdAt: new Date(cs.createdAt),
    }});
  }
  console.log(`  ✓ classSubjects: ${classSubjects.length}`);

  // 9. TeacherClasses (junction)
  const teacherClasses = load('teacherClasses');
  for (const tc of teacherClasses) {
    await prisma.teacherClass.create({ data: {
      id: tc.id, teacherId: tc.teacherId, classId: tc.classId,
      isPrimary: tc.isPrimary, assignedAt: new Date(tc.assignedAt),
    }});
  }
  console.log(`  ✓ teacherClasses: ${teacherClasses.length}`);

  // 10. TeacherSubjects (junction)
  const teacherSubjects = load('teacherSubjects');
  for (const ts of teacherSubjects) {
    await prisma.teacherSubject.create({ data: {
      id: ts.id, teacherId: ts.teacherId, classId: ts.classId,
      subjectId: ts.subjectId, assignedAt: new Date(ts.assignedAt),
    }});
  }
  console.log(`  ✓ teacherSubjects: ${teacherSubjects.length}`);

  // 11. Students
  const students = load('students');
  for (const s of students) {
    await prisma.student.create({ data: {
      id: s.id, firstName: s.firstName, lastName: s.lastName,
      dateOfBirth: s.dateOfBirth ? new Date(s.dateOfBirth) : null,
      gender: s.gender, classId: s.classId,
      enrolledAt: new Date(s.enrolledAt), status: s.status,
      createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt),
      guardianName: s.guardianName, guardianPhone: s.guardianPhone,
      guardianRelation: s.guardianRelation, guardianIdNumber: s.guardianIdNumber,
    }});
  }
  console.log(`  ✓ students: ${students.length}`);

  // 12. Exams
  const exams = load('exams');
  for (const e of exams) {
    await prisma.exam.create({ data: {
      id: e.id, name: e.name, term: e.term, year: e.year,
      examDate: e.examDate ? new Date(e.examDate) : null,
      maxMarks: e.maxMarks, status: e.status, classId: e.classId,
      approvedBy: e.approvedBy,
      approvedAt: e.approvedAt ? new Date(e.approvedAt) : null,
      closedBy: e.closedBy,
      closedAt: e.closedAt ? new Date(e.closedAt) : null,
      createdAt: new Date(e.createdAt), updatedAt: new Date(e.updatedAt),
    }});
  }
  console.log(`  ✓ exams: ${exams.length}`);

  // 13. Student Marks (biggest table - 504 rows)
  const marks = load('studentMarks');
  let batch: any[] = [];
  const BATCH_SIZE = 100;
  for (const m of marks) {
    batch.push({
      id: m.id, examId: m.examId, studentId: m.studentId,
      subjectId: m.subjectId, marksObtained: m.marksObtained,
      remarks: m.remarks, gradedBy: m.gradedBy,
      gradedAt: new Date(m.gradedAt),
    });
    if (batch.length >= BATCH_SIZE) {
      await prisma.studentMark.createMany({ data: batch });
      console.log(`    ... imported ${batch.length} marks`);
      batch = [];
    }
  }
  if (batch.length > 0) {
    await prisma.studentMark.createMany({ data: batch });
    console.log(`    ... imported ${batch.length} marks`);
  }
  console.log(`  ✓ studentMarks: ${marks.length}`);

  // 14. Attendance (360 rows)
  const attendance = load('attendance');
  batch = [];
  for (const a of attendance) {
    batch.push({
      id: a.id, studentId: a.studentId, classId: a.classId,
      date: a.date, status: a.status, markedBy: a.markedBy,
      createdAt: new Date(a.createdAt),
    });
    if (batch.length >= BATCH_SIZE) {
      await prisma.attendance.createMany({ data: batch });
      batch = [];
    }
  }
  if (batch.length > 0) {
    await prisma.attendance.createMany({ data: batch });
  }
  console.log(`  ✓ attendance: ${attendance.length}`);

  // 15. Exam Remarks (0 rows but include for completeness)
  const remarks = load('examRemarks');
  for (const r of remarks) {
    await prisma.examRemark.create({ data: {
      id: r.id, examId: r.examId, studentId: r.studentId,
      remark: r.remark, writtenBy: r.writtenBy,
      writtenAt: new Date(r.writtenAt), updatedAt: new Date(r.updatedAt),
    }});
  }
  console.log(`  ✓ examRemarks: ${remarks.length}`);

  console.log('\n✅ Migration complete! All data is now in Supabase.');
}

main()
  .catch((e: any) => { console.error('Migration error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
