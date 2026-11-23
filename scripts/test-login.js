const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  // Test admin login
  const admin = await db.user.findUnique({ where: { email: 'admin@nakoyonjo.ac.ke' } });
  const valid1 = await bcrypt.compare('Nakoyonjo@2026', admin.password);
  console.log('Admin password valid:', valid1);

  // Test teacher login
  const teacher = await db.user.findUnique({ where: { email: 'james.mwangi@nakoyonjo.ac.ke' } });
  const valid2 = await bcrypt.compare('Teacher@2026', teacher.password);
  console.log('Teacher password valid:', valid2);
}
main();
