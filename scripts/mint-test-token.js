/* Mint an admin JWT using the app's secret (same lib as token-auth.ts) */
const { SignJWT } = require("jose");
const fs = require("fs");

// read NEXTAUTH_SECRET from .env
const env = fs.readFileSync("/home/z/my-project/.env", "utf8");
const secretStr = env.match(/NEXTAUTH_SECRET=(.+)/)[1].trim();
const secret = new TextEncoder().encode(secretStr);

// grab the admin user id from the DB
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

(async () => {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" } });
  const teacher = await db.user.findFirst({
    where: { role: "TEACHER" },
    include: { teacher: true },
  });
  await db.$disconnect();

  async function sign(u) {
    return new SignJWT({ id: u.id, email: u.email, name: u.name, role: u.role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secret);
  }

  fs.writeFileSync("/tmp/admin_token.txt", await sign(admin));
  if (teacher) fs.writeFileSync("/tmp/teacher_token.txt", await sign(teacher));
  console.log("tokens written; admin:", admin.email, "| teacher:", teacher?.email ?? "none");
})().catch((e) => { console.error(e.message); process.exit(1); });
