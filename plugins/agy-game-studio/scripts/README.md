# Helper Scripts

This folder contains environment check and maintenance scripts for this repository.

## `check_env.sh`

Checks that your local machine has the tools needed to build Ebitengine games and generate Gemini assets:

```bash
./scripts/check_env.sh
```

* **Required**: `go` (1.26+), `wasm_exec.js` (in `GOROOT`), `node`, `uv`, `python3`, `file` (or `mimetype`), and Gemini credentials (`GEMINI_API_KEY` or Vertex AI ADC).
* **Recommended (optional)**: [`godoctor`](https://github.com/danicat/godoctor) and [`kungfu`](https://github.com/danicat/kungfu).

## `sync_skills.sh`

Maintainer tool to diff, pull, or push the 10 bundled skills in `./skills/` against a local checkout of the [skills.danicat.dev](https://skills.danicat.dev) repository (defaults to `/Users/petruzalek/projects/skills`, override with `--upstream <path>` or `UPSTREAM_SKILLS_DIR`).

```bash
# Check if any local skill differs from upstream
./scripts/sync_skills.sh --check

# Copy latest upstream skills into ./skills/
./scripts/sync_skills.sh --pull

# Push local edits from ./skills/ back to upstream
./scripts/sync_skills.sh --push

# Target a single skill
./scripts/sync_skills.sh --push --skill ebitengineer
```
