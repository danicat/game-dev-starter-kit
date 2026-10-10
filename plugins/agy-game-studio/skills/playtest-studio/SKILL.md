---
name: playtest-studio
description: Launch the Ebitengine 2D WASM Playtest & Visual Bug Annotation Studio UI extension in the Antigravity side pane. Use whenever the user types /playtest-studio, asks to playtest an Ebitengine/Go game, debug a game visually, or annotate visual game bugs.
license: Apache-2.0
---

# Playtest Studio (`/playtest-studio`)

Playtest Studio is an Antigravity UI extension (`agy-game-studio/studio`) that renders in the auxiliary (side) pane. It compiles any Ebitengine Go workspace to WebAssembly (`GOOS=js GOARCH=wasm`) on demand, runs the game at 60 FPS with WebGL2 and WebAudio, records a 10-second (250-frame @ 25 FPS) GPU-blitted circular DVR buffer, and provides vector bug annotation tools (`Pen`, `Arrow`, `Box`, `Text`) with 1-click delivery of annotated frame screenshots (`📸 Frame`), 10-second animated GIF replays (`🎞️ 10s GIF`), WASM stdout/stderr logs, and compiler tracebacks back to the active conversation.

## Opening Playtest Studio

Surface the UI extension pill in chat to open or toggle Playtest Studio in the side pane:

```markdown
[Playtest Studio](sidecar://agy-game-studio/studio/)
```

## Workflow

1. **Open the Panel**: Click the `[Playtest Studio](sidecar://agy-game-studio/studio/)` pill in chat (or open the **⋮** menu in the top-right of the conversation and select **Playtest Studio** under **Extensions**).
2. **Compile & Play**: Playtest Studio automatically detects the active conversation and workspace via `window.sidecar`, compiles the Go package to WebAssembly (`GOOS=js GOARCH=wasm`), and launches the live 60 FPS viewport (`🚀 Run`).
3. **Pause & Scrub 10s DVR**: Press `` ` `` (Backquote) or `F8` (or click **`⏸️ Pause`**) to freeze the frame and scrub backward/forward frame-by-frame across the last 10 seconds (250 frames @ 25 FPS) of gameplay.
4. **Annotate & Send to Chat**: Circle or call out visual bugs using `✏️ Pen (P)`, `🏹 Arrow (A)`, `🔲 Box (B)`, or `🏷️ Text (T)`, type a note, and click **`📸 Frame`** (single `.png`) or **`🎞️ 10s GIF`** (animated `.gif` replay) to deliver the visual report and WASM logs directly into the active conversation.

