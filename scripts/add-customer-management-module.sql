DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RbacPageKey')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       INNER JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'RbacPageKey'
         AND e.enumlabel = 'customerManagement'
     ) THEN
    ALTER TYPE "RbacPageKey" ADD VALUE 'customerManagement';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerSourcePlatform') THEN
    CREATE TYPE "CustomerSourcePlatform" AS ENUM (
      'super_site',
      'douyin',
      'xiaohongshu',
      'video_channel',
      'kuaishou'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CustomerLead" (
  id TEXT PRIMARY KEY,
  name TEXT,
  "phoneNumber" TEXT,
  "wechatId" TEXT,
  "platformName" TEXT,
  "sourcePlatform" "CustomerSourcePlatform" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CustomerLead_sourcePlatform_createdAt_idx"
  ON "CustomerLead" ("sourcePlatform", "createdAt");

CREATE INDEX IF NOT EXISTS "CustomerLead_phoneNumber_idx"
  ON "CustomerLead" ("phoneNumber");

CREATE INDEX IF NOT EXISTS "CustomerLead_wechatId_idx"
  ON "CustomerLead" ("wechatId");

CREATE INDEX IF NOT EXISTS "CustomerLead_name_createdAt_idx"
  ON "CustomerLead" (name, "createdAt");
