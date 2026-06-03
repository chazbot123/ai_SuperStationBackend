#!/usr/bin/env node

import { rm, mkdir, cp, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const packageJsonPath = path.resolve(repoRoot, "package.json");
const agentSourcePath = path.resolve(__dirname, "agent.mjs");
const extensionSourceDir = path.resolve(
  repoRoot,
  "scripts",
  "browser-extension",
  "platform-login-helper",
);
const outputRoot = path.resolve(__dirname, "dist");
const publicDownloadDir = path.resolve(repoRoot, "server", ".runtime", "downloads");
const packageExecutableName = "AI-SuperWeb-Local-Agent.exe";
const fixedPackageZipName = "AI-SuperWeb-Local-Agent.zip";
const execFileAsync = promisify(execFile);

async function main() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const version = String(packageJson.version || "0.0.0").trim() || "0.0.0";
  const packageDir = path.resolve(outputRoot, `ai-superweb-local-agent-v${version}`);
  const outputZipPath = path.resolve(outputRoot, `ai-superweb-local-agent-v${version}.zip`);
  const outputExePath = path.resolve(packageDir, packageExecutableName);
  const fixedZipPath = path.resolve(publicDownloadDir, fixedPackageZipName);
  const packagedAgentEntryPath = path.resolve(outputRoot, "_pkg", "agent.cjs");

  await rm(packageDir, { recursive: true, force: true });
  await rm(outputZipPath, { force: true });
  await rm(fixedZipPath, { force: true });
  await mkdir(packageDir, { recursive: true });
  await mkdir(publicDownloadDir, { recursive: true });
  await createPackagedAgentEntrypoint(packagedAgentEntryPath);

  await buildWindowsExecutable(outputExePath, packagedAgentEntryPath);
  await cp(extensionSourceDir, path.resolve(packageDir, "platform-login-helper"), {
    recursive: true,
    force: true,
  });
  await writeFile(
    path.resolve(packageDir, "README.txt"),
    createReadme(version),
    "utf8",
  );
  await writeFile(
    path.resolve(packageDir, "start-local-agent-debug.cmd"),
    createDebugLauncherScript(),
    "utf8",
  );
  await writeFile(
    path.resolve(packageDir, "client-manifest.json"),
    `${JSON.stringify(
      {
        productName: "AI SuperWeb Local Agent",
        version,
        entry: packageExecutableName,
        localAgentBaseUrl: "http://127.0.0.1:3210",
        bundledExtensionDir: "platform-login-helper",
        builtAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await buildZip(packageDir, outputZipPath);
  await cp(outputZipPath, fixedZipPath, { force: true });

  process.stdout.write(
    `${JSON.stringify(
      {
        productName: "AI SuperWeb Local Agent",
        version,
        packageDir,
        outputZipPath,
        fixedZipPath,
      },
      null,
      2,
    )}\n`,
  );
}

async function buildWindowsExecutable(outputExePath, packagedAgentEntryPath) {
  const debugReportPath = path.resolve(outputRoot, "pkg-build-debug.json");
  const pkgArgs = [
    path.resolve(repoRoot, "node_modules", "@yao-pkg", "pkg", "lib-es5", "bin.js"),
    packagedAgentEntryPath,
    "--targets",
    "node20-win-x64",
    "--output",
    outputExePath,
    "--public",
    "--public-packages",
    "*",
    "--no-bytecode",
  ];

  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(process.execPath, pkgArgs, {
      cwd: repoRoot,
      windowsHide: true,
    });
    stdout = result.stdout || "";
    stderr = result.stderr || "";
  } catch (error) {
    stdout = typeof error?.stdout === "string" ? error.stdout : "";
    stderr = typeof error?.stderr === "string" ? error.stderr : "";
    await writeFile(
      debugReportPath,
      `${JSON.stringify(
        {
          success: false,
          processExecPath: process.execPath,
          agentSourcePath,
          packagedAgentEntryPath,
          outputExePath,
          pkgArgs,
          stdout,
          stderr,
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    throw error;
  }

  await writeFile(
    debugReportPath,
    `${JSON.stringify(
      {
        success: true,
        processExecPath: process.execPath,
        agentSourcePath,
        packagedAgentEntryPath,
        outputExePath,
        pkgArgs,
        stdout,
        stderr,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await stat(outputExePath);
}

async function createPackagedAgentEntrypoint(outputPath) {
  const agentSource = await readFile(agentSourcePath, "utf8");
  const packagedSource = agentSource
    .replace(
      'import { execFileSync, spawn } from "node:child_process";',
      'const { execFileSync, spawn } = require("node:child_process");',
    )
    .replace(
      'import { existsSync } from "node:fs";',
      'const { existsSync } = require("node:fs");',
    )
    .replace(
      'import { appendFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";',
      'const { appendFile, cp, mkdir, readFile, stat, writeFile } = require("node:fs/promises");',
    )
    .replace(
      'import { createServer } from "node:http";',
      'const { createServer } = require("node:http");',
    )
    .replace('import os from "node:os";', 'const os = require("node:os");')
    .replace('import path from "node:path";', 'const path = require("node:path");')
    .replace(
      'import { fileURLToPath } from "node:url";',
      'const { pathToFileURL } = require("node:url");',
    )
    .replace(
      'const __filename = fileURLToPath(import.meta.url);\nconst __dirname = path.dirname(__filename);\n',
      '',
    )
    .replaceAll("import.meta.url", "pathToFileURL(__filename).href");

  if (/^\s*import\s/m.test(packagedSource)) {
    throw new Error("打包入口转换失败：agent.cjs 中仍残留 ESM import 语句");
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, packagedSource, "utf8");
}

async function buildZip(sourceDir, zipFilePath) {
  const zip = new JSZip();
  await addDirectoryToZip(zip, sourceDir, sourceDir);
  const content = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  await writeFile(zipFilePath, content);
}

async function addDirectoryToZip(zip, baseDir, currentDir) {
  const entries = await import("node:fs/promises").then(({ readdir }) =>
    readdir(currentDir, { withFileTypes: true }),
  );
  for (const entry of entries) {
    const absolutePath = path.resolve(currentDir, entry.name);
    const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, baseDir, absolutePath);
      continue;
    }
    const fileBuffer = await readFile(absolutePath);
    zip.file(relativePath, fileBuffer);
  }
}

function createReadme(version) {
  return `AI SuperWeb Local Agent v${version}

一、用户需要准备什么
1. 已安装 BitBrowser
2. 本地客户端压缩包（解压后使用）

二、用户实际上感知到几样东西
1. BitBrowser
2. 本地客户端

说明：
- 浏览器扩展已经内置在本地客户端里
- 用户不需要单独下载或手动安装扩展

三、首次使用
1. 解压当前 zip 到任意本地目录
2. 双击 ${packageExecutableName}
3. 回到平台页面，点击对应平台登录
4. 如果双击 exe 仍闪退，可改为双击 start-local-agent-debug.cmd 收集日志

四、默认地址
- 本地客户端: http://127.0.0.1:3210
- BitBrowser Local API 默认值: http://127.0.0.1:54345

五、当前交付边界
- 当前是便携版 zip 包
- zip 内包含单文件 exe 和内置扩展目录
- 已内置扩展
- 还不是完整桌面安装器
- 如需安装器/自动升级，可在下一阶段继续补
`;
}

function createDebugLauncherScript() {
  return `@echo off
setlocal
cd /d "%~dp0"
set "LOG_FILE=%~dp0local-agent-wrapper.log"
echo ==== [%date% %time%] launch start ====>>"%LOG_FILE%"
"%~dp0AI-SuperWeb-Local-Agent.exe" >>"%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
echo ==== [%date% %time%] exit code: %EXIT_CODE% ====>>"%LOG_FILE%"
echo.
echo Debug log: %LOG_FILE%
echo Exit code: %EXIT_CODE%
pause
`;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`[local-agent-build] ${message}\n`);
  process.exit(1);
});
