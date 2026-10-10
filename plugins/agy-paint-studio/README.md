# Paint Studio (`agy-paint-studio`)

Paint Studio is a multi-layer drawing, `.psd` editing, and Gemini image refinement UI extension plugin for [Google Antigravity](https://antigravity.google) that runs in the side pane, inline in chat, and as a custom viewer for `.psd` and raster image files.

![Paint Studio running in the Antigravity side pane](assets/screenshot-preview.png)

## Quickstart

Paint Studio ships with prebuilt UI assets (`dist/`) and uses Antigravity's bundled Node.js runtime and `sidecar_sdk`. Installing the plugin requires no `npm install` or build step.

### 1. Install the plugin

Choose the installation method for your Antigravity surface:

#### Antigravity CLI (`agy`)

Install directly from GitHub in your shell:

```bash
agy plugin install https://github.com/danicat/agy-paint-studio
```

Or inside an interactive `agy` TUI session using `/plugin`:

```text
/plugin install https://github.com/danicat/agy-paint-studio
```

#### Antigravity 2.0 and Antigravity IDE

Place the plugin directory in one of Antigravity's plugin discovery roots:

- **Global (all workspaces)**:
  - **macOS / Linux**: `~/.gemini/config/plugins/agy-paint-studio`
  - **Windows**: `%USERPROFILE%\.gemini\config\plugins\agy-paint-studio`

  ```bash
  git clone https://github.com/danicat/agy-paint-studio.git ~/.gemini/config/plugins/agy-paint-studio
  ```

- **Workspace (project-scoped)**:
  Place the plugin at `.agents/plugins/agy-paint-studio` in your repository root, or declare its parent directory in `.agents/plugins.json` (workspace) or `~/.gemini/config/plugins.json` (global):

  ```json
  {
    "entries": [
      { "path": "/path/to/plugins" }
    ]
  }
  ```

### 2. Enable the plugin

1. If you created a new plugin directory manually on disk, restart Antigravity so it discovers the directory.
2. In **Antigravity 2.0** or **Antigravity IDE**, open **Customizations** in the left sidebar, select the **Installed** tab, and verify **Paint Studio** (`agy-paint-studio`) is enabled. (Or run `/plugin` in chat / `agy plugin enable agy-paint-studio` in the CLI.)
3. Once enabled, Antigravity automatically starts and supervises the `agy-paint-studio/studio` sidecar process.

### 3. Open Paint Studio

Open the studio inside any conversation using any of the three entrypoints:

- **Side-pane UI extension**: Click the **⋮** (three-dot) menu in the top-right corner of a conversation and select **Extensions → Paint Studio**.
- **Custom `.psd` and image viewer**: Click any `.psd`, `.png`, `.jpg`, `.jpeg`, or `.webp` file in chat or the file explorer to open it directly in the Paint Studio side pane.
- **Slash command**: Type `/paint-studio` in chat to render an inline `<agent-embed>` canvas and a clickable `[Paint Studio](sidecar://agy-paint-studio/studio/)` side-pane pill.

Draw on the canvas and click **Send** to save both the flattened `PNG` and the multi-layer `.psd` into the active conversation and post the image into chat.

### 4. Configure Gemini image refinement (optional)

AI refinement calls `gemini-3.1-flash-lite-image` on Vertex AI using Google Cloud Application Default Credentials (ADC):

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export GOOGLE_CLOUD_LOCATION="global"
```

---

## Usage and workflows

### Four ways to use Paint Studio

A single background `SidecarApp` server powers four views:

| View | Entrypoint | Best for |
| :--- | :--- | :--- |
| **Side-pane UI extension** | **⋮ → Extensions → Paint Studio** or `[Paint Studio](sidecar://agy-paint-studio/studio/)` | Persistent workspace next to your conversation. Expands to full mode automatically when widened (`>= 760px`) or maximized. |
| **Custom `.psd` & image viewer** | Click any `.psd`, `.png`, `.jpg`, `.jpeg`, or `.webp` file (`file_extensions` in `sidecar.json`) | Inspecting and editing multi-layer `.psd` files or annotating screenshots in place. |
| **Inline chat canvas** | `/paint-studio` (`<agent-embed>`) | Quick 480px sketches and visual prompts directly inside the chat stream. |
| **Full browser workspace** | Click **Full Mode** in the studio header (`?mode=full`) | Multi-layer `.psd` editing in a dedicated browser window with full menu bar and layer controls. |

![Paint Studio in full workspace mode](assets/screenshot-full.png)

### File, artifact, and chat actions

| Action | Shortcut | Behaviour |
| :--- | :--- | :--- |
| **Send** | — | Saves the flattened `PNG` and layered `.psd` into `<appDataDir>/brain/<conversation-id>/` and calls `window.sidecar.agent.sendMessage()`. |
| **Save Project** | `⌘S` | Saves a multi-layer `.psd` file to `Downloads`, `Desktop`, `Workspace`, `Session`, or a custom path. |
| **Export Image** | `⇧⌘E` | Exports a flattened `PNG`, `JPEG`, or `WebP` file to disk or triggers a browser download. |
| **Open File** | `⌘O` | Opens a local `.psd`, `PNG`, `JPEG`, or `WebP` file from disk as a canvas or new layer. |
| **Open Artifact** | — | Browses images and `.psd` files from the active Antigravity session to open or insert as a layer. |

### AI refinement presets

The bottom refinement bar sends the current composite canvas to `gemini-3.1-flash-lite-image` and inserts the generated output as a new non-destructive layer above your sketch:

| Preset | Behaviour |
| :--- | :--- |
| **Beautify** | Interprets rough sketches and stick figures into a polished, high-resolution illustration. |
| **Notes** | Reads handwritten or typed redlines, arrows, and callout annotations, applies the requested edits, and removes the markup. |
| **Watercolor** | Transforms the sketch into a wet-on-wet watercolour painting on cold-press textured paper. |
| **Concept Art** | Renders cinematic digital concept art with dramatic lighting and atmospheric depth. |
| **Vector** | Produces flat vector artwork with crisp geometric edges and solid colour fills. |
| **Pixel Art** | Converts the drawing into 16-bit sprite pixel art with a constrained palette. |
| **3D Clay** | Renders a studio-lit 3D clay miniature with soft subsurface scattering. |
| **Anime** | Produces cel-shaded anime illustration with expressive linework. |

Type custom instructions in the prompt field and press `Enter` or click **Refine** to combine any preset with a specific prompt.

### Keyboard shortcuts

| Key | Tool / Action |
| :--- | :--- |
| `V` | Select, move, cut, copy, or paste |
| `B` | Smooth brush |
| `P` | Pixel pencil |
| `E` | Eraser (defaults to 20px width; shows live cursor ring) |
| `U` / `O` | Rectangle / Ellipse |
| `L` / `A` | Line / Arrow |
| `T` | Text |
| `G` | Paint bucket (scanline flood fill) |
| `I` | Eyedropper |
| `H` / `Space` | Pan canvas (scroll to zoom) |
| `X` | Swap foreground and background colours |
| `[` / `]` | Decrease / increase active tool size |
| `⌘Z` / `⇧⌘Z` | Undo / Redo |
| `⌘0` / `⌘9` | Zoom 100% / Fit canvas to viewport |
| `⌫` | Clear active selection or layer |

---

## Development and testing

Only contributors modifying TypeScript source (`src/`) or server code (`server/`) need to install dev dependencies and rebuild `dist/`:

```bash
npm install
npm run build
npm run typecheck
npm test
```

`npm run build` compiles the frontend (`dist/index.html`, `dist/app.js`, `dist/styles.css`) and bundles the sidecar server (`dist/server.mjs`) so the committed `dist/` folder runs with zero external `node_modules`.

### Debugging the sidecar

Antigravity writes sidecar `stdout` and `stderr` to:

```text
~/.gemini/antigravity/sidecar_data/agy-paint-studio/studio/logs/sidecar.log
```

- **Frontend changes** (`src/`): Run `npm run build`, then close and reopen the Paint Studio panel. The backend re-reads `dist/index.html`, `dist/app.js`, and `dist/styles.css` from disk on each request with `Cache-Control: no-store`.
- **Backend changes** (`server/` or `sidecars/studio/`): Run `npm run build`, then disable and re-enable **Paint Studio** in **Customizations → Installed** (or via `/plugin`) to restart the sidecar process.

---

## Architecture and internals

```text
agy-paint-studio/
├── plugin.json                        # Plugin identity, display name, version, and logo
├── assets/
│   └── logo.svg                       # Square SVG icon shown in Customizations and file viewer tabs
├── sidecars/
│   └── studio/
│       ├── sidecar.json               # Sidecar process config, AUX_PANE entrypoint, and file_extensions
│       ├── package.json               # Marks the sidecar directory as an ES module
│       └── run.mjs                    # Sidecar entrypoint (loads pre-bundled dist/server.mjs)
├── skills/
│   └── paint-studio/
│       └── SKILL.md                   # /paint-studio skill for inline + side-pane launch
├── dist/                              # Prebuilt frontend assets and self-contained server bundle
├── server/
│   ├── index.mjs                      # SidecarApp routes, session/filesystem I/O, and /api/template
│   └── services/
│       └── gemini.mjs                 # Vertex AI image refinement service
├── src/                               # TypeScript canvas engine, PSD parser, and UI components
└── tests/                             # Node test runner suites (flood fill, eraser, PSD, Gemini, endpoints)
```

### Sidecar API routes

| Route | Method | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `/`, `/app.js`, `/styles.css` | `GET` | Open | Serves the classic IIFE frontend bundle to the `plugin://` iframe. |
| `/preload.js` | `GET` | Open | Injected by `SidecarApp`; exposes `window.sidecar` and syncs host theme tokens. |
| `/api/health` | `GET` | Open | Returns `{ status: "ok", port }` for health checks. |
| `/api/template` | `GET` | Open | Generates a self-contained HTML artifact for `<agent-embed>` inline chat mode. |
| `/api/fs/open` | `GET` | Open | Streams `.psd` or image files from allowed user/workspace roots when opened via `?file=`. |
| `/api/fs/info` | `GET` | Open | Resolves default save directories (`Downloads`, `Desktop`, `Workspace`, `Session`). |
| `/api/fs/save` | `POST` | `X-Sidecar-Token` | Saves `.psd`, `PNG`, `JPEG`, or `WebP` files to allowed local directories. |
| `/api/artifact` | `GET` / `POST` | `X-Sidecar-Token` (`POST`) | Reads or writes session artifacts inside `<appDataDir>/brain/<session-id>/`. |
| `/api/ai/refine` | `POST` | `X-Sidecar-Token` | Refines the composite canvas with `gemini-3.1-flash-lite-image`. |

---

## License and compliance

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

This is not an officially supported Google product.
