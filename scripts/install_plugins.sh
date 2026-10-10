#!/usr/bin/env bash
# ==============================================================================
# Game Dev Starter Kit — Plugin Installer
# Links (or copies) the two bundled Antigravity plugins into
# ~/.gemini/config/plugins/ and enables them when running inside Antigravity.
#   1. agy-game-studio  (Playtest Studio UI Extension + 11 Game Dev Skills)
#   2. agy-paint-studio (Paint Studio UI Extension + /paint-studio Skill)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGINS_SRC_DIR="${REPO_ROOT}/plugins"
PLUGINS_DST_DIR="${HOME}/.gemini/config/plugins"

FORCE=0
MODE="symlink"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Installs the two bundled Antigravity plugins into ${PLUGINS_DST_DIR}:
  - agy-game-studio  (2D Game Studio & Playtest Studio UI Extension)
  - agy-paint-studio (Paint Studio UI Extension)

Options:
  -f, --force    Overwrite existing plugin directories or symlinks in ${PLUGINS_DST_DIR}
  --copy         Copy plugin directories instead of creating symlinks (default: symlink)
  -h, --help     Show this help message and exit
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--force)
      FORCE=1
      shift
      ;;
    --copy)
      MODE="copy"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option '$1'" >&2
      usage >&2
      exit 2
      ;;
  esac
done

mkdir -p "${PLUGINS_DST_DIR}"

PLUGINS=("agy-game-studio" "agy-paint-studio")

for plugin in "${PLUGINS[@]}"; do
  src="${PLUGINS_SRC_DIR}/${plugin}"
  dst="${PLUGINS_DST_DIR}/${plugin}"

  if [[ ! -d "${src}" ]]; then
    echo "ERROR: Bundled plugin source directory not found: ${src}" >&2
    exit 1
  fi

  if [[ -e "${dst}" || -L "${dst}" ]]; then
    if [[ "${FORCE}" -eq 0 ]]; then
      if [[ -L "${dst}" ]]; then
        target="$(readlink "${dst}")"
        echo "[OK] ${plugin} is already linked at ${dst} -> ${target} (use --force to relink)"
      else
        echo "[OK] ${plugin} is already installed at ${dst} (use --force to overwrite)"
      fi
      continue
    fi
    rm -rf "${dst}"
  fi

  if [[ "${MODE}" == "symlink" ]]; then
    ln -s "${src}" "${dst}"
    echo "[INSTALLED] Linked ${dst} -> ${src}"
  else
    cp -R "${src}" "${dst}"
    echo "[INSTALLED] Copied ${src} -> ${dst}"
  fi
done

# Enable both plugins live via the Antigravity Language Server if reachable
if [[ -n "${ANTIGRAVITY_CSRF_TOKEN:-}" ]]; then
  LS_ADDR="${ANTIGRAVITY_LS_ADDRESS:-localhost:5387}"
  for plugin in "${PLUGINS[@]}"; do
    curl -sS -X POST \
      "http://${LS_ADDR}/exa.language_server_pb.LanguageServerService/JetboxWriteState" \
      -H "Content-Type: application/json" \
      -H "x-codeium-csrf-token: ${ANTIGRAVITY_CSRF_TOKEN}" \
      -d "{\"userConfig\":{\"plugins\":{\"${plugin}\":{\"enabled\":true}}}}" >/dev/null 2>&1 || true
  done
  echo "[ENABLED] Enabled agy-game-studio and agy-paint-studio in Antigravity."
fi

echo ""
echo "✅ Both plugins are installed in ${PLUGINS_DST_DIR}."
echo "   Restart Antigravity if this is your first time installing them, or check Customizations -> Installed."
