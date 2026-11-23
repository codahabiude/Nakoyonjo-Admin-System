/**
 * E2E test: Settings actually take effect across the system.
 * - school info flows into report card data (/api/marks)
 * - public branding endpoint (/api/settings/public) drives sidebar/login/tab
 * - dynamic PWA manifest (/manifest.webmanifest) follows the school name
 * - term date validation blocks exams outside the term calendar
 * - term range is included in report payloads
 * Creates its own temp admin + exam, restores previous settings, cleans up.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const zlib = require("zlib");

const BASE = process.argv[2] || "http://localhost:3210";
const db = new PrismaClient();
const STAMP = Date.now();
const ADMIN_EMAIL = `settings-test-admin-${STAMP}@local.test`;
/** All settings the test writes — used to detect which keys it introduced. */
const NEW_TEST_SETTINGS = {
  school_name: "Test Academy Kenya",
  school_motto: "Knowledge Is Light",
  school_phone: "+254700111222",
  school_address: "Test Town, Kenya",
  head_teacher_name: "Mrs. Test Head",
  term1_start: "2026-01-05",
  term1_end: "2026-04-03",
};
const results = [];
let adminUser = null;
let createdExamId = null;
let previousSettings = {};
/** Keys the test itself introduced (absent before) → must be DELETED after. */
let introducedKeys = [];

function check(name, cond, extra = "") {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  [" + extra + "]" : ""}`);
}

/**
 * Extract searchable text from a PDF.
 * pdfkit compresses content streams (FlateDecode) AND encodes text as hex
 * runs (<4e616d65...>) inside kerned TJ arrays — so inflate the streams,
 * then decode every hex run in order into plain ASCII.
 */
function extractPdfText(buf) {
  const streams = [];
  let idx = 0;
  while (true) {
    const start = buf.indexOf("stream", idx);
    if (start === -1) break;
    const end = buf.indexOf("endstream", start);
    if (end === -1) break;
    // Skip the EOL right after the "stream" keyword (could be \n, \r\n).
    let p = start + 6;
    while (p < buf.length && (buf[p] === 13 || buf[p] === 10)) p++;
    try { streams.push(zlib.inflateSync(buf.slice(p, end)).toString("latin1")); } catch {}
    idx = end + 9;
  }
  const content = streams.join("\n") + "\n" + buf.toString("latin1");

  let out = "";
  const re = /<([0-9A-Fa-f]+)>/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const h = m[1];
    for (let i = 0; i + 1 < h.length; i += 2) {
      out += String.fromCharCode(parseInt(h.substr(i, 2), 16));
    }
  }
  return out + "\n" + content;
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function main() {
  // ---- setup: temp admin ----
  adminUser = await db.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: await bcrypt.hash("test-admin-pw", 10),
      name: "Settings Test Admin",
      role: "ADMIN",
    },
  });
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: "test-admin-pw" },
  });
  check("login as temp admin", login.status === 200 && login.json?.token);
  const token = login.json?.token;
  if (!token) throw new Error("no token");

  // ---- capture previous settings for restore ----
  const prev = await api("/api/settings", { token });
  previousSettings = prev.json?.settings || {};
  // Any test key NOT present beforehand must be deleted on cleanup —
  // otherwise the test value leaks into the live system.
  introducedKeys = Object.keys(NEW_TEST_SETTINGS).filter(
    (k) => !(k in previousSettings)
  );

  // ---- TEST 1: save settings ----
  const newSettings = NEW_TEST_SETTINGS;
  const putRes = await api("/api/settings", {
    method: "PUT",
    token,
    body: {
      settings: Object.entries(newSettings).map(([key, value]) => ({ key, value })),
    },
  });
  check("PUT /api/settings → 200", putRes.status === 200);

  const getRes = await api("/api/settings", { token });
  check(
    "settings round-trip (school_name persisted)",
    getRes.json?.settings?.school_name === "Test Academy Kenya"
  );

  // ---- TEST 1b: PUBLIC branding endpoint (no auth) drives the system UI ----
  const pub = await api("/api/settings/public");
  check("GET /api/settings/public without token → 200", pub.status === 200);
  check(
    "public endpoint reflects new school name (sidebar/login source)",
    pub.json?.schoolName === "Test Academy Kenya",
    pub.json?.schoolName || ""
  );
  check(
    "public endpoint carries motto/address/phone/head teacher",
    pub.json?.motto === "Knowledge Is Light" &&
      pub.json?.address === "Test Town, Kenya" &&
      pub.json?.phone === "+254700111222" &&
      pub.json?.headTeacher === "Mrs. Test Head"
  );
  check(
    "public endpoint exposes ONLY branding (no term dates leaked)",
    pub.json && Object.keys(pub.json).every((k) =>
      ["schoolName", "motto", "phone", "address", "headTeacher"].includes(k)
    )
  );

  // ---- TEST 1c: dynamic PWA manifest follows the school name ----
  const mfRes = await fetch(BASE + "/manifest.webmanifest");
  let mf = null;
  try { mf = await mfRes.json(); } catch {}
  check("GET /manifest.webmanifest → 200 JSON", mfRes.status === 200 && !!mf);
  check(
    "manifest name follows configured school name",
    typeof mf?.name === "string" && mf.name.startsWith("Test Academy"),
    mf?.name || ""
  );
  check(
    "manifest short_name follows configured school name",
    typeof mf?.short_name === "string" && mf.short_name.startsWith("Test Academy"),
    mf?.short_name || ""
  );
  check(
    "manifest keeps PWA icons",
    Array.isArray(mf?.icons) && mf.icons.length >= 2
  );

  // ---- TEST 2: exam INSIDE term 1 calendar → accepted ----
  const classRow = await db.class.findFirst();
  if (!classRow) throw new Error("no classes in DB");
  const examIn = await api("/api/exams", {
    method: "POST",
    token,
    body: {
      name: `Settings Exam In ${STAMP}`,
      term: "Term 1",
      year: "2026",
      classId: classRow.id,
      examDate: "2026-02-10",
    },
  });
  createdExamId = examIn.json?.exam?.id;
  check("exam dated INSIDE term1 → 201", examIn.status === 201);

  // ---- TEST 3: exam OUTSIDE term 1 calendar → 400 with clear message ----
  const examOut = await api("/api/exams", {
    method: "POST",
    token,
    body: {
      name: `Settings Exam Out ${STAMP}`,
      term: "Term 1",
      year: "2026",
      classId: classRow.id,
      examDate: "2026-08-10",
    },
  });
  check("exam dated OUTSIDE term1 → 400", examOut.status === 400);
  check(
    "rejection message mentions the term window",
    typeof examOut.json?.error === "string" && /outside the Term 1 calendar/.test(examOut.json.error),
    examOut.json?.error || ""
  );

  // ---- TEST 4: report payload carries school info + term range ----
  const studentRow = await db.student.findFirst({ where: { classId: classRow.id } });
  if (!studentRow) throw new Error("no students in DB for report test");
  const reportRes = await api("/api/marks", {
    method: "POST",
    token,
    body: { studentId: studentRow.id, examId: createdExamId },
  });
  const rep = reportRes.json;
  check("report data includes school object", !!rep?.school?.schoolName);
  check(
    "report header uses configured school name",
    rep?.school?.schoolName === "Test Academy Kenya",
    rep?.school?.schoolName || ""
  );
  check(
    "report carries motto/address/phone",
    rep?.school?.schoolMotto === "Knowledge Is Light" &&
      rep?.school?.schoolAddress === "Test Town, Kenya" &&
      rep?.school?.schoolPhone === "+254700111222"
  );
  check(
    "report carries head teacher name",
    rep?.headTeacher === "Mrs. Test Head",
    rep?.headTeacher || ""
  );
  check(
    "report carries term range from settings",
    typeof rep?.termRange === "string" && rep.termRange.length > 0,
    rep?.termRange || ""
  );

  // ---- TEST 5: PDF builder honors school name (server-side smoke test) ----
  const pdfRes = await fetch(BASE + "/api/report-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ studentId: studentRow.id, examId: createdExamId }),
  });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  check("report PDF generates", pdfRes.status === 200 && pdfBuf.length > 1000, `${pdfBuf.length} bytes`);
  // pdfkit compresses content streams (FlateDecode) — inflate them all so
  // the text is actually searchable, then scan the combined text.
  const pdfText = extractPdfText(pdfBuf);
  check(
    "PDF contains configured school name",
    pdfText.includes("TEST ACADEMY KENYA"),
    ""
  );
  check("PDF no longer contains old hardcoded name", !pdfText.includes("NAKOYONJO DEB PRIMARY SCHOOL"), "");

  // ---- summary ----
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("FAILED:", failed.map((f) => f.name).join(" | "));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("TEST ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (createdExamId) await db.exam.delete({ where: { id: createdExamId } }).catch(() => {});
      // restore previous settings…
      const keys = Object.keys(previousSettings);
      for (const key of keys) {
        await db.schoolSetting
          .upsert({ where: { key }, update: { value: previousSettings[key] }, create: { key, value: previousSettings[key] } })
          .catch(() => {});
      }
      // …and DELETE keys the test itself introduced (no leak into live DB).
      for (const key of introducedKeys) {
        await db.schoolSetting.deleteMany({ where: { key } }).catch(() => {});
      }
      if (adminUser) await db.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    } catch (e) {
      console.error("cleanup warning:", e.message);
    }
    await db.$disconnect();
    console.log("cleanup done (exam deleted, settings restored or removed)");
  });
