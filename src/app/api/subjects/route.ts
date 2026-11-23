import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/subjects
export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const subjects = await db.subject.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { classes: true } } },
    });

    return NextResponse.json({ subjects });
  } catch (error) {
    console.error("GET /api/subjects error:", error);
    return NextResponse.json({ error: "Failed to fetch subjects" }, { status: 500 });
  }
}

// POST /api/subjects (admin only)
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
    const { code, name, category, description } = body;

    if (!code || !name) {
      return NextResponse.json(
        { error: "Code and name are required" },
        { status: 400 }
      );
    }

    const subject = await db.subject.create({
      data: { code, name, category: category || "CORE", description },
    });

    return NextResponse.json({ subject }, { status: 201 });
  } catch (error) {
    console.error("POST /api/subjects error:", error);
    return NextResponse.json({ error: "Failed to create subject" }, { status: 500 });
  }
}