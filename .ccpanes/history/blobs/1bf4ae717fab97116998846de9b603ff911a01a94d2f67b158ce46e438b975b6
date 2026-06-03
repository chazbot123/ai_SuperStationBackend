import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const repoRoot = path.resolve(currentDir, "..");
const configuredStoreFilePath = String(process.env.BITBROWSER_STORAGE_FILE || "").trim();

function resolveStoreFilePath() {
  const candidates = configuredStoreFilePath
    ? [path.resolve(configuredStoreFilePath)]
    : [
        path.resolve(repoRoot, ".runtime", "bitbrowser", "bitbrowser.store.json"),
        path.resolve(repoRoot, "server", ".runtime", "bitbrowser", "bitbrowser.store.json"),
      ];
  return candidates.find((item) => fs.existsSync(item)) || candidates[0];
}

const storeFilePath = resolveStoreFilePath();

const defaultReasons = new Set(["keepalive", "publish"]);
const sessionTerminalStatuses = new Set(["completed", "failed", "closed"]);
const commandTerminalStatuses = new Set(["completed", "failed", "cancelled"]);

function nowIso() {
  return new Date().toISOString();
}

function parseReasons() {
  const raw = process.argv
    .slice(2)
    .flatMap((arg) => String(arg || "").split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return new Set(raw.length ? raw : Array.from(defaultReasons));
}

function readStore() {
  if (!fs.existsSync(storeFilePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(storeFilePath, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(storeFilePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function main() {
  const reasons = parseReasons();
  const store = readStore();
  if (!store) {
    console.log(`bitbrowser store not found: ${storeFilePath}`);
    process.exit(0);
  }

  const lockProfileBindingIds = new Set(
    (Array.isArray(store.locks) ? store.locks : [])
      .filter((item) => reasons.has(String(item?.reason || "").trim().toLowerCase()))
      .map((item) => String(item.profileBindingId || "").trim())
      .filter(Boolean),
  );

  const sessionIdsToClose = new Set(
    (Array.isArray(store.runtimeSessions) ? store.runtimeSessions : [])
      .filter((item) => {
        const reason = String(item?.reason || "").trim().toLowerCase();
        const status = String(item?.status || "").trim().toLowerCase();
        return reasons.has(reason) && !sessionTerminalStatuses.has(status);
      })
      .map((item) => String(item.id || "").trim())
      .filter(Boolean),
  );

  const timestamp = nowIso();
  const originalLockCount = Array.isArray(store.locks) ? store.locks.length : 0;
  const originalRuntimeSessionCount = Array.isArray(store.runtimeSessions)
    ? store.runtimeSessions.length
    : 0;
  const originalRuntimeCommandCount = Array.isArray(store.runtimeCommands)
    ? store.runtimeCommands.length
    : 0;

  store.locks = (Array.isArray(store.locks) ? store.locks : []).filter(
    (item) => !reasons.has(String(item?.reason || "").trim().toLowerCase()),
  );

  let closedRuntimeSessions = 0;
  store.runtimeSessions = (Array.isArray(store.runtimeSessions) ? store.runtimeSessions : []).map(
    (item) => {
      if (!sessionIdsToClose.has(String(item?.id || "").trim())) {
        return item;
      }
      closedRuntimeSessions += 1;
      return {
        ...item,
        status: "failed",
        updatedAt: timestamp,
      };
    },
  );

  let cancelledRuntimeCommands = 0;
  store.runtimeCommands = (Array.isArray(store.runtimeCommands) ? store.runtimeCommands : []).map(
    (item) => {
      const runtimeSessionId = String(item?.runtimeSessionId || "").trim();
      const status = String(item?.status || "").trim().toLowerCase();
      if (!sessionIdsToClose.has(runtimeSessionId) || commandTerminalStatuses.has(status)) {
        return item;
      }
      cancelledRuntimeCommands += 1;
      return {
        ...item,
        status: "cancelled",
        errorMessage: item?.errorMessage || "cleared by clear-bitbrowser-runtime-locks",
        updatedAt: timestamp,
      };
    },
  );

  writeStore(store);

  console.log(
    JSON.stringify(
      {
        storeFilePath,
        reasons: Array.from(reasons),
        removedLocks: originalLockCount - store.locks.length,
        affectedProfileBindings: Array.from(lockProfileBindingIds),
        closedRuntimeSessions,
        cancelledRuntimeCommands,
        originalRuntimeSessionCount,
        originalRuntimeCommandCount,
      },
      null,
      2,
    ),
  );
}

main();
