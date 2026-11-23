import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required" }, { status: 400 });
    }
    // Must be strings — bcrypt.compare/hash throws on non-string input
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json({ error: "Passwords must be text" }, { status: 400 });
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }
    if (newPassword.length > 50) {
      return NextResponse.json({ error: "New password must be less than 50 characters" }, { status: 400 });
    }

    // Fetch the user's current hashed password
    const dbUser = await db.user.findUnique({ where: { id: user.id }, select: { password: true } });
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, dbUser.password);
    if (!isValid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    // Don't allow reusing the same password
    const isSame = await bcrypt.compare(newPassword, dbUser.password);
    if (isSame) {
      return NextResponse.json({ error: "New password must be different from current password" }, { status: 400 });
    }

    // Hash and save the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    return NextResponse.json({ ok: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("POST /api/auth/change-password error:", error);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
