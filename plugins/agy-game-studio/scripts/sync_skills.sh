#!/usr/bin/env bash
# ==============================================================================
# Antigravity 2D Game Studio (agy-game-studio) — Upstream Skill Sync Tool
# Synchronizes bundled plugin skills in ./skills/<name> with upstream catalog
# at /Users/petruzalek/projects/skills/<category>/<name>.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOCAL_SKILLS_DIR="${REPO_ROOT}/skills"
UPSTREAM_ROOT="${UPSTREAM_SKILLS_DIR:-/Users/petruzalek/projects/skills}"

ALL_SKILLS=(
  "ebitengineer"
  "game-design"
  "procedural-art"
  "procedural-composer"
  "sprite-animation"
  "vibe-game-developer"
  "nano-banana"
  "lyria"
  "godoctor"
  "swarm-coding"
)

upstream_subpath_for_skill() {
  local skill="$1"
  case "$skill" in
    ebitengineer)        echo "game-dev/ebitengineer" ;;
    game-design)         echo "game-dev/game-design" ;;
    procedural-art)      echo "game-dev/procedural-art" ;;
    procedural-composer) echo "game-dev/procedural-composer" ;;
    sprite-animation)    echo "game-dev/sprite-animation" ;;
    vibe-game-developer) echo "game-dev/vibe-game-developer" ;;
    nano-banana)         echo "media/nano-banana" ;;
    lyria)               echo "media/lyria" ;;
    godoctor)            echo "coding/godoctor" ;;
    swarm-coding)        echo "agents/swarm-coding" ;;
    *)
      echo "ERROR: Unknown skill '${skill}'. Valid skills: ${ALL_SKILLS[*]}" >&2
      return 1
      ;;
  esac
}

usage() {
  cat <<EOF
Usage: $(basename "$0") <mode> [options]

Synchronize or diff bundled plugin skills (./skills/<name>) with the upstream
skills repository (${UPSTREAM_ROOT}).

Modes (mutually exclusive, one required):
  --check              Diff ./skills/<name> against upstream and exit non-zero on drift
  --pull               Sync upstream -> ./skills/<name> (mirror upstream into plugin)
  --push               Sync ./skills/<name> -> upstream (publish plugin changes upstream)
  -h, --help           Show this help message and exit

Options:
  --skill <name>       Operate on a single skill (repeatable; defaults to all 10 skills)
  --upstream <path>    Override upstream skills root directory
                       (default: ${UPSTREAM_ROOT})

Mapped Skills (10):
  ebitengineer         -> game-dev/ebitengineer
  game-design          -> game-dev/game-design
  procedural-art       -> game-dev/procedural-art
  procedural-composer  -> game-dev/procedural-composer
  sprite-animation     -> game-dev/sprite-animation
  vibe-game-developer  -> game-dev/vibe-game-developer
  nano-banana          -> media/nano-banana
  lyria                -> media/lyria
  godoctor             -> coding/godoctor
  swarm-coding         -> agents/swarm-coding
EOF
}

MODE=""
SELECTED_SKILLS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      if [[ -n "$MODE" && "$MODE" != "check" ]]; then
        echo "ERROR: Cannot combine --check with --${MODE}." >&2
        exit 2
      fi
      MODE="check"
      shift
      ;;
    --pull)
      if [[ -n "$MODE" && "$MODE" != "pull" ]]; then
        echo "ERROR: Cannot combine --pull with --${MODE}." >&2
        exit 2
      fi
      MODE="pull"
      shift
      ;;
    --push)
      if [[ -n "$MODE" && "$MODE" != "push" ]]; then
        echo "ERROR: Cannot combine --push with --${MODE}." >&2
        exit 2
      fi
      MODE="push"
      shift
      ;;
    --skill)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "ERROR: --skill requires a skill name argument." >&2
        exit 2
      fi
      # Validate skill name immediately (fail fast)
      upstream_subpath_for_skill "$2" >/dev/null
      SELECTED_SKILLS+=("$2")
      shift 2
      ;;
    --upstream)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "ERROR: --upstream requires a directory path argument." >&2
        exit 2
      fi
      UPSTREAM_ROOT="$2"
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

if [[ ${#SELECTED_SKILLS[@]} -eq 0 ]]; then
  SELECTED_SKILLS=("${ALL_SKILLS[@]}")
fi

if [[ ! -d "$UPSTREAM_ROOT" ]]; then
  echo "ERROR: Upstream skills root directory does not exist: ${UPSTREAM_ROOT}" >&2
  exit 1
fi

RSYNC_EXCLUDES=(
  "--exclude=.DS_Store"
  "--exclude=__pycache__/"
  "--exclude=.pytest_cache/"
  "--exclude=.ruff_cache/"
  "--exclude=.venv/"
)

DIFF_EXCLUDES=(
  "-x" ".DS_Store"
  "-x" "__pycache__"
  "-x" ".pytest_cache"
  "-x" ".ruff_cache"
  "-x" ".venv"
)

DRIFT_COUNT=0

for skill in "${SELECTED_SKILLS[@]}"; do
  subpath="$(upstream_subpath_for_skill "$skill")"
  local_dir="${LOCAL_SKILLS_DIR}/${skill}"
  upstream_dir="${UPSTREAM_ROOT}/${subpath}"

  case "$MODE" in
    check)
      if [[ ! -d "$local_dir" ]]; then
        echo "[DRIFT] ${skill}: missing local skill directory '${local_dir}'" >&2
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
        continue
      fi
      if [[ ! -d "$upstream_dir" ]]; then
        echo "[DRIFT] ${skill}: missing upstream skill directory '${upstream_dir}'" >&2
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
        continue
      fi
      if diff_out="$(diff -ruN "${DIFF_EXCLUDES[@]}" "$upstream_dir" "$local_dir" 2>&1)"; then
        echo "[OK]    ${skill} (${subpath}) is in sync with upstream."
      else
        echo "[DRIFT] ${skill} (${subpath}) differs from upstream:"
        echo "$diff_out"
        DRIFT_COUNT=$((DRIFT_COUNT + 1))
      fi
      ;;

    pull)
      if [[ ! -d "$upstream_dir" ]]; then
        echo "ERROR: Upstream skill directory not found: ${upstream_dir}" >&2
        exit 1
      fi
      mkdir -p "$local_dir"
      rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${upstream_dir}/" "${local_dir}/"
      echo "[PULL]  Synced upstream ${subpath} -> skills/${skill}"
      ;;

    push)
      if [[ ! -d "$local_dir" ]]; then
        echo "ERROR: Local skill directory not found: ${local_dir}" >&2
        exit 1
      fi
      mkdir -p "$upstream_dir"
      rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${local_dir}/" "${upstream_dir}/"
      echo "[PUSH]  Synced skills/${skill} -> upstream ${subpath}"
      ;;
  esac
done

if [[ "$MODE" == "check" ]]; then
  if [[ "$DRIFT_COUNT" -gt 0 ]]; then
    echo "ERROR: Drift detected in ${DRIFT_COUNT} skill(s)." >&2
    exit 1
  fi
  echo "All ${#SELECTED_SKILLS[@]} checked skill(s) match upstream (${UPSTREAM_ROOT})."
fi
