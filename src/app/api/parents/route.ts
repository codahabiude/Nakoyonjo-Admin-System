import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import bcrypt from "bcryptjs";

// GET /api/parents — list all parents (admin only)
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { user: { name: { contains: search } } },
        { phone: { contains: search } },
        { alternatePhone: { contains: search } },
      ];
    }

    const parents = await db.parent.findMany({
      where,
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
      orderBy: { createdAt: "desc" },
    });

    const result = parents.map((p) => ({
      id: p.id,
      name: p.user.name,
      email: p.user.email,
      phone: p.phone,
      alternatePhone: p.alternatePhone,
      nationalId: p.nationalId,
      address: p.address,
      children: p.children.map((c) => ({
        id: c.student.id,
        firstName: c.student.firstName,
        lastName: c.student.lastName,
        admissionNo: c.student.id,
        className: c.student.class.name,
        relation: c.relation,
      })),
      createdAt: p.createdAt,
    }));

    return NextResponse.json({ parents: result });
  } catch (error) {
    console.error("GET /api/parents error:", error);
    return NextResponse.json({ error: "Failed to fetch parents" }, { status: 500 });
  }
}

// POST /api/parents — create a parent account (admin only)
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
    const { name, phone, nationalId, alternatePhone, address, relation, studentIds } = body;

    if (!name || !phone) {
      return NextResponse.json(
        { error: "Name and phone are required" },
        { status: 400 }
      );
    }

    // Auto-generate email from phone
    const cleanPhone = phone.replace(/[^\d+]/g, "");
    const email = `parent_${cleanPhone.replace(/\+/g, "")}@nakoyonjo.ac.ke`;
    // Generate a secure random password (8 chars, alphanumeric)
    const password = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 8);
    const hashedPw = await bcrypt.hash(password, 10);

    // Create user + parent + links in a transaction
    const result = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          password: hashedPw,
          name,
          role: "PARENT",
          phone: cleanPhone,
        },
      });

      const newParent = await tx.parent.create({
        data: {
          userId: newUser.id,
          nationalId: nationalId || null,
          phone: cleanPhone,
          alternatePhone: alternatePhone || null,
          address: address || null,
        },
      });

      // Link to students
      if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
        const uniqueIds = [...new Set(studentIds)];
        for (const studentId of uniqueIds) {
          const studentExists = await tx.student.findUnique({ where: { id: studentId } });
          if (studentExists) {
            await tx.parentStudent.create({
              data: {
                parentId: newParent.id,
                studentId,
                relation: relation || "Parent",
              },
            });
          }
        }
      }

      // Fetch created children
      const children = await tx.parentStudent.findMany({
        where: { parentId: newParent.id },
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
      });

      return {
        id: newParent.id,
        name,
        email,
        phone: cleanPhone,
        nationalId: newParent.nationalId,
        alternatePhone: newParent.alternatePhone,
        address: newParent.address,
        children: children.map((c) => ({
          id: c.student.id,
          firstName: c.student.firstName,
          lastName: c.student.lastName,
          admissionNo: c.student.id,
          className: c.student.class.name,
          relation: c.relation,
        })),
        // Login credentials
        credentials: {
          email,
          password,
        },
      };
    });

    return NextResponse.json({ parent: result }, { status: 201 });
  } catch (error) {
    console.error("POST /api/parents error:", error);
    return NextResponse.json({ error: "Failed to create parent" }, { status: 500 });
  }
}
