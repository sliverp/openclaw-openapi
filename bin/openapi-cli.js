#!/usr/bin/env node

/**
 * openclaw-openapi CLI
 *
 * 命令:
 *   openclaw-openapi setup [options]   配置 Open API 插件
 *   openclaw-openapi install           安装插件到 OpenClaw
 *
 * Setup 选项:
 *   --port <port>       WebSocket 监听端口 (默认: 3210)
 *   --host <host>       WebSocket 监听地址 (默认: 0.0.0.0)
 *   --token <token>     认证 token (可选，不设置则无需认证)
 *   --no-token          显式禁用 token 认证
 *   --account <id>      账户 ID (默认: default)
 *   --name <name>       账户名称
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { randomBytes } from "crypto";

// ─── 参数解析 ───
const args = process.argv.slice(2);
const command = args[0];

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function printUsage() {
  console.log(`
openclaw-openapi — OpenClaw Open API 插件 CLI

用法:
  openclaw-openapi setup [options]    配置插件
  openclaw-openapi install            安装插件
  openclaw-openapi uninstall          卸载插件
  openclaw-openapi status             查看当前配置
  openclaw-openapi generate-token     生成随机 token

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
  openclaw-openapi setup

  # 指定端口和 token
  openclaw-openapi setup --port 8080 --token my-secret

  # 自动生成安全 token
  openclaw-openapi setup --port 3210 --generate-token

  # 查看当前配置
  openclaw-openapi status
`);
}

// ─── 配置文件操作 ───
function getConfigPath() {
  // 支持 OPENCLAW_HOME 环境变量
  const home = process.env.OPENCLAW_HOME || join(homedir(), ".openclaw");
  return join(home, "openclaw.json");
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
  console.log("📦 安装 openclaw-openapi 插件...\n");
  try {
    execSync("openclaw plugins install @openclaw/openapi", {
      stdio: "inherit",
    });
    console.log("\n✅ 插件安装完成");
    console.log("💡 接下来运行: openclaw-openapi setup --port 3210");
  } catch {
    console.error(
      "\n⚠ 自动安装失败，请尝试手动安装:"
    );
    console.error("  cd <openclaw-openapi 目录> && openclaw plugins install .");
  }
}

function cmdUninstall() {
  const config = readConfig();
  if (config.channels?.openapi) {
    delete config.channels.openapi;
    writeConfig(config);
    console.log("✅ 已移除 Open API 通道配置");
  } else {
    console.log("ℹ Open API 通道配置不存在，无需移除");
  }

  try {
    execSync("openclaw plugins uninstall openclaw-openapi", {
      stdio: "inherit",
    });
  } catch {
    // ignore
  }

  console.log("💡 重启 OpenClaw 使更改生效: openclaw restart");
}

function cmdStatus() {
  const config = readConfig();
  const section = config.channels?.openapi;

  if (!section) {
    console.log("ℹ Open API 通道未配置");
    console.log("💡 运行 openclaw-openapi setup 进行配置");
    return;
  }

  console.log("📋 Open API 当前配置:\n");
  printOpenApiConfig(config);
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
