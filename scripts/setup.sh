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
TOTAL_STEPS=4

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
CONFIG_FILE="$OPENCLAW_HOME/openclaw.json"

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

# ─── Step 1: 安装插件 ───
if [[ "$SKIP_INSTALL" != "true" ]]; then
  step 1 "安装插件"

  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

  if command -v openclaw &>/dev/null; then
    info "通过 openclaw CLI 安装..."
    (cd "$PLUGIN_DIR" && openclaw plugins install .) || {
      warn "CLI 安装失败，尝试手动链接..."
      mkdir -p "$OPENCLAW_HOME/plugins"
      ln -sf "$PLUGIN_DIR" "$OPENCLAW_HOME/plugins/openclaw-openapi"
      success "已手动链接插件目录"
    }
  else
    warn "未找到 openclaw 命令，尝试手动链接..."
    mkdir -p "$OPENCLAW_HOME/plugins"
    ln -sf "$PLUGIN_DIR" "$OPENCLAW_HOME/plugins/openclaw-openapi"
    success "已手动链接插件目录"
  fi
else
  step 1 "跳过安装 (--skip-install)"
fi

# ─── Step 2: 写入配置 ───
step 2 "写入配置"

mkdir -p "$OPENCLAW_HOME"

# 如果配置文件不存在则创建空 JSON
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo '{}' > "$CONFIG_FILE"
  info "已创建新配置文件: $CONFIG_FILE"
fi

# 使用 node 来安全地修改 JSON（避免 jq 依赖）
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));

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

fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2) + '\n');
console.log('配置已写入: $CONFIG_FILE');
"

success "配置写入完成"

# ─── Step 3: 验证配置 ───
step 3 "验证配置"

node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
const oa = config.channels?.openapi;
if (!oa) { console.error('❌ openapi 段不存在'); process.exit(1); }
if (!oa.enabled) { console.error('❌ openapi 未启用'); process.exit(1); }
console.log('  启用: ✅');
console.log('  端口: ' + oa.port);
console.log('  地址: ' + oa.host);
console.log('  认证: ' + (oa.token ? '🔒 已设置' : '🔓 无'));
"

success "配置验证通过"

# ─── Step 4: 重启 OpenClaw ───
if [[ "$NO_RESTART" != "true" ]]; then
  step 4 "重启 OpenClaw"

  if command -v openclaw &>/dev/null; then
    openclaw restart 2>/dev/null && success "OpenClaw 已重启" || {
      warn "重启失败，请手动重启: openclaw restart"
    }
  else
    warn "未找到 openclaw 命令，请手动重启"
  fi
else
  step 4 "跳过重启 (--no-restart)"
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
