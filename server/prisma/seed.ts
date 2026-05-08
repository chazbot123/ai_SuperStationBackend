import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, SessionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const databaseUrl = process.env.DATABASE_URL;
const DEMO_PASSWORD = '123456';
const BCRYPT_ROUNDS = 10;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for prisma seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function seedUser(username: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  return prisma.user.upsert({
    where: { username },
    update: {
      displayName: '演示主账号',
      companyName: '智邻科技',
      passwordHash,
      role: 'main_company',
    },
    create: {
      username,
      displayName: '演示主账号',
      companyName: '智邻科技',
      passwordHash,
      role: 'main_company',
    },
  });
}

async function clearSessions(userId: string) {
  await prisma.userSession.deleteMany({
    where: { userId },
  });
}

async function seedInitialSession(userId: string) {
  return prisma.userSession.create({
    data: {
      userId,
      deviceId: 'seed-device-1',
      deviceName: 'Seed Device',
      status: SessionStatus.active,
    },
  });
}

async function main() {
  const user = await seedUser('demo_admin');
  await clearSessions(user.id);
  await seedInitialSession(user.id);
}

void main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await prisma.$disconnect();
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
