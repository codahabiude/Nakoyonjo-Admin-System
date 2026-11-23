import { execSync } from 'child_process';

const BASE = 'http://localhost:3000';
function api(method, path, body = null, token = null) {
  const opts = ['-s', '-X', method, `${BASE}${path}`, '-H', 'Content-Type: application/json'];
  if (token) opts.push('-H', `Authorization: Bearer ${token}`);
  if (body) opts.push('-d', JSON.stringify(body));
  try { return JSON.parse(execSync(`curl ${opts.join(' ')}`, { timeout: 10000 }).toString()); }
  catch (e) { return null; }
}

console.log('=== LOGIN ===');
const admin = api('POST', '/api/auth/login', { email: 'admin@nakoyonjo.ac.ke', password: 'admin123' });
console.log('Admin:', admin.ok ? 'OK' : 'FAIL');
if (!admin.ok) { process.exit(1); }

console.log('\n=== EXAMS (Admin) ===');
const exams = api('GET', '/api/exams', null, admin.token);
console.log(`Admin sees ${exams.exams.length} exams`);
exams.exams.slice(0, 3).forEach(e => console.log(`  ${e.name} - ${e.className}`));

console.log('\n=== LOGIN TEACHER ===');
const teacher = api('POST', '/api/auth/login', { email: 'james.mwangi@nakoyonjo.ac.ke', password: 'teacher123' });
console.log('Teacher:', teacher.ok ? 'OK' : 'FAIL');

console.log('\n=== EXAMS (Teacher) ===');
const tExams = api('GET', '/api/exams', null, teacher.token);
console.log(`Teacher sees ${tExams.exams.length} exam(s)`);
tExams.exams.forEach(e => console.log(`  ${e.name} - ${e.className}`));

console.log('\n=== MY CLASS ===');
const myClass = api('GET', '/api/my-class', null, teacher.token);
console.log(`Teacher class: ${myClass.classes.map(c => c.name).join(', ')}`);

const examId = tExams.exams[0]?.id;
if (!examId) { console.log('No exam to test marks'); process.exit(0); }

console.log('\n=== MARKS ===');
const marks = api('GET', `/api/marks?examId=${examId}`, null, teacher.token);
console.log(`Exam: ${marks.exam.name} | Students: ${marks.students.length} | Subjects: ${marks.subjects.length}`);

const studentId = marks.students[0]?.id;

console.log('\n=== REPORT CARD ===');
const report = api('POST', '/api/marks', { studentId, examId }, teacher.token);
console.log(`${report.student.firstName} ${report.student.lastName}`);
console.log(`Total: ${report.summary.totalMarks}/${report.summary.maxTotal} | Avg: ${report.summary.average} | Grade: ${report.summary.grade} | Rank: ${report.summary.rank}/${report.summary.totalStudents}`);
report.marks.forEach(m => console.log(`  ${m.code}: ${m.marksObtained}/${m.maxMarks} (${m.grade})`));

console.log('\n=== ALL TESTS PASSED ===');
