// Export all data from SQLite to JSON files for migration
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const OUT = path.join(__dirname, 'migration-data');

async function exportTable(name: string, model: any) {
  const data = await model.findMany();
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  Exported ${name}: ${data.length} rows`);
  return data;
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  console.log('Exporting SQLite data...');

  // Order: independent tables first, then dependent
  await exportTable('schoolSettings', prisma.schoolSetting);
  await exportTable('gradingSchemes', prisma.gradingScheme);
  await exportTable('gradeRules', prisma.gradeRule);
  await exportTable('users', prisma.user);
  await exportTable('teachers', prisma.teacher);
  await exportTable('classes', prisma.class);
  await exportTable('subjects', prisma.subject);
  await exportTable('classSubjects', prisma.classSubject);
  await exportTable('teacherClasses', prisma.teacherClass);
  await exportTable('teacherSubjects', prisma.teacherSubject);
  await exportTable('students', prisma.student);
  await exportTable('exams', prisma.exam);
  await exportTable('studentMarks', prisma.studentMark);
  await exportTable('attendance', prisma.attendance);
  await exportTable('examRemarks', prisma.examRemark);

  console.log(`\nDone! All data saved to ${OUT}/`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
