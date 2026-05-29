#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const agentProductName = "AI SuperWeb Local Agent";
const agentVersion = process.env.LOCAL_AGENT_VERSION?.trim() || "dev";
const packagedRuntimeDir = process.pkg ? path.dirname(process.execPath) : "";

const localDataRoot = process.env.LOCALAPPDATA
  ? path.resolve(process.env.LOCALAPPDATA, "AISuperWeb")
  : path.resolve(os.homedir(), ".ai-superweb");

const defaultConfigPath = path.resolve(localDataRoot, "local-agent", "agent-config.json");
const repoExtensionSourceDir = path.resolve(
  repoRoot,
  "scripts",
  "browser-extension",
  "platform-login-helper",
);
const portableExtensionDir = packagedRuntimeDir
  ? path.resolve(packagedRuntimeDir, "platform-login-helper")
  : "";
const defaultExtensionSourceDir =
  portableExtensionDir && existsSync(portableExtensionDir)
    ? portableExtensionDir
    : repoExtensionSourceDir;
const defaultExtensionTargetDir = portableExtensionDir || path.resolve(
  localDataRoot,
  "bitbrowser-extension",
  "platform-login-helper",
);
const defaultServerEnvPath = resolveDefaultServerEnvPath();
const defaultLocalApiBaseUrl = "http://127.0.0.1:54345";
const defaultLocalAgentHost = "127.0.0.1";
const defaultLocalAgentPort = 3210;
const isPackagedDefaultLaunch = process.pkg && !process.argv[2];

const command = process.argv[2] || (process.pkg ? "serve" : "help");
const args = parseArgs(process.argv.slice(3));

main().catch((error) => {
  void writePackagedLaunchLog(`error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  console.error(`[local-agent] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  switch (command) {
    case "init":
      printJson(await executeInit());
      return;
    case "sync-extension":
      printJson(await executeSyncExtension());
      return;
    case "write-server-env":
      printJson(await executeWriteServerEnv());
      return;
    case "start-bitbrowser":
      printJson(await executeStartBitBrowser());
      return;
    case "serve":
      await handleServe();
      return;
    case "status":
      printJson(await getStatusSnapshot());
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      throw new Error(`未知命令: ${command}`);
  }
}

async function executeInit(overrides = {}) {
  const config = await readAgentConfig();
  const nextConfig = buildNextConfig(config, overrides);
  const synced = await syncExtensionDirectory({
    sourceDir: nextConfig.extensionSourceDir,
    targetDir: nextConfig.extensionTargetDir,
  });

  nextConfig.extensionTargetDir = synced.targetDir;
  nextConfig.bitBrowserPath =
    normalizePathArg(pickArg(overrides, "bitbrowser-path")) ||
    nextConfig.bitBrowserPath ||
    detectBitBrowserExecutable() ||
    "";
  nextConfig.localApiBaseUrl =
    normalizeTextArg(pickArg(overrides, "local-api-base-url")) ||
    nextConfig.localApiBaseUrl ||
    defaultLocalApiBaseUrl;
  nextConfig.serverEnvPath =
    normalizePathArg(pickArg(overrides, "server-env-file")) ||
    nextConfig.serverEnvPath ||
    defaultServerEnvPath;
  nextConfig.updatedAt = new Date().toISOString();

  await saveAgentConfig(nextConfig);

  const shouldWriteServerEnv =
    !pickFlag(overrides, "skip-write-server-env") && Boolean(nextConfig.serverEnvPath);
  if (shouldWriteServerEnv) {
    await writeServerEnv(nextConfig.serverEnvPath, {
      BITBROWSER_LOCAL_API_BASE_URL: nextConfig.localApiBaseUrl,
    });
  }

  return {
    command: "init",
    configPath: defaultConfigPath,
    bitBrowserPath: nextConfig.bitBrowserPath || null,
    localApiBaseUrl: nextConfig.localApiBaseUrl || null,
    extensionSourceDir: nextConfig.extensionSourceDir,
    extensionTargetDir: nextConfig.extensionTargetDir,
    serverEnvPath: nextConfig.serverEnvPath || null,
    wroteServerEnv: shouldWriteServerEnv,
  };
}

async function executeSyncExtension(overrides = {}) {
  const config = await readAgentConfig();
  const sourceDir =
    normalizePathArg(pickArg(overrides, "source-dir")) ||
    config.extensionSourceDir ||
    defaultExtensionSourceDir;
  const targetDir =
    normalizePathArg(pickArg(overrides, "target-dir")) ||
    config.extensionTargetDir ||
    defaultExtensionTargetDir;
  const synced = await syncExtensionDirectory({ sourceDir, targetDir });

  await saveAgentConfig({
    ...config,
    extensionSourceDir: sourceDir,
    extensionTargetDir: synced.targetDir,
    updatedAt: new Date().toISOString(),
  });

  return {
    command: "sync-extension",
    sourceDir,
    targetDir: synced.targetDir,
  };
}

async function executeWriteServerEnv(overrides = {}) {
  const config = await readAgentConfig();
  const serverEnvPath =
    normalizePathArg(pickArg(overrides, "server-env-file")) ||
    config.serverEnvPath ||
    defaultServerEnvPath;
  if (!serverEnvPath) {
    throw new Error("未配置 server .env 路径，请通过 --server-env-file 显式传入");
  }
  const extensionDir =
    normalizePathArg(pickArg(overrides, "extension-dir")) ||
    config.extensionTargetDir ||
    defaultExtensionTargetDir;
  const localApiBaseUrl =
    normalizeTextArg(pickArg(overrides, "local-api-base-url")) ||
    config.localApiBaseUrl ||
    defaultLocalApiBaseUrl;

  await writeServerEnv(serverEnvPath, {
    BITBROWSER_LOCAL_API_BASE_URL: localApiBaseUrl,
  });

  await saveAgentConfig({
    ...config,
    serverEnvPath,
    extensionTargetDir: extensionDir,
    localApiBaseUrl,
    updatedAt: new Date().toISOString(),
  });

  return {
    command: "write-server-env",
    serverEnvPath,
    BITBROWSER_LOCAL_API_BASE_URL: localApiBaseUrl || null,
    localExtensionDir: extensionDir,
  };
}

async function executeStartBitBrowser(overrides = {}) {
  const config = await readAgentConfig();
  const bitBrowserPath =
    normalizePathArg(pickArg(overrides, "bitbrowser-path")) ||
    config.bitBrowserPath ||
    detectBitBrowserExecutable() ||
    "";
  const extensionDir =
    normalizePathArg(pickArg(overrides, "extension-dir")) ||
    config.extensionTargetDir ||
    defaultExtensionTargetDir;

  if (!bitBrowserPath) {
    throw new Error("未找到 BitBrowser 可执行文件，请通过 --bitbrowser-path 显式传入");
  }

  if (!existsSync(bitBrowserPath)) {
    throw new Error(`BitBrowser 可执行文件不存在: ${bitBrowserPath}`);
  }

  if (!existsSync(extensionDir)) {
    await syncExtensionDirectory({
      sourceDir: config.extensionSourceDir || defaultExtensionSourceDir,
      targetDir: extensionDir,
    });
  }

  const explicitArgs = splitCommaArgs(pickArg(overrides, "additional-args"));
  const launchArgs = [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    ...explicitArgs,
  ];

  const runningMainProcesses = listRunningBitBrowserMainProcesses(bitBrowserPath);
  const hasExpectedArgs = runningMainProcesses.some((item) =>
    hasBitBrowserExtensionArgs(item.commandLine, extensionDir),
  );
  const requiresRestart =
    runningMainProcesses.length > 0 && !hasExpectedArgs;

  if (requiresRestart) {
    stopBitBrowserProcesses(bitBrowserPath);
    await sleep(1200);
  }

  if (!requiresRestart && hasExpectedArgs) {
    return {
      command: "start-bitbrowser",
      bitBrowserPath,
      launchArgs,
      reusedExistingProcess: true,
    };
  }

  const child = spawn(bitBrowserPath, launchArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();

  await saveAgentConfig({
    ...config,
    bitBrowserPath,
    extensionTargetDir: extensionDir,
    updatedAt: new Date().toISOString(),
  });

  return {
    command: "start-bitbrowser",
    bitBrowserPath,
    launchArgs,
  };
}

async function handleServe() {
  const host = normalizeTextArg(pickArg({}, "host")) || defaultLocalAgentHost;
  const port = normalizePortArg(pickArg({}, "port")) || defaultLocalAgentPort;
  const server = createServer(async (request, response) => {
    setCorsHeaders(response);
    const method = request.method || "GET";
    const url = new URL(request.url || "/", `http://${host}:${port}`);

    if (method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      if (method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          status: "ok",
          service: "ai-superweb-local-agent",
          productName: agentProductName,
          version: agentVersion,
          host,
          port,
        });
        return;
      }

      if (method === "GET" && url.pathname === "/version") {
        sendJson(response, 200, {
          productName: agentProductName,
          version: agentVersion,
          distributionMode: detectDistributionMode(),
        });
        return;
      }

      if (method === "GET" && url.pathname === "/status") {
        sendJson(response, 200, await getStatusSnapshot());
        return;
      }

      if (method === "POST" && url.pathname === "/init") {
        sendJson(response, 200, await executeInit(await readJsonBody(request)));
        return;
      }

      if (method === "POST" && url.pathname === "/sync-extension") {
        sendJson(response, 200, await executeSyncExtension(await readJsonBody(request)));
        return;
      }

      if (method === "POST" && url.pathname === "/write-server-env") {
        sendJson(response, 200, await executeWriteServerEnv(await readJsonBody(request)));
        return;
      }

      if (method === "POST" && url.pathname === "/start-bitbrowser") {
        sendJson(response, 200, await executeStartBitBrowser(await readJsonBody(request)));
        return;
      }

      sendJson(response, 404, {
        error: "NOT_FOUND",
        message: `未找到接口: ${method} ${url.pathname}`,
      });
    } catch (error) {
      sendJson(response, 500, {
        error: "LOCAL_AGENT_ERROR",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    if (isAddressInUseError(error)) {
      const runningAgent = await readRunningAgentHealth(host, port);
      if (runningAgent) {
        await writePackagedLaunchLog(`reused-existing-agent: ${runningAgent.healthUrl}`);
        if (isPackagedDefaultLaunch) {
          showPackagedLaunchNotice("本地客户端已在运行", `连接地址：${runningAgent.healthUrl}`);
        }
        printJson({
          command: "serve",
          reusedExistingAgent: true,
          ...runningAgent,
        });
        return;
      }
    }
    throw error;
  }

  const payload = {
    command: "serve",
    productName: agentProductName,
    version: agentVersion,
    host,
    port,
    healthUrl: `http://${host}:${port}/health`,
    statusUrl: `http://${host}:${port}/status`,
  };
  if (isPackagedDefaultLaunch) {
    await writePackagedLaunchLog(`serve-started: ${payload.healthUrl}`);
    showPackagedLaunchNotice("本地客户端启动成功", `连接地址：${payload.healthUrl}`);
  }
  printJson(payload);
}

async function getStatusSnapshot() {
  const config = await readAgentConfig();
  const bitBrowserPath = config.bitBrowserPath || detectBitBrowserExecutable() || "";
  const extensionSourceDir = config.extensionSourceDir || defaultExtensionSourceDir;
  const extensionTargetDir = config.extensionTargetDir || defaultExtensionTargetDir;
  const serverEnvPath = config.serverEnvPath || defaultServerEnvPath;

  return {
    productName: agentProductName,
    version: agentVersion,
    distributionMode: detectDistributionMode(),
    configPath: defaultConfigPath,
    localDataRoot,
    bitBrowserPath: bitBrowserPath || null,
    bitBrowserExists: bitBrowserPath ? existsSync(bitBrowserPath) : false,
    extensionSourceDir,
    extensionSourceExists: existsSync(extensionSourceDir),
    extensionTargetDir,
    extensionTargetExists: existsSync(extensionTargetDir),
    serverEnvPath: serverEnvPath || null,
    serverEnvExists: serverEnvPath ? existsSync(serverEnvPath) : false,
    localApiBaseUrl: config.localApiBaseUrl || null,
    config,
  };
}

function resolveDefaultServerEnvPath() {
  const candidate = path.resolve(repoRoot, "server", ".env");
  return existsSync(candidate) ? candidate : "";
}

function detectDistributionMode() {
  if (packagedRuntimeDir) {
    return "portable-exe";
  }
  return defaultServerEnvPath ? "repo" : "portable";
}

function buildNextConfig(current, overrides = {}) {
  return {
    bitBrowserPath:
      normalizePathArg(pickArg(overrides, "bitbrowser-path")) || current.bitBrowserPath || "",
    localApiBaseUrl:
      normalizeTextArg(pickArg(overrides, "local-api-base-url")) ||
      current.localApiBaseUrl ||
      defaultLocalApiBaseUrl,
    extensionSourceDir:
      normalizePathArg(pickArg(overrides, "source-dir")) ||
      current.extensionSourceDir ||
      defaultExtensionSourceDir,
    extensionTargetDir:
      normalizePathArg(pickArg(overrides, "target-dir")) ||
      current.extensionTargetDir ||
      defaultExtensionTargetDir,
    serverEnvPath:
      normalizePathArg(pickArg(overrides, "server-env-file")) ||
      current.serverEnvPath ||
      defaultServerEnvPath,
    updatedAt: current.updatedAt || "",
  };
}

async function syncExtensionDirectory(input) {
  const sourceDir = path.resolve(input.sourceDir);
  const targetDir = path.resolve(input.targetDir);
  if (sourceDir === targetDir) {
    return { sourceDir, targetDir };
  }
  if (!existsSync(sourceDir)) {
    throw new Error(`扩展源目录不存在: ${sourceDir}`);
  }

  const sourceStat = await stat(sourceDir);
  if (!sourceStat.isDirectory()) {
    throw new Error(`扩展源目录不是目录: ${sourceDir}`);
  }

  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
  });

  return { sourceDir, targetDir };
}

async function readAgentConfig() {
  if (!existsSync(defaultConfigPath)) {
    return {
      bitBrowserPath: "",
      localApiBaseUrl: defaultLocalApiBaseUrl,
      extensionSourceDir: defaultExtensionSourceDir,
      extensionTargetDir: defaultExtensionTargetDir,
      serverEnvPath: defaultServerEnvPath,
      updatedAt: "",
    };
  }

  const raw = await readFile(defaultConfigPath, "utf8");
  return JSON.parse(raw);
}

async function saveAgentConfig(config) {
  await mkdir(path.dirname(defaultConfigPath), { recursive: true });
  await writeFile(defaultConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function writeServerEnv(filePath, entries) {
  const resolvedPath = path.resolve(filePath);
  const envDir = path.dirname(resolvedPath);
  await mkdir(envDir, { recursive: true });

  const currentContent = existsSync(resolvedPath) ? await readFile(resolvedPath, "utf8") : "";
  const lines = currentContent ? currentContent.split(/\r?\n/) : [];
  const nextLines = [...lines];

  for (const [key, value] of Object.entries(entries)) {
    if (!value) {
      continue;
    }

    const lineValue = `${key}=${value}`;
    const existingIndex = nextLines.findIndex((line) => line.startsWith(`${key}=`));
    if (existingIndex >= 0) {
      nextLines[existingIndex] = lineValue;
      continue;
    }
    nextLines.push(lineValue);
  }

  const normalized = nextLines.filter((line, index, arr) => !(index === arr.length - 1 && line === ""));
  await writeFile(resolvedPath, `${normalized.join(os.EOL)}${os.EOL}`, "utf8");
}

function detectBitBrowserExecutable() {
  const candidates = [
    path.resolve("C:\\Program Files\\BitBrowser\\BitBrowser.exe"),
    path.resolve("C:\\Program Files (x86)\\BitBrowser\\BitBrowser.exe"),
    path.resolve(process.env.LOCALAPPDATA || "", "BitBrowser", "BitBrowser.exe"),
  ];

  return candidates.find((item) => item && existsSync(item)) || "";
}

function listRunningBitBrowserMainProcesses(bitBrowserPath) {
  if (process.platform !== "win32") {
    return [];
  }

  try {
    const script = [
      `$targetPath = '${escapePowerShellLiteral(bitBrowserPath)}'`,
      "Get-CimInstance Win32_Process |",
      "  Where-Object {",
      "    $_.ExecutablePath -eq $targetPath -and",
      "    $_.CommandLine -and",
      "    $_.CommandLine -notmatch '--type='",
      "  } |",
      "  Select-Object ProcessId, CommandLine |",
      "  ConvertTo-Json -Compress",
    ].join(" ");
    const output = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", script],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    if (!output) {
      return [];
    }
    const parsed = JSON.parse(output);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.map((item) => ({
      processId: Number(item.ProcessId) || 0,
      commandLine: String(item.CommandLine || ""),
    }));
  } catch {
    return [];
  }
}

function stopBitBrowserProcesses(bitBrowserPath) {
  if (process.platform !== "win32") {
    return;
  }

  const processName = path.basename(bitBrowserPath);
  try {
    execFileSync("taskkill.exe", ["/F", "/T", "/IM", processName], {
      encoding: "utf8",
      windowsHide: true,
      stdio: "ignore",
    });
  } catch {
    const script = [
      `$targetPath = '${escapePowerShellLiteral(bitBrowserPath)}'`,
      "Get-CimInstance Win32_Process |",
      "  Where-Object { $_.ExecutablePath -eq $targetPath } |",
      "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ].join(" ");
    execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
    });
  }
}

function hasBitBrowserExtensionArgs(commandLine, extensionDir) {
  const normalizedCommandLine = normalizePathArg(commandLine).toLowerCase();
  const normalizedExtensionDir = normalizePathArg(extensionDir).toLowerCase();
  if (!normalizedCommandLine || !normalizedExtensionDir) {
    return false;
  }
  return (
    normalizedCommandLine.includes(`--disable-extensions-except=${normalizedExtensionDir}`) &&
    normalizedCommandLine.includes(`--load-extension=${normalizedExtensionDir}`)
  );
}

function escapePowerShellLiteral(value) {
  return String(value || "").replace(/'/g, "''");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitCommaArgs(value) {
  const normalized = normalizeTextArg(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }

    const body = item.slice(2);
    const equalsIndex = body.indexOf("=");
    if (equalsIndex >= 0) {
      parsed[body.slice(0, equalsIndex)] = body.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[body] = "true";
      continue;
    }

    parsed[body] = next;
    index += 1;
  }
  return parsed;
}

function pickArg(overrides, name) {
  if (overrides && typeof overrides[name] === "string") {
    return overrides[name];
  }
  return args[name];
}

function pickFlag(overrides, name) {
  if (overrides && typeof overrides[name] === "boolean") {
    return overrides[name];
  }
  if (overrides && typeof overrides[name] === "string") {
    return overrides[name] === "true";
  }
  return args[name] === "true";
}

function normalizeTextArg(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizePathArg(value) {
  const normalized = normalizeTextArg(value);
  return normalized ? path.resolve(normalized) : "";
}

function normalizePortArg(value) {
  const raw = normalizeTextArg(value);
  if (!raw) {
    return 0;
  }
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 ? port : 0;
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(data)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (!chunks.length) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function printHelp() {
  console.log(`${agentProductName}

用法:
  node scripts/local-agent/agent.mjs init [--bitbrowser-path <path>] [--local-api-base-url <url>]
  node scripts/local-agent/agent.mjs sync-extension [--source-dir <path>] [--target-dir <path>]
  node scripts/local-agent/agent.mjs write-server-env [--server-env-file <path>] [--local-api-base-url <url>]
  node scripts/local-agent/agent.mjs start-bitbrowser [--bitbrowser-path <path>] [--additional-args <a,b>]
  node scripts/local-agent/agent.mjs serve [--host <host>] [--port <port>]
  node scripts/local-agent/agent.mjs status

说明:
  init               同步扩展、保存本地配置，并可选写入 server/.env
  sync-extension     把仓库里的内置扩展复制到本机固定目录
  write-server-env   只回写 BITBROWSER_LOCAL_API_BASE_URL
  start-bitbrowser   使用内置扩展参数启动 BitBrowser
  serve              启动本地 HTTP 服务，提供健康检查和状态接口
  status             输出当前配置和文件存在状态

默认值:
  BitBrowser Local API 默认使用 ${defaultLocalApiBaseUrl}
  本地 Agent HTTP 默认监听 http://${defaultLocalAgentHost}:${defaultLocalAgentPort}
  便携版 exe 默认直接使用解压目录下的 platform-login-helper
  扩展目录只保存在本地 Agent 配置，不写入云端后端环境变量
  当前版本 ${agentVersion}
`);
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function isAddressInUseError(error) {
  return Boolean(error && typeof error === "object" && error.code === "EADDRINUSE");
}

async function readRunningAgentHealth(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    return {
      productName: payload.productName || agentProductName,
      version: payload.version || agentVersion,
      host: payload.host || host,
      port: Number(payload.port) || port,
      healthUrl: `http://${host}:${port}/health`,
      statusUrl: `http://${host}:${port}/status`,
    };
  } catch {
    return null;
  }
}

function showPackagedLaunchNotice(title, message) {
  if (!process.pkg || process.platform !== "win32") {
    return;
  }

  const script = [
    "Add-Type -AssemblyName PresentationFramework",
    `[System.Windows.MessageBox]::Show('${escapePowerShellLiteral(message)}', '${escapePowerShellLiteral(title)}') | Out-Null`,
  ].join("; ");
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-EncodedCommand", encodedScript],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    },
  );
  child.unref();
}

async function writePackagedLaunchLog(message) {
  if (!process.pkg) {
    return;
  }
  const logPath = path.resolve(path.dirname(process.execPath), "local-agent-launch.log");
  await appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}
