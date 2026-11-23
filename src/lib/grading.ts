import { db } from "./db";

// ============================================================
// FIXED 8-LEVEL CBC POINTS SCALE (Kenyan CBC Standard)
// Used for points-based ranking — always applies regardless of
// the custom grading scheme configured in the database.
// ============================================================

export const CBC_POINTS_SCALE = [
  { minMarks: 90, maxMarks: 100, grade: "EE1", remark: "Exceeding Expectations", points: 8 },
  { minMarks: 75, maxMarks: 89,  grade: "EE2", remark: "Exceeding Expectations", points: 7 },
  { minMarks: 58, maxMarks: 74,  grade: "ME1", remark: "Meeting Expectations",  points: 6 },
  { minMarks: 41, maxMarks: 57,  grade: "ME2", remark: "Meeting Expectations",  points: 5 },
  { minMarks: 31, maxMarks: 40,  grade: "AE1", remark: "Approaching Expectations", points: 4 },
  { minMarks: 21, maxMarks: 30,  grade: "AE2", remark: "Approaching Expectations", points: 3 },
  { minMarks: 11, maxMarks: 20,  grade: "BE1", remark: "Below Expectations", points: 2 },
  { minMarks: 0,  maxMarks: 10,  grade: "BE2", remark: "Below Expectations", points: 1 },
] as const;

/**
 * Normalize a raw mark to a percentage out of 100 before grading.
 * All CBC scales assume a 0–100 range; exams with maxMarks ≠ 100 must be
 * converted first or every grade/point would be wrong.
 */
function toPercent(marks: number, maxMarks: number = 100): number {
  if (!Number.isFinite(marks)) return 0;
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) return 0;
  if (maxMarks === 100) return marks;
  return (marks / maxMarks) * 100;
}

/**
 * Returns the CBC points (1-8) for a given mark.
 * Accepts an optional maxMarks (defaults to 100) and converts to a
 * percentage first. Uses the fixed Kenyan CBC 8-level scale and is NOT
 * affected by custom grading schemes configured in the database.
 */
export function getPointsFromMarks(marks: number, maxMarks: number = 100): number {
  const pct = toPercent(marks, maxMarks);
  for (const level of CBC_POINTS_SCALE) {
    if (pct >= level.minMarks && pct <= level.maxMarks) return level.points;
  }
  return 0;
}

/**
 * Returns the detailed CBC grade (e.g. "EE1", "ME2") and points for a mark.
 * Accepts an optional maxMarks (defaults to 100). Uses the fixed 8-level CBC scale.
 */
export function getDetailedGrade(marks: number, maxMarks: number = 100): { grade: string; remark: string; points: number } {
  const pct = toPercent(marks, maxMarks);
  for (const level of CBC_POINTS_SCALE) {
    if (pct >= level.minMarks && pct <= level.maxMarks) {
      return { grade: level.grade, remark: level.remark, points: level.points };
    }
  }
  return { grade: "-", remark: "", points: 0 };
}

/**
 * Returns a color key for a given grade code.
 * Works with both 4-level (EE, ME, AE, BE) and 8-level (EE1, EE2, ME1, etc.) codes.
 */
export function getGradeColorKey(grade: string): "EE" | "ME" | "AE" | "BE" {
  if (grade.startsWith("EE")) return "EE";
  if (grade.startsWith("ME")) return "ME";
  if (grade.startsWith("AE")) return "AE";
  return "BE";
}

// ============================================================
// DYNAMIC GRADING SCHEME (from database)
// ============================================================

// In-memory cache for the active grading scheme (refreshed per request cycle)
let cachedGrades: { minMarks: number; maxMarks: number; grade: string; remark: string | null; sortOrder: number }[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

// Fallback used when no scheme exists in the DB — cached too, otherwise
// every single mark graded hits the database (N+1 in report builders).
const CBC_FALLBACK_RULES = [
  { minMarks: 90, maxMarks: 100, grade: "EE1", remark: "Exceeding Expectations", sortOrder: 7 },
  { minMarks: 75, maxMarks: 89,  grade: "EE2", remark: "Exceeding Expectations", sortOrder: 6 },
  { minMarks: 58, maxMarks: 74,  grade: "ME1", remark: "Meeting Expectations",  sortOrder: 5 },
  { minMarks: 41, maxMarks: 57,  grade: "ME2", remark: "Meeting Expectations",  sortOrder: 4 },
  { minMarks: 31, maxMarks: 40,  grade: "AE1", remark: "Approaching Expectations", sortOrder: 3 },
  { minMarks: 21, maxMarks: 30,  grade: "AE2", remark: "Approaching Expectations", sortOrder: 2 },
  { minMarks: 11, maxMarks: 20,  grade: "BE1", remark: "Below Expectations", sortOrder: 1 },
  { minMarks: 0,  maxMarks: 10,  grade: "BE2", remark: "Below Expectations", sortOrder: 0 },
];

export async function getActiveGradingRules() {
  const now = Date.now();
  if (cachedGrades && now - cacheTime < CACHE_TTL) return cachedGrades;

  const scheme = await db.gradingScheme.findFirst({
    where: { isActive: true },
    include: { grades: { orderBy: { sortOrder: "desc" } } },
  });

  if (!scheme || scheme.grades.length === 0) {
    // Fallback to Kenyan CBC 8-level performance levels if no scheme exists
    return CBC_FALLBACK_RULES;
  }

  cachedGrades = scheme.grades.map((g) => ({
    minMarks: g.minMarks,
    maxMarks: g.maxMarks,
    grade: g.grade,
    remark: g.remark,
    sortOrder: g.sortOrder,
  }));
  cacheTime = now;
  return cachedGrades!;
}

export async function getGradeFromMarks(
  marks: number,
  maxMarks: number = 100
): Promise<{ grade: string; remark: string | null }> {
  const pct = toPercent(marks, maxMarks);
  const rules = await getActiveGradingRules();
  for (const rule of rules) {
    if (pct >= rule.minMarks && pct <= rule.maxMarks) {
      return { grade: rule.grade, remark: rule.remark };
    }
  }
  return { grade: "-", remark: null };
}

// Invalidate cache (call after creating/updating/activating a scheme)
export function invalidateGradingCache() {
  cachedGrades = null;
  cacheTime = 0;
}

/**
 * Validate that a set of grade rules has no overlapping or gapped ranges.
 * Returns an error message string if invalid, or null if valid.
 *
 * Rules are sorted by minMarks descending before validation.
 * Each rule's range must not overlap with any other rule,
 * and the rules should ideally cover 0–100 without gaps.
 */
export function validateGradingRanges(
  grades: { minMarks: number; maxMarks: number; grade: string }[]
): string | null {
  // Empty array would crash the sorted[0] access below — treat as invalid input
  if (!Array.isArray(grades) || grades.length === 0) {
    return "At least one grading rule is required";
  }

  // Check individual ranges
  for (const g of grades) {
    if (g.minMarks > g.maxMarks) {
      return `"${g.grade}": min (${g.minMarks}) is greater than max (${g.maxMarks})`;
    }
    if (g.minMarks < 0 || g.maxMarks > 100) {
      return `"${g.grade}": marks must be between 0 and 100`;
    }
  }

  // Sort by minMarks descending to check for overlaps
  const sorted = [...grades].sort((a, b) => b.minMarks - a.minMarks);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // Overlap: current's min falls within next's range
    if (current.minMarks <= next.maxMarks) {
      return `"${current.grade}" (${current.minMarks}–${current.maxMarks}) overlaps with "${next.grade}" (${next.minMarks}–${next.maxMarks})`;
    }

    // Gap: current's min starts more than 1 above next's max
    if (current.minMarks > next.maxMarks + 1) {
      return `Gap between "${current.grade}" (${current.maxMarks}) and "${next.grade}" (${next.minMarks}) — range ${next.maxMarks + 1}–${current.minMarks - 1} is uncovered`;
    }
  }

  // Check coverage: highest max should be 100, lowest min should be 0
  if (sorted[0].maxMarks < 100) {
    return `Highest range ends at ${sorted[0].maxMarks}, expected 100`;
  }
  if (sorted[sorted.length - 1].minMarks > 0) {
    return `Lowest range starts at ${sorted[sorted.length - 1].minMarks}, expected 0`;
  }

  return null; // valid
}
