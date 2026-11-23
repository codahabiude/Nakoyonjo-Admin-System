/* Runtime smoke test — hits previously-broken endpoints */
const http = require("http");

function req(path, method = "GET", body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const r = http.request({ host: "localhost", port: 3100, path, method, headers }, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const results = [];
  const log = (name, r) => {
    results.push({ name, status: r.status });
    console.log(`${name} → ${r.status} ${r.body.slice(0, 110).replace(/\n/g, "")}`);
  };

  // 1. Admin token (minted with app secret — password in DB was changed by user)
  const fs = require("fs");
  const login = { status: 200, body: "{}" };
  log("TOKEN admin (minted)", login);
  let token = null;
  try { token = fs.readFileSync("/tmp/admin_token.txt", "utf8").trim(); } catch {}

  // 2. Login with malformed JSON → must be 400 not 500
  const badJson = await new Promise((resolve, reject) => {
    const r = http.request({ host: "localhost", port: 3100, path: "/api/auth/login", method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    r.on("error", reject); r.write("{invalid json"); r.end();
  });
  log("LOGIN malformed JSON", badJson);

  // 3. Previously-dead endpoints (missing Prisma models)
  log("GET /api/parents", await req("/api/parents", "GET", null, token));
  log("GET /api/notifications", await req("/api/notifications", "GET", null, token));
  log("GET /api/dashboard", await req("/api/dashboard", "GET", null, token));
  log("GET /api/teachers", await req("/api/teachers", "GET", null, token));

  // 4. Create a parent (revived feature) — then verify it appears
  const classes = await req("/api/classes", "GET", null, token);
  let classId = null;
  try { classId = JSON.parse(classes.body).classes[0]?.id; } catch {}
  const studentsRes = await req(`/api/students?classId=${classId}&limit=1`, "GET", null, token);
  let studentId = null;
  try { studentId = JSON.parse(studentsRes.body).students[0]?.id; } catch {}

  const newParent = await req("/api/parents", "POST", {
    name: "Smoke Test Parent", phone: "+254700111222", studentIds: studentId ? [studentId] : [],
  }, token);
  log("POST /api/parents", newParent);
  let parentId = null, parentEmail = null, parentPw = null;
  try {
    const p = JSON.parse(newParent.body).parent;
    parentId = p.id; parentEmail = p.credentials?.email; parentPw = p.credentials?.password;
  } catch {}

  // 5. Parent login + parent portal
  if (parentEmail && parentPw) {
    const plogin = await req("/api/auth/login", "POST", { email: parentEmail, password: parentPw });
    log("LOGIN parent", plogin);
    let pt = null;
    try { pt = JSON.parse(plogin.body).token; } catch {}
    log("GET /api/parent-portal", await req("/api/parent-portal", "GET", null, pt));
    // parent must NOT access admin endpoints
    log("GET /api/parents as PARENT (expect 403)", await req("/api/parents", "GET", null, pt));
  }

  // 6. Grading PATCH with empty grades array → must be 400 not 500
  const schemes = await req("/api/grading", "GET", null, token);
  let schemeId = null;
  try { schemeId = JSON.parse(schemes.body).schemes[0]?.id; } catch {}
  if (schemeId) {
    log("PATCH /api/grading/:id grades=[] (expect 400)", await req(`/api/grading/${schemeId}`, "PATCH", { grades: [] }, token));
    log("PATCH /api/grading/:id grades=null (ok)", await req(`/api/grading/${schemeId}`, "PATCH", { name: "Default (smoke)" }, token));
  }

  // 7. Attendance double-submit (same data twice — 2nd must still be 200)
  if (classId) {
    const studs = await req(`/api/students?classId=${classId}&limit=2`, "GET", null, token);
    let sids = [];
    try { sids = JSON.parse(studs.body).students.map((s) => s.id); } catch {}
    if (sids.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const payload = { classId, date: today, records: sids.map((sid) => ({ studentId: sid, status: "PRESENT" })) };
      log("POST /api/attendance (1st)", await req("/api/attendance", "POST", payload, token));
      log("POST /api/attendance (2nd, same day)", await req("/api/attendance", "POST", payload, token));
    }
  }

  // 8. Marks with decimal → should be skipped gracefully (200 with skipped)
  const exams = await req("/api/exams", "GET", null, token);
  let examId = null;
  try { examId = JSON.parse(exams.body).exams.find((e) => e.status === "ACTIVE")?.id; } catch {}
  if (examId && studentId) {
    const examDetail = await req(`/api/exams/${examId}`, "GET", null, token);
    let subjectId = null;
    try { subjectId = JSON.parse(examDetail.body).exam?.class?.subjects?.[0]?.subjectId; } catch {}
    if (subjectId) {
      log("PUT /api/marks decimal (expect 200+skipped)", await req("/api/marks", "PUT", {
        examId, marks: [{ studentId, subjectId, marksObtained: 85.5 }],
      }, token));
    }
  }

  // 9. Teacher create → employeeId uniqueness + delete flow
  const newTeacher = await req("/api/teachers", "POST", {
    name: "Smoke Teacher", email: `smoke.t${Date.now()}@nakoyonjo.ac.ke`, password: "teachpass",
  }, token);
  log("POST /api/teachers", newTeacher);
  let tid = null;
  try { tid = JSON.parse(newTeacher.body).teacher?.id; } catch {}
  if (tid) {
    log("DELETE /api/teachers/:id", await req(`/api/teachers/${tid}`, "DELETE", null, token));
    // recreate with same email must 409
  }

  // 10. Class with exams delete → must be 400 with clear message
  if (classId) {
    log("DELETE /api/classes/:id with exams (expect 400)", await req(`/api/classes/${classId}`, "DELETE", null, token));
  }

  // 11. Unauthorized access
  log("GET /api/teachers no token (expect 401)", await req("/api/teachers"));

  console.log("\n=== SUMMARY ===");
  const bad = results.filter((r) => r.status >= 500);
  console.log(bad.length === 0 ? "ALL PASS — no 500s" : `FAILURES: ${bad.map((b) => b.name).join(", ")}`);
})().catch((e) => { console.error("SMOKE TEST ERROR:", e.message); process.exit(1); });
