/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  getSessionId,
  setSessionId,
  onSessionChange,
  getWorkspacePath,
  setWorkspacePath,
  onWorkspaceChange,
  getFullStudioUrl,
  resolveWorkspaceUri,
  fetchHealth,
  fetchRecentSessions,
  buildWasm,
  sendBugToChat,
  sendBuildErrorToChat,
  type BuildWasmFailure
} from '../utils/api.ts';
import { FrameDvrBuffer } from '../engine/FrameDvrBuffer.ts';
import {
  BugAnnotator,
  QA_COLOR_SWATCHES,
  type AnnotationTool
} from '../engine/BugAnnotator.ts';
import { WasmRunner } from '../engine/WasmRunner.ts';
import {
  encodeAnimatedGif,
  gifBytesToDataUrl,
  detectActiveViewportBounds,
  type GifFrameInput
} from '../engine/GifEncoder.ts';

export class StudioNotifier {
  private static container: HTMLElement | null = null;

  private static getContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'notification-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  public static show(
    message: string,
    type: 'info' | 'success' | 'error' = 'info',
    duration = 4000,
    detail?: string
  ): void {
    const container = this.getContainer();
    const toast = document.createElement('div');
    toast.className = `notification-toast toast-${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ';

    const content = document.createElement('div');
    content.className = 'toast-message';

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = message;
    content.appendChild(titleEl);

    if (detail) {
      const detailEl = document.createElement('pre');
      detailEl.className = 'toast-detail';
      detailEl.textContent = detail;
      content.appendChild(detailEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Dismiss';
    closeBtn.onclick = () => toast.remove();

    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 280);
      }, duration);
    }
  }

  public static info(message: string, duration = 3000): void {
    this.show(message, 'info', duration);
  }

  public static success(message: string, duration = 3800): void {
    this.show(message, 'success', duration);
  }

  public static error(message: string, detail?: string): void {
    console.error('[Playtest Studio Error]', message, detail || '');
    this.show(message, 'error', 0, detail);
  }

  public static fatal(title: string, error: unknown, context?: string): void {
    console.error('[Playtest Studio FATAL]', title, error, context ?? '');
    const existing = document.getElementById('fatal-error-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'fatal-error-overlay';
    overlay.className = 'modal-overlay fatal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');

    const errorMessage =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const errorStack = error instanceof Error && error.stack ? error.stack : '';

    const detailLines = [
      context ? `[Context] ${context}` : '',
      errorMessage,
      errorStack && errorStack !== errorMessage ? errorStack : ''
    ]
      .filter(Boolean)
      .join('\n\n');

    overlay.innerHTML = `
      <div class="fatal-dialog">
        <div class="fatal-icon">🚨</div>
        <h2 class="fatal-title"></h2>
        <p class="fatal-desc">A critical error occurred in Playtest Studio. Failed fast with full diagnostics:</p>
        <pre class="fatal-pre"></pre>
        <div class="fatal-actions">
          <button type="button" class="btn btn-danger" id="fatal-reload-btn">Reload Studio</button>
          <button type="button" class="btn btn-outline" id="fatal-dismiss-btn">Dismiss (Esc)</button>
        </div>
      </div>
    `;

    const titleNode = overlay.querySelector('.fatal-title');
    if (titleNode) titleNode.textContent = title;
    const preNode = overlay.querySelector('.fatal-pre');
    if (preNode) preNode.textContent = detailLines;

    const cleanup = () => {
      window.removeEventListener('keydown', onEsc);
      overlay.remove();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    };
    window.addEventListener('keydown', onEsc);

    overlay.querySelector('#fatal-reload-btn')?.addEventListener('click', () => {
      window.location.reload();
    });
    overlay.querySelector('#fatal-dismiss-btn')?.addEventListener('click', cleanup);

    document.body.appendChild(overlay);
  }
}

export class PlaytestStudioUI {
  private headerEl: HTMLElement;
  private annotationBarEl: HTMLElement;
  private viewportEl: HTMLElement;
  private bugBarEl: HTMLElement;

  public readonly dvrBuffer: FrameDvrBuffer;
  public readonly annotator: BugAnnotator;
  public readonly runner: WasmRunner;

  private activePkg = '.';
  private activeDvrIndex = 0;
  private keypadVisible = false;
  private logsDrawerVisible = false;
  private isBuilding = false;
  private lastBuildFailure: BuildWasmFailure | null = null;

  private runnerMountEl!: HTMLElement;
  private annotationStageEl!: HTMLElement;
  private readyStateEl!: HTMLElement;
  private errorStateEl!: HTMLElement;
  private gameStageEl!: HTMLElement;
  private focusPillEl!: HTMLElement;
  private keypadOverlayEl!: HTMLElement;
  private logsDrawerEl!: HTMLElement;

  constructor(containers: {
    headerEl: HTMLElement;
    annotationBarEl: HTMLElement;
    viewportEl: HTMLElement;
    bugBarEl: HTMLElement;
  }) {
    this.headerEl = containers.headerEl;
    this.annotationBarEl = containers.annotationBarEl;
    this.viewportEl = containers.viewportEl;
    this.bugBarEl = containers.bugBarEl;

    this.dvrBuffer = new FrameDvrBuffer(250, 40);

    this.renderHeader();
    this.renderAnnotationBar();
    this.renderViewport();
    this.renderBugReportBar();

    const baseCanvas = this.viewportEl.querySelector(
      '#annotation-base-canvas'
    ) as HTMLCanvasElement;
    const overlayCanvas = this.viewportEl.querySelector(
      '#annotation-overlay-canvas'
    ) as HTMLCanvasElement;

    this.annotator = new BugAnnotator({
      baseCanvas,
      overlayCanvas,
      width: 640,
      height: 360,
      onHistoryChange: () => this.updateAnnotationControlsUI()
    });

    this.runner = new WasmRunner(this.runnerMountEl, this.dvrBuffer, {
      onFrameRecorded: () => {
        this.activeDvrIndex = Math.max(0, this.dvrBuffer.length - 1);
        this.updateDvrScrubberUI();
        if (this.runner.isPaused() && this.annotator.getShapes().length === 0) {
          const latest = this.dvrBuffer.getLatestFrame();
          if (latest) {
            void this.annotator.loadBaseFrameDataUrl(
              latest.dataUrl,
              latest.width,
              latest.height
            );
          }
        }
      },
      onPauseChange: (paused) => {
        this.handlePauseStateChanged(paused);
      },
      onFocusChange: (focused) => {
        this.updateFocusPillUI(focused);
      },
      onLog: (_level, _line, allLogs) => {
        this.updateLogsUI(allLogs);
      },
      onPanic: (message, allLogs) => {
        this.updateLogsUI(allLogs);
        this.showRuntimePanicView(message);
      }
    });

    this.bindEvents();
    void this.syncSessionAndWorkspaceFromServer();
  }

  private async applyWorkspaceUri(workspaceUri: string): Promise<boolean> {
    if (!workspaceUri || !workspaceUri.trim()) {
      return false;
    }
    try {
      const resolved = await resolveWorkspaceUri(workspaceUri);
      const unifiedPath = resolved.projectPath || resolved.workspace;
      if (unifiedPath) {
        setWorkspacePath(unifiedPath);
      }
      this.activePkg = '.';
      this.updateHeaderInputsUI();
      return Boolean(resolved.hasGoMod);
    } catch (err) {
      console.warn('[PlaytestStudioUI] Failed to resolve workspace URI:', err);
      return false;
    }
  }

  private async syncSessionAndWorkspaceFromServer(): Promise<void> {
    let shouldAutoBuild = Boolean(
      new URLSearchParams(window.location.search).get('workspace')?.trim()
    );

    if (window.sidecar?.conversationId && !getSessionId()) {
      try {
        setSessionId(window.sidecar.conversationId);
      } catch {
        // Ignore invalid conversationId format
      }
    }

    if (window.sidecar && typeof window.sidecar.onWorkspaceChange === 'function') {
      window.sidecar.onWorkspaceChange((uris: string[]) => {
        if (Array.isArray(uris) && uris.length > 0 && uris[0]) {
          void this.applyWorkspaceUri(uris[0]);
        }
      });
    }

    try {
      const health = await fetchHealth();
      if (health.activeSessionId && !getSessionId()) {
        setSessionId(health.activeSessionId);
      }
      if (health.defaultWorkspace) {
        const hasGoMod = await this.applyWorkspaceUri(health.defaultWorkspace);
        shouldAutoBuild = shouldAutoBuild || hasGoMod;
      }
      this.updateHeaderInputsUI();
      this.updateSessionBadgeUI();
    } catch (err) {
      console.warn('[PlaytestStudioUI] Sidecar health check skipped or unavailable:', err);
    }

    if (window.sidecar && typeof window.sidecar.getWorkspaceUris === 'function') {
      try {
        const uris = await Promise.race([
          window.sidecar.getWorkspaceUris(),
          new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1200)),
        ]);
        if (Array.isArray(uris) && uris.length > 0 && uris[0]) {
          const hasGoMod = await this.applyWorkspaceUri(uris[0]);
          shouldAutoBuild = shouldAutoBuild || hasGoMod;
        }
      } catch (err) {
        console.warn('[PlaytestStudioUI] getWorkspaceUris skipped:', err);
      }
    }

    if (shouldAutoBuild && getWorkspacePath().trim() && !this.isBuilding && !this.runner.isRunning()) {
      void this.handleBuildAndRun();
    }
  }

  private renderHeader(): void {
    const ws = getWorkspacePath();
    this.headerEl.innerHTML = `
      <div class="header-left">
        <button
          type="button"
          id="btn-home-ready"
          class="app-brand brand-home-btn"
          data-tooltip="Return to Ready Card / Stop Game"
          title="Return to Ready Card / Stop Game"
          aria-label="Return to Ready Card"
        >
          <span class="brand-logo" aria-hidden="true">🕹️</span>
        </button>

        <div class="workspace-controls">
          <input
            type="text"
            id="workspace-input"
            class="input-text workspace-path-input"
            placeholder="Go project path (e.g. /path/to/game)"
            value="${this.escapeAttr(ws)}"
            aria-label="Go project or package directory path"
            title="Go Project or Package Directory Path"
          />
          <button
            type="button"
            id="btn-build-run"
            class="btn btn-primary btn-sm"
            data-tooltip="Compile Go to WASM &amp; Launch (GOOS=js GOARCH=wasm)"
            title="Compile Go to WASM &amp; Launch (GOOS=js GOARCH=wasm)"
          >
            <span id="build-btn-label">🚀 Run</span>
          </button>
        </div>
      </div>

      <div class="header-right">
        <button
          type="button"
          id="btn-pause-toggle"
          class="btn btn-outline btn-sm"
          disabled
          data-tooltip="Freeze Frame &amp; Annotate Bug (\` or F8)"
          title="Freeze Frame &amp; Annotate Bug (\` or F8)"
        >
          <span id="pause-btn-label">⏸️ Pause</span>
        </button>

        <button
          type="button"
          id="btn-keypad-toggle"
          class="btn btn-ghost btn-icon"
          data-tooltip="Virtual Gamepad (WASD / Arrows / Space)"
          title="Toggle On-Screen Virtual Gamepad (WASD / Arrows / Space)"
          aria-label="Toggle On-Screen Virtual Gamepad"
        >
          <span>🎮</span>
        </button>

        <button
          type="button"
          id="btn-mute-toggle"
          class="btn btn-ghost btn-icon"
          data-tooltip="Mute / Unmute Game Audio"
          title="Mute / Unmute Game Audio"
          aria-label="Mute or Unmute Game Audio"
        >
          <span id="mute-btn-label">🔊</span>
        </button>

        <button
          type="button"
          id="btn-logs-toggle"
          class="btn btn-ghost btn-icon-badge"
          data-tooltip="WASM Console &amp; Stderr Logs"
          title="Toggle WASM Console &amp; Stderr Logs"
          aria-label="Toggle WASM Console and Stderr Logs"
        >
          <span>📟</span>
          <span id="logs-count-badge" class="badge-pill">0</span>
        </button>

        <button
          type="button"
          id="btn-session-badge"
          class="session-badge disconnected"
          data-tooltip="Active Antigravity Session (Click to switch)"
          title="Active Antigravity Session (Click to switch)"
          aria-label="Switch Antigravity Session"
        >
          <span class="status-dot offline"></span>
          <span>🔗</span>
          <span id="session-badge-text" class="sr-only">Standalone</span>
        </button>

        <a
          id="btn-full-studio"
          href="${this.escapeAttr(getFullStudioUrl())}"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-ghost btn-icon preview-only-btn"
          data-tooltip="Open Full Playtest Studio in Browser Tab"
          title="Open Full Playtest Studio in Browser Tab"
          aria-label="Open Full Playtest Studio in Browser Tab"
        >
          <span>↗️</span>
        </a>
      </div>
    `;
    this.updateSessionBadgeUI();
  }

  private renderAnnotationBar(): void {
    const swatchesHtml = QA_COLOR_SWATCHES.map(
      (s, idx) => `
        <button
          type="button"
          class="qa-color-swatch ${idx === 0 ? 'active' : ''}"
          data-color="${s.hex}"
          style="background-color: ${s.hex};"
          data-tooltip="Color: ${s.name} (${s.hex})"
          title="Annotation Color: ${s.name} (${s.hex})"
          aria-label="Annotation color ${s.name}"
        ></button>
      `
    ).join('');

    this.annotationBarEl.innerHTML = `
      <div class="annotation-tools-group" role="toolbar" aria-label="Bug Annotation Tools">
        <button
          type="button"
          class="ann-tool-btn btn-icon"
          data-tool="pen"
          data-tooltip="Freehand Pen (P)"
          title="Freehand Pen (P)"
          aria-label="Freehand Pen Tool (P)"
        >
          <span>✏️</span>
        </button>
        <button
          type="button"
          class="ann-tool-btn btn-icon"
          data-tool="arrow"
          data-tooltip="Pointing Arrow Callout (A)"
          title="Pointing Arrow Callout (A)"
          aria-label="Pointing Arrow Tool (A)"
        >
          <span>🏹</span>
        </button>
        <button
          type="button"
          class="ann-tool-btn btn-icon active"
          data-tool="box"
          data-tooltip="Bounding Box Callout (B)"
          title="Bounding Box Callout (B)"
          aria-label="Bounding Box Tool (B)"
        >
          <span>🔲</span>
        </button>
        <button
          type="button"
          class="ann-tool-btn btn-icon"
          data-tool="text"
          data-tooltip="Text Label Callout (T)"
          title="Text Label Callout (T)"
          aria-label="Text Label Tool (T)"
        >
          <span>🏷️</span>
        </button>

        <div class="bar-divider"></div>

        <div class="qa-swatch-group" role="group" aria-label="QA Colors">
          ${swatchesHtml}
        </div>

        <div class="bar-divider"></div>

        <div class="ann-history-group">
          <button
            type="button"
            id="btn-ann-undo"
            class="btn btn-ghost btn-icon"
            disabled
            data-tooltip="Undo Annotation (⌘Z)"
            title="Undo Annotation (⌘Z)"
            aria-label="Undo Annotation"
          >↩️</button>
          <button
            type="button"
            id="btn-ann-redo"
            class="btn btn-ghost btn-icon"
            disabled
            data-tooltip="Redo Annotation (⇧⌘Z)"
            title="Redo Annotation (⇧⌘Z)"
            aria-label="Redo Annotation"
          >↪️</button>
          <button
            type="button"
            id="btn-ann-clear"
            class="btn btn-ghost btn-icon"
            disabled
            data-tooltip="Clear All Annotations"
            title="Clear All Annotations"
            aria-label="Clear All Annotations"
          >🧹</button>
        </div>
      </div>

      <div class="dvr-scrubber-group" role="region" aria-label="10-Second DVR Frame Scrubber">
        <button
          type="button"
          id="btn-dvr-prev"
          class="btn btn-outline btn-icon"
          data-tooltip="Step Back 1 Frame (←)"
          title="Step Back 1 Frame (←)"
          aria-label="Step Back 1 Frame"
        >⏮️</button>
        <input
          type="range"
          id="dvr-scrubber-slider"
          class="dvr-slider"
          min="0"
          max="0"
          step="1"
          value="0"
          title="Scrub 10-Second Gameplay DVR Buffer (250 frames @ 25fps)"
          aria-label="Scrub recorded gameplay frames"
        />
        <button
          type="button"
          id="btn-dvr-next"
          class="btn btn-outline btn-icon"
          data-tooltip="Step Forward 1 Frame (→)"
          title="Step Forward 1 Frame (→)"
          aria-label="Step Forward 1 Frame"
        >⏭️</button>
        <span
          id="dvr-frame-badge"
          class="dvr-frame-badge"
          data-tooltip="Live (0.0s)"
          title="Live (0.0s)"
        >0.0s</span>
      </div>
    `;
  }

  private renderViewport(): void {
    const ws = getWorkspacePath();
    this.viewportEl.innerHTML = `
      <!-- 1. Ready State (before first WASM build) -->
      <div id="viewport-ready-state" class="viewport-state-panel">
        <div class="ready-card">
          <div class="ready-icon-badge">🎮</div>
          <h2 class="ready-title">Ebitengine Live Playtest &amp; Visual QA</h2>
          <p class="ready-subtitle">
            Compile your Go game to WebAssembly (<code>GOOS=js GOARCH=wasm</code>), play inline at 60 FPS,
            pause with <kbd>F8</kbd> or <kbd>\`</kbd> to scrub the 10-second DVR ring buffer, circle visual bugs, and send directly to Antigravity chat.
          </p>

          <div class="ready-form-row">
            <div class="ready-field">
              <label for="ready-workspace-input">Go Project or Package Directory</label>
              <input
                type="text"
                id="ready-workspace-input"
                class="input-text"
                placeholder="/path/to/ebitengine-game or /path/to/repo/cmd/game"
                value="${this.escapeAttr(ws)}"
              />
            </div>
          </div>

          <div class="ready-actions">
            <button type="button" id="btn-ready-build" class="btn btn-primary btn-lg">
              <span>▶ Compile &amp; Launch Ebitengine WASM</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Build Error / Runtime Panic State (HTTP 422 fail-fast view) -->
      <div id="viewport-error-state" class="viewport-state-panel hidden">
        <div class="error-card">
          <div class="error-card-header">
            <div class="error-title-wrap">
              <span class="error-badge-icon">🚨</span>
              <div>
                <h3 id="error-state-title" class="error-card-title">Go WASM Compilation Failed</h3>
                <div id="error-state-meta" class="error-card-meta"></div>
              </div>
            </div>
            <div class="error-card-actions">
              <button type="button" id="btn-retry-build" class="btn btn-outline btn-sm">🔄 Retry Build</button>
              <button type="button" id="btn-send-build-error" class="btn btn-danger btn-sm">
                <span>🚨 Send Build Error to Chat</span>
              </button>
            </div>
          </div>
          <pre id="error-state-traceback" class="error-traceback-pre"></pre>
        </div>
      </div>

      <!-- 3. Active Game + Frozen DVR Annotation Stage -->
      <div id="viewport-game-stage" class="viewport-game-stage hidden">
        <div id="wasm-runner-mount" class="wasm-runner-mount"></div>

        <div id="annotation-stage" class="annotation-stage hidden">
          <div class="annotation-canvas-wrapper">
            <canvas id="annotation-base-canvas" class="annotation-base-canvas"></canvas>
            <canvas id="annotation-overlay-canvas" class="annotation-overlay-canvas"></canvas>
          </div>
        </div>

        <!-- Focus & Controls Status Pill -->
        <button type="button" id="focus-status-pill" class="focus-status-pill unfocused">
          <span>🎮 Click Game Viewport to Capture Keyboard &amp; Audio</span>
        </button>

        <!-- Collapsible On-Screen Virtual Gamepad Overlay -->
        <div id="virtual-keypad-overlay" class="virtual-keypad-overlay hidden" aria-label="On-Screen Virtual Gamepad">
          <div class="keypad-dpad">
            <button type="button" class="keypad-btn dpad-up" data-code="ArrowUp" data-key="ArrowUp">▲</button>
            <div class="dpad-mid-row">
              <button type="button" class="keypad-btn dpad-left" data-code="ArrowLeft" data-key="ArrowLeft">◀</button>
              <button type="button" class="keypad-btn dpad-down" data-code="ArrowDown" data-key="ArrowDown">▼</button>
              <button type="button" class="keypad-btn dpad-right" data-code="ArrowRight" data-key="ArrowRight">▶</button>
            </div>
          </div>
          <div class="keypad-actions">
            <button type="button" class="keypad-btn action-btn" data-code="KeyZ" data-key="z">Z</button>
            <button type="button" class="keypad-btn action-btn" data-code="KeyX" data-key="x">X</button>
            <button type="button" class="keypad-btn action-btn action-space" data-code="Space" data-key=" ">SPACE</button>
          </div>
        </div>

        <!-- Collapsible WASM Console & Stderr Drawer -->
        <div id="logs-drawer" class="logs-drawer hidden">
          <div class="logs-drawer-header">
            <span>WASM Console &amp; Runtime Logs (Last 200 lines)</span>
            <div class="logs-drawer-actions">
              <button type="button" id="btn-clear-logs" class="btn btn-ghost btn-sm">Clear</button>
              <button type="button" id="btn-close-logs" class="btn btn-ghost btn-sm">✕</button>
            </div>
          </div>
          <pre id="logs-drawer-content" class="logs-drawer-pre">No WASM console output recorded yet.</pre>
        </div>
      </div>
    `;

    this.readyStateEl = this.viewportEl.querySelector('#viewport-ready-state') as HTMLElement;
    this.errorStateEl = this.viewportEl.querySelector('#viewport-error-state') as HTMLElement;
    this.gameStageEl = this.viewportEl.querySelector('#viewport-game-stage') as HTMLElement;
    this.runnerMountEl = this.viewportEl.querySelector('#wasm-runner-mount') as HTMLElement;
    this.annotationStageEl = this.viewportEl.querySelector('#annotation-stage') as HTMLElement;
    this.focusPillEl = this.viewportEl.querySelector('#focus-status-pill') as HTMLElement;
    this.keypadOverlayEl = this.viewportEl.querySelector('#virtual-keypad-overlay') as HTMLElement;
    this.logsDrawerEl = this.viewportEl.querySelector('#logs-drawer') as HTMLElement;
  }

  private renderBugReportBar(): void {
    this.bugBarEl.innerHTML = `
      <input
        type="text"
        id="bug-note-input"
        class="input-text bug-note-input"
        placeholder="Describe the visual bug or instruction for Antigravity..."
        aria-label="Bug description or instruction for Antigravity"
      />
      <input type="checkbox" id="include-logs-checkbox" checked class="hidden" aria-hidden="true" />
      <button
        type="button"
        id="btn-toggle-attach-logs"
        class="btn btn-ghost btn-icon btn-toggle active"
        data-tooltip-pos="top"
        data-tooltip="Attach WASM Console Logs (ON)"
        title="Attach Captured WASM Console / Stderr Logs (ON — Click to toggle)"
        aria-label="Toggle attaching WASM console logs"
        aria-pressed="true"
      >
        <span>📋</span>
      </button>
      <button
        type="button"
        id="btn-send-bug-chat"
        class="btn btn-send-chat btn-sm"
        data-tooltip-pos="top"
        data-tooltip="Send Annotated Frame (.png) to Chat (Enter)"
        title="Send Annotated Frame Screenshot (.png) to Chat (Enter)"
      >
        <span>📸 Frame</span>
      </button>
      <button
        type="button"
        id="btn-send-gif-chat"
        class="btn btn-send-gif btn-sm"
        data-tooltip-pos="top"
        data-tooltip="Send 10-Second DVR Replay (.gif @ 25fps) to Chat"
        title="Send 10-Second DVR Replay as Animated GIF (.gif @ 25fps) to Chat"
      >
        <span>🎞️ 10s GIF</span>
      </button>
    `;
  }

  private bindEvents(): void {
    // Synchronize unified project path input between Header and Ready screen
    const headerWsInput = this.headerEl.querySelector('#workspace-input') as HTMLInputElement;
    const readyWsInput = this.viewportEl.querySelector('#ready-workspace-input') as HTMLInputElement;

    const syncWs = (val: string) => {
      setWorkspacePath(val);
      if (headerWsInput.value !== val) headerWsInput.value = val;
      if (readyWsInput.value !== val) readyWsInput.value = val;
    };

    headerWsInput.addEventListener('change', () => syncWs(headerWsInput.value));
    headerWsInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        syncWs(headerWsInput.value);
        void this.handleBuildAndRun();
      }
    });
    readyWsInput.addEventListener('input', () => syncWs(readyWsInput.value));
    readyWsInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        syncWs(readyWsInput.value);
        void this.handleBuildAndRun();
      }
    });

    onWorkspaceChange(() => this.updateHeaderInputsUI());
    onSessionChange(() => this.updateSessionBadgeUI());

    // Build & Run buttons
    this.headerEl.querySelector('#btn-build-run')?.addEventListener('click', () => {
      syncWs(headerWsInput.value);
      void this.handleBuildAndRun();
    });

    this.viewportEl.querySelector('#btn-ready-build')?.addEventListener('click', () => {
      syncWs(readyWsInput.value);
      void this.handleBuildAndRun();
    });

    this.viewportEl.querySelector('#btn-retry-build')?.addEventListener('click', () => {
      void this.handleBuildAndRun();
    });

    // Send Build Error to Chat button
    this.viewportEl.querySelector('#btn-send-build-error')?.addEventListener('click', () => {
      void this.handleSendBuildErrorToChat();
    });

    // Pause & Annotate toggle button
    this.headerEl.querySelector('#btn-pause-toggle')?.addEventListener('click', () => {
      this.runner.togglePause();
    });

    // Home button (return to Ready Card)
    this.headerEl.querySelector('#btn-home-ready')?.addEventListener('click', () => {
      this.showReadyStateView();
    });

    // Keypad toggle
    this.headerEl.querySelector('#btn-keypad-toggle')?.addEventListener('click', () => {
      this.keypadVisible = !this.keypadVisible;
      this.keypadOverlayEl.classList.toggle('hidden', !this.keypadVisible);
      this.headerEl
        .querySelector('#btn-keypad-toggle')
        ?.classList.toggle('active', this.keypadVisible);
    });

    // Mute toggle
    this.headerEl.querySelector('#btn-mute-toggle')?.addEventListener('click', () => {
      const muted = this.runner.toggleMuted();
      const label = this.headerEl.querySelector('#mute-btn-label');
      const btn = this.headerEl.querySelector('#btn-mute-toggle');
      if (label) {
        label.textContent = muted ? '🔇' : '🔊';
      }
      if (btn) {
        const tip = muted ? 'Unmute Game Audio (Muted)' : 'Mute Game Audio';
        btn.setAttribute('data-tooltip', tip);
        btn.setAttribute('title', tip);
      }
    });

    // Logs drawer toggle
    this.headerEl.querySelector('#btn-logs-toggle')?.addEventListener('click', () => {
      this.logsDrawerVisible = !this.logsDrawerVisible;
      this.logsDrawerEl.classList.toggle('hidden', !this.logsDrawerVisible);
      this.headerEl
        .querySelector('#btn-logs-toggle')
        ?.classList.toggle('active', this.logsDrawerVisible);
    });
    this.viewportEl.querySelector('#btn-close-logs')?.addEventListener('click', () => {
      this.logsDrawerVisible = false;
      this.logsDrawerEl.classList.add('hidden');
      this.headerEl.querySelector('#btn-logs-toggle')?.classList.remove('active');
    });
    this.viewportEl.querySelector('#btn-clear-logs')?.addEventListener('click', () => {
      this.runner.clearConsoleLogs();
      this.updateLogsUI([]);
    });

    // Session switcher modal
    this.headerEl.querySelector('#btn-session-badge')?.addEventListener('click', () => {
      void this.openSessionSwitcherModal();
    });

    // Focus pill click focuses game
    this.focusPillEl.addEventListener('click', () => {
      if (!this.runner.isPaused()) {
        this.runner.focus();
      }
    });

    // Virtual Keypad buttons
    const keypadBtns = this.keypadOverlayEl.querySelectorAll('.keypad-btn');
    keypadBtns.forEach((btn) => {
      const el = btn as HTMLElement;
      const code = el.dataset.code || 'Space';
      const key = el.dataset.key || ' ';

      const press = (e: Event) => {
        e.preventDefault();
        el.classList.add('pressed');
        this.runner.dispatchVirtualKey(code, key, 'keydown');
      };
      const release = (e: Event) => {
        e.preventDefault();
        if (el.classList.contains('pressed')) {
          el.classList.remove('pressed');
          this.runner.dispatchVirtualKey(code, key, 'keyup');
        }
      };

      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointerleave', release);
      el.addEventListener('pointercancel', release);
    });

    // Annotation Tool buttons
    const toolBtns = this.annotationBarEl.querySelectorAll('.ann-tool-btn');
    toolBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = (btn as HTMLElement).dataset.tool as AnnotationTool;
        if (tool) {
          this.selectAnnotationTool(tool);
        }
      });
    });

    // Annotation Color Swatches
    const swatches = this.annotationBarEl.querySelectorAll('.qa-color-swatch');
    swatches.forEach((sw) => {
      sw.addEventListener('click', () => {
        const hex = (sw as HTMLElement).dataset.color;
        if (hex) {
          this.annotator.setColor(hex);
          swatches.forEach((s) => s.classList.remove('active'));
          sw.classList.add('active');
        }
      });
    });

    // Annotation Undo / Redo / Clear
    this.annotationBarEl.querySelector('#btn-ann-undo')?.addEventListener('click', () => {
      this.annotator.undo();
    });
    this.annotationBarEl.querySelector('#btn-ann-redo')?.addEventListener('click', () => {
      this.annotator.redo();
    });
    this.annotationBarEl.querySelector('#btn-ann-clear')?.addEventListener('click', () => {
      this.annotator.clearAnnotations();
    });

    // DVR Frame Scrubber controls
    const dvrSlider = this.annotationBarEl.querySelector(
      '#dvr-scrubber-slider'
    ) as HTMLInputElement;
    dvrSlider.addEventListener('input', () => {
      const idx = Number.parseInt(dvrSlider.value, 10);
      void this.scrubToDvrFrame(idx);
    });

    this.annotationBarEl.querySelector('#btn-dvr-prev')?.addEventListener('click', () => {
      if (this.dvrBuffer.length > 0) {
        const nextIdx = Math.max(0, this.activeDvrIndex - 1);
        void this.scrubToDvrFrame(nextIdx);
      }
    });

    this.annotationBarEl.querySelector('#btn-dvr-next')?.addEventListener('click', () => {
      if (this.dvrBuffer.length > 0) {
        const nextIdx = Math.min(this.dvrBuffer.length - 1, this.activeDvrIndex + 1);
        void this.scrubToDvrFrame(nextIdx);
      }
    });

    // Toggle Attach Logs icon button
    const attachLogsBtn = this.bugBarEl.querySelector(
      '#btn-toggle-attach-logs'
    ) as HTMLButtonElement | null;
    const attachLogsCheckbox = this.bugBarEl.querySelector(
      '#include-logs-checkbox'
    ) as HTMLInputElement | null;
    attachLogsBtn?.addEventListener('click', () => {
      const nextChecked = attachLogsCheckbox ? !attachLogsCheckbox.checked : false;
      if (attachLogsCheckbox) {
        attachLogsCheckbox.checked = nextChecked;
      }
      attachLogsBtn.classList.toggle('active', nextChecked);
      attachLogsBtn.setAttribute('aria-pressed', String(nextChecked));
      const tip = nextChecked
        ? 'Attach WASM Console Logs (ON)'
        : 'Attach WASM Console Logs (OFF)';
      attachLogsBtn.setAttribute('data-tooltip', tip);
      attachLogsBtn.setAttribute('title', tip);
    });

    // Send Bug / 5s GIF to Chat buttons + Enter key in bug note input
    const bugInput = this.bugBarEl.querySelector('#bug-note-input') as HTMLInputElement;
    bugInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleSendBugToChat();
      }
    });

    this.bugBarEl.querySelector('#btn-send-bug-chat')?.addEventListener('click', () => {
      void this.handleSendBugToChat();
    });
    this.bugBarEl.querySelector('#btn-send-gif-chat')?.addEventListener('click', () => {
      void this.handleSendGifToChat();
    });

    // Parent window capture-phase hotkey listener (`F8` / Backquote + annotation shortcuts when paused)
    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const isInput =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable);

        if (e.code === 'F8' || (!isInput && e.code === 'Backquote')) {
          if (this.runner.isRunning()) {
            e.preventDefault();
            e.stopPropagation();
            this.runner.togglePause();
          }
          return;
        }

        if (isInput || !this.runner.isPaused()) {
          return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            this.annotator.redo();
          } else {
            this.annotator.undo();
          }
          return;
        }

        if (e.code === 'KeyP') {
          e.preventDefault();
          this.selectAnnotationTool('pen');
        } else if (e.code === 'KeyA') {
          e.preventDefault();
          this.selectAnnotationTool('arrow');
        } else if (e.code === 'KeyB') {
          e.preventDefault();
          this.selectAnnotationTool('box');
        } else if (e.code === 'KeyT') {
          e.preventDefault();
          this.selectAnnotationTool('text');
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          void this.scrubToDvrFrame(Math.max(0, this.activeDvrIndex - 1));
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          void this.scrubToDvrFrame(Math.min(this.dvrBuffer.length - 1, this.activeDvrIndex + 1));
        }
      },
      { capture: true }
    );
  }

  public async handleBuildAndRun(): Promise<void> {
    if (this.isBuilding) {
      return;
    }

    const workspace = getWorkspacePath().trim();
    if (!workspace) {
      StudioNotifier.error(
        'Missing Go Workspace Path',
        'Enter the path to your Ebitengine Go workspace in the header bar before building.'
      );
      return;
    }

    this.isBuilding = true;
    this.lastBuildFailure = null;
    this.setBuildButtonsLoading(true);

    try {
      StudioNotifier.info(`Compiling Go WASM in "${workspace}"...`, 2500);
      const result = await buildWasm({
        workspace
      });

      if (!result.ok) {
        this.lastBuildFailure = result;
        this.showBuildErrorView(result);
        StudioNotifier.error(
          'Go WASM Compilation Failed (HTTP 422)',
          result.compilerOutput.slice(0, 240)
        );
        return;
      }

      this.activePkg = result.pkg || '.';
      this.showActiveGameStage();
      await this.runner.launchBuild(result.buildId);

      const pauseBtn = this.headerEl.querySelector('#btn-pause-toggle') as HTMLButtonElement | null;
      if (pauseBtn) {
        pauseBtn.disabled = false;
      }

      const kbSize = (result.wasmBytes / (1024 * 1024)).toFixed(2);
      StudioNotifier.success(
        `Built & launched ${result.pkg} (${kbSize} MB WASM in ${result.durationMs}ms)`
      );
      this.runner.focus();
    } catch (err: any) {
      StudioNotifier.error('WASM Build / Launch Error', err?.message || String(err));
    } finally {
      this.isBuilding = false;
      this.setBuildButtonsLoading(false);
    }
  }

  private handlePauseStateChanged(paused: boolean): void {
    const pauseBtn = this.headerEl.querySelector('#btn-pause-toggle') as HTMLButtonElement | null;
    const pauseLabel = this.headerEl.querySelector('#pause-btn-label');

    if (paused) {
      if (pauseBtn) {
        pauseBtn.classList.add('btn-warning-active');
        pauseBtn.setAttribute('data-tooltip', 'Resume Gameplay (` or F8)');
        pauseBtn.setAttribute('title', 'Resume Gameplay (` or F8)');
      }
      if (pauseLabel) pauseLabel.textContent = '▶️ Resume';

      this.annotationBarEl.classList.remove('hidden');
      this.annotationStageEl.classList.remove('hidden');

      const liveCanvas = this.runner.getGameCanvas();
      if (liveCanvas && liveCanvas.width > 0 && liveCanvas.height > 0) {
        this.annotator.loadBaseFromCanvas(liveCanvas);
      } else {
        const latest = this.dvrBuffer.getLatestFrame();
        if (latest) {
          void this.annotator.loadBaseFrameDataUrl(latest.dataUrl, latest.width, latest.height);
        }
      }

      this.activeDvrIndex = Math.max(0, this.dvrBuffer.length - 1);
      this.updateDvrScrubberUI();
      this.updateFocusPillUI(false);
    } else {
      if (pauseBtn) {
        pauseBtn.classList.remove('btn-warning-active');
        pauseBtn.setAttribute('data-tooltip', 'Freeze Frame & Annotate Bug (` or F8)');
        pauseBtn.setAttribute('title', 'Freeze Frame & Annotate Bug (` or F8)');
      }
      if (pauseLabel) pauseLabel.textContent = '⏸️ Pause';

      this.annotationBarEl.classList.add('hidden');
      this.annotationStageEl.classList.add('hidden');
      this.runner.focus();
    }
  }

  public async scrubToDvrFrame(index: number): Promise<void> {
    const frame = this.dvrBuffer.getFrameAt(index);
    if (!frame) {
      return;
    }
    this.activeDvrIndex = frame.index;
    this.updateDvrScrubberUI();
    if (frame.canvas) {
      this.annotator.loadBaseFromCanvas(frame.canvas);
    } else {
      await this.annotator.loadBaseFrameDataUrl(frame.dataUrl, frame.width, frame.height);
    }
  }

  private updateDvrScrubberUI(): void {
    const slider = this.annotationBarEl.querySelector(
      '#dvr-scrubber-slider'
    ) as HTMLInputElement | null;
    const badge = this.annotationBarEl.querySelector('#dvr-frame-badge');
    const prevBtn = this.annotationBarEl.querySelector(
      '#btn-dvr-prev'
    ) as HTMLButtonElement | null;
    const nextBtn = this.annotationBarEl.querySelector(
      '#btn-dvr-next'
    ) as HTMLButtonElement | null;

    const total = this.dvrBuffer.length;
    if (total === 0) {
      if (slider) {
        slider.min = '0';
        slider.max = '0';
        slider.value = '0';
        slider.disabled = true;
      }
      if (badge) {
        badge.textContent = '0.0s';
        badge.setAttribute('data-tooltip', 'Live (0.0s)');
        badge.setAttribute('title', 'Live (0.0s)');
      }
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const clampedIdx = Math.max(0, Math.min(total - 1, this.activeDvrIndex));
    const frame = this.dvrBuffer.getFrameAt(clampedIdx);

    if (slider) {
      slider.disabled = false;
      slider.min = '0';
      slider.max = String(total - 1);
      slider.value = String(clampedIdx);
    }
    if (prevBtn) prevBtn.disabled = clampedIdx <= 0;
    if (nextBtn) nextBtn.disabled = clampedIdx >= total - 1;

    if (badge && frame) {
      const shortLabel =
        frame.relativeSec === 0 ? '0.0s' : `${frame.relativeSec.toFixed(1)}s`;
      const fullTooltip =
        frame.relativeSec === 0
          ? `Live (0.0s) · Frame ${clampedIdx + 1}/${total}`
          : `${frame.relativeSec.toFixed(2)}s · Frame ${clampedIdx + 1}/${total}`;
      badge.textContent = shortLabel;
      badge.setAttribute('data-tooltip', fullTooltip);
      badge.setAttribute('title', fullTooltip);
    }
  }

  private selectAnnotationTool(tool: AnnotationTool): void {
    this.annotator.setTool(tool);
    const toolBtns = this.annotationBarEl.querySelectorAll('.ann-tool-btn');
    toolBtns.forEach((btn) => {
      const t = (btn as HTMLElement).dataset.tool;
      btn.classList.toggle('active', t === tool);
    });
  }

  private updateAnnotationControlsUI(): void {
    const undoBtn = this.annotationBarEl.querySelector(
      '#btn-ann-undo'
    ) as HTMLButtonElement | null;
    const redoBtn = this.annotationBarEl.querySelector(
      '#btn-ann-redo'
    ) as HTMLButtonElement | null;
    const clearBtn = this.annotationBarEl.querySelector(
      '#btn-ann-clear'
    ) as HTMLButtonElement | null;

    if (undoBtn) undoBtn.disabled = !this.annotator.canUndo();
    if (redoBtn) redoBtn.disabled = !this.annotator.canRedo();
    if (clearBtn) clearBtn.disabled = this.annotator.getShapes().length === 0;
  }

  private updateFocusPillUI(focused: boolean): void {
    if (!this.focusPillEl) return;

    if (this.runner.isPaused()) {
      this.focusPillEl.className = 'focus-status-pill paused';
      this.focusPillEl.innerHTML = '<span>⏸ Paused — Draw on Frame or Scrub 10s DVR</span>';
      return;
    }

    if (focused) {
      this.focusPillEl.className = 'focus-status-pill focused';
      this.focusPillEl.innerHTML = '<span>● Controls Active (` or F8 to Pause)</span>';
    } else {
      this.focusPillEl.className = 'focus-status-pill unfocused';
      this.focusPillEl.innerHTML =
        '<span>🎮 Click Game Viewport to Capture Keyboard &amp; Audio</span>';
    }
  }

  private updateLogsUI(logs: string[]): void {
    const badge = this.headerEl.querySelector('#logs-count-badge');
    if (badge) {
      badge.textContent = String(logs.length);
    }
    const pre = this.viewportEl.querySelector('#logs-drawer-content');
    if (pre) {
      pre.textContent =
        logs.length > 0 ? logs.join('\n') : 'No WASM console output recorded yet.';
      pre.scrollTop = pre.scrollHeight;
    }
  }

  public showReadyStateView(): void {
    this.runner.destroy();
    this.lastBuildFailure = null;
    this.annotationBarEl.classList.add('hidden');
    this.annotationStageEl.classList.add('hidden');
    this.gameStageEl.classList.add('hidden');
    this.errorStateEl.classList.add('hidden');
    this.readyStateEl.classList.remove('hidden');

    const pauseBtn = this.headerEl.querySelector('#btn-pause-toggle') as HTMLButtonElement | null;
    const pauseLabel = this.headerEl.querySelector('#pause-btn-label');
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.classList.remove('btn-warning-active');
    }
    if (pauseLabel) {
      pauseLabel.textContent = '⏸️ Pause';
    }
    this.updateHeaderInputsUI();
  }

  private showActiveGameStage(): void {
    this.readyStateEl.classList.add('hidden');
    this.errorStateEl.classList.add('hidden');
    this.gameStageEl.classList.remove('hidden');
  }

  private showBuildErrorView(failure: BuildWasmFailure): void {
    this.runner.destroy();
    this.annotationBarEl.classList.add('hidden');
    this.readyStateEl.classList.add('hidden');
    this.gameStageEl.classList.add('hidden');
    this.errorStateEl.classList.remove('hidden');

    const titleEl = this.viewportEl.querySelector('#error-state-title');
    const metaEl = this.viewportEl.querySelector('#error-state-meta');
    const preEl = this.viewportEl.querySelector('#error-state-traceback');

    if (titleEl) titleEl.textContent = failure.error || 'Go WASM Compilation Failed';
    if (metaEl) {
      metaEl.textContent = `Workspace: ${failure.workspace} | Package: ${failure.pkg} | Exit Code: ${failure.exitCode}`;
    }
    if (preEl) {
      preEl.textContent = failure.compilerOutput;
    }
  }

  private showRuntimePanicView(panicMessage: string): void {
    const ws = getWorkspacePath() || '.';
    this.lastBuildFailure = {
      ok: false,
      status: 422,
      error: 'Go WASM Runtime Panic',
      compilerOutput: [panicMessage, '', ...this.runner.getConsoleLogs().slice(-30)].join('\n'),
      workspace: ws,
      pkg: this.activePkg,
      exitCode: 2
    };
    this.showBuildErrorView(this.lastBuildFailure);
  }

  private async handleSendBuildErrorToChat(): Promise<void> {
    if (!this.lastBuildFailure) {
      return;
    }

    const btn = this.viewportEl.querySelector(
      '#btn-send-build-error'
    ) as HTMLButtonElement | null;
    if (btn) btn.disabled = true;

    try {
      const noteInput = this.bugBarEl.querySelector('#bug-note-input') as HTMLInputElement | null;
      const note = noteInput?.value.trim() || '';

      await sendBuildErrorToChat({
        buildError: this.lastBuildFailure.compilerOutput,
        note,
        workspace: this.lastBuildFailure.workspace,
        pkg: this.lastBuildFailure.pkg
      });

      StudioNotifier.success('Sent Go WASM compiler traceback directly to Antigravity chat!');
    } catch (err: any) {
      StudioNotifier.error('Failed to send build error to chat', err?.message || String(err));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  private async ensurePausedFrameLoaded(): Promise<void> {
    if (this.runner.isRunning() && !this.runner.isPaused()) {
      this.runner.setPaused(true);
    } else if (this.dvrBuffer.length === 0) {
      this.runner.syncDvrFromChild();
      this.activeDvrIndex = Math.max(0, this.dvrBuffer.length - 1);
      this.updateDvrScrubberUI();
    }

    if (!this.annotator.hasFrozenFrame()) {
      const liveCanvas = this.runner.getGameCanvas();
      if (liveCanvas && liveCanvas.width > 0 && liveCanvas.height > 0) {
        this.annotator.loadBaseFromCanvas(liveCanvas);
      } else {
        const latest = this.dvrBuffer.getLatestFrame();
        if (latest) {
          if (latest.canvas) {
            this.annotator.loadBaseFromCanvas(latest.canvas);
          } else {
            await this.annotator.loadBaseFrameDataUrl(latest.dataUrl, latest.width, latest.height);
          }
        }
      }
    }
  }

  private decodeDataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode frame dataUrl into HTMLImageElement.'));
      img.src = dataUrl;
    });
  }

  private async buildDvrAnimatedGifDataUrl(): Promise<{
    dataUrl: string;
    width: number;
    height: number;
    frameCount: number;
    durationSec: number;
  }> {
    await this.ensurePausedFrameLoaded();

    const allFrames = this.dvrBuffer.getFrames();
    const endIdx =
      allFrames.length > 0
        ? Math.max(0, Math.min(allFrames.length - 1, this.activeDvrIndex))
        : 0;
    const selectedFrames = allFrames.length > 0 ? allFrames.slice(0, endIdx + 1) : [];

    const baseDims = this.annotator.getDimensions();
    const srcWidth = selectedFrames[0]?.width || baseDims.width || 640;
    const srcHeight = selectedFrames[0]?.height || baseDims.height || 360;

    // Probe the active rendered game viewport bounds so letterbox bars are cropped out of the GIF.
    // GIF exports never include annotations and are always locked strictly to game screen resolution.
    let crop = { x: 0, y: 0, width: srcWidth, height: srcHeight };
    const probeFrame = selectedFrames[selectedFrames.length - 1] || selectedFrames[0];
    if (probeFrame) {
      const probeCanvas = document.createElement('canvas');
      probeCanvas.width = srcWidth;
      probeCanvas.height = srcHeight;
      const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
      if (probeCtx) {
        probeCtx.clearRect(0, 0, srcWidth, srcHeight);
        if (probeFrame.canvas) {
          probeCtx.drawImage(probeFrame.canvas, 0, 0, srcWidth, srcHeight);
        } else if (probeFrame.dataUrl) {
          const probeImg = await this.decodeDataUrlToImage(probeFrame.dataUrl);
          probeCtx.drawImage(probeImg, 0, 0, srcWidth, srcHeight);
        }
        const probeData = probeCtx.getImageData(0, 0, srcWidth, srcHeight);
        crop = detectActiveViewportBounds(probeData.data, srcWidth, srcHeight);
      }
    }

    // Scale to crisp 480px max width for fast encoding and compact inline chat GIF playback
    const maxGifWidth = 480;
    const scale = crop.width > maxGifWidth ? maxGifWidth / crop.width : 1;
    const targetWidth = Math.max(64, Math.round(crop.width * scale));
    const targetHeight = Math.max(36, Math.round(crop.height * scale));

    const scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = targetWidth;
    scratchCanvas.height = targetHeight;
    const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Failed to acquire 2D context for GIF encoding.');
    }
    ctx.imageSmoothingEnabled = false;

    const gifFrames: GifFrameInput[] = [];

    for (let i = 0; i < selectedFrames.length; i++) {
      const f = selectedFrames[i];
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      if (f.canvas) {
        ctx.drawImage(
          f.canvas,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          targetWidth,
          targetHeight
        );
      } else {
        const img = await this.decodeDataUrlToImage(f.dataUrl);
        ctx.drawImage(
          img,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          targetWidth,
          targetHeight
        );
      }
      const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

      const isLastFrame = i === selectedFrames.length - 1;
      let frameDelayMs = this.dvrBuffer.captureIntervalMs;
      if (i + 1 < selectedFrames.length) {
        const rawDelta = selectedFrames[i + 1].timestampMs - f.timestampMs;
        if (Number.isFinite(rawDelta) && rawDelta >= 15 && rawDelta <= 250) {
          frameDelayMs = Math.round(rawDelta);
        }
      }

      gifFrames.push({
        rgba: new Uint8Array(imageData.data),
        delayMs: isLastFrame ? 900 : frameDelayMs
      });
    }

    // If no DVR frames were buffered yet, capture a single unannotated frame from the live game canvas
    if (gifFrames.length === 0) {
      const liveCanvas = this.runner.getGameCanvas();
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      if (liveCanvas && liveCanvas.width > 0 && liveCanvas.height > 0) {
        const liveCtx = liveCanvas.getContext('2d');
        if (liveCtx) {
          const liveData = liveCtx.getImageData(0, 0, liveCanvas.width, liveCanvas.height);
          crop = detectActiveViewportBounds(liveData.data, liveCanvas.width, liveCanvas.height);
        }
        ctx.drawImage(
          liveCanvas,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          targetWidth,
          targetHeight
        );
      }
      const fallbackData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      gifFrames.push({
        rgba: new Uint8Array(fallbackData.data),
        delayMs: 900
      });
    }

    const gifBytes = encodeAnimatedGif({
      width: targetWidth,
      height: targetHeight,
      frames: gifFrames
    });

    const spanSec =
      selectedFrames.length >= 2
        ? (selectedFrames[selectedFrames.length - 1].timestampMs - selectedFrames[0].timestampMs) /
          1000
        : (selectedFrames.length * this.dvrBuffer.captureIntervalMs) / 1000;
    const durationSec = Number(Math.max(0.04, spanSec).toFixed(2));
    return {
      dataUrl: gifBytesToDataUrl(gifBytes),
      width: targetWidth,
      height: targetHeight,
      frameCount: gifFrames.length,
      durationSec
    };
  }

  private async handleSendGifToChat(): Promise<void> {
    if (this.lastBuildFailure && !this.runner.isRunning()) {
      await this.handleSendBuildErrorToChat();
      return;
    }

    const gifBtn = this.bugBarEl.querySelector('#btn-send-gif-chat') as HTMLButtonElement | null;
    const sendBtn = this.bugBarEl.querySelector('#btn-send-bug-chat') as HTMLButtonElement | null;
    if (gifBtn) gifBtn.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    try {
      StudioNotifier.info('Encoding 10s DVR replay (25 FPS) into animated GIF...', 2400);
      const gifResult = await this.buildDvrAnimatedGifDataUrl();

      const noteInput = this.bugBarEl.querySelector('#bug-note-input') as HTMLInputElement | null;
      const includeLogsCheckbox = this.bugBarEl.querySelector(
        '#include-logs-checkbox'
      ) as HTMLInputElement | null;

      const note = noteInput?.value.trim() || '';
      const includeLogs = includeLogsCheckbox ? includeLogsCheckbox.checked : true;
      const consoleLogs = includeLogs ? this.runner.getConsoleLogs() : [];

      const currentFrame = this.dvrBuffer.getFrameAt(this.activeDvrIndex);
      const endOffset = currentFrame
        ? currentFrame.relativeSec === 0
          ? 'live (0.0s)'
          : `${currentFrame.relativeSec.toFixed(2)}s`
        : 'live';

      const filename = `playtest-clip-${Date.now()}.gif`;
      const res = await sendBugToChat({
        filename,
        imageDataUrl: gifResult.dataUrl,
        note,
        consoleLogs,
        workspace: getWorkspacePath() || '.',
        pkg: this.activePkg,
        frameOffset: `${gifResult.frameCount}f (${gifResult.durationSec}s DVR → ${endOffset})`,
        resolution: `${gifResult.width}x${gifResult.height}`,
        width: gifResult.width,
        height: gifResult.height
      });

      StudioNotifier.success(
        `Delivered 10s DVR GIF "${res.filename || filename}" (${gifResult.frameCount} frames) to chat!`
      );
      if (noteInput) {
        noteInput.value = '';
      }
    } catch (err: any) {
      StudioNotifier.error('Failed to encode or send 10s DVR GIF', err?.message || String(err));
    } finally {
      if (gifBtn) gifBtn.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  private async handleSendBugToChat(): Promise<void> {
    if (this.lastBuildFailure && !this.runner.isRunning()) {
      await this.handleSendBuildErrorToChat();
      return;
    }

    await this.ensurePausedFrameLoaded();

    const sendBtn = this.bugBarEl.querySelector('#btn-send-bug-chat') as HTMLButtonElement | null;
    const gifBtn = this.bugBarEl.querySelector('#btn-send-gif-chat') as HTMLButtonElement | null;
    if (sendBtn) sendBtn.disabled = true;
    if (gifBtn) gifBtn.disabled = true;

    try {
      const noteInput = this.bugBarEl.querySelector('#bug-note-input') as HTMLInputElement | null;
      const includeLogsCheckbox = this.bugBarEl.querySelector(
        '#include-logs-checkbox'
      ) as HTMLInputElement | null;

      const note = noteInput?.value.trim() || '';
      const includeLogs = includeLogsCheckbox ? includeLogsCheckbox.checked : true;
      const consoleLogs = includeLogs ? this.runner.getConsoleLogs() : [];

      const smartExport = this.annotator.exportSmartComposite();
      const currentFrame = this.dvrBuffer.getFrameAt(this.activeDvrIndex);
      const frameOffset = currentFrame
        ? currentFrame.relativeSec === 0
          ? 'live (0.0s)'
          : `${currentFrame.relativeSec.toFixed(2)}s`
        : 'live';

      const filename = `playtest-bug-${Date.now()}.png`;
      const res = await sendBugToChat({
        filename,
        imageDataUrl: smartExport.dataUrl,
        note,
        consoleLogs,
        workspace: getWorkspacePath() || '.',
        pkg: this.activePkg,
        frameOffset,
        resolution: `${smartExport.width}x${smartExport.height}`,
        width: smartExport.width,
        height: smartExport.height
      });

      StudioNotifier.success(`Delivered "${res.filename || filename}" to Antigravity chat!`);
      if (noteInput) {
        noteInput.value = '';
      }
    } catch (err: any) {
      StudioNotifier.error('Failed to send bug report to chat', err?.message || String(err));
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (gifBtn) gifBtn.disabled = false;
    }
  }

  private setBuildButtonsLoading(loading: boolean): void {
    const headerBtn = this.headerEl.querySelector('#btn-build-run') as HTMLButtonElement | null;
    const headerLabel = this.headerEl.querySelector('#build-btn-label');
    const readyBtn = this.viewportEl.querySelector('#btn-ready-build') as HTMLButtonElement | null;

    if (headerBtn) headerBtn.disabled = loading;
    if (readyBtn) {
      readyBtn.disabled = loading;
      readyBtn.innerHTML = loading
        ? '<span>⏳ Compiling &amp; Launching WASM...</span>'
        : '<span>▶ Compile &amp; Launch Ebitengine WASM</span>';
    }
    if (headerLabel) {
      headerLabel.textContent = loading ? '⏳ Building...' : '🚀 Run';
    }
  }

  private updateHeaderInputsUI(): void {
    const ws = getWorkspacePath();
    const headerWsInput = this.headerEl.querySelector(
      '#workspace-input'
    ) as HTMLInputElement | null;
    const readyWsInput = this.viewportEl.querySelector(
      '#ready-workspace-input'
    ) as HTMLInputElement | null;
    if (headerWsInput && headerWsInput.value !== ws) {
      headerWsInput.value = ws;
    }
    if (readyWsInput && readyWsInput.value !== ws) {
      readyWsInput.value = ws;
    }
    const fullLink = this.headerEl.querySelector('#btn-full-studio') as HTMLAnchorElement | null;
    if (fullLink) {
      fullLink.href = getFullStudioUrl();
    }
  }

  private updateSessionBadgeUI(): void {
    const sid = getSessionId();
    const badge = this.headerEl.querySelector('#btn-session-badge');
    const fullLink = this.headerEl.querySelector('#btn-full-studio') as HTMLAnchorElement | null;

    if (badge) {
      const dot = badge.querySelector('.status-dot');
      const text = badge.querySelector('#session-badge-text');
      if (sid && sid !== 'standalone') {
        badge.className = 'session-badge connected';
        if (dot) dot.className = 'status-dot online';
        if (text) text.textContent = `${sid.slice(0, 8)}...`;
        const tip = `Session: ${sid.slice(0, 8)}... (Click to switch)`;
        badge.setAttribute('data-tooltip', tip);
        badge.setAttribute('title', tip);
      } else {
        badge.className = 'session-badge disconnected';
        if (dot) dot.className = 'status-dot offline';
        if (text) text.textContent = 'Standalone';
        const tip = 'Session: Standalone (Click to connect)';
        badge.setAttribute('data-tooltip', tip);
        badge.setAttribute('title', tip);
      }
    }

    if (fullLink) {
      fullLink.href = getFullStudioUrl();
    }
  }

  private async openSessionSwitcherModal(): Promise<void> {
    const existing = document.getElementById('session-switcher-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'session-switcher-modal';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
      <div class="modal-dialog session-modal-dialog">
        <div class="modal-header">
          <span class="modal-title">Connect Antigravity Session</span>
          <button type="button" class="modal-close-btn" id="session-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="session-manual-row">
            <input
              type="text"
              id="manual-session-input"
              class="input-text"
              placeholder="Paste Session UUID or 'standalone'"
              value="${this.escapeAttr(getSessionId() || '')}"
            />
            <button type="button" id="btn-apply-session" class="btn btn-primary btn-sm">Connect</button>
          </div>
          <div id="recent-sessions-list" class="recent-sessions-list">
            <div class="session-loading">Loading recent Antigravity sessions...</div>
          </div>
        </div>
      </div>
    `;

    const close = () => overlay.remove();
    overlay.querySelector('#session-modal-close')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.querySelector('#btn-apply-session')?.addEventListener('click', () => {
      const input = overlay.querySelector('#manual-session-input') as HTMLInputElement;
      const val = input.value.trim();
      if (val) {
        try {
          setSessionId(val);
          StudioNotifier.success(`Connected to session ${val}`);
          close();
        } catch (err: any) {
          StudioNotifier.error('Invalid Session ID', err?.message || String(err));
        }
      }
    });

    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('#recent-sessions-list') as HTMLElement;
    try {
      const sessions = await fetchRecentSessions();
      if (sessions.length === 0) {
        listEl.innerHTML = '<div class="session-empty">No recent sessions found.</div>';
        return;
      }
      listEl.innerHTML = sessions
        .map(
          (s) => `
          <button type="button" class="session-item-btn" data-sid="${this.escapeAttr(s.id)}">
            <span class="session-item-id">${this.escapeHtml(s.id)}</span>
            <span class="session-item-time">${this.escapeHtml(new Date(s.updatedAt).toLocaleTimeString())}</span>
          </button>
        `
        )
        .join('');

      listEl.querySelectorAll('.session-item-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sid = (btn as HTMLElement).dataset.sid;
          if (sid) {
            setSessionId(sid);
            StudioNotifier.success(`Connected to session ${sid.slice(0, 8)}...`);
            close();
          }
        });
      });
    } catch (err: any) {
      listEl.innerHTML = `<div class="session-empty">Failed to load sessions: ${this.escapeHtml(err?.message || String(err))}</div>`;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escapeAttr(str: string): string {
    return this.escapeHtml(str).replace(/'/g, '&#39;');
  }
}
