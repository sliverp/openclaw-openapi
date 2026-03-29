#!/usr/bin/env bash
#
# openclaw-openapi 一键安装配置脚本
#
# 用法:
#   bash scripts/setup.sh [options]
#
# 选项:
#   --port PORT         WebSocket 端口 (默认: 3210)
#   --host HOST         监听地址 (默认: 0.0.0.0)
#   --token TOKEN       认证 token (不设置则无需认证)
#   --generate-token    自动生成随机 token
#   --skip-install      跳过插件安装步骤
#   --no-restart        安装后不重启 OpenClaw
#
# 示例:
#   bash scripts/setup.sh --port 3210 --generate-token
#   bash scripts/setup.sh --port 8080 --token my-secret
#   bash scripts/setup.sh --skip-install --port 3210

set -euo pipefail

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}ℹ${NC} $*"; }
success() { echo -e "${GREEN}✅${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC} $*"; }
error()   { echo -e "${RED}❌${NC} $*"; }
step()    { echo -e "\n${BOLD}${CYAN}[$1/$TOTAL_STEPS]${NC} ${BOLD}$2${NC}"; }

# ─── 默认值 ───
PORT=3210
HOST="0.0.0.0"
TOKEN=""
GENERATE_TOKEN=false
SKIP_INSTALL=false
NO_RESTART=false
TOTAL_STEPS=5

# ─── 参数解析 ───
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)          PORT="$2";        shift 2 ;;
    --host)          HOST="$2";        shift 2 ;;
    --token)         TOKEN="$2";       shift 2 ;;
    --generate-token) GENERATE_TOKEN=true; shift ;;
    --skip-install)  SKIP_INSTALL=true; shift ;;
    --no-restart)    NO_RESTART=true;  shift ;;
    --help|-h)
      head -20 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
    *)
      error "未知参数: $1"
      exit 1
      ;;
  esac
done

# ─── 生成 token ───
if [[ "$GENERATE_TOKEN" == "true" && -z "$TOKEN" ]]; then
  TOKEN=$(openssl rand -base64 24 | tr -d '=/+' | head -c 32)
  info "已生成随机 token: ${BOLD}${TOKEN}${NC}"
fi

# ─── 配置文件路径 ───
OPENCLAW_HOME="${OPENCLAW_HOME:-$HOME/.openclaw}"
EXTENSIONS_DIR="$OPENCLAW_HOME/extensions"
CONFIG_FILE="$OPENCLAW_HOME/openclaw.json"
PLUGIN_ID="openclaw-openapi"

echo ""
echo -e "${BOLD}╔════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     OpenClaw Open API 插件安装配置         ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════╝${NC}"
echo ""
info "端口: ${BOLD}$PORT${NC}"
info "地址: ${BOLD}$HOST${NC}"
if [[ -n "$TOKEN" ]]; then
  info "认证: ${BOLD}🔒 已设置${NC}"
else
  info "认证: ${BOLD}🔓 无${NC}"
fi
echo ""

# ─── Step 1: 构建插件 ───
step 1 "构建插件"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

info "插件源码目录: $PLUGIN_DIR"

# 确保 dist 目录存在（如果有 tsconfig.json 则编译）
if [[ -f "$PLUGIN_DIR/tsconfig.json" ]]; then
  if [[ ! -d "$PLUGIN_DIR/dist" ]] || [[ "$PLUGIN_DIR/src/channel.ts" -nt "$PLUGIN_DIR/dist/src/channel.js" ]]; then
    info "编译 TypeScript..."
    (cd "$PLUGIN_DIR" && npm run build 2>&1) || {
      warn "编译有警告，继续..."
    }
  else
    info "dist/ 已是最新"
  fi
fi

# 验证关键文件
if [[ ! -f "$PLUGIN_DIR/dist/index.js" ]]; then
  error "dist/index.js 不存在，请先运行 npm run build"
  exit 1
fi
if [[ ! -f "$PLUGIN_DIR/openclaw.plugin.json" ]]; then
  error "openclaw.plugin.json 不存在"
  exit 1
fi

success "构建完成"

# ─── Step 2: 安装插件到 extensions 目录 ───
if [[ "$SKIP_INSTALL" != "true" ]]; then
  step 2 "安装插件到 extensions 目录"

  TARGET_DIR="$EXTENSIONS_DIR/$PLUGIN_ID"
  mkdir -p "$EXTENSIONS_DIR"

  # 尝试 openclaw plugins install 命令
  INSTALLED_VIA_CLI=false
  if command -v openclaw &>/dev/null; then
    info "尝试通过 openclaw CLI 安装..."
    if (cd "$PLUGIN_DIR" && openclaw plugins install . 2>&1); then
      success "CLI 安装成功"
      INSTALLED_VIA_CLI=true
    else
      warn "CLI 安装失败，使用手动链接方式..."
    fi
  fi

  if [[ "$INSTALLED_VIA_CLI" != "true" ]]; then
    # 手动安装：符号链接到 extensions 目录
    if [[ -L "$TARGET_DIR" ]]; then
      info "移除旧符号链接..."
      rm -f "$TARGET_DIR"
    elif [[ -d "$TARGET_DIR" ]]; then
      info "移除旧安装目录..."
      rm -rf "$TARGET_DIR"
    fi

    ln -sf "$PLUGIN_DIR" "$TARGET_DIR"
    success "已链接: $TARGET_DIR -> $PLUGIN_DIR"
  fi

  # 确保 node_modules/openclaw 符号链接存在（解析 openclaw/plugin-sdk）
  OPENCLAW_GLOBAL=""
  # 尝试找到全局 openclaw 位置
  if command -v openclaw &>/dev/null; then
    OPENCLAW_BIN=$(which openclaw 2>/dev/null || true)
    if [[ -n "$OPENCLAW_BIN" ]]; then
      # 跟随符号链接找到真实路径
      OPENCLAW_REAL=$(readlink -f "$OPENCLAW_BIN" 2>/dev/null || realpath "$OPENCLAW_BIN" 2>/dev/null || echo "")
      if [[ -n "$OPENCLAW_REAL" ]]; then
        # 从 bin 路径向上找到包根目录
        OPENCLAW_GLOBAL=$(cd "$(dirname "$OPENCLAW_REAL")/.." 2>/dev/null && pwd || echo "")
      fi
    fi
  fi

  # 也尝试从 npm global 找
  if [[ -z "$OPENCLAW_GLOBAL" ]] || [[ ! -d "$OPENCLAW_GLOBAL" ]]; then
    NPM_GLOBAL_ROOT=$(npm root -g 2>/dev/null || echo "")
    if [[ -n "$NPM_GLOBAL_ROOT" ]] && [[ -d "$NPM_GLOBAL_ROOT/openclaw" ]]; then
      OPENCLAW_GLOBAL="$NPM_GLOBAL_ROOT/openclaw"
    fi
  fi

  # 创建 openclaw 符号链接
  EFFECTIVE_DIR="$TARGET_DIR"
  if [[ -L "$TARGET_DIR" ]]; then
    EFFECTIVE_DIR=$(readlink -f "$TARGET_DIR" 2>/dev/null || realpath "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")
  fi

  if [[ -n "$OPENCLAW_GLOBAL" ]] && [[ -d "$OPENCLAW_GLOBAL" ]]; then
    mkdir -p "$EFFECTIVE_DIR/node_modules"
    if [[ ! -e "$EFFECTIVE_DIR/node_modules/openclaw" ]]; then
      ln -sf "$OPENCLAW_GLOBAL" "$EFFECTIVE_DIR/node_modules/openclaw"
      success "已链接 openclaw SDK: node_modules/openclaw -> $OPENCLAW_GLOBAL"
    else
      info "node_modules/openclaw 已存在"
    fi
  else
    warn "未找到全局 openclaw 安装路径"
    warn "如果插件加载失败，请手动创建符号链接:"
    warn "  ln -sf \$(npm root -g)/openclaw $EFFECTIVE_DIR/node_modules/openclaw"
  fi

  # 确保 ws 依赖存在
  if [[ ! -d "$EFFECTIVE_DIR/node_modules/ws" ]]; then
    info "安装运行时依赖 ws..."
    (cd "$EFFECTIVE_DIR" && npm install --omit=dev 2>&1) || {
      warn "npm install 失败，尝试仅安装 ws..."
      (cd "$EFFECTIVE_DIR" && npm install ws 2>&1) || true
    }
  fi

else
  step 2 "跳过安装 (--skip-install)"
fi

# ─── Step 3: 写入配置 ───
step 3 "写入配置"

mkdir -p "$OPENCLAW_HOME"

# 如果配置文件不存在则创建空 JSON
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo '{}' > "$CONFIG_FILE"
  info "已创建新配置文件: $CONFIG_FILE"
fi

# 使用 node 来安全地修改 JSON
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));

// 1. 写入 channels.openapi 配置
config.channels = config.channels || {};
config.channels.openapi = {
  ...(config.channels.openapi || {}),
  enabled: true,
  port: $PORT,
  host: '$HOST',
};

const token = '$TOKEN';
if (token) {
  config.channels.openapi.token = token;
}

// 2. 清理 plugins.entries 中的残留条目（避免 stale config 警告）
if (config.plugins?.entries?.['openclaw-openapi'] !== undefined) {
  // 保留有效的 entries 配置，只在值为空/无效时才清理
  const entry = config.plugins.entries['openclaw-openapi'];
  if (!entry || (typeof entry === 'object' && Object.keys(entry).length === 0)) {
    delete config.plugins.entries['openclaw-openapi'];
    if (Object.keys(config.plugins.entries).length === 0) {
      delete config.plugins.entries;
    }
    console.log('已清理 plugins.entries 中的残留 openclaw-openapi 条目');
  }
}

fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
console.log('配置已写入: $CONFIG_FILE');
"

success "配置写入完成"

# ─── Step 4: 验证配置 ───
step 4 "验证配置"

node -e "
const fs = require('fs');
const path = require('path');

// 检查配置
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
const oa = config.channels?.openapi;
if (!oa) { console.error('❌ openapi 段不存在'); process.exit(1); }
if (!oa.enabled) { console.error('❌ openapi 未启用'); process.exit(1); }
console.log('  配置:');
console.log('    启用: ✅');
console.log('    端口: ' + oa.port);
console.log('    地址: ' + oa.host);
console.log('    认证: ' + (oa.token ? '🔒 已设置' : '🔓 无'));

// 检查插件文件
const extDir = '$EXTENSIONS_DIR/$PLUGIN_ID';
const checks = [
  { file: 'openclaw.plugin.json', desc: '插件清单' },
  { file: 'package.json', desc: '包配置' },
  { file: 'dist/index.js', desc: '入口文件' },
];

console.log('');
console.log('  插件文件:');
let allOk = true;
for (const c of checks) {
  const p = path.join(extDir, c.file);
  const exists = fs.existsSync(p);
  console.log('    ' + (exists ? '✅' : '❌') + ' ' + c.desc + ' (' + c.file + ')');
  if (!exists) allOk = false;
}

// 检查 openclaw SDK 链接
const sdkPath = path.join(extDir, 'node_modules', 'openclaw');
const sdkOk = fs.existsSync(sdkPath);
console.log('    ' + (sdkOk ? '✅' : '⚠️') + ' openclaw SDK 链接');

if (!allOk) {
  console.error('');
  console.error('❌ 部分关键文件缺失，插件可能无法加载');
  process.exit(1);
}
"

success "验证通过"

# ─── Step 5: 重启 OpenClaw ───
if [[ "$NO_RESTART" != "true" ]]; then
  step 5 "重启 OpenClaw"

  if command -v openclaw &>/dev/null; then
    openclaw restart 2>/dev/null && success "OpenClaw 已重启" || {
      warn "重启失败，请手动重启: openclaw restart"
    }
  else
    warn "未找到 openclaw 命令，请手动重启"
  fi
else
  step 5 "跳过重启 (--no-restart)"
fi

# ─── 完成 ───
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  安装完成！${NC}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "  WebSocket 地址: ${BOLD}ws://$HOST:$PORT${NC}"
if [[ -n "$TOKEN" ]]; then
  echo -e "  认证 Token:     ${BOLD}$TOKEN${NC}"
fi
echo ""
echo -e "  客户端连接示例:"
echo -e "  ${CYAN}import { OpenClawClient } from '@openclaw/openapi/client';${NC}"
echo ""
echo -e "  ${CYAN}const client = new OpenClawClient({${NC}"
echo -e "  ${CYAN}  url: 'ws://<your-server>:$PORT',${NC}"
if [[ -n "$TOKEN" ]]; then
  echo -e "  ${CYAN}  token: '$TOKEN',${NC}"
fi
echo -e "  ${CYAN}});${NC}"
echo -e "  ${CYAN}await client.connect();${NC}"
echo ""
