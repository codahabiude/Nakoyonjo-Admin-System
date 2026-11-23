const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  // Reset admin
  const adminHash = await bcrypt.hash('Nakoyonjo@2026', 10);
  await db.user.update({
    where: { email: 'admin@nakoyonjo.ac.ke' },
    data: { password: adminHash }
  });
  console.log('Admin password reset');

  // Reset teacher
  const teacherHash = await bcrypt.hash('Teacher@2026', 10);
  await db.user.update({
    where: { email: 'james.mwangi@nakoyonjo.ac.ke' },
    data: { password: teacherHash }
  });
  console.log('Teacher password reset');

  // Verify
  const admin = await db.user.findUnique({ where: { email: 'admin@nakoyonjo.ac.ke' } });
  console.log('Admin verify:', await bcrypt.compare('Nakoyonjo@2026', admin.password));
  const teacher = await db.user.findUnique({ where: { email: 'james.mwangi@nakoyonjo.ac.ke' } });
  console.log('Teacher verify:', await bcrypt.compare('Teacher@2026', teacher.password));
}
main();
