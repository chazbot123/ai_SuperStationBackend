DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VideoDraftSource') THEN
    CREATE TYPE "VideoDraftSource" AS ENUM (
      'product_video',
      'avatar_video'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VideoDraftStatus') THEN
    CREATE TYPE "VideoDraftStatus" AS ENUM (
      'ready',
      'processing',
      'failed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "VideoDraft" (
  id TEXT PRIMARY KEY,
  "creatorId" TEXT NOT NULL,
  source "VideoDraftSource" NOT NULL,
  title TEXT NOT NULL,
  "platformStyle" TEXT,
  "publishTitle" TEXT,
  "publishTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "completedAt" TIMESTAMP(3),
  "durationText" TEXT NOT NULL,
  "generatedScript" TEXT NOT NULL,
  "videoUrl" TEXT NOT NULL DEFAULT '',
  "taskId" TEXT,
  provider TEXT,
  model TEXT,
  "errorMessage" TEXT,
  "reviewStage" "SocialPostReviewStage" NOT NULL DEFAULT 'draft',
  status "VideoDraftStatus" NOT NULL DEFAULT 'processing',
  "syncedToLeads" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoDraft_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "User"(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "VideoDraft_creatorId_createdAt_idx"
  ON "VideoDraft" ("creatorId", "createdAt");

CREATE INDEX IF NOT EXISTS "VideoDraft_creatorId_source_createdAt_idx"
  ON "VideoDraft" ("creatorId", source, "createdAt");

CREATE INDEX IF NOT EXISTS "VideoDraft_createdAt_idx"
  ON "VideoDraft" ("createdAt");
