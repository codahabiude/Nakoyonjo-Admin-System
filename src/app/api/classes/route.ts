import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/classes
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = user.role;
    const userId = user.id;

    let classes;
    if (userRole === "ADMIN") {
      classes = await db.class.findMany({
        include: {
          _count: { select: { students: true, subjects: true, teachers: true } },
          subjects: { include: { subject: true } },
          teachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
        },
        orderBy: [{ name: "asc" }],
      });
    } else {
      const teacher = await db.teacher.findUnique({
        where: { userId },
        include: {
          classes: {
            include: {
              class: {
                include: {
                  _count: { select: { students: true, subjects: true } },
                  subjects: { include: { subject: true } },
                },
              },
            },
          },
        },
      });
      // Flatten TeacherClass → Class, keeping isPrimary so the UI can show
      // which of the teacher's classes they are THE class teacher of.
      classes = teacher?.classes.map((tc) => ({ ...tc.class, isPrimary: tc.isPrimary })) || [];
    }

    return NextResponse.json({ classes });
  } catch (error) {
    console.error("GET /api/classes error:", error);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

// POST /api/classes (admin only)
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { name, academicYear, subjectIds } = body;

    if (!name) {
      return NextResponse.json({ error: "Class name is required" }, { status: 400 });
    }

    const newClass = await db.class.create({
      data: {
        name,
        academicYear: academicYear || String(new Date().getFullYear()),
        subjects: subjectIds?.length
          ? { create: subjectIds.map((subjectId: string) => ({ subjectId })) }
          : undefined,
      },
      include: {
        subjects: { include: { subject: true } },
        _count: { select: { students: true } },
      },
    });

    return NextResponse.json({ class: newClass }, { status: 201 });
  } catch (error) {
    console.error("POST /api/classes error:", error);
    return NextResponse.json({ error: "Failed to create class" }, { status: 500 });
  }
}
