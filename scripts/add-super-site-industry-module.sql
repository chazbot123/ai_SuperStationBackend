DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuperSiteIndustrySourceType') THEN
    CREATE TYPE "SuperSiteIndustrySourceType" AS ENUM (
      'manual',
      'rss',
      'html'
    );
  END IF;
END $$;

ALTER TABLE "SuperSiteSetting"
  ADD COLUMN IF NOT EXISTS "industrySourceConfigs" JSONB,
  ADD COLUMN IF NOT EXISTS "industryKeywords" JSONB,
  ADD COLUMN IF NOT EXISTS "industryRefreshConfig" JSONB,
  ADD COLUMN IF NOT EXISTS "industryLastSyncAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "industryLastSyncStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "industryLastSyncError" TEXT;

CREATE TABLE IF NOT EXISTS "SuperSiteIndustryItem" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sourceType" "SuperSiteIndustrySourceType" NOT NULL,
  "sourceKey" TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  "coverImage" TEXT,
  "sourceUrl" TEXT,
  "publishedAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isPinned" BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  "manualCreated" BOOLEAN NOT NULL DEFAULT FALSE,
  "rawPayload" JSONB,
  "crawlHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SuperSiteIndustryItem_userId_fkey'
  ) THEN
    ALTER TABLE "SuperSiteIndustryItem"
      ADD CONSTRAINT "SuperSiteIndustryItem_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'super_site_industry_item_user_source_url_unique'
  ) THEN
    CREATE UNIQUE INDEX "super_site_industry_item_user_source_url_unique"
      ON "SuperSiteIndustryItem" ("userId", "sourceKey", "sourceUrl");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SuperSiteIndustryItem_crawlHash_key"
  ON "SuperSiteIndustryItem" ("crawlHash");

CREATE INDEX IF NOT EXISTS "SuperSiteIndustryItem_userId_enabled_isPinned_sortOrder_idx"
  ON "SuperSiteIndustryItem" ("userId", enabled, "isPinned", "sortOrder");

CREATE INDEX IF NOT EXISTS "SuperSiteIndustryItem_userId_sourceType_publishedAt_idx"
  ON "SuperSiteIndustryItem" ("userId", "sourceType", "publishedAt");

CREATE INDEX IF NOT EXISTS "SuperSiteIndustryItem_userId_createdAt_idx"
  ON "SuperSiteIndustryItem" ("userId", "createdAt");
