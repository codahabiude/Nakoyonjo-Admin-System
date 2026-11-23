import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import { validateGradingRanges, invalidateGradingCache } from "@/lib/grading";

// GET /api/grading/:id — get single scheme
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const { id } = await params;
    const scheme = await db.gradingScheme.findUnique({
      where: { id },
      include: { grades: { orderBy: { sortOrder: "desc" } } },
    });
    if (!scheme) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });

    return NextResponse.json({ scheme });
  } catch (error) {
    console.error("GET /api/grading/:id error:", error);
    return NextResponse.json({ error: "Failed to fetch scheme" }, { status: 500 });
  }
}

// PATCH /api/grading/:id — update scheme or activate it
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const { id } = await params;
    const body = await req.json();
    const { name, description, grades, makeActive } = body;

    const existing = await db.gradingScheme.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });

    // If new grades provided, validate them FIRST — before deactivating
    // anything — so a validation failure can never leave all schemes inactive.
    if (grades !== undefined) {
      if (!Array.isArray(grades) || grades.length === 0) {
        return NextResponse.json(
          { error: "grades must be a non-empty array of grading rules" },
          { status: 400 }
        );
      }
      // Coerce numeric fields (strings like "90" would break comparisons)
      for (const g of grades as Record<string, unknown>[]) {
        g.minMarks = Number(g.minMarks);
        g.maxMarks = Number(g.maxMarks);
        g.sortOrder = Number(g.sortOrder ?? 0) || 0;
        if (!Number.isFinite(g.minMarks) || !Number.isFinite(g.maxMarks)) {
          return NextResponse.json(
            { error: `Grading rule "${g.grade ?? "?"}" has non-numeric min/max marks` },
            { status: 400 }
          );
        }
      }
      const validationError = validateGradingRanges(grades as { minMarks: number; maxMarks: number; grade: string }[]);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }
    }

    // Deactivate + update + replace rules in ONE transaction so a mid-way
    // failure can never leave the scheme inactive or rule-less.
    const scheme = await db.$transaction(async (tx) => {
      // If activating this scheme, deactivate all others
      if (makeActive) {
        await tx.gradingScheme.updateMany({ where: { isActive: true }, data: { isActive: false } });
      }

      // Update scheme fields
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (makeActive !== undefined) updateData.isActive = makeActive;

      await tx.gradingScheme.update({
        where: { id },
        data: updateData,
      });

      // Replace all rules if new grades provided
      if (grades && Array.isArray(grades)) {
        await tx.gradeRule.deleteMany({ where: { schemeId: id } });
        for (const g of grades as { minMarks: number; maxMarks: number; grade: string; remark?: string; sortOrder?: number }[]) {
          await tx.gradeRule.create({
            data: {
              schemeId: id,
              minMarks: g.minMarks,
              maxMarks: g.maxMarks,
              grade: g.grade,
              remark: g.remark || null,
              sortOrder: g.sortOrder ?? 0,
            },
          });
        }
      }

      return tx.gradingScheme.findUnique({
        where: { id },
        include: { grades: { orderBy: { sortOrder: "desc" } } },
      });
    });

    invalidateGradingCache();

    return NextResponse.json({ scheme });
  } catch (error) {
    console.error("PATCH /api/grading/:id error:", error);
    return NextResponse.json({ error: "Failed to update scheme" }, { status: 500 });
  }
}

// DELETE /api/grading/:id — delete scheme
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const { id } = await params;
    const existing = await db.gradingScheme.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Scheme not found" }, { status: 404 });

    // Don't delete if it's the only active scheme
    if (existing.isActive) {
      const count = await db.gradingScheme.count({ where: { isActive: true } });
      if (count <= 1) {
        return NextResponse.json({ error: "Cannot delete the only active grading scheme. Activate another one first." }, { status: 400 });
      }
    }

    await db.gradingScheme.delete({ where: { id } });
    invalidateGradingCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/grading/:id error:", error);
    return NextResponse.json({ error: "Failed to delete scheme" }, { status: 500 });
  }
}
