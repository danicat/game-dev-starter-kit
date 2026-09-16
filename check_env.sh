#!/usr/bin/env bash

# ==============================================================================
# GopherCon UK 2026: Workshop Environment Doctor Script
# Session: Vibe Code a 2D Game with Go and Gemini
# ==============================================================================

set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo -e "${BLUE}${BOLD}"
echo "=========================================================================="
echo "   GopherCon UK 2026: Vibe Coding Workshop Environment Check (check_env)  "
echo "=========================================================================="
echo -e "${NC}"

pass() {
    echo -e "  [${GREEN}PASS${NC}] $1"
}

fail() {
    echo -e "  [${RED}FAIL${NC}] $1"
    echo -e "         ${YELLOW}↳ FIX: $2${NC}\n"
    ERRORS=$((ERRORS + 1))
}

warn() {
    echo -e "  [${YELLOW}WARN${NC}] $1"
    echo -e "         ${YELLOW}↳ NOTE: $2${NC}\n"
    WARNINGS=$((WARNINGS + 1))
}

# 1. Check Go 1.26+
echo -e "${BOLD}1. Checking Go Compiler (1.26+)...${NC}"
if command -v go >/dev/null 2>&1; then
    GO_VER_STR=$(go version | awk '{print $3}' | sed 's/go//')
    # Parse version major.minor
    GO_MAJOR=$(echo "$GO_VER_STR" | cut -d. -f1)
    GO_MINOR=$(echo "$GO_VER_STR" | cut -d. -f2)
    if [ "$GO_MAJOR" -gt 1 ] || { [ "$GO_MAJOR" -eq 1 ] && [ "$GO_MINOR" -ge 26 ]; }; then
        pass "Go version $GO_VER_STR is installed."
    else
        fail "Go version $GO_VER_STR installed, but Go 1.26+ is required." "Upgrade Go to 1.26+ from https://go.dev/dl/ or run 'brew upgrade go'."
    fi
else
    fail "Go compiler is not installed." "Install Go 1.26+ from https://go.dev/doc/install or run 'brew install go'."
fi

# 2. Check uv Package Runner
echo -e "${BOLD}2. Checking uv Python Package Runner...${NC}"
if command -v uv >/dev/null 2>&1; then
    UV_VER=$(uv --version 2>&1 | head -n1)
    pass "uv is installed ($UV_VER)."
else
    fail "uv package runner is not installed." "Install uv by running: 'curl -LsSf https://astral.sh/uv/install.sh | sh' or 'brew install uv'."
fi

# 3. Check Python 3.10+
echo -e "${BOLD}3. Checking Python 3...${NC}"
if command -v python3 >/dev/null 2>&1; then
    PY_VER=$(python3 --version 2>&1)
    pass "$PY_VER is installed."
else
    fail "python3 is not installed." "Install Python 3.10+ from https://www.python.org/downloads/ or run 'brew install python'."
fi

# 4. Check Antigravity / agy CLI
echo -e "${BOLD}4. Checking Antigravity CLI (agy)...${NC}"
if command -v agy >/dev/null 2>&1; then
    AGY_VER=$(agy --version 2>&1 | head -n1)
    pass "Antigravity CLI (agy) is installed ($AGY_VER)."
elif command -v antigravity >/dev/null 2>&1; then
    AGY_VER=$(antigravity --version 2>&1 | head -n1)
    pass "Antigravity CLI is installed ($AGY_VER)."
else
    fail "Antigravity CLI (agy) is not installed." "Install agy CLI by running 'npm install -g @google/antigravity-cli' or see workshop setup guide."
fi

# 5. Check gcloud CLI
echo -e "${BOLD}5. Checking Google Cloud SDK (gcloud CLI)...${NC}"
if command -v gcloud >/dev/null 2>&1; then
    pass "gcloud CLI is installed."
else
    fail "gcloud CLI is not installed." "Install gcloud CLI from https://cloud.google.com/sdk/docs/install or run 'brew install --cask google-cloud-sdk'."
fi

# 6. Check Google Application Default Credentials (ADC)
echo -e "${BOLD}6. Checking GCP Application Default Credentials (ADC)...${NC}"
if command -v gcloud >/dev/null 2>&1; then
    if gcloud auth application-default print-access-token >/dev/null 2>&1; then
        pass "GCP Application Default Credentials (ADC) are active and valid."
    else
        fail "GCP ADC credentials are missing or expired." "Authenticate with Vertex AI by running: 'gcloud auth application-default login'."
    fi
else
    warn "Skipping ADC check (gcloud not found)." "Run 'gcloud auth application-default login' after installing gcloud."
fi

# 7. Check Git
echo -e "${BOLD}7. Checking Git...${NC}"
if command -v git >/dev/null 2>&1; then
    pass "git is installed ($(git --version))."
else
    fail "git is not installed." "Install git from https://git-scm.com/ or run 'brew install git'."
fi

# 8. Check WebAssembly Support Assets (wasm_exec.js)
echo -e "${BOLD}8. Checking Go WebAssembly Execution Support (wasm_exec.js)...${NC}"
if command -v go >/dev/null 2>&1; then
    GOROOT_PATH=$(go env GOROOT)
    WASM_EXEC_1="$GOROOT_PATH/lib/wasm/wasm_exec.js"
    WASM_EXEC_2="$GOROOT_PATH/misc/wasm/wasm_exec.js"
    if [ -f "$WASM_EXEC_1" ]; then
        pass "wasm_exec.js located at $WASM_EXEC_1."
    elif [ -f "$WASM_EXEC_2" ]; then
        pass "wasm_exec.js located at $WASM_EXEC_2."
    else
        fail "wasm_exec.js not found in Go installation ($GOROOT_PATH)." "Ensure Go standard library wasm files are present. Reinstall Go 1.26+ from https://go.dev/dl/."
    fi
fi

# 9. Check File Identification Utility (file or mimetype)
echo -e "${BOLD}9. Checking File Identification Tools (file / mimetype)...${NC}"
if command -v file >/dev/null 2>&1; then
    pass "'file' utility is installed."
elif command -v mimetype >/dev/null 2>&1; then
    pass "'mimetype' utility is installed."
else
    warn "'file' or 'mimetype' CLI utility not found." "Install 'file' or 'mimetype' CLI utility for asset format validation."
fi

# ==============================================================================
# Final Summary
# ==============================================================================
echo -e "\n--------------------------------------------------------------------------"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}🎉 ENVIRONMENT CHECK PASSED! All prerequisites are ready for the workshop.${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}Note: $WARNINGS warning(s) detected, but all core dependencies are functional.${NC}"
    fi
    exit 0
else
    echo -e "${RED}${BOLD}❌ ENVIRONMENT CHECK FAILED: $ERRORS required dependency issue(s) detected.${NC}"
    echo -e "${RED}Please apply the fixes listed above before starting the workshop session.${NC}"
    exit 1
fi
