const fs = require("node:fs");
const path = require("node:path");
const { PrismaPg } = require("../server/node_modules/@prisma/adapter-pg");
const { PrismaClient } = require("../server/node_modules/@prisma/client");

const envText = fs.readFileSync(path.join(__dirname, "..", "server", ".env"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) continue;
  const key = trimmed.slice(0, separatorIndex).trim();
  const value = trimmed.slice(separatorIndex + 1).trim();
  if (!(key in process.env)) {
    process.env[key] = value;
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const jobs = await prisma.leadPublishJob.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      platform: true,
      status: true,
      createdAt: true,
      platformAccountId: true,
      draftTitle: true,
    },
  });

  const contents = await prisma.leadContent.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      platformStyle: true,
      contentType: true,
      createdAt: true,
    },
  });

  console.log("JOBS");
  console.log(JSON.stringify(jobs, null, 2));
  console.log("CONTENTS");
  console.log(JSON.stringify(contents, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
