import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/parents/[id] — get single parent with children
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parent = await db.parent.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        children: {
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                class: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    return NextResponse.json({
      parent: {
        id: parent.id,
        name: parent.user.name,
        email: parent.user.email,
        phone: parent.phone,
        alternatePhone: parent.alternatePhone,
        nationalId: parent.nationalId,
        address: parent.address,
        children: parent.children.map((c) => ({
          id: c.student.id,
          firstName: c.student.firstName,
          lastName: c.student.lastName,
          admissionNo: c.student.id,
          className: c.student.class.name,
          relation: c.relation,
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/parents/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch parent" }, { status: 500 });
  }
}

// PATCH /api/parents/[id] — update parent info
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, phone, alternatePhone, nationalId, address, studentIds, relation } = body;

    const parent = await db.parent.findUnique({ where: { id } });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    const result = await db.$transaction(async (tx) => {
      // Update user name if provided
      if (name) {
        await tx.user.update({ where: { id: parent.userId }, data: { name } });
      }

      // Update parent fields
      const updateData: Record<string, unknown> = {};
      if (phone) updateData.phone = phone;
      if (alternatePhone !== undefined) updateData.alternatePhone = alternatePhone || null;
      if (nationalId !== undefined) updateData.nationalId = nationalId || null;
      if (address !== undefined) updateData.address = address || null;

      if (Object.keys(updateData).length > 0) {
        await tx.parent.update({ where: { id }, data: updateData });
      }

      // Update student links if provided
      if (studentIds && Array.isArray(studentIds)) {
        // Delete existing links
        await tx.parentStudent.deleteMany({ where: { parentId: id } });
        // Create new links
        const uniqueIds = [...new Set(studentIds)];
        for (const studentId of uniqueIds) {
          const studentExists = await tx.student.findUnique({ where: { id: studentId } });
          if (studentExists) {
            await tx.parentStudent.create({
              data: {
                parentId: id,
                studentId,
                relation: relation || "Parent",
              },
            });
          }
        }
      }

      // Fetch updated parent
      const updated = await tx.parent.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          children: {
            include: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  class: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      return updated!;
    });

    return NextResponse.json({
      parent: {
        id: result.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.phone,
        alternatePhone: result.alternatePhone,
        nationalId: result.nationalId,
        address: result.address,
        children: result.children.map((c) => ({
          id: c.student.id,
          firstName: c.student.firstName,
          lastName: c.student.lastName,
          admissionNo: c.student.id,
          className: c.student.class.name,
          relation: c.relation,
        })),
      },
    });
  } catch (error) {
    console.error("PATCH /api/parents/[id] error:", error);
    return NextResponse.json({ error: "Failed to update parent" }, { status: 500 });
  }
}

// DELETE /api/parents/[id] — remove parent and their user account
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const parent = await db.parent.findUnique({ where: { id } });
    if (!parent) {
      return NextResponse.json({ error: "Parent not found" }, { status: 404 });
    }

    // Delete parent (cascades to user via onDelete: Cascade)
    await db.parent.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/parents/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete parent" }, { status: 500 });
  }
}
