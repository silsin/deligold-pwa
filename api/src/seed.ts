/**
 * Seeds the platform chart of accounts plus one broker with its own copy,
 * plus the initial SUPER_ADMIN login from env (temporary credentials the
 * operator rotates after first sign-in).
 *
 * Run once per fresh database:
 *
 *   node dist/seed.js
 *
 * Everything is upserted by unique key, so re-running it is a no-op rather
 * than a duplicate-account disaster.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { TRADE_SYMBOLS } from './market/symbols';
import { ACCOUNTS } from './accounting/accounts.service';

const prisma = new PrismaClient();

interface AccountTemplate {
  code: string;
  name: string;
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  perSymbol?: boolean;
}

const TEMPLATES: AccountTemplate[] = [
  { code: ACCOUNTS.CASH, name: 'نقد و بانک', type: 'ASSET' },
  { code: ACCOUNTS.GOLD_INVENTORY, name: 'طلای مشتریان', type: 'ASSET', perSymbol: true },
  { code: ACCOUNTS.STORE_INVENTORY, name: 'طلای انبار', type: 'ASSET' },
  { code: ACCOUNTS.CUSTOMER_CASH_PAYABLE, name: 'بستانکاران — وجه نقد مشتریان', type: 'LIABILITY' },
  { code: ACCOUNTS.CUSTOMER_GOLD_PAYABLE, name: 'بستانکاران — طلای مشتریان', type: 'LIABILITY' },
  { code: ACCOUNTS.WITHDRAWAL_PAYABLE, name: 'برداشت‌های در انتظار', type: 'LIABILITY' },
  { code: ACCOUNTS.PAID_IN_CAPITAL, name: 'سرمایه', type: 'EQUITY' },
  { code: ACCOUNTS.TRADING_REVENUE, name: 'درآمد کارمزد معاملات', type: 'REVENUE' },
  { code: ACCOUNTS.TRADING_PNL, name: 'سود/زیان معاملات', type: 'REVENUE' },
  { code: ACCOUNTS.OPERATING_EXPENSE, name: 'هزینه‌های عملیاتی', type: 'EXPENSE' },
];

async function seedBook(brokerId: string | null): Promise<number> {
  let created = 0;
  for (const t of TEMPLATES) {
    const keys = t.perSymbol
      ? TRADE_SYMBOLS.map(s => ({ code: t.code, name: `${t.name} — ${s.symbol}`, type: t.type, symbol: s.symbol }))
      : [{ code: t.code, name: t.name, type: t.type, symbol: null as string | null }];

    for (const k of keys) {
      // A composite unique cannot match a null brokerId in an upsert `where`,
      // so platform-wide rows (brokerId null) are located with a find first.
      const existing = await prisma.account.findFirst({
        where: { code: k.code, brokerId, symbol: k.symbol },
      });
      if (existing) {
        await prisma.account.update({ where: { id: existing.id }, data: { name: k.name } });
      } else {
        await prisma.account.create({
          data: {
            code: k.code,
            name: k.name,
            type: k.type,
            brokerId,
            symbol: k.symbol,
          },
        });
      }
      created++;
    }
  }
  return created;
}

async function main() {
  const platform = await seedBook(null);
  console.log(`platform accounts: ${platform}`);

  const broker = await prisma.broker.upsert({
    where: { slug: 'delly-gold' },
    create: { name: 'دلی گلد', slug: 'delly-gold' },
    update: {},
  });
  const book = await seedBook(broker.id);
  console.log(`broker ${broker.slug} accounts: ${book}`);

  await seedSuperAdmin();

  console.log('seed done');
}

/**
 * Initial SUPER_ADMIN login, so the platform is operable from a fresh DB.
 *
 * Constant dev defaults (override via env for production):
 *
 *   SEED_ADMIN_PHONE=09120000000 SEED_ADMIN_PASSWORD=ChangeMe123! npx ts-node src/seed.ts
 *
 * Upserted by phone: re-running with the same phone keeps the existing role
 * but refreshes the password (handy for lockout recovery).
 */
const SEED_ADMIN_PHONE = (process.env.SEED_ADMIN_PHONE ?? '09334880627').trim();
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'gfx234789';

async function seedSuperAdmin(): Promise<void> {
  const phone = SEED_ADMIN_PHONE;
  const password = SEED_ADMIN_PASSWORD;
  if (password.length < 6) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 6 characters');
  }

  const hash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findFirst({ where: { phone } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        brokerId: null,
        name: existing.name?.trim() ? existing.name : 'مدیر سیستم',
      },
    });
    console.log(`seed super-admin: refreshed ${phone} (SUPER_ADMIN)`);
    return;
  }

  const created = await prisma.user.create({
    data: {
      phone,
      name: 'مدیر سیستم',
      password: hash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      brokerId: null,
    },
  });
  await prisma.wallet.upsert({
    where: { userId: created.id },
    create: { userId: created.id },
    update: {},
  });
  console.log(`seed super-admin: created ${phone} (SUPER_ADMIN)`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
