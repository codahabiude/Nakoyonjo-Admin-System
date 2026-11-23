const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  try {
    const users = await db.user.count();
    console.log('Users:', users);
    const students = await db.student.count();
    console.log('Students:', students);
    const classes = await db.class.count();
    console.log('Classes:', classes);
    const exams = await db.exam.count();
    console.log('Exams:', exams);
    // Try a dashboard-like query
    const classSubjects = await db.classSubject.findMany({
      where: { classId: { in: [] } },
      include: { subject: { select: { id: true, code: true, name: true } } },
    });
    console.log('ClassSubjects query OK, count:', classSubjects.length);
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  await db.disconnect();
}
main();
