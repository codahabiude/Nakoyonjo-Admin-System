import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import bcrypt from "bcryptjs";

// POST /api/seed — populate database with sample data (admin only, one-time use)
export async function POST(req: NextRequest) {
  try {
    // Bug 25: Add auth check
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    // Check if data already exists
    const existingUsers = await db.user.count();
    if (existingUsers > 0) {
      return NextResponse.json(
        { message: "Database already has data. Reset if needed." },
        { status: 200 }
      );
    }

    const hashedAdminPw = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD || "ChangeMeImmediately!1", 10);
    const hashedTeacherPw = await bcrypt.hash(process.env.TEACHER_SEED_PASSWORD || "ChangeMeImmediately!2", 10);

    // 1. Create Users
    const admin = await db.user.create({
      data: {
        email: "admin@nakoyonjo.ac.ke",
        password: hashedAdminPw,
        name: "Mrs. Agnes Wanjiku",
        role: "ADMIN",
      },
    });

    const teacher1User = await db.user.create({
      data: {
        email: "james.mwangi@nakoyonjo.ac.ke",
        password: hashedTeacherPw,
        name: "Mr. James Mwangi",
        role: "TEACHER",
      },
    });

    const teacher2User = await db.user.create({
      data: {
        email: "grace.naswa@nakoyonjo.ac.ke",
        password: hashedTeacherPw,
        name: "Ms. Grace Naswa",
        role: "TEACHER",
      },
    });

    const teacher3User = await db.user.create({
      data: {
        email: "peter.wekesa@nakoyonjo.ac.ke",
        password: hashedTeacherPw,
        name: "Mr. Peter Wekesa",
        role: "TEACHER",
      },
    });

    // 2. Create Subjects (CBC)
    const subjects = await Promise.all([
      db.subject.create({
        data: {
          code: "ENG",
          name: "English",
          category: "CORE",
          description: "English Language and Literacy",
        },
      }),
      db.subject.create({
        data: {
          code: "MAT",
          name: "Mathematics",
          category: "CORE",
          description: "Mathematics and Numeracy",
        },
      }),
      db.subject.create({
        data: {
          code: "SCI",
          name: "Integrated Science",
          category: "CORE",
          description: "Science, Technology and Innovation",
        },
      }),
      db.subject.create({
        data: {
          code: "CASS",
          name: "Creative Arts and Social Studies",
          category: "CORE",
          description: "Creative Arts and Social Studies",
        },
      }),
      db.subject.create({
        data: {
          code: "CRE",
          name: "Christian Religious Education",
          category: "CORE",
          description: "Christian Religious Education",
        },
      }),
      db.subject.create({
        data: {
          code: "IRE",
          name: "Islamic Religious Education",
          category: "CORE",
          description: "Islamic Religious Education",
        },
      }),
      db.subject.create({
        data: {
          code: "PRE",
          name: "Pre-Technical Studies",
          category: "CORE",
          description: "Pre-Technical and Pre-Career Education",
        },
      }),
    ]);

    // 3. Create Classes
    const classes = await Promise.all([
      db.class.create({ data: { name: "Grade 1", academicYear: "2026" } }),
      db.class.create({ data: { name: "Grade 2", academicYear: "2026" } }),
      db.class.create({ data: { name: "Grade 3", academicYear: "2026" } }),
      db.class.create({ data: { name: "Grade 4", academicYear: "2026" } }),
      db.class.create({ data: { name: "Grade 5", academicYear: "2026" } }),
      db.class.create({ data: { name: "Grade 6", academicYear: "2026" } }),
    ]);

    // 4. Assign subjects to classes
    const subjectIds = subjects.map((s) => s.id);
    for (const cls of classes) {
      await Promise.all(
        subjectIds.map((sid) =>
          db.classSubject.create({ data: { classId: cls.id, subjectId: sid } })
        )
      );
    }

    // 5. Create Teachers
    const teacher1 = await db.teacher.create({
      data: {
        employeeId: "TCH-001",
        phone: "+254712345001",
        qualification: "B.Ed (Primary)",
        userId: teacher1User.id,
        classes: {
          create: [
            { classId: classes[0].id, isPrimary: true },
            { classId: classes[1].id },
          ],
        },
      },
    });

    const teacher2 = await db.teacher.create({
      data: {
        employeeId: "TCH-002",
        phone: "+254712345002",
        qualification: "B.Ed (Science)",
        userId: teacher2User.id,
        classes: {
          create: [
            { classId: classes[2].id, isPrimary: true },
            { classId: classes[3].id },
          ],
        },
      },
    });

    const teacher3 = await db.teacher.create({
      data: {
        employeeId: "TCH-003",
        phone: "+254712345003",
        qualification: "Diploma in Education",
        userId: teacher3User.id,
        classes: {
          create: [
            { classId: classes[4].id, isPrimary: true },
            { classId: classes[5].id },
          ],
        },
      },
    });

    // 6. Create Sample Students (8 per class = 48 total)
    const firstNames = [
      "Brian", "Faith", "Kelvin", "Mercy", "Dennis", "Sharon", "Ivan", "Linet",
      "Noah", "Brenda", "Alex", "Esther", "Mark", "Priscilla", "Victor", "Diana",
      "Samuel", "Naomi", "Collins", "Lucy", "Edwin", "Phyllis", "Kevin", "Ann",
      "Jordan", "Ruth", "Martin", "Tabitha", "Emmanuel", "Charity", "Harrison", "Jane",
      "Abel", "Grace", "Benard", "Helen", "Caleb", "Rebecca", "Daniel", "Susan",
      "Felix", "Agnes", "Gilbert", "Mary", "Henry", "Dorcas",
      "Patrick", "Elizabeth",
    ];
    const lastNames = [
      "Wanjiru", "Otieno", "Muthoni", "Kipchoge", "Achieng", "Kamau", "Naswa",
      "Wambua", "Mwangi", "Akinyi", "Njoroge", "Chebet", "Odhiambo", "Wairimu",
      "Koech", "Moraa", "Mutua", "Jepkorir", "Kimani", "Nyambura", "Kibet",
      "Wanjiku", "Bett", "Thuo", "Cherono", "Kariuki", "Jerono", "Maina",
      "Rono", "Njeri", "Rotich", "Muthui", "Kirui", "Wambui", "Yego",
      "Ngugi", "Tuitoek", "Gikundi", "Kosgei", "Kamende", "Biwott", "Mbugua",
      "Kirui", "Njoki", "Kiprop", "Wachira", "Chepkemoi", "Ndungu",
      "Simiyu",
    ];
    const guardianRelations = ["Father", "Mother", "Uncle", "Aunt", "Grandmother", "Guardian"];

    let studentCounter = 0;
    for (const cls of classes) {
      for (let i = 0; i < 8; i++) {
        const idx = studentCounter;
        await db.student.create({
          data: {
            firstName: firstNames[idx],
            lastName: lastNames[idx],
            gender: idx % 2 === 0 ? "MALE" : "FEMALE",
            dateOfBirth: new Date(
              2015 + Math.floor(idx / 8),
              (idx % 12),
              (idx % 28) + 1
            ),
            classId: cls.id,
            guardianName: `${lastNames[idx]} ${guardianRelations[idx % guardianRelations.length]}`,
            guardianPhone: `+254${700000000 + idx * 11111}`,
            guardianRelation: guardianRelations[idx % guardianRelations.length],
          },
        });
        studentCounter++;
      }
    }

    // 7. Create sample attendance for the past 5 school days
    const today = new Date();
    const statuses = ["PRESENT", "PRESENT", "PRESENT", "ABSENT", "LATE", "PRESENT", "PRESENT", "PRESENT"];

    for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      // Skip weekends
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const dateStr = d.toISOString().split("T")[0];

      const allStudents = await db.student.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, classId: true },
      });

      await Promise.all(
        allStudents.map((student, idx) =>
          db.attendance.create({
            data: {
              studentId: student.id,
              classId: student.classId,
              date: dateStr,
              status: statuses[idx % statuses.length],
              markedBy: admin.id,
            },
          })
        )
      );
    }

    return NextResponse.json({
      message: "Database seeded successfully with sample data",
      data: {
        users: 4,
        teachers: 3,
        classes: 6,
        subjects: 7,
        students: 48,
      },
    });
  } catch (error) {
    console.error("POST /api/seed error:", error);
    return NextResponse.json(
      { error: "Failed to seed database", details: String(error) },
      { status: 500 }
    );
  }
}
