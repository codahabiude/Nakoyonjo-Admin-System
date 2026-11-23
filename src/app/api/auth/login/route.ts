import { NextRequest, NextResponse } from "next/server";
import { authenticateCredentials, signToken } from "@/lib/token-auth";

export async function POST(req: NextRequest) {
  try {
    let body: { email?: unknown; password?: unknown };
    try {
      body = await req.json();
    } catch {
      // Malformed / empty JSON body → 400, not a 500
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }
    const { email, password } = body ?? {};
    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await authenticateCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = await signToken(user);
    return NextResponse.json({ ok: true, token, user });
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { ok: false, error: "Login failed" },
      { status: 500 }
    );
  }
}
