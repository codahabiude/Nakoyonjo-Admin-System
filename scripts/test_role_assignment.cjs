/**
 * E2E test: admin assigns Regular vs Class Teacher roles.
 * Starts against a running `next start` server (URL passed as argv[2]).
 * Creates its own temp admin + teachers, then cleans everything up.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const BASE = process.argv[2] || "http://localhost:3210";
const db = new PrismaClient();

const STAMP = Date.now();
const ADMIN_EMAIL = `role-test-admin-${STAMP}@local.test`;
const results = [];
let adminUser = null;
const createdTeacherUserIds = [];

function check(name, cond, extra = "") {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  [" + extra + "]" : ""}`);
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
      name: "Role Test Admin",
      role: "ADMIN",
    },
  });

  // ---- login ----
  const login = await api("/api/auth/login", {
    method: "POST",
    body: { email: ADMIN_EMAIL, password: "test-admin-pw" },
  });
  check("login as temp admin", login.status === 200 && login.json?.token);
  const token = login.json?.token;
  if (!token) throw new Error("no token");

  // ---- classes: need at least 2 ----
  const classesRes = await api("/api/classes", { token });
  const classes = classesRes.json?.classes || [];
  check("at least 2 classes exist", classes.length >= 2, `${classes.length} classes`);
  const C1 = classes[0];
  const C2 = classes[1];

  // ---- TEST 1: add teacher as CLASS TEACHER of C1 ----
  const t1res = await api("/api/teachers", {
    method: "POST",
    token,
    body: {
      name: "Alice Primary",
      email: `alice-${STAMP}@local.test`,
      password: "teacher-pw",
      classIds: [C1.id],
      primaryClassId: C1.id,
    },
  });
  const t1 = t1res.json?.teacher;
  createdTeacherUserIds.push(t1?.userId);
  check("POST teacher w/ primaryClassId → 201", t1res.status === 201);
  check(
    "teacher1 isPrimary on C1",
    t1?.classes?.find((c) => c.classId === C1.id)?.isPrimary === true
  );

  // ---- TEST 2: second teacher as class teacher of SAME class → first demoted ----
  const t2res = await api("/api/teachers", {
    method: "POST",
    token,
    body: {
      name: "Bob Replacement",
      email: `bob-${STAMP}@local.test`,
      password: "teacher-pw",
      classIds: [C1.id, C2.id],
      primaryClassId: C1.id,
    },
  });
  const t2 = t2res.json?.teacher;
  createdTeacherUserIds.push(t2?.userId);
  check("POST teacher2 same primary class → 201", t2res.status === 201);
  const t1After = await db.teacherClass.findFirst({
    where: { teacherId: t1.id, classId: C1.id },
  });
  check("old class teacher demoted to regular", t1After?.isPrimary === false);
  check(
    "teacher2 is now primary of C1",
    t2?.classes?.find((c) => c.classId === C1.id)?.isPrimary === true
  );

  // ---- TEST 3: add REGULAR teacher (no primaryClassId) ----
  const t3res = await api("/api/teachers", {
    method: "POST",
    token,
    body: {
      name: "Carol Regular",
      email: `carol-${STAMP}@local.test`,
      password: "teacher-pw",
      classIds: [C2.id],
    },
  });
  const t3 = t3res.json?.teacher;
  createdTeacherUserIds.push(t3?.userId);
  check("POST regular teacher → 201", t3res.status === 201);
  check(
    "regular teacher NOT primary anywhere",
    (t3?.classes || []).every((c) => !c.isPrimary) && t3.classes.length === 1
  );

  // ---- TEST 4: EDIT preserves primary when primaryClassId omitted ----
  const t4put = await api(`/api/teachers/${t2.id}`, {
    method: "PUT",
    token,
    body: { phone: "+254700000001", classIds: [C1.id, C2.id] }, // no primaryClassId
  });
  check("PUT teacher2 (no primaryClassId) → 200", t4put.status === 200);
  const t2Rows = await db.teacherClass.findMany({ where: { teacherId: t2.id } });
  const t2Primary = t2Rows.filter((r) => r.isPrimary).map((r) => r.classId);
  check("primary preserved after edit without primaryClassId", t2Primary.length === 1 && t2Primary[0] === C1.id, t2Primary.join(","));

  // ---- TEST 5: EDIT explicitly revoke → regular teacher ----
  const t5put = await api(`/api/teachers/${t2.id}`, {
    method: "PUT",
    token,
    body: { classIds: [C1.id, C2.id], primaryClassId: null },
  });
  check("PUT teacher2 primaryClassId=null → 200", t5put.status === 200);
  const t2RowsAfter = await db.teacherClass.findMany({ where: { teacherId: t2.id } });
  check("revoked → teacher2 has no primary rows", t2RowsAfter.every((r) => !r.isPrimary));

  // ---- TEST 6: promote via edit; verify primaryClassId must be in classIds ----
  const t6bad = await api(`/api/teachers/${t2.id}`, {
    method: "PUT",
    token,
    body: { classIds: [C2.id], primaryClassId: C1.id },
  });
  check("PUT primary not in classIds → 400", t6bad.status === 400);

  const t6put = await api(`/api/teachers/${t2.id}`, {
    method: "PUT",
    token,
    body: { classIds: [C2.id], primaryClassId: C2.id },
  });
  check("PUT valid promotion → 200", t6put.status === 200);
  const t2Final = await db.teacherClass.findMany({ where: { teacherId: t2.id } });
  check(
    "teacher2 primary of C2 only",
    t2Final.filter((r) => r.isPrimary).map((r) => r.classId).join(",") === C2.id
  );

  // ---- TEST 7: primaryClassId-only change (no classIds) ----
  const t7put = await api(`/api/teachers/${t2.id}`, {
    method: "PUT",
    token,
    body: { primaryClassId: null },
  });
  check("PUT primary-only revoke → 200", t7put.status === 200);
  const t2Final2 = await db.teacherClass.findMany({ where: { teacherId: t2.id } });
  check("classes untouched, no primary", t2Final2.length === 1 && t2Final2.every((r) => !r.isPrimary));

  // ---- TEST 8: non-admin forbidden ----
  const teacherPw = await bcrypt.hash("teacher-pw", 10);
  const t4User = await db.user.create({
    data: {
      email: `dave-${STAMP}@local.test`,
      password: teacherPw,
      name: "Dave Teacher",
      role: "TEACHER",
    },
  });
  const t4Teacher = await db.teacher.create({
    data: { employeeId: `TCH-T${String(STAMP).slice(-5)}`, userId: t4User.id },
  });
  const tlogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: `dave-${STAMP}@local.test`, password: "teacher-pw" },
  });
  const t4putForbidden = await api(`/api/teachers/${t1.id}`, {
    method: "PUT",
    token: tlogin.json?.token,
    body: { classIds: [C1.id], primaryClassId: C1.id },
  });
  check("regular teacher cannot assign roles → 403", t4putForbidden.status === 403);
  await db.user.delete({ where: { id: t4User.id } }); // cascade deletes teacher

  // ---- TEST 9: primary implies membership (add teacher with primaryClassId only) ----
  const t9res = await api("/api/teachers", {
    method: "POST",
    token,
    body: {
      name: "Eve PrimaryOnly",
      email: `eve-${STAMP}@local.test`,
      password: "teacher-pw",
      classIds: [],
      primaryClassId: C1.id,
    },
  });
  const t9 = t9res.json?.teacher;
  createdTeacherUserIds.push(t9?.userId);
  check("primaryClassId alone implies class assignment → 201", t9res.status === 201);
  check(
    "eve assigned & primary of C1",
    t9?.classes?.length === 1 &&
      t9.classes[0].classId === C1.id &&
      t9.classes[0].isPrimary === true
  );

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
    // ---- cleanup: delete teachers (cascade via user) + temp admin ----
    try {
      for (const uid of createdTeacherUserIds) {
        if (uid) await db.user.delete({ where: { id: uid } }).catch(() => {});
      }
      if (adminUser) {
        await db.user.delete({ where: { id: adminUser.id } }).catch(() => {});
      }
    } catch (e) {
      console.error("cleanup warning:", e.message);
    }
    await db.$disconnect();
    console.log("cleanup done");
  });
