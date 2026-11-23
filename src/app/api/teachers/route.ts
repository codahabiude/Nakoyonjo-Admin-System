import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/teachers — staff roster (admin only: contains all staff emails/phones)
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const teachers = await db.teacher.findMany({
      include: {
        user: { select: { email: true, name: true, role: true, isActive: true } },
        classes: { include: { class: true } },
        subjects: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            class: { select: { id: true, name: true } },
          },
          orderBy: [{ class: { name: "asc" } }, { subject: { code: "asc" } }],
        },
      },
      orderBy: { dateJoined: "desc" },
    });

    return NextResponse.json({ teachers });
  } catch (error) {
    console.error("GET /api/teachers error:", error);
    return NextResponse.json({ error: "Failed to fetch teachers" }, { status: 500 });
  }
}

// POST /api/teachers — create teacher + user account (admin only)
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
    const {
      name,
      email,
      password,
      phone,
      qualification,
      classIds,
      primaryClassId, // optional: class this teacher will lead as CLASS TEACHER
    } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await db.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    // Generate employee ID — derive from the highest existing number so
    // deleting a teacher never causes TCH-xxx collisions.
    const lastTeachers = await db.teacher.findMany({
      orderBy: { employeeId: "desc" },
      take: 1,
      select: { employeeId: true },
    });
    const lastNum = parseInt(lastTeachers[0]?.employeeId?.replace("TCH-", "") || "0", 10);
    const employeeId = `TCH-${String((isNaN(lastNum) ? 0 : lastNum) + 1).padStart(3, "0")}`;

    const hashedPassword = await bcrypt.hash(password, 10);

    // Class-teacher assignment implies membership of that class, so merge it
    // into the class list. If no primaryClassId is given the teacher is a
    // REGULAR teacher for every class they are assigned to.
    const hasPrimary = typeof primaryClassId === "string" && primaryClassId.length > 0;
    const uniqueClassIds = [
      ...new Set([
        ...(Array.isArray(classIds) ? (classIds as string[]) : []),
        ...(hasPrimary ? [primaryClassId as string] : []),
      ]),
    ];

    // Validate class ids BEFORE creating anything (clean 400, not Prisma P2003)
    if (uniqueClassIds.length > 0) {
      const existingClasses = await db.class.count({ where: { id: { in: uniqueClassIds } } });
      if (existingClasses !== uniqueClassIds.length) {
        return NextResponse.json({ error: "One or more class IDs do not exist" }, { status: 400 });
      }
    }

    // BUSINESS RULE: a class can have only ONE class teacher. Demote any
    // other teacher currently flagged as primary for this class.
    if (hasPrimary) {
      await db.teacherClass.updateMany({
        where: { classId: primaryClassId as string, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const teacher = await db.teacher.create({
      data: {
        employeeId,
        phone,
        qualification,
        user: {
          create: {
            email,
            password: hashedPassword,
            name,
            role: "TEACHER",
          },
        },
        classes: uniqueClassIds.length
          ? {
              create: uniqueClassIds.map((classId) => ({
                classId,
                isPrimary: hasPrimary && classId === primaryClassId,
              })),
            }
          : undefined,
      },
      include: {
        user: { select: { email: true, name: true, role: true } },
        classes: { include: { class: true } },
        subjects: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ teacher }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/teachers error:", error);
    // Unique constraint (email raced in) / FK violation (bad classId) → clean 4xx, not 500
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2003"
    ) {
      return NextResponse.json({ error: "One or more class IDs do not exist" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create teacher" }, { status: 500 });
  }
}
