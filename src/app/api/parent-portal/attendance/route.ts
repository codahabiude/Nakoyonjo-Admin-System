import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyRequest } from "@/lib/token-auth";

// GET /api/parent-portal/attendance?studentId=xxx
// Returns attendance history for a parent's child
export async function GET(req: Request) {
  try {
    const user = await verifyRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "PARENT") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get("studentId");
    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }

    // Verify this parent is linked to this student
    const parent = await db.parent.findUnique({
      where: { userId: user.id },
      include: { children: true },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent profile not found" }, { status: 404 });
    }

    const isLinked = parent.children.some((c) => c.studentId === studentId);
    if (!isLinked) {
      return NextResponse.json(
        { error: "This student is not linked to your account" },
        { status: 403 }
      );
    }

    // Fetch attendance records (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateStr = ninetyDaysAgo.toISOString().split("T")[0];

    const records = await db.attendance.findMany({
      where: { studentId, date: { gte: dateStr } },
      orderBy: { date: "desc" },
      select: { date: true, status: true },
    });

    // Compute summary stats
    const total = records.length;
    const present = records.filter((r) => r.status === "PRESENT").length;
    const absent = records.filter((r) => r.status === "ABSENT").length;
    const late = records.filter((r) => r.status === "LATE").length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    // Group by month for monthly summary
    const monthlySummary: Record<string, { present: number; absent: number; late: number; total: number }> = {};
    for (const r of records) {
      const month = r.date.substring(0, 7); // YYYY-MM
      if (!monthlySummary[month]) {
        monthlySummary[month] = { present: 0, absent: 0, late: 0, total: 0 };
      }
      monthlySummary[month].total++;
      if (r.status === "PRESENT") monthlySummary[month].present++;
      else if (r.status === "ABSENT") monthlySummary[month].absent++;
      else if (r.status === "LATE") monthlySummary[month].late++;
    }

    // Format monthly data for chart
    const monthlyData = Object.entries(monthlySummary)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        label: new Date(month + "-01").toLocaleDateString("en-KE", { year: "numeric", month: "short" }),
        ...data,
        rate: data.total > 0 ? Math.round(((data.present + data.late) / data.total) * 100) : 0,
      }));

    return NextResponse.json({
      records,
      summary: { total, present, absent, late, rate },
      monthlyData,
    });
  } catch (error) {
    console.error("GET /api/parent-portal/attendance error:", error);
    return NextResponse.json({ error: "Failed to fetch attendance" }, { status: 500 });
  }
}
