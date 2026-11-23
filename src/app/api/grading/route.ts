import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { validateGradingRanges, invalidateGradingCache } from "@/lib/grading";

// GET /api/grading — list all schemes with their rules
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const schemes = await db.gradingScheme.findMany({
      include: {
        grades: { orderBy: { sortOrder: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ schemes });
  } catch (error) {
    console.error("GET /api/grading error:", error);
    return NextResponse.json({ error: "Failed to fetch grading schemes" }, { status: 500 });
  }
}

// POST /api/grading — create a new grading scheme with rules
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json();
    const { name, description, grades, makeActive } = body;

    if (!name || !grades || !Array.isArray(grades) || grades.length === 0) {
      return NextResponse.json({ error: "Name and at least one performance level are required" }, { status: 400 });
    }

    // Validate each grade rule
    for (const g of grades) {
      if (g.minMarks === undefined || g.maxMarks === undefined || !g.grade) {
        return NextResponse.json({ error: "Each performance level needs minMarks, maxMarks, and a level code (e.g. EE, ME, AE, BE)" }, { status: 400 });
      }
    }

    // Validate no overlapping ranges or gaps
    const validationError = validateGradingRanges(grades);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // If making this active, deactivate all others in a transaction to prevent race condition
    let scheme;
    const gradesData = grades.map((g: { minMarks: number; maxMarks: number; grade: string; remark?: string; sortOrder?: number }, i: number) => ({
      minMarks: g.minMarks,
      maxMarks: g.maxMarks,
      grade: g.grade,
      remark: g.remark || null,
      sortOrder: g.sortOrder ?? i,
    }));

    if (makeActive) {
      const result = await db.$transaction([
        db.gradingScheme.updateMany({ where: { isActive: true }, data: { isActive: false } }),
        db.gradingScheme.create({
          data: { name, description: description || null, isActive: true, grades: { create: gradesData } },
          include: { grades: { orderBy: { sortOrder: "desc" } } },
        }),
      ]);
      scheme = result[1];
    } else {
      scheme = await db.gradingScheme.create({
        data: { name, description: description || null, isActive: false, grades: { create: gradesData } },
        include: { grades: { orderBy: { sortOrder: "desc" } } },
      });
    }

    invalidateGradingCache();

    return NextResponse.json({ scheme }, { status: 201 });
  } catch (error) {
    console.error("POST /api/grading error:", error);
    return NextResponse.json({ error: "Failed to create grading scheme" }, { status: 500 });
  }
}
