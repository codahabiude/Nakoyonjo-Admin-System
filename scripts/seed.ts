import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function seed() {
  // Check if data already exists
  const existingUsers = await db.user.count();
  if (existingUsers > 0) {
    console.log('Database already has data. Resetting...');
    await db.schoolSetting.deleteMany();
    await db.studentMark.deleteMany();
    await db.exam.deleteMany();
    await db.attendance.deleteMany();
    await db.student.deleteMany();
    await db.teacherSubject.deleteMany();
    await db.teacherClass.deleteMany();
    await db.classSubject.deleteMany();
    await db.teacher.deleteMany();
    await db.user.deleteMany();
    await db.class.deleteMany();
    await db.subject.deleteMany();
    await db.gradeRule.deleteMany();
    await db.gradingScheme.deleteMany();
  }

  const adminPassword = process.env.ADMIN_SEED_PASSWORD || 'ChangeMeImmediately!1';
  const teacherPassword = process.env.TEACHER_SEED_PASSWORD || 'ChangeMeImmediately!2';
  const hashedAdminPw = await bcrypt.hash(adminPassword, 10);
  const hashedTeacherPw = await bcrypt.hash(teacherPassword, 10);

  // ---- DEFAULT CBC GRADING SCHEME ----
  const defaultScheme = await db.gradingScheme.create({
    data: {
      name: 'Kenyan CBC Grading',
      description: 'Competency-Based Curriculum performance levels',
      isActive: true,
      grades: {
        create: [
          { minMarks: 80, maxMarks: 100, grade: 'EE', remark: 'Exceeding Expectations', sortOrder: 3 },
          { minMarks: 50, maxMarks: 79,  grade: 'ME', remark: 'Meeting Expectations', sortOrder: 2 },
          { minMarks: 30, maxMarks: 49,  grade: 'AE', remark: 'Approaching Expectations', sortOrder: 1 },
          { minMarks: 0,  maxMarks: 29,  grade: 'BE', remark: 'Below Expectations', sortOrder: 0 },
        ],
      },
    },
  });
  console.log('Created CBC grading scheme:', defaultScheme.name);

  // ---- SCHOOL SETTINGS ----
  const settings = [
    { key: 'school_name', value: 'Nakoyonjo DEB Primary School' },
    { key: 'school_motto', value: 'Education for Life' },
    { key: 'school_address', value: 'P.O. Box 123, Bungoma, Kenya' },
    { key: 'school_phone', value: '+254700000000' },
    { key: 'term1_start', value: '2026-01-27' },
    { key: 'term1_end', value: '2026-04-04' },
    { key: 'term2_start', value: '2026-05-04' },
    { key: 'term2_end', value: '2026-07-25' },
    { key: 'term3_start', value: '2026-09-01' },
    { key: 'term3_end', value: '2026-11-21' },
  ];
  for (const s of settings) {
    await db.schoolSetting.create({ data: s });
  }
  console.log('Created school settings');

  // ---- USERS ----
  const admin = await db.user.create({
    data: { email: 'admin@nakoyonjo.ac.ke', password: hashedAdminPw, name: 'Mrs. Agnes Wanjiku', role: 'ADMIN' },
  });

  const teacherData = [
    { email: 'james.mwangi@nakoyonjo.ac.ke', name: 'Mr. James Mwangi', empId: 'TCH-001', qual: 'B.Ed (Primary)', phone: '+254712345001' },
    { email: 'grace.naswa@nakoyonjo.ac.ke', name: 'Ms. Grace Naswa', empId: 'TCH-002', qual: 'B.Ed (Science)', phone: '+254712345002' },
    { email: 'peter.wekesa@nakoyonjo.ac.ke', name: 'Mr. Peter Wekesa', empId: 'TCH-003', qual: 'Diploma in Education', phone: '+254712345003' },
    { email: 'lucy.chepkemoi@nakoyonjo.ac.ke', name: 'Ms. Lucy Chepkemoi', empId: 'TCH-004', qual: 'B.Ed (Arts)', phone: '+254712345004' },
    { email: 'david.kimani@nakoyonjo.ac.ke', name: 'Mr. David Kimani', empId: 'TCH-005', qual: 'B.Ed (Primary)', phone: '+254712345005' },
    { email: 'mary.wanjiku@nakoyonjo.ac.ke', name: 'Ms. Mary Wanjiku', empId: 'TCH-006', qual: 'B.Ed (Mathematics)', phone: '+254712345006' },
    { email: 'samuel.rotich@nakoyonjo.ac.ke', name: 'Mr. Samuel Rotich', empId: 'TCH-007', qual: 'Diploma in Education', phone: '+254712345007' },
    { email: 'doris.akinyi@nakoyonjo.ac.ke', name: 'Ms. Doris Akinyi', empId: 'TCH-008', qual: 'B.Ed (English)', phone: '+254712345008' },
    { email: 'henry.kiprop@nakoyonjo.ac.ke', name: 'Mr. Henry Kiprop', empId: 'TCH-009', qual: 'B.Ed (Science)', phone: '+254712345009' },
    { email: 'faith.njeri@nakoyonjo.ac.ke', name: 'Ms. Faith Njeri', empId: 'TCH-010', qual: 'B.Ed (Primary)', phone: '+254712345010' },
  ];

  const teacherUsers = await Promise.all(
    teacherData.map((t) => db.user.create({ data: { email: t.email, password: hashedTeacherPw, name: t.name, role: 'TEACHER' } }))
  );

  // ---- SUBJECTS ----
  const subjects = await Promise.all([
    db.subject.create({ data: { code: 'ENG', name: 'English', category: 'CORE', description: 'English Language and Literacy' } }),
    db.subject.create({ data: { code: 'MAT', name: 'Mathematics', category: 'CORE', description: 'Mathematics and Numeracy' } }),
    db.subject.create({ data: { code: 'SCI', name: 'Integrated Science', category: 'CORE', description: 'Science, Technology and Innovation' } }),
    db.subject.create({ data: { code: 'CASS', name: 'Creative Arts & Social Studies', category: 'CORE', description: 'Creative Arts and Social Studies' } }),
    db.subject.create({ data: { code: 'CRE', name: 'Christian Religious Education', category: 'CORE', description: 'Christian Religious Education' } }),
    db.subject.create({ data: { code: 'KIS', name: 'Kiswahili', category: 'CORE', description: 'Kiswahili Language' } }),
    db.subject.create({ data: { code: 'PE', name: 'Physical Education', category: 'CORE', description: 'Physical Education and Sports' } }),
  ]);

  // ---- CLASSES (Grade 1-9, no streams) ----
  const classNames = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'];
  const classes = await Promise.all(
    classNames.map((name) => db.class.create({ data: { name, academicYear: '2026' } }))
  );

  // Link all subjects to all classes
  const subjectIds = subjects.map((s) => s.id);
  for (const cls of classes) {
    await Promise.all(subjectIds.map((sid) => db.classSubject.create({ data: { classId: cls.id, subjectId: sid } })));
  }

  // ---- TEACHERS + CLASS ASSIGNMENTS + SUBJECT ASSIGNMENTS ----
  // Each teacher is class teacher of one class AND teaches specific subjects.
  // Teachers also teach some subjects in OTHER classes.
  //
  // Subject assignments per teacher per class:
  const subjectAssignments: { teacherIdx: number; classIdx: number; subjectIdxs: number[] }[] = [
    // TCH-001 Mr. James Mwangi — Class Teacher Grade 1, teaches ENG & CRE in G1, G2, G3
    { teacherIdx: 0, classIdx: 0, subjectIdxs: [0, 4] },  // ENG, CRE in Grade 1
    { teacherIdx: 0, classIdx: 1, subjectIdxs: [0] },       // ENG in Grade 2
    { teacherIdx: 0, classIdx: 2, subjectIdxs: [0, 4] },  // ENG, CRE in Grade 3
    // TCH-002 Ms. Grace Naswa — Class Teacher Grade 2, teaches SCI & MAT in G1, G2, G3
    { teacherIdx: 1, classIdx: 1, subjectIdxs: [1, 2] },  // MAT, SCI in Grade 2
    { teacherIdx: 1, classIdx: 0, subjectIdxs: [2] },       // SCI in Grade 1
    { teacherIdx: 1, classIdx: 2, subjectIdxs: [1] },       // MAT in Grade 3
    // TCH-003 Mr. Peter Wekesa — Class Teacher Grade 3, teaches KIS & CASS in G1-G4
    { teacherIdx: 2, classIdx: 2, subjectIdxs: [5, 3] },  // KIS, CASS in Grade 3
    { teacherIdx: 2, classIdx: 3, subjectIdxs: [5] },       // KIS in Grade 4
    // TCH-004 Ms. Lucy Chepkemoi — Class Teacher Grade 4, teaches ENG & MAT in G4, G5
    { teacherIdx: 3, classIdx: 3, subjectIdxs: [0, 1] },  // ENG, MAT in Grade 4
    { teacherIdx: 3, classIdx: 4, subjectIdxs: [0, 1] },  // ENG, MAT in Grade 5
    // TCH-005 Mr. David Kimani — Class Teacher Grade 5, teaches SCI & PE in G4-G6
    { teacherIdx: 4, classIdx: 4, subjectIdxs: [2, 6] },  // SCI, PE in Grade 5
    { teacherIdx: 4, classIdx: 5, subjectIdxs: [2, 6] },  // SCI, PE in Grade 6
    // TCH-006 Ms. Mary Wanjiku — Class Teacher Grade 6, teaches MAT & CRE in G5-G7
    { teacherIdx: 5, classIdx: 5, subjectIdxs: [1, 4] },  // MAT, CRE in Grade 6
    { teacherIdx: 5, classIdx: 6, subjectIdxs: [1, 4] },  // MAT, CRE in Grade 7
    // TCH-007 Mr. Samuel Rotich — Class Teacher Grade 7, teaches KIS & CASS in G6-G8
    { teacherIdx: 6, classIdx: 6, subjectIdxs: [5, 3] },  // KIS, CASS in Grade 7
    { teacherIdx: 6, classIdx: 7, subjectIdxs: [5, 3] },  // KIS, CASS in Grade 8
    // TCH-008 Ms. Doris Akinyi — Class Teacher Grade 8, teaches ENG & SCI in G7-G9
    { teacherIdx: 7, classIdx: 7, subjectIdxs: [0, 2] },  // ENG, SCI in Grade 8
    { teacherIdx: 7, classIdx: 8, subjectIdxs: [0, 2] },  // ENG, SCI in Grade 9
    // TCH-009 Mr. Henry Kiprop — Class Teacher Grade 9, teaches MAT & PE in G8, G9
    { teacherIdx: 8, classIdx: 8, subjectIdxs: [1, 6, 4] },  // MAT, PE, CRE in Grade 9
    { teacherIdx: 8, classIdx: 7, subjectIdxs: [1] },       // MAT in Grade 8
    // TCH-010 Ms. Faith Njeri — No class teacher duty, teaches PE & CASS across multiple classes
    { teacherIdx: 9, classIdx: 0, subjectIdxs: [6, 3] },  // PE, CASS in Grade 1
    { teacherIdx: 9, classIdx: 1, subjectIdxs: [6, 3] },  // PE, CASS in Grade 2
    { teacherIdx: 9, classIdx: 3, subjectIdxs: [6] },       // PE in Grade 4
    { teacherIdx: 9, classIdx: 4, subjectIdxs: [3] },       // CASS in Grade 5
    { teacherIdx: 9, classIdx: 5, subjectIdxs: [3] },       // CASS in Grade 6
    { teacherIdx: 9, classIdx: 6, subjectIdxs: [6] },       // PE in Grade 7
  ];

  // Expand assignments into individual teacher-subject-class records
  const expandedAssignments: { teacherIdx: number; classIdx: number; subjectIdx: number }[] = [];
  for (const sa of subjectAssignments) {
    for (const sIdx of sa.subjectIdxs) {
      expandedAssignments.push({ teacherIdx: sa.teacherIdx, classIdx: sa.classIdx, subjectIdx: sIdx });
    }
  }

  // Create teachers with class + subject assignments
  for (let i = 0; i < 9; i++) {
    await db.teacher.create({
      data: {
        employeeId: teacherData[i].empId,
        phone: teacherData[i].phone,
        qualification: teacherData[i].qual,
        userId: teacherUsers[i].id,
        classes: { create: [{ classId: classes[i].id, isPrimary: true }] },
        subjects: {
          create: expandedAssignments
            .filter((sa) => sa.teacherIdx === i)
            .map((sa) => ({
              classId: classes[sa.classIdx].id,
              subjectId: subjects[sa.subjectIdx].id,
            })),
        },
      },
    });
  }
  // 10th teacher has no primary class but teaches PE & CASS across classes
  await db.teacher.create({
    data: {
      employeeId: teacherData[9].empId,
      phone: teacherData[9].phone,
      qualification: teacherData[9].qual,
      userId: teacherUsers[9].id,
      subjects: {
        create: expandedAssignments
          .filter((sa) => sa.teacherIdx === 9)
          .map((sa) => ({
            classId: classes[sa.classIdx].id,
            subjectId: subjects[sa.subjectIdx].id,
          })),
      },
    },
  });
  console.log('Created 10 teachers with subject assignments');

  // ---- STUDENTS (8 per class = 72 total) ----
  const firstNames = ['Brian','Faith','Kelvin','Mercy','Dennis','Sharon','Ivan','Linet','Noah','Brenda','Alex','Esther','Mark','Priscilla','Victor','Diana','Samuel','Naomi','Collins','Lucy','Edwin','Phyllis','Kevin','Ann','Jordan','Ruth','Martin','Tabitha','Emmanuel','Charity','Harrison','Jane','Abel','Grace','Benard','Helen','Caleb','Rebecca','Daniel','Susan','Felix','Agnes','Gilbert','Mary','Henry','Dorcas','Patrick','Elizabeth','Brian J','Faith W','Kelvin K','Mercy N','Dennis O','Sharon C','Ivan M','Linet W','Noah K','Brenda C','Alex N','Esther M','Mark W','Priscilla O','Victor K','Diana J','Samuel W','Naomi C','Collins R','Lucy M','Edwin K','Phyllis W','Kevin O','Ann N','Jordan M','Ruth K','Martin W','Tabitha C','Emmanuel O','Charity N','Benedict','Lavender'];
  const lastNames = ['Wanjiru','Otieno','Muthoni','Kipchoge','Achieng','Kamau','Naswa','Wambua','Mwangi','Akinyi','Njoroge','Chebet','Odhiambo','Wairimu','Koech','Moraa','Mutua','Jepkorir','Kimani','Nyambura','Kibet','Wanjiku','Bett','Thuo','Cherono','Kariuki','Jerono','Maina','Rono','Njeri','Rotich','Muthui','Kirui','Wambui','Yego','Ngugi','Tuitoek','Gikundi','Kosgei','Kamende','Biwott','Mbugua','Kirui','Njoki','Kiprop','Wachira','Chepkemoi','Ndungu','Simiyu','Wanjiru','Otieno','Muthoni','Kipchoge','Achieng','Kamau','Naswa','Wambua','Mwangi','Akinyi','Njoroge','Chebet','Odhiambo','Wairimu','Koech','Moraa','Mutua','Jepkorir','Kimani','Nyambura','Kibet','Wanjiku','Bett','Thuo','Cherono','Kariuki','Jerono','Maina','Rono','Njeri','Onyango','Muthui','Kiptoo'];
  const guardianRelations = ['Father','Mother','Uncle','Aunt','Grandmother','Guardian'];

  let studentCounter = 0;
  for (const cls of classes) {
    for (let i = 0; i < 8; i++) {
      const idx = studentCounter;
      await db.student.create({
        data: {
          firstName: firstNames[idx],
          lastName: lastNames[idx],
          gender: idx % 2 === 0 ? 'MALE' : 'FEMALE',
          dateOfBirth: new Date(2015 + Math.floor(idx / 8), (idx % 12), (idx % 28) + 1),
          classId: cls.id,
          guardianName: `${lastNames[idx]} ${guardianRelations[idx % guardianRelations.length]}`,
          guardianPhone: `+254${700000000 + idx * 11111}`,
          guardianRelation: guardianRelations[idx % guardianRelations.length],
        },
      });
      studentCounter++;
    }
  }

  // ---- SAMPLE EXAMS ----
  // Create one exam per class for "Term 1 Opener 2026"
  for (let i = 0; i < classes.length; i++) {
    const exam = await db.exam.create({
      data: {
        name: 'Term 1 Opener',
        term: 'Term 1',
        year: '2026',
        classId: classes[i].id,
        maxMarks: 100,
        status: 'ACTIVE',
      },
    });

    // Get students in this class
    const studentsInClass = await db.student.findMany({ where: { classId: classes[i].id, status: 'ACTIVE' }, select: { id: true } });
    const classSubjects = await db.classSubject.findMany({ where: { classId: classes[i].id }, select: { subjectId: true } });

    // Generate random marks for each student x subject
    for (const student of studentsInClass) {
      for (const cs of classSubjects) {
        const marksObtained = Math.floor(Math.random() * 51) + 40; // 40-90 range
        let remarks = 'Needs improvement';
        if (marksObtained >= 80) remarks = 'Excellent';
        else if (marksObtained >= 60) remarks = 'Good';
        else if (marksObtained >= 50) remarks = 'Fair';

        await db.studentMark.create({
          data: {
            examId: exam.id,
            studentId: student.id,
            subjectId: cs.subjectId,
            marksObtained,
            remarks,
            gradedBy: admin.id,
          },
        });
      }
    }
  }

  // ---- ATTENDANCE (last 7 weekdays) ----
  const today = new Date();
  const statuses = ['PRESENT','PRESENT','PRESENT','ABSENT','LATE','PRESENT','PRESENT','PRESENT'];
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const d = new Date(today);
    d.setDate(d.getDate() - dayOffset);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const dateStr = d.toISOString().split('T')[0];
    const allStudents = await db.student.findMany({ where: { status: 'ACTIVE' }, select: { id: true, classId: true } });
    await Promise.all(
      allStudents.map((student, idx) =>
        db.attendance.create({
          data: { studentId: student.id, classId: student.classId, date: dateStr, status: statuses[idx % statuses.length], markedBy: admin.id },
        })
      )
    );
  }

  console.log('Seeded: 1 admin, 10 teachers, 9 classes (Grade 1-9), 7 subjects, 72 students, 9 exams with marks, 5 days attendance');
  console.log('IMPORTANT: Change all default passwords after first login!');
  await db.$disconnect();
}

seed().catch((e) => { console.error('Seed error:', e); process.exit(1); });
