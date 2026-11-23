import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { verifyRequest } from "@/lib/token-auth";

// POST /api/teachers/reset-password — Admin resets a teacher's password
export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    const body = await req.json();
    const { teacherId, newPassword } = body;

    if (!teacherId || !newPassword) {
      return NextResponse.json(
        { error: "Teacher ID and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 4) {
      return NextResponse.json(
        { error: "Password must be at least 4 characters" },
        { status: 400 }
      );
    }

    // Find the teacher to get the associated userId
    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: teacher.userId },
      data: { password: hashedPassword },
    });

    return NextResponse.json({
      message: "Password reset successfully",
      teacher: {
        id: teacher.id,
        name: teacher.user.name,
        email: teacher.user.email,
      },
    });
  } catch (error) {
    console.error("POST /api/teachers/reset-password error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
