/**
 * Creates the first SUPER_ADMIN.
 *
 * Run once, with the phone and password on the command line:
 *
 *   node dist/admin.js 09120000000 secret-password
 *
 * Refuses to run when one already exists — a second super admin is minted from
 * inside the app, through the users endpoint, not from a shell.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const [phoneArg, passwordArg] = process.argv.slice(2);
  if (!phoneArg || !passwordArg) {
    console.error('usage: node dist/admin.js <phone> <password>');
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (existing) {
    console.error(`a super admin already exists (${existing.phone ?? existing.id}) — refusing`);
    process.exit(1);
  }

  const user = await prisma.user.create({
    data: {
      phone: phoneArg.trim(),
      name: 'مدیر سیستم',
      password: await bcrypt.hash(passwordArg, 10),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });
  await prisma.wallet.create({ data: { userId: user.id } });

  console.log(`super admin created: ${user.id} (${phoneArg})`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
