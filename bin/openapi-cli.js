#!/usr/bin/env node

/**
 * openclaw-openapi CLI — 辅助工具
 *
 * 安装/卸载/配置请直接使用 openclaw 命令：
 *   openclaw plugins install .                                安装插件
 *   openclaw channels add --channel openapi --token "3210:my-secret"  配置通道
 *   openclaw plugins uninstall openclaw-openapi               卸载插件
 *   openclaw restart                                          重启生效
 *
 * 本 CLI 只提供辅助功能：
 *   openclaw-openapi status            查看当前配置和安装状态
 *   openclaw-openapi generate-token    生成随机 token
 */

import { readFileSync, existsSync, lstatSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";

// ─── 参数解析 ───
const args = process.argv.slice(2);
const command = args[0];

function getOpenClawHome() {
  return process.env.OPENCLAW_HOME || join(homedir(), ".openclaw");
}

function getExtensionsDir() {
  return join(getOpenClawHome(), "extensions");
}

function getConfigPath() {
  return join(getOpenClawHome(), "openclaw.json");
}

function readConfig() {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

// ─── 命令实现 ───

function cmdStatus() {
  const config = readConfig();
  const section = config.channels?.openapi;

  // 检查插件安装状态
  const targetDir = join(getExtensionsDir(), "openclaw-openapi");
  const pluginInstalled = existsSync(join(targetDir, "openclaw.plugin.json"));
  const entryExists = existsSync(join(targetDir, "dist", "index.js"));
  const isSymlink = existsSync(targetDir) && lstatSync(targetDir).isSymbolicLink();

  console.log("📋 Open API 插件状态:\n");
  console.log(`  插件安装: ${pluginInstalled ? "✅ 已安装" : "❌ 未安装"}`);
  console.log(`  入口文件: ${entryExists ? "✅ 存在" : "❌ 缺失 (需要先 npm run build)"}`);
  console.log(`  安装方式: ${isSymlink ? "符号链接" : pluginInstalled ? "目录复制" : "未安装"}`);
  console.log(`  安装路径: ${targetDir}`);

  if (!section) {
    console.log("\n  通道配置: ❌ 未配置");
    console.log("\n💡 运行: openclaw channels add --channel openapi --token \"<port>:<token>\"");
    return;
  }

  console.log("\n  通道配置:");
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
      console.log(`    地址:   ws://${acc.host || host}:${acc.port || port}`);
      console.log(`    认证:   ${acc.token ? "🔒 已设置" : token ? "🔒 继承全局" : "🔓 无需认证"}`);
    }
  }
}

function cmdGenerateToken() {
  console.log(randomBytes(32).toString("base64url"));
}

function printUsage() {
  console.log(`
openclaw-openapi — OpenClaw Open API 插件

安装:
  cd /path/to/openclaw-openapi
  npm install && npm run build
  openclaw plugins install .

配置:
  openclaw channels add --channel openapi --token "<port>:<token>"
  openclaw restart

  token 格式支持:
    "3210"                 只指定端口，无认证
    "my-secret"            默认端口 3210，使用 token 认证
    "3210:my-secret"       指定端口 + token
    "0.0.0.0:3210:secret"  指定 host + 端口 + token

卸载:
  openclaw plugins uninstall openclaw-openapi

辅助命令:
  openclaw-openapi status            查看当前配置和安装状态
  openclaw-openapi generate-token    生成随机 token
`);
}

// ─── 主入口 ───
switch (command) {
  case "status":
    cmdStatus();
    break;
  case "generate-token":
    cmdGenerateToken();
    break;
  case "setup":
  case "install":
  case "uninstall":
  case "reinstall":
    console.log(`\n⚠ "${command}" 命令已移除，请直接使用 openclaw 命令：\n`);
    if (command === "install" || command === "reinstall") {
      console.log("  安装: openclaw plugins install .");
      console.log('  配置: openclaw channels add --channel openapi --token "3210:my-secret"');
      console.log("  重启: openclaw restart");
    } else if (command === "uninstall") {
      console.log("  卸载: openclaw plugins uninstall openclaw-openapi");
      console.log("  重启: openclaw restart");
    } else if (command === "setup") {
      console.log('  配置: openclaw channels add --channel openapi --token "3210:my-secret"');
      console.log("  重启: openclaw restart");
    }
    console.log("");
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
