import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/settings/public — PUBLIC branding endpoint.
//
// The login screen and app shell need the school's identity BEFORE the user
// authenticates (sidebar brand, login header, browser tab title), so this
// route intentionally requires NO token. Only non-sensitive display fields
// are exposed — term dates and any future internal settings stay private to
// the admin-only /api/settings route.
const PUBLIC_KEYS = [
  "school_name",
  "school_motto",
  "school_phone",
  "school_address",
  "head_teacher_name",
] as const;

export async function GET(req: NextRequest) {
  try {
    const rows = await db.schoolSetting.findMany({
      where: { key: { in: [...PUBLIC_KEYS] } },
    });
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return NextResponse.json(
      {
        schoolName: (map.school_name || "").trim(),
        motto: (map.school_motto || "").trim(),
        phone: (map.school_phone || "").trim(),
        address: (map.school_address || "").trim(),
        headTeacher: (map.head_teacher_name || "").trim(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/settings/public error:", error);
    return NextResponse.json({ error: "Failed to fetch branding" }, { status: 500 });
  }
}
