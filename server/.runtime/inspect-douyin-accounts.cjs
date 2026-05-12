const { PrismaPg } = require('../node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('../node_modules/@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const envText = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const i = trimmed.indexOf('=');
  if (i === -1) continue;
  const k = trimmed.slice(0, i).trim();
  const v = trimmed.slice(i + 1).trim();
  if (!(k in process.env)) process.env[k] = v;
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const items = await prisma.leadPlatformAccount.findMany({
    where: { platform: 'douyin', loginStatus: 'authenticated' },
    select: { id: true, accountName: true, displayName: true, browserSessionPath: true },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(items, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
