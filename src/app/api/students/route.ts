import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/students — list all students (admin) or only assigned class students (teacher)
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get("classId");
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    let page = parseInt(searchParams.get("page") || "1");
    let limit = parseInt(searchParams.get("limit") || "50");

    // Bug 2: Handle NaN from invalid pagination params
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;

    const userRole = user.role;

    // Build where clause
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }
    if (status) where.status = status;

    // If teacher, restrict to their assigned classes
    if (userRole === "TEACHER") {
      const teacher = await db.teacher.findUnique({
        where: { userId: user.id },
        include: { classes: { select: { classId: true } } },
      });
      const classIds = teacher?.classes.map((c) => c.classId) || [];

      if (classId) {
        // Bug 1: Verify the requested classId belongs to this teacher
        if (!classIds.includes(classId)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        where.classId = classId;
      } else {
        // Default to all of the teacher's classes
        if (classIds.length > 0) {
          where.classId = { in: classIds };
        } else {
          // Teacher has no classes, return empty
          return NextResponse.json({
            students: [],
            pagination: { page, limit, total: 0, pages: 0 },
          });
        }
      }
    } else {
      // Admin: apply classId filter if provided
      if (classId) where.classId = classId;
    }

    const [students, total] = await Promise.all([
      db.student.findMany({
        where,
        include: { class: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.student.count({ where }),
    ]);

    return NextResponse.json({
      students,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /api/students error:", error);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

// POST /api/students — create a new student (admin only)
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
      firstName,
      lastName,
      dateOfBirth,
      gender,
      classId,
      guardianName,
      guardianPhone,
      guardianRelation,
      guardianIdNumber,
    } = body;

    if (!firstName || !lastName || !classId) {
      return NextResponse.json(
        { error: "First name, last name, and class are required" },
        { status: 400 }
      );
    }

    // Validate classId exists (FK target) → clean 400, not a Prisma 500
    const cls = await db.class.findUnique({ where: { id: classId } });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 400 });
    }
    // Reject unparseable dateOfBirth
    if (dateOfBirth) {
      const d = new Date(dateOfBirth);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid date of birth" }, { status: 400 });
      }
    }

    const student = await db.student.create({
      data: {
        firstName,
        lastName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        gender: gender || "UNKNOWN",
        classId,
        guardianName,
        guardianPhone,
        guardianRelation,
        guardianIdNumber,
      },
      include: { class: true },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (error) {
    console.error("POST /api/students error:", error);
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
  }
}
