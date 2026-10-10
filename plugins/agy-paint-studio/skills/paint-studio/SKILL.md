---
name: paint-studio
description: Open the interactive Paint Studio canvas both inline in the chat stream and as a dockable side-pane UI Extension in the active Antigravity conversation. Use whenever the user types /paint-studio, asks to draw, sketch, paint, create diagrams, or edit images.
license: Apache-2.0
---

# Paint Studio (`/paint-studio`)

Paint Studio supports four simultaneous views from a single `SidecarApp` backend (`agy-paint-studio/studio`):
1. **Inline Chat Canvas (`<agent-embed>`)**: Interactive 480px studio card embedded directly in the conversation stream.
2. **Side-Pane UI Extension (`sidecar://agy-paint-studio/studio/`)**: Docked auxiliary side pane in Antigravity (`SIDECAR_UI_ENTRYPOINT_AUX_PANE`) that expands to full studio mode when widened or maximized.
3. **Custom Image & `.psd` File Viewer (`file_extensions: [".psd", ".png", ".jpg", ".jpeg", ".webp"]`)**: Clicking any `.psd`, `.png`, `.jpg`, `.jpeg`, or `.webp` file in Antigravity mounts Paint Studio with `?file=/path/to/file` and loads the image or PSD layer stack onto the canvas.
4. **Full Browser Window**: Pop-out full-screen studio via the **Full Mode** button in the header.

## Execution Runbook

When the user invokes `/paint-studio` (or asks to sketch, paint, or edit images):

### Step 1: Discover the Active Sidecar Port & Fetch the Inline Artifact
Read the active sidecar port from `~/.gemini/antigravity/sidecar_data/agy-paint-studio/studio/logs/sidecar.log` and fetch the self-contained HTML artifact from `/api/template?session_id=<conversation-id>` into a temporary file, then register it in the conversation's artifact directory using `write_to_file` (`UserFacing: true`, `RequestFeedback: false`):

```bash
PORT=$(grep -Eo '127\.0\.0\.1:[0-9]+' ~/.gemini/antigravity/sidecar_data/agy-paint-studio/studio/logs/sidecar.log | tail -n 1 | cut -d: -f2)
curl -sf "http://127.0.0.1:${PORT}/api/template?session_id=<conversation-id>" -o /tmp/paint-studio-inline.html
```

Then write `/tmp/paint-studio-inline.html` to `<appDataDir>/brain/<conversation-id>/paint-studio.html` using `write_to_file` (or copy it directly after creating the artifact metadata).

### Step 2: Render Both the Inline Widget and the Side-Pane Pill
In your chat response, include **both** the `<agent-embed>` tag and the `sidecar://` pill:

```markdown
<agent-embed src="file:///<appDataDir>/brain/<conversation-id>/paint-studio.html"></agent-embed>

[Paint Studio](sidecar://agy-paint-studio/studio/)
```
