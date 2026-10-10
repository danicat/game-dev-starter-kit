# Antigravity 2D Game Studio (`agy-game-studio`)

**Antigravity 2D Game Studio** is an all-in-one 2D game development plugin and live WebAssembly **Playtest Studio** UI extension for [Google Antigravity](https://antigravity.google). Build 2D games in Go with [Ebitengine](https://ebitengine.org/) and Google Gemini, compile and playtest them live at 60 FPS in the side pane, rewind a 10-second DVR buffer, annotate visual bugs, and export 10-second animated GIF clips directly into your chat session.

![Playtest Studio running Neon Bastion at 60 FPS](assets/playtest-studio-live.png)

---

## User-Level Installation

`agy-game-studio` ships with prebuilt UI assets (`dist/`) and uses Antigravity's bundled Node.js runtime and `sidecar_sdk`. Installing the plugin as a user requires **no `npm install` or frontend build step** — only a Go toolchain (`1.26+` recommended) to compile your games to WebAssembly (`GOOS=js GOARCH=wasm`).

### 1. Install the plugin

Choose the installation method for your Antigravity surface:

#### Antigravity CLI (`agy`)

Install directly from GitHub in your shell:

```bash
agy plugin install https://github.com/danicat/agy-game-studio
```

Or inside an interactive `agy` TUI session using `/plugin`:

```text
/plugin install https://github.com/danicat/agy-game-studio
```

#### Antigravity 2.0 and Antigravity IDE

Place the plugin directory in one of Antigravity's plugin discovery roots:

- **Global (all workspaces)**:
  - **macOS / Linux**: `~/.gemini/config/plugins/agy-game-studio`
  - **Windows**: `%USERPROFILE%\.gemini\config\plugins\agy-game-studio`

  ```bash
  git clone https://github.com/danicat/agy-game-studio.git ~/.gemini/config/plugins/agy-game-studio
  ```

- **Workspace (project-scoped)**:
  Place the plugin at `.agents/plugins/agy-game-studio` in your repository root, or declare its parent directory in `.agents/plugins.json` (workspace) or `~/.gemini/config/plugins.json` (global):

  ```json
  {
    "entries": [
      { "path": "/path/to/plugins" }
    ]
  }
  ```

### 2. Enable the plugin

1. If you created a new plugin directory manually on disk, **restart Antigravity** so it discovers the directory on startup.
2. In **Antigravity 2.0** or **Antigravity IDE**, open **Customizations** in the left sidebar, select the **Installed** tab, and verify **Antigravity 2D Game Studio** (`agy-game-studio`) is enabled. (Or run `/plugin` in chat / `agy plugin enable agy-game-studio` in the CLI.)
3. Once enabled, Antigravity automatically starts and supervises the `agy-game-studio/studio` sidecar process.

### 3. Open Playtest Studio & start building

Use these slash commands inside any Antigravity conversation:

- **`/vibe-game-developer`** — Start a new 2D game from scratch. Interviews you to create a `GDD.md`, architects the Ebitengine loop, generates procedural or Gemini art/music, and launches Playtest Studio.
- **`/playtest-studio`** — Open the **Playtest Studio** side pane (or click **⋮ → Extensions → Playtest Studio** in the top-right corner of a conversation).
- **`/grill-me`** — Run an interactive game design interview to flesh out mechanics and produce a `GDD.md`.

### 4. Configure Gemini credentials for AI art & music (optional)

The `nano-banana` (image generation) and `lyria` (music generation) skills support either a Gemini API key or Google Cloud Vertex AI Application Default Credentials (ADC):

```bash
# Option A: Gemini API Key (Google AI Studio)
export GEMINI_API_KEY="your-api-key"

# Option B: Vertex AI ADC
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CLOUD_LOCATION="global"
```

Run `./scripts/check_env.sh` at any time to verify Go, `wasm_exec.js`, Node.js, `uv`, Python 3, and your Gemini credentials.

---

## Playtest Studio UI Extension (`sidecars/studio`)

Open **Playtest Studio** in the right-hand side pane via `/playtest-studio`, `[Playtest Studio](sidecar://agy-game-studio/studio/)`, or **⋮ → Extensions → Playtest Studio**:

- **Unified Project Path & 1-Click WASM Build**: Enter any Go game directory or package path (e.g. `/path/to/game` or `/path/to/repo/cmd/game`) and press `Enter` or click **🚀 Run**. The sidecar automatically resolves `go.mod`, compiles with `GOOS=js GOARCH=wasm`, and streams any compiler or runtime panic tracebacks directly to chat.
- **60 FPS Zero-Copy DVR Ring Buffer**: Continuously records the last **10 seconds (250 frames @ 25 FPS)** onto GPU-backed 2D canvases without dropping frame rate.
- **Pause, Scrub & Annotate (`F8` or `` ` ``)**: Pause gameplay, scrub frame-by-frame through the 10s DVR timeline, draw boxes/arrows/callouts over visual bugs, and send either:
  - **📸 Frame**: Smart-cropped PNG screenshot (true-to-screen resolution when unannotated, or automatically expanded to include any margin notes drawn in the scratch space) + WASM console logs.
  - **🎞️ 10s GIF**: Pure 10-second animated GIF89a replay locked strictly to the game's screen resolution + WASM console logs.

![Pause & Annotate mode with 10s DVR rewind scrubber](assets/playtest-studio-annotate.png)

### Exported 10s DVR Gameplay GIF

![10-second animated GIF exported from Playtest Studio](assets/playtest-neon-bastion.gif)

---

## Included Skills (11)

| Skill | What it does |
| :--- | :--- |
| [`vibe-game-developer`](skills/vibe-game-developer/SKILL.md) | Main entry point (`/vibe-game-developer`). Routes your prompts to the right design, code, art, or audio skill. |
| [`playtest-studio`](skills/playtest-studio/SKILL.md) | Launches the live 60 FPS Ebitengine WASM Playtest Studio in the side pane (`/playtest-studio`) with a 10s DVR rewind buffer, 10s GIF export, and visual bug annotations. |
| [`game-design`](skills/game-design/SKILL.md) | Asks focused design questions (`/grill-me`) to turn your idea into a clear `GDD.md`. |
| [`ebitengineer`](skills/ebitengineer/SKILL.md) | Writes Ebitengine v2 game loops, scenes, 2D cameras, physics, tilemaps, shaders, and WebAssembly builds. |
| [`procedural-art`](skills/procedural-art/SKILL.md) | Draws 2D sprites, shapes, color ramps, and particles in pure Go code without image files. |
| [`sprite-animation`](skills/sprite-animation/SKILL.md) | Slices sprite sheets, plays frame animations, and reads Aseprite files. |
| [`procedural-composer`](skills/procedural-composer/SKILL.md) | Generates retro sound effects and music loops in pure Go code. |
| [`nano-banana`](skills/nano-banana/SKILL.md) | Generates sprites, tilesets, and game art with Nano Banana (`gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`). |
| [`lyria`](skills/lyria/SKILL.md) | Generates 44.1 kHz stereo music tracks and loops with Lyria (`lyria-3-pro-preview`, `lyria-3-clip-preview`). |
| [`godoctor`](skills/godoctor/SKILL.md) | Checks Go code quality, test coverage (`testquery`), and mutation score (`selene`). |
| [`swarm-coding`](skills/swarm-coding/SKILL.md) | Splits multi-system game features across parallel subagents with disjoint file ownership. |

---

## Developer & Contributor Guide

Only contributors modifying Playtest Studio's TypeScript frontend (`src/`), sidecar server (`server/`), or bundled skills need to install dev dependencies and rebuild `dist/`.

### 1. Local development setup

Clone the repository and symlink it into `~/.gemini/config/plugins/` so Antigravity loads your live working tree:

```bash
git clone git@github.com:danicat/agy-game-studio.git
cd agy-game-studio
ln -s "$(pwd)" ~/.gemini/config/plugins/agy-game-studio
./scripts/check_env.sh
```

### 2. Build, typecheck, and test

```bash
npm install
npm run build
npm run typecheck
npm test
```

`npm run build` typechecks the TypeScript source (`src/`) and runs Vite to produce the self-contained frontend bundle (`dist/index.html`, `dist/app.js`, `dist/styles.css`) so the committed `dist/` folder runs with zero external `node_modules`.

### 3. Debugging & hot-reloading the sidecar

Antigravity writes sidecar `stdout` and `stderr` to:

```text
~/.gemini/antigravity/sidecar_data/agy-game-studio/studio/logs/sidecar.log
```

- **Frontend changes (`src/`)**: Run `npm run build`, then refresh or close and reopen the Playtest Studio panel. The sidecar server reads `dist/index.html`, `dist/app.js`, and `dist/styles.css` fresh from disk on every request.
- **Backend changes (`server/` or `sidecars/studio/`)**: Disable and re-enable **Antigravity 2D Game Studio** (`agy-game-studio`) in **Customizations → Installed** (or via `/plugin`) to restart the background sidecar process.

### 4. Standalone CLI helper scripts

```bash
# Generate or edit images with Nano Banana
uv run skills/nano-banana/scripts/banana.py --help

# Generate music tracks with Lyria
uv run skills/lyria/scripts/lyria.py --help

# Slice a sprite sheet PNG into an Aseprite JSON manifest
uv run skills/sprite-animation/scripts/slice_spritesheet.py --help
```

---

## About the Author

DISCLAIMER: I AM NOT A GAME DEVELOPER.

<img src="chibi_dani_oops.png" alt="Chibi Dani Oops" width="320" />

I am [Daniela Petruzalek](https://linkedin.com/in/petruzalek), a Developer Relations Engineer at Google. I might not be a game developer, but I am a lifetime gamer and game collector. I enjoy using projects like this to teach software engineering, agentic coding, and creative ways to build with AI.