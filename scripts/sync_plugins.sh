#!/usr/bin/env bash
# ==============================================================================
# Game Dev Starter Kit — Upstream Plugin Sync Tool
# Synchronizes ./plugins/agy-game-studio and ./plugins/agy-paint-studio with
# their standalone repositories in /Users/petruzalek/projects/.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_PLUGINS_DIR="${REPO_ROOT}/plugins"
PROJECTS_ROOT="${UPSTREAM_PROJECTS_DIR:-/Users/petruzalek/projects}"

ALL_PLUGINS=(
  "agy-game-studio"
  "agy-paint-studio"
)

usage() {
  cat <<EOF
Usage: $(basename "$0") <mode> [options]

Synchronize or diff bundled plugins (./plugins/<name>) with their standalone
repositories (${PROJECTS_ROOT}/<name>).

Modes (mutually exclusive, one required):
  --check              Diff ./plugins/<name> against upstream and exit non-zero on drift
  --pull               Sync upstream -> ./plugins/<name>
  --push               Sync ./plugins/<name> -> upstream
  -h, --help           Show this help message and exit

Options:
  --plugin <name>      Operate on a single plugin (agy-game-studio or agy-paint-studio)
  --projects <path>    Override upstream projects root directory (default: ${PROJECTS_ROOT})
EOF
}

MODE=""
SELECTED_PLUGINS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check|--pull|--push)
      flag="${1#--}"
      if [[ -n "$MODE" && "$MODE" != "$flag" ]]; then
        echo "ERROR: Cannot combine --${flag} with --${MODE}." >&2
        exit 2
      fi
      MODE="$flag"
      shift
      ;;
    --plugin)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "ERROR: --plugin requires a plugin name." >&2
        exit 2
      fi
      if [[ "$2" != "agy-game-studio" && "$2" != "agy-paint-studio" ]]; then
        echo "ERROR: Unknown plugin '$2'. Valid plugins: ${ALL_PLUGINS[*]}" >&2
        exit 2
      fi
      SELECTED_PLUGINS+=("$2")
      shift 2
      ;;
    --projects)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "ERROR: --projects requires a directory path." >&2
        exit 2
      fi
      PROJECTS_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument '$1'." >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  echo "ERROR: A mode flag (--check, --pull, or --push) is required." >&2
  usage >&2
  exit 2
fi

if [[ ${#SELECTED_PLUGINS[@]} -eq 0 ]]; then
  SELECTED_PLUGINS=("${ALL_PLUGINS[@]}")
fi

RSYNC_EXCLUDES=(
  "--exclude=.git/"
  "--exclude=node_modules/"
  "--exclude=.DS_Store"
  "--exclude=__pycache__/"
  "--exclude=.pytest_cache/"
  "--exclude=.ruff_cache/"
  "--exclude=.venv/"
)

DIFF_EXCLUDES=(
  "-x" ".git"
  "-x" "node_modules"
  "-x" ".DS_Store"
  "-x" "__pycache__"
  "-x" ".pytest_cache"
  "-x" ".ruff_cache"
  "-x" ".venv"
)

DRIFT_COUNT=0

for plugin in "${SELECTED_PLUGINS[@]}"; do
  local_dir="${LOCAL_PLUGINS_DIR}/${plugin}"
  upstream_dir="${PROJECTS_ROOT}/${plugin}"

  case "$MODE" in
    check)
      if [[ ! -d "$local_dir" ]]; then
        echo "[DRIFT] ${plugin}: missing local directory '${local_dir}'" >&2
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
        continue
      fi
      if [[ ! -d "$upstream_dir" ]]; then
        echo "[DRIFT] ${plugin}: missing upstream directory '${upstream_dir}'" >&2
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
        continue
      fi
      if diff_out="$(diff -ruN "${DIFF_EXCLUDES[@]}" "$upstream_dir" "$local_dir" 2>&1)"; then
        echo "[OK]    ${plugin} is in sync with ${upstream_dir}."
      else
        echo "[DRIFT] ${plugin} differs from ${upstream_dir}:"
        echo "$diff_out"
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
      fi
      ;;
    pull)
      if [[ ! -d "$upstream_dir" ]]; then
        echo "ERROR: Upstream plugin directory not found: ${upstream_dir}" >&2
        exit 1
      fi
      mkdir -p "$local_dir"
      rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${upstream_dir}/" "${local_dir}/"
      echo "[PULL]  Synced ${upstream_dir} -> plugins/${plugin}"
      ;;
    push)
      if [[ ! -d "$local_dir" ]]; then
        echo "ERROR: Local plugin directory not found: ${local_dir}" >&2
        exit 1
      fi
      mkdir -p "$upstream_dir"
      rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${local_dir}/" "${upstream_dir}/"
      echo "[PUSH]  Synced plugins/${plugin} -> ${upstream_dir}"
      ;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  if [[ "$DRIFT_COUNT" -gt 0 ]]; then
    echo "ERROR: Drift detected in ${DRIFT_COUNT} plugin(s)." >&2
    exit 1
  fi
  echo "All ${#SELECTED_PLUGINS[@]} plugin(s) match upstream (${PROJECTS_ROOT})."
fi
