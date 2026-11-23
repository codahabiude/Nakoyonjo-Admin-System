import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/teachers/profile — returns the logged-in teacher's own profile
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (user.role === "ADMIN") {
      return NextResponse.json({ error: "Not available for admin" }, { status: 403 });
    }

    const teacher = await db.teacher.findUnique({
      where: { userId: user.id },
      select: {
        employeeId: true,
        phone: true,
        qualification: true,
        dateJoined: true,
        user: { select: { email: true, name: true } },
      },
    });

    if (!teacher) {
      return NextResponse.json({ error: "Teacher profile not found" }, { status: 404 });
    }

    return NextResponse.json({
      employeeId: teacher.employeeId,
      phone: teacher.phone,
      qualification: teacher.qualification,
      dateJoined: teacher.dateJoined.toISOString(),
      email: teacher.user.email,
      name: teacher.user.name,
    });
  } catch (error) {
    console.error("GET /api/teachers/profile error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
