# Helper Scripts

This folder contains setup, environment check, and maintainer sync scripts for the **Game Dev Starter Kit**.

## `install_plugins.sh`

Links (or copies with `--copy`) the two bundled Antigravity plugins (`agy-game-studio` and `agy-paint-studio`) into `~/.gemini/config/plugins/` and enables them:

```bash
./scripts/install_plugins.sh
```

## `check_env.sh`

Checks that your local machine has the tools needed to build Ebitengine games, run the Playtest Studio and Paint Studio sidecars, and generate Gemini assets:

```bash
./scripts/check_env.sh
```

* **Required**: `go` (1.26+), `wasm_exec.js` (in `GOROOT`), `node`, `uv`, `python3`, `file` (or `mimetype`), and Gemini credentials (`GEMINI_API_KEY` or Vertex AI ADC).
* **Checked Plugins**: `agy-game-studio` and `agy-paint-studio` in `~/.gemini/config/plugins/`.
* **Recommended (optional)**: [`godoctor`](https://github.com/danicat/godoctor) and [`kungfu`](https://github.com/danicat/kungfu).

## `sync_plugins.sh`

Maintainer tool to diff, pull, or push `./plugins/agy-game-studio` and `./plugins/agy-paint-studio` against their standalone repositories:

```bash
# Check if either bundled plugin differs from its standalone repo
./scripts/sync_plugins.sh --check

# Pull latest changes from standalone repos into ./plugins/
./scripts/sync_plugins.sh --pull

# Push changes from ./plugins/ back to standalone repos
./scripts/sync_plugins.sh --push
```

## `sync_skills.sh`

Maintainer tool to diff, pull, or push the 10 catalog skills in `./plugins/agy-game-studio/skills/` against a local checkout of the [skills.danicat.dev](https://skills.danicat.dev) repository:

```bash
./scripts/sync_skills.sh --check
./scripts/sync_skills.sh --pull
./scripts/sync_skills.sh --push
```
