// Central school-settings loader.
//
// Settings live in the SchoolSetting key/value table and are edited by the
// admin in SettingsView. This helper is the single place that turns those
// rows into typed values with sensible fallbacks, so every consumer
// (report cards, PDFs, Excel exports, SMS, exam validation) reads the SAME
// data and honors admin edits immediately (no caching).

import { db } from "./db";

export interface SchoolInfo {
  schoolName: string;
  schoolMotto: string;
  schoolPhone: string;
  schoolAddress: string;
  headTeacherName: string;
  /** Raw ISO dates (YYYY-MM-DD) keyed "term1_start" … "term3_end". */
  termDates: Record<string, string>;
}

const DEFAULT_SCHOOL_NAME = "Nakoyonjo DEB Primary School";
const DEFAULT_SCHOOL_ADDRESS = "Bungoma, Kenya";

const TERM_DATE_KEYS = [
  "term1_start", "term1_end",
  "term2_start", "term2_end",
  "term3_start", "term3_end",
] as const;

/** Load every school setting in ONE query and apply defaults. */
export async function getSchoolInfo(): Promise<SchoolInfo> {
  const rows = await db.schoolSetting.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    schoolName: (map.school_name || DEFAULT_SCHOOL_NAME).trim(),
    schoolMotto: (map.school_motto || "").trim(),
    schoolPhone: (map.school_phone || "").trim(),
    schoolAddress: (map.school_address || DEFAULT_SCHOOL_ADDRESS).trim(),
    headTeacherName: (map.head_teacher_name || "").trim(),
    termDates: Object.fromEntries(TERM_DATE_KEYS.map((k) => [k, map[k] || ""])),
  };
}

/**
 * Resolve the calendar range for a term name like "Term 1" (case/space
 * tolerant, e.g. "term 2"). Returns nulls when the admin has not set dates.
 */
export function termRangeFor(
  term: string,
  termDates: Record<string, string>
): { start: Date | null; end: Date | null; startRaw: string; endRaw: string } {
  const m = /term\s*([1-3])/i.exec(term || "");
  const n = m ? m[1] : null;
  if (!n) return { start: null, end: null, startRaw: "", endRaw: "" };

  const startRaw = termDates[`term${n}_start`] || "";
  const endRaw = termDates[`term${n}_end`] || "";
  const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
  const end = endRaw ? new Date(`${endRaw}T23:59:59`) : null;

  return { start, end, startRaw, endRaw };
}

/** Human range for report cards, e.g. "06 Jan 2026 – 04 Apr 2026" ("" if unset). */
export function formatTermRange(
  term: string,
  termDates: Record<string, string>
): string {
  const { startRaw, endRaw } = termRangeFor(term, termDates);
  if (!startRaw && !endRaw) return "";

  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  };

  if (startRaw && endRaw) return `${fmt(startRaw)} – ${fmt(endRaw)}`;
  return fmt(startRaw || endRaw);
}

/**
 * Validate an exam date against the term calendar from settings.
 * Returns an error message when the date is OUTSIDE the term, otherwise "".
 * Skips validation when the admin has not configured the term dates.
 */
export function examDateOutsideTerm(
  term: string,
  examDate: Date,
  termDates: Record<string, string>
): string {
  const { start, end } = termRangeFor(term, termDates);
  if (!start || !end) return ""; // dates not configured → don't block
  if (examDate < start || examDate > end) {
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
    return `Exam date ${fmt(examDate)} is outside the ${term} calendar (${fmt(start)} – ${fmt(end)}). Adjust the date or update Term Dates in Settings.`;
  }
  return "";
}
