DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportConversationStatus') THEN
    CREATE TYPE "SupportConversationStatus" AS ENUM (
      'ai_chat',
      'handoff_requested',
      'queueing',
      'human_chat',
      'ended'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportMessageRole') THEN
    CREATE TYPE "SupportMessageRole" AS ENUM (
      'visitor',
      'ai',
      'agent',
      'system'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportHandoffStatus') THEN
    CREATE TYPE "SupportHandoffStatus" AS ENUM (
      'pending',
      'accepted',
      'closed',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SupportConversation" (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL DEFAULT 'web',
  "visitorSessionId" TEXT NOT NULL,
  "visitorName" TEXT,
  "visitorContact" TEXT,
  "sourcePage" TEXT,
  status "SupportConversationStatus" NOT NULL DEFAULT 'ai_chat',
  "handoffRequestedAt" TIMESTAMP(3),
  "humanTakenAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedAgentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SupportMessage" (
  id TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  role "SupportMessageRole" NOT NULL,
  content TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  "sourcesJson" JSONB,
  "agentUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SupportHandoff" (
  id TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  status "SupportHandoffStatus" NOT NULL DEFAULT 'pending',
  "queueSerial" INTEGER,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SupportConversation_assignedAgentId_fkey'
  ) THEN
    ALTER TABLE "SupportConversation"
      ADD CONSTRAINT "SupportConversation_assignedAgentId_fkey"
      FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SupportMessage_conversationId_fkey'
  ) THEN
    ALTER TABLE "SupportMessage"
      ADD CONSTRAINT "SupportMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SupportMessage_agentUserId_fkey'
  ) THEN
    ALTER TABLE "SupportMessage"
      ADD CONSTRAINT "SupportMessage_agentUserId_fkey"
      FOREIGN KEY ("agentUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SupportHandoff_conversationId_fkey'
  ) THEN
    ALTER TABLE "SupportHandoff"
      ADD CONSTRAINT "SupportHandoff_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SupportHandoff_acceptedByUserId_fkey'
  ) THEN
    ALTER TABLE "SupportHandoff"
      ADD CONSTRAINT "SupportHandoff_acceptedByUserId_fkey"
      FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "SupportConversation_status_lastMessageAt_idx"
  ON "SupportConversation" (status, "lastMessageAt");

CREATE INDEX IF NOT EXISTS "SupportConversation_visitorSessionId_createdAt_idx"
  ON "SupportConversation" ("visitorSessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportConversation_assignedAgentId_status_updatedAt_idx"
  ON "SupportConversation" ("assignedAgentId", status, "updatedAt");

CREATE INDEX IF NOT EXISTS "SupportMessage_conversationId_createdAt_idx"
  ON "SupportMessage" ("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportMessage_role_createdAt_idx"
  ON "SupportMessage" (role, "createdAt");

CREATE INDEX IF NOT EXISTS "SupportMessage_agentUserId_createdAt_idx"
  ON "SupportMessage" ("agentUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportHandoff_conversationId_status_requestedAt_idx"
  ON "SupportHandoff" ("conversationId", status, "requestedAt");

CREATE INDEX IF NOT EXISTS "SupportHandoff_status_requestedAt_idx"
  ON "SupportHandoff" (status, "requestedAt");

CREATE INDEX IF NOT EXISTS "SupportHandoff_acceptedByUserId_status_requestedAt_idx"
  ON "SupportHandoff" ("acceptedByUserId", status, "requestedAt");
