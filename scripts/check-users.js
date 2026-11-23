const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  try {
    const users = await db.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, password: true }
    });
    console.log('Total users:', users.length);
    for (const u of users) {
      console.log(`  ${u.email} | role=${u.role} | active=${u.isActive} | pw length=${u.password.length} | pw starts with $2=${u.password.startsWith('$2')}`);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  }
}
main();
