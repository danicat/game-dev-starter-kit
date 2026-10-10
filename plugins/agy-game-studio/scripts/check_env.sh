#!/usr/bin/env bash
# ==============================================================================
# Antigravity 2D Game Studio (agy-game-studio) — Environment Doctor Script
# Validates required toolchain, WASM runtime assets, and Gemini credentials.
# ==============================================================================

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<EOF
Usage: $(basename "$0")

Validates local environment prerequisites for Antigravity 2D Game Studio:
  - go (Go 1.26+ compiler)
  - wasm_exec.js (Go WebAssembly runtime support in GOROOT)
  - node (Node.js runtime for studio sidecars)
  - uv (Python package & script runner for Nano Banana 2.1, Lyria 3.5, and sprite tools)
  - python3 (Python 3.10+ runtime)
  - file / mimetype (Binary asset container validation)
  - Gemini Credentials (GEMINI_API_KEY or Vertex AI ADC)
  - godoctor (Optional/Recommended: Go verification, test analytics, and mutation testing)
  - kungfu (Optional/Recommended: Agent Skills Gateway CLI)
EOF
  exit 0
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
REMEDIATIONS=()
NOTES=()

record_row() {
  local component="$1"
  local status="$2"
  local details="$3"
  local fix="${4:-}"

  local color="$GREEN"
  if [[ "$status" == "FAIL" ]]; then
    color="$RED"
    ERRORS=$((ERRORS + 1))
    REMEDIATIONS+=("${BOLD}${component}${NC}: ${fix}")
  elif [[ "$status" == "WARN" ]]; then
    color="$YELLOW"
    WARNINGS=$((WARNINGS + 1))
    [[ -n "$fix" ]] && NOTES+=("${BOLD}${component}${NC}: ${fix}")
  fi

  printf "│ %-20s │ ${color}%-6s${NC} │ %-46s │\n" "$component" "$status" "${details:0:46}"
}

echo -e "${BLUE}${BOLD}==================================================================================${NC}"
echo -e "${BLUE}${BOLD}        Antigravity 2D Game Studio (agy-game-studio) — Environment Doctor        ${NC}"
echo -e "${BLUE}${BOLD}==================================================================================${NC}"
echo ""
printf "┌──────────────────────┬────────┬────────────────────────────────────────────────┐\n"
printf "│ %-20s │ %-6s │ %-46s │\n" "Component" "Status" "Details"
printf "├──────────────────────┼────────┼────────────────────────────────────────────────┤\n"

# 1. Check Go (1.26+)
if command -v go >/dev/null 2>&1; then
  GO_RAW="$(go version | awk '{print $3}')"
  GO_VER="${GO_RAW#go}"
  GO_MAJOR="$(echo "$GO_VER" | cut -d. -f1)"
  GO_MINOR="$(echo "$GO_VER" | cut -d. -f2)"
  if [[ "$GO_MAJOR" -gt 1 ]] || { [[ "$GO_MAJOR" -eq 1 ]] && [[ "$GO_MINOR" -ge 26 ]]; }; then
    record_row "go" "PASS" "Go ${GO_VER} installed"
  else
    record_row "go" "FAIL" "Go ${GO_VER} found (1.26+ required)" \
      "Upgrade Go to 1.26+: 'brew upgrade go' or download from https://go.dev/dl/"
  fi
else
  record_row "go" "FAIL" "go binary not found in PATH" \
    "Install Go 1.26+: 'brew install go' or download from https://go.dev/dl/"
fi

# 2. Check Go WebAssembly Support (wasm_exec.js)
if command -v go >/dev/null 2>&1; then
  GOROOT_PATH="$(go env GOROOT)"
  if [[ -f "${GOROOT_PATH}/lib/wasm/wasm_exec.js" ]]; then
    record_row "wasm_exec.js" "PASS" "Found in GOROOT/lib/wasm/wasm_exec.js"
  elif [[ -f "${GOROOT_PATH}/misc/wasm/wasm_exec.js" ]]; then
    record_row "wasm_exec.js" "PASS" "Found in GOROOT/misc/wasm/wasm_exec.js"
  else
    record_row "wasm_exec.js" "FAIL" "Missing wasm_exec.js in ${GOROOT_PATH}" \
      "Reinstall Go 1.26+ standard library from https://go.dev/dl/"
  fi
else
  record_row "wasm_exec.js" "FAIL" "Cannot check (go not installed)" \
    "Install Go 1.26+ first"
fi

# 3. Check Node.js (for Studio Sidecars)
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node --version 2>&1 | head -n1)"
  record_row "node" "PASS" "Node.js ${NODE_VER}"
else
  record_row "node" "FAIL" "node binary not found in PATH" \
    "Install Node.js 20+: 'brew install node' or https://nodejs.org/"
fi

# 4. Check uv
if command -v uv >/dev/null 2>&1; then
  UV_VER="$(uv --version 2>&1 | head -n1)"
  record_row "uv" "PASS" "${UV_VER:0:46}"
else
  record_row "uv" "FAIL" "uv binary not found in PATH" \
    "Install uv: 'curl -LsSf https://astral.sh/uv/install.sh | sh' or 'brew install uv'"
fi

# 5. Check python3
if command -v python3 >/dev/null 2>&1; then
  PY_VER="$(python3 --version 2>&1 | head -n1)"
  record_row "python3" "PASS" "${PY_VER:0:46}"
else
  record_row "python3" "FAIL" "python3 binary not found in PATH" \
    "Install Python 3.10+: 'brew install python' or https://www.python.org/downloads/"
fi

# 6. Check godoctor (Recommended / Optional)
if command -v godoctor >/dev/null 2>&1; then
  GD_PATH="$(command -v godoctor)"
  record_row "godoctor (optional)" "PASS" "Found (${GD_PATH:0:36})"
else
  record_row "godoctor (optional)" "WARN" "Not installed (recommended)" \
    "Optional: 'go install github.com/danicat/godoctor@latest'"
fi

# 7. Check kungfu (Recommended / Optional)
if command -v kungfu >/dev/null 2>&1; then
  KF_VER="$(kungfu --version 2>&1 | head -n1 || echo "kungfu installed")"
  record_row "kungfu (optional)" "PASS" "${KF_VER:0:46}"
else
  record_row "kungfu (optional)" "WARN" "Not installed (recommended)" \
    "Optional: 'go install github.com/danicat/kungfu@latest'"
fi

# 8. Check file / mimetype utility
if command -v file >/dev/null 2>&1; then
  record_row "file utility" "PASS" "Found ($(command -v file))"
elif command -v mimetype >/dev/null 2>&1; then
  record_row "file utility" "PASS" "Found ($(command -v mimetype))"
else
  record_row "file utility" "FAIL" "Neither 'file' nor 'mimetype' found" \
    "Install 'file' utility for binary asset MIME-type verification"
fi

# 9. Check Gemini Credentials (GEMINI_API_KEY or Vertex AI ADC + GCP Project)
ADC_FILE="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"
GCP_PROJECT="${GOOGLE_CLOUD_PROJECT:-}"
if [[ -z "$GCP_PROJECT" ]] && command -v gcloud >/dev/null 2>&1; then
  GCP_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
  [[ "$GCP_PROJECT" == "(unset)" ]] && GCP_PROJECT=""
fi

if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  record_row "Gemini Auth" "PASS" "GEMINI_API_KEY is set in environment"
elif [[ -n "$GCP_PROJECT" && -f "$ADC_FILE" ]]; then
  record_row "Gemini Auth" "PASS" "Vertex AI ADC (project: ${GCP_PROJECT:0:22})"
elif [[ -n "$GCP_PROJECT" ]]; then
  record_row "Gemini Auth" "FAIL" "GCP project (${GCP_PROJECT:0:18}) set, ADC missing" \
    "Run 'gcloud auth application-default login' or export GEMINI_API_KEY='<your-key>'"
else
  record_row "Gemini Auth" "FAIL" "Neither GEMINI_API_KEY nor Vertex ADC configured" \
    "Export GEMINI_API_KEY='<your-key>' OR run 'gcloud auth application-default login'"
fi
printf "└──────────────────────┴────────┴────────────────────────────────────────────────┘\n"

if [[ "$WARNINGS" -gt 0 ]]; then
  echo ""
  echo -e "${YELLOW}${BOLD}Optional Recommendations:${NC}"
  for note in "${NOTES[@]}"; do
    echo -e "  • ${note}"
  done
fi

if [[ "$ERRORS" -gt 0 ]]; then
  echo ""
  echo -e "${RED}${BOLD}❌ ENVIRONMENT CHECK FAILED: ${ERRORS} required check(s) did not pass.${NC}"
  echo -e "${YELLOW}${BOLD}Actionable Remediation Steps:${NC}"
  for fix in "${REMEDIATIONS[@]}"; do
    echo -e "  • ${fix}"
  done
  exit 1
fi

echo ""
echo -e "${GREEN}${BOLD}✅ ENVIRONMENT CHECK PASSED: All required tools and credentials are ready.${NC}"
exit 0
