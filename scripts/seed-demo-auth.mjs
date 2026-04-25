import "dotenv/config";
import { createRequire } from "node:module";

const requireFromServer = createRequire(new URL("../server/package.json", import.meta.url));

const { PrismaClient } = requireFromServer("@prisma/client");
const { PrismaPg } = requireFromServer("@prisma/adapter-pg");
const { Pool } = requireFromServer("pg");
const bcrypt = requireFromServer("bcrypt");

const DATABASE_URL = process.env.DATABASE_URL;
const DEFAULT_PASSWORD = "123456";
const BCRYPT_ROUNDS = 10;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function upsertUser(input) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  return prisma.user.upsert({
    where: { username: input.username },
    update: {
      displayName: input.displayName,
      companyName: input.companyName,
      passwordHash,
      role: input.role,
    },
    create: {
      username: input.username,
      displayName: input.displayName,
      companyName: input.companyName,
      passwordHash,
      role: input.role,
    },
  });
}

async function ensureRule() {
  return prisma.rule.upsert({
    where: { name: "默认提示词规则" },
    update: {
      minCount: 1,
      maxCount: 30,
      minLen: 2,
      maxLen: 30,
      dedupeRequired: true,
      sensitiveFilterEnabled: true,
      submitRateLimitPerDay: null,
    },
    create: {
      name: "默认提示词规则",
      minCount: 1,
      maxCount: 30,
      minLen: 2,
      maxLen: 30,
      dedupeRequired: true,
      sensitiveFilterEnabled: true,
      submitRateLimitPerDay: null,
    },
  });
}

async function ensureAgent(ruleId, userId) {
  return prisma.agent.upsert({
    where: { code: "A001" },
    update: {
      name: "一级代理 A001",
      status: "active",
      ruleId,
      userId,
    },
    create: {
      code: "A001",
      name: "一级代理 A001",
      status: "active",
      ruleId,
      userId,
    },
  });
}

async function main() {
  const mainCompanyUser = await upsertUser({
    username: "demo_admin",
    displayName: "演示主账号",
    companyName: "智邻科技",
    role: "main_company",
  });

  const agentUser = await upsertUser({
    username: "agent_a001",
    displayName: "一级代理 A001",
    companyName: "智邻科技",
    role: "level1_agent",
  });

  const rule = await ensureRule();
  const agent = await ensureAgent(rule.id, agentUser.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        accounts: [
          { username: mainCompanyUser.username, role: mainCompanyUser.role },
          { username: agentUser.username, role: agentUser.role, agentId: agent.id },
        ],
        defaultPassword: DEFAULT_PASSWORD,
      },
      null,
      2,
    ),
  );
}

await main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
