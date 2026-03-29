#!/usr/bin/env node

/**
 * openclaw-openapi CLI
 *
 * 命令:
 *   openclaw-openapi setup [options]    配置 Open API 插件
 *   openclaw-openapi install [--force]  安装插件到 OpenClaw
 *   openclaw-openapi uninstall          卸载插件
 *   openclaw-openapi reinstall          卸载后重新安装
 *   openclaw-openapi status             查看状态
 *   openclaw-openapi generate-token     生成随机 token
 *
 * Setup 选项:
 *   --port <port>       WebSocket 监听端口 (默认: 3210)
 *   --host <host>       WebSocket 监听地址 (默认: 0.0.0.0)
 *   --token <token>     认证 token (可选，不设置则无需认证)
 *   --no-token          显式禁用 token 认证
 *   --account <id>      账户 ID (默认: default)
 *   --name <name>       账户名称
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, unlinkSync, lstatSync, rmSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";

// ─── 参数解析 ───
const args = process.argv.slice(2);
const command = args[0];

/** 返回用户实际应该输入的命令前缀 */
function getCmd() {
  const invoked = process.argv[1];
  return invoked && invoked.endsWith("openapi-cli.js")
    ? `node ${invoked}`
    : "openclaw-openapi";
}

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function printUsage() {
  const cmd = getCmd();
  console.log(`
openclaw-openapi — OpenClaw Open API 插件 CLI

用法:
  ${cmd} setup [options]    配置插件
  ${cmd} install [--force]  安装插件
  ${cmd} uninstall          卸载插件
  ${cmd} reinstall          卸载后重新安装
  ${cmd} status             查看当前配置
  ${cmd} generate-token     生成随机 token

Setup 选项:
  --port <port>       WebSocket 端口 (默认: 3210)
  --host <host>       监听地址 (默认: 0.0.0.0)
  --token <token>     认证 token (不设置则无需认证)
  --generate-token    自动生成随机 token
  --no-token          显式移除 token
  --account <id>      账户 ID (默认: default)
  --name <name>       账户显示名称

示例:
  # 快速配置（默认端口 3210，无认证）
  ${cmd} setup

  # 指定端口和 token
  ${cmd} setup --port 8080 --token my-secret

  # 自动生成安全 token
  ${cmd} setup --port 3210 --generate-token

  # 卸载后重新安装
  ${cmd} reinstall

  # 查看当前配置
  ${cmd} status
`);
}

function getOpenClawHome() {
  return process.env.OPENCLAW_HOME || join(homedir(), ".openclaw");
}

function getExtensionsDir() {
  return join(getOpenClawHome(), "extensions");
}

// ─── 配置文件操作 ───
function getConfigPath() {
  return join(getOpenClawHome(), "openclaw.json");
}

function readConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    console.error(`⚠ 无法解析配置文件: ${configPath}`);
    return {};
  }
}

function writeConfig(config) {
  const configPath = getConfigPath();
  const dir = join(configPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return configPath;
}

function generateToken(length = 32) {
  return randomBytes(length).toString("base64url");
}

// ─── 工具函数 ───

function getPluginDir() {
  const __filename = fileURLToPath(import.meta.url);
  return join(dirname(__filename), "..");
}

function getTargetDir() {
  return join(getExtensionsDir(), "openclaw-openapi");
}

/**
 * 移除已安装的插件目录（符号链接或真实目录都能处理）
 * @returns {boolean} 是否成功移除
 */
function removePluginDir() {
  const targetDir = getTargetDir();
  try {
    if (!existsSync(targetDir)) return false;
    const stat = lstatSync(targetDir);
    if (stat.isSymbolicLink()) {
      unlinkSync(targetDir);
      console.log("✅ 已移除插件符号链接");
    } else if (stat.isDirectory()) {
      rmSync(targetDir, { recursive: true, force: true });
      console.log("✅ 已移除插件目录");
    } else {
      unlinkSync(targetDir);
      console.log("✅ 已移除插件文件");
    }
    return true;
  } catch (err) {
    console.error(`⚠ 移除失败: ${err.message}`);
    return false;
  }
}

// ─── 命令实现 ───

function cmdSetup() {
  const port = parseInt(getArg("port") || "3210", 10);
  const host = getArg("host") || "0.0.0.0";
  const accountId = getArg("account") || "default";
  const name = getArg("name");
  const noToken = hasFlag("no-token");
  const genToken = hasFlag("generate-token");

  let token = getArg("token");
  if (genToken && !token) {
    token = generateToken();
    console.log(`🔑 已生成随机 token: ${token}`);
  }

  const config = readConfig();

  // 确保 channels.openapi 段存在
  config.channels = config.channels || {};

  if (accountId === "default") {
    config.channels.openapi = {
      ...(config.channels.openapi || {}),
      enabled: true,
      port,
      host,
    };
    if (token) {
      config.channels.openapi.token = token;
    } else if (noToken) {
      delete config.channels.openapi.token;
    }
    if (name) {
      config.channels.openapi.name = name;
    }
  } else {
    config.channels.openapi = config.channels.openapi || {};
    config.channels.openapi.accounts = config.channels.openapi.accounts || {};
    config.channels.openapi.accounts[accountId] = {
      ...(config.channels.openapi.accounts[accountId] || {}),
      enabled: true,
      port,
      host,
    };
    if (token) {
      config.channels.openapi.accounts[accountId].token = token;
    } else if (noToken) {
      delete config.channels.openapi.accounts[accountId].token;
    }
    if (name) {
      config.channels.openapi.accounts[accountId].name = name;
    }
  }

  const savedPath = writeConfig(config);
  console.log(`\n✅ Open API 配置已写入: ${savedPath}`);
  console.log(`\n📋 当前配置:`);
  printOpenApiConfig(config);
  console.log(`\n💡 重启 OpenClaw 使配置生效: openclaw restart`);
}

function cmdInstall() {
  const force = hasFlag("force");
  console.log("📦 安装 openclaw-openapi 插件...\n");

  const pluginDir = getPluginDir();
  const extensionsDir = getExtensionsDir();
  const targetDir = getTargetDir();

  // 如果目标已存在，先清理
  if (existsSync(targetDir)) {
    if (!force) {
      console.log(`⚠ 插件目录已存在: ${targetDir}`);
      console.log(`  使用 --force 强制重新安装，或先运行 uninstall`);
      console.log(`  提示: ${getCmd()} reinstall 可一键重装\n`);
      return;
    }
    console.log("🗑 清理旧安装...");
    removePluginDir();
  }

  // 先尝试 openclaw CLI
  let installed = false;
  try {
    execSync(`openclaw plugins install "${pluginDir}"`, {
      stdio: "inherit",
    });
    console.log("\n✅ CLI 安装完成");
    installed = true;
  } catch {
    console.log("⚠ CLI 安装失败，使用手动链接方式...\n");
  }

  if (!installed) {
    // 手动符号链接
    mkdirSync(extensionsDir, { recursive: true });

    try {
      symlinkSync(pluginDir, targetDir, "dir");
      console.log(`✅ 已链接: ${targetDir} -> ${pluginDir}`);
      installed = true;
    } catch (err) {
      console.error(`❌ 链接失败: ${err.message}`);
      console.error(`请手动执行: ln -sf "${pluginDir}" "${targetDir}"`);
    }
  }

  if (installed) {
    console.log(`\n💡 接下来运行: ${getCmd()} setup --port 3210`);
    console.log("💡 然后重启:   openclaw restart");
  }
}

function cmdUninstall() {
  const config = readConfig();
  let configChanged = false;

  // 移除通道配置
  if (config.channels?.openapi) {
    delete config.channels.openapi;
    configChanged = true;
    console.log("✅ 已移除 Open API 通道配置");
  } else {
    console.log("ℹ Open API 通道配置不存在，无需移除");
  }

  // 清理 plugins.entries 残留
  if (config.plugins?.entries?.["openclaw-openapi"]) {
    delete config.plugins.entries["openclaw-openapi"];
    configChanged = true;
    console.log("✅ 已清理 plugins.entries 残留");
  }

  if (configChanged) {
    writeConfig(config);
  }

  // 尝试 CLI 卸载
  let cliUninstalled = false;
  try {
    execSync("openclaw plugins uninstall openclaw-openapi", {
      stdio: "inherit",
    });
    cliUninstalled = true;
  } catch {
    // CLI 卸载失败，手动移除
  }

  if (!cliUninstalled) {
    removePluginDir();
  }

  console.log("\n✅ 卸载完成");
  console.log("💡 重启 OpenClaw 使更改生效: openclaw restart");
}

function cmdReinstall() {
  console.log("🔄 重新安装 openclaw-openapi 插件...\n");
  console.log("── 步骤 1: 卸载 ──\n");
  cmdUninstall();
  console.log("\n── 步骤 2: 安装 ──\n");
  // 强制安装模式
  args.push("--force");
  cmdInstall();
}

function cmdStatus() {
  const config = readConfig();
  const section = config.channels?.openapi;

  // 检查插件安装状态
  const targetDir = join(getExtensionsDir(), "openclaw-openapi");
  const pluginInstalled = existsSync(join(targetDir, "openclaw.plugin.json"));
  const entryExists = existsSync(join(targetDir, "dist", "index.js"));

  console.log("📋 Open API 插件状态:\n");
  console.log(`  插件安装: ${pluginInstalled ? "✅ 已安装" : "❌ 未安装"}`);
  console.log(`  入口文件: ${entryExists ? "✅ 存在" : "❌ 缺失"}`);
  console.log(`  安装路径: ${targetDir}`);

  if (!section) {
    console.log("\n  通道配置: ❌ 未配置");
    console.log(`\n💡 运行 ${getCmd()} setup 进行配置`);
    return;
  }

  console.log("\n  通道配置:");
  printOpenApiConfig(config);

  // 检查 stale entries
  if (config.plugins?.entries?.["openclaw-openapi"] && !pluginInstalled) {
    console.log("\n  ⚠ plugins.entries 中存在残留条目（插件未正确安装）");
    console.log(`  💡 运行 ${getCmd()} install 安装插件`);
  }
}

function cmdGenerateToken() {
  const token = generateToken();
  console.log(token);
}

function printOpenApiConfig(config) {
  const section = config.channels?.openapi;
  if (!section) return;

  // 顶层配置
  const enabled = section.enabled ?? false;
  const port = section.port ?? 3210;
  const host = section.host ?? "0.0.0.0";
  const token = section.token;
  const name = section.name;

  console.log(`  账户: default`);
  if (name) console.log(`    名称:   ${name}`);
  console.log(`    启用:   ${enabled ? "✅ 是" : "❌ 否"}`);
  console.log(`    地址:   ws://${host}:${port}`);
  console.log(`    认证:   ${token ? "🔒 已设置" : "🔓 无需认证"}`);

  // 多账户
  if (section.accounts) {
    for (const [id, acc] of Object.entries(section.accounts)) {
      console.log(`\n  账户: ${id}`);
      if (acc.name) console.log(`    名称:   ${acc.name}`);
      console.log(`    启用:   ${acc.enabled ? "✅ 是" : "❌ 否"}`);
      console.log(
        `    地址:   ws://${acc.host || host}:${acc.port || port}`
      );
      console.log(
        `    认证:   ${acc.token ? "🔒 已设置" : token ? "🔒 继承全局" : "🔓 无需认证"}`
      );
    }
  }
}

// ─── 主入口 ───
switch (command) {
  case "setup":
    cmdSetup();
    break;
  case "install":
    cmdInstall();
    break;
  case "uninstall":
    cmdUninstall();
    break;
  case "reinstall":
    cmdReinstall();
    break;
  case "status":
    cmdStatus();
    break;
  case "generate-token":
    cmdGenerateToken();
    break;
  case "--help":
  case "-h":
  case "help":
  case undefined:
    printUsage();
    break;
  default:
    console.error(`未知命令: ${command}`);
    printUsage();
    process.exit(1);
}
