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

import type { CanvasEngine } from '../engine/CanvasEngine.ts';
import { SelectionTool } from '../engine/tools/SelectionTool.ts';
import { exportPsdFile, importPsdFile, serializePsd } from '../utils/psd.ts';
import {
  sidecarFetch,
  getWorkspaceUris,
  sendAgentMessage,
  fetchActiveSessionId,
  getSessionId,
  setActiveSessionId,
  onSessionChange,
  getFullStudioUrl
} from '../utils/api.ts';
import { ArtifactModal } from './ArtifactModal.ts';
import { ConversationModal } from './ConversationModal.ts';
import { NotificationManager } from './Notification.ts';

export class Header {
  private engine: CanvasEngine;
  private container: HTMLElement;
  private artifactModal: ArtifactModal;
  private conversationModal: ConversationModal;
  private sessionId: string | null = null;
  private shortcutsEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private newCanvasEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private saveExportEscHandler: ((e: KeyboardEvent) => void) | null = null;
  private lastSaveDirectory = '';
  private lastSaveBasename = '';
  public onSessionChange: ((sessionId: string) => void) | null = null;

  constructor(engine: CanvasEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;
    this.artifactModal = new ArtifactModal(engine);

    this.sessionId = getSessionId();
    this.conversationModal = new ConversationModal();

    this.render();
    this.bindEvents();
    this.renderAiRefineBar();

    this.artifactModal.setSessionId(this.sessionId);

    onSessionChange((updatedId) => {
      if (this.sessionId !== updatedId) {
        this.sessionId = updatedId;
        this.artifactModal.setSessionId(updatedId);
        this.updateSessionUI();
      }
    });

    if (!this.sessionId) {
      fetchActiveSessionId().catch((err) => {
        console.warn('[Header] Could not auto-resolve active session ID:', err);
      });
    }

    this.engine.addZoomChangeListener((zoom) => {
      const zoomBtn = this.container.querySelector('#zoom-reset-btn');
      if (zoomBtn) {
        zoomBtn.textContent = `${Math.round(zoom * 100)}%`;
      }
    });

    this.engine.addHistoryChangeListener(() => {
      const undoBtn = this.container.querySelector('#undo-btn') as HTMLButtonElement | null;
      const redoBtn = this.container.querySelector('#redo-btn') as HTMLButtonElement | null;
      if (undoBtn) undoBtn.disabled = !this.engine.history.canUndo();
      if (redoBtn) redoBtn.disabled = !this.engine.history.canRedo();
    });
  }

  public setSessionId(id: string) {
    setActiveSessionId(id);
    this.sessionId = getSessionId();
    this.artifactModal.setSessionId(this.sessionId);
    this.updateSessionUI();
    if (this.onSessionChange && this.sessionId) {
      this.onSessionChange(this.sessionId);
    }
  }

  private updateSessionUI() {
    const badge = this.container.querySelector('#header-session-badge');
    if (badge) {
      badge.innerHTML = '';
      if (this.sessionId && this.sessionId !== 'standalone') {
        badge.className = 'session-badge connected';
        badge.setAttribute('title', `Connected to session: ${this.sessionId} (Click to switch)`);
        const dot = document.createElement('span');
        dot.className = 'status-dot online';
        const label = document.createElement('span');
        label.className = 'session-id-text';
        label.textContent = `${this.sessionId.substring(0, 8)}...`;
        badge.appendChild(dot);
        badge.appendChild(label);
      } else {
        badge.className = 'session-badge disconnected';
        badge.setAttribute('title', 'Standalone Mode (Click to connect session)');
        const dot = document.createElement('span');
        dot.className = 'status-dot offline';
        const label = document.createElement('span');
        label.className = 'session-id-text';
        label.textContent = 'Standalone';
        badge.appendChild(dot);
        badge.appendChild(label);
      }
    }

    const fullStudioLink = document.getElementById('btn-full-studio') as HTMLAnchorElement | null;
    if (fullStudioLink) {
      fullStudioLink.href = getFullStudioUrl();
    }
  }

  private render() {
    const isConnected = Boolean(this.sessionId && this.sessionId !== 'standalone');

    this.container.innerHTML = `
      <div class="header-left">
        <div class="app-brand" title="Paint Studio">
          <div class="brand-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
            </svg>
          </div>
          <span class="app-title">Paint Studio</span>
        </div>

        <nav class="menu-bar">
          <!-- File Menu -->
          <div class="menu-dropdown">
            <button class="menu-trigger">File ▾</button>
            <div class="menu-content">
              <button class="menu-item" id="menu-new-canvas">
                <span>New Canvas...</span>
                <span class="shortcut">⌘N</span>
              </button>
              <button class="menu-item" id="menu-clear-layer">
                <span>Clear Active Layer</span>
                <span class="shortcut">⌫</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item" id="menu-open-image">
                <span>Open Image as Canvas...</span>
                <span class="shortcut">⌘O</span>
              </button>
              <button class="menu-item" id="menu-import-layer">
                <span>Import Image as Layer...</span>
                <span class="shortcut">⇧⌘I</span>
              </button>
              <button class="menu-item" id="menu-open-psd">
                <span>Open Photoshop PSD...</span>
                <span class="shortcut">⇧⌘O</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item" id="menu-export-psd">
                <span>Save PSD (With Layers)...</span>
                <span class="shortcut">⌘S</span>
              </button>
              <button class="menu-item" id="menu-export-png">
                <span>Export PNG...</span>
                <span class="shortcut">⇧⌘E</span>
              </button>
              <button class="menu-item" id="menu-export-jpg">
                <span>Export JPEG...</span>
              </button>
              <button class="menu-item" id="menu-export-webp">
                <span>Export WebP...</span>
              </button>
            </div>
          </div>

          <!-- Edit Menu -->
          <div class="menu-dropdown">
            <button class="menu-trigger">Edit ▾</button>
            <div class="menu-content">
              <button class="menu-item" id="menu-undo">
                <span>Undo</span>
                <span class="shortcut">⌘Z</span>
              </button>
              <button class="menu-item" id="menu-redo">
                <span>Redo</span>
                <span class="shortcut">⇧⌘Z</span>
              </button>
              <div class="menu-divider"></div>
              <button class="menu-item" id="menu-resize-canvas">
                <span>Resize Canvas...</span>
              </button>
              <button class="menu-item" id="menu-flatten-image">
                <span>Flatten All Layers</span>
              </button>
            </div>
          </div>

          <!-- View Menu -->
          <div class="menu-dropdown">
            <button class="menu-trigger">View ▾</button>
            <div class="menu-content">
              <button class="menu-item" id="menu-zoom-in">
                <span>Zoom In</span>
                <span class="shortcut">+</span>
              </button>
              <button class="menu-item" id="menu-zoom-out">
                <span>Zoom Out</span>
                <span class="shortcut">-</span>
              </button>
              <button class="menu-item" id="menu-zoom-100">
                <span>Actual Size (100%)</span>
                <span class="shortcut">⌘0</span>
              </button>
              <button class="menu-item" id="menu-zoom-fit">
                <span>Fit to Screen</span>
                <span class="shortcut">⌘9</span>
              </button>
            </div>
          </div>
        </nav>

        <!-- Hidden file inputs -->
        <input type="file" id="hidden-open-any-input" accept="image/*,.psd,application/octet-stream" style="display: none;">
        <input type="file" id="hidden-open-image-input" accept="image/*" style="display: none;">
        <input type="file" id="hidden-import-layer-input" accept="image/*" style="display: none;">
        <input type="file" id="hidden-open-psd-input" accept=".psd,application/octet-stream" style="display: none;">
      </div>

      <div class="header-center">
        <!-- Undo / Redo / Clear Quick Controls -->
        <div class="history-controls">
          <button id="undo-btn" class="icon-btn" title="Undo (⌘Z)" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7v6h6"></path>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
            </svg>
          </button>
          <button id="redo-btn" class="icon-btn" title="Redo (⇧⌘Z)" disabled>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 7v6h-6"></path>
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
            </svg>
          </button>
          <button id="clear-layer-btn" class="icon-btn" title="Clear Active Layer Pixels (⌫)" aria-label="Clear Active Layer Pixels">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="9" y1="9" x2="15" y2="15"></line>
              <line x1="15" y1="9" x2="9" y2="15"></line>
            </svg>
          </button>
        </div>

        <div class="header-divider"></div>

        <!-- Zoom Controls -->
        <div class="zoom-controls">
          <button id="zoom-out-btn" class="icon-btn" title="Zoom Out (-)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <button id="zoom-reset-btn" class="zoom-badge" title="Click to Fit to Viewport (⌘9)">100%</button>
          <button id="zoom-in-btn" class="icon-btn" title="Zoom In (+)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
        </div>
      </div>

      <div class="header-right">
        <!-- Interactive Session Status & Switcher Pill -->
        <button type="button" id="header-session-badge" class="session-badge ${isConnected ? 'connected' : 'disconnected'}" aria-label="Switch Active Antigravity Conversation">
          <span class="status-dot ${isConnected ? 'online' : 'offline'}"></span>
          <span class="session-id-text"></span>
        </button>

        <!-- Open File (Image or PSD) -->
        <button id="open-file-btn" class="btn btn-header-action" title="Open File (Image or PSD) (⌘O)" aria-label="Open File">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span class="btn-label">Open File</span>
        </button>

        <!-- Session Artifacts Modal Trigger -->
        <button id="artifacts-btn" class="btn btn-header-action" title="Open / Save Session Artifacts" aria-label="Open Artifact">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <span class="btn-label">Open Artifact</span>
        </button>

        <!-- Save PSD to Filesystem -->
        <button id="save-psd-btn" class="btn btn-header-action" title="Save Layered PSD to Filesystem (⌘S)" aria-label="Save PSD">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span class="btn-label">Save</span>
        </button>

        <!-- Export Image (PNG, JPG, WebP) to Filesystem -->
        <button id="export-img-btn" class="btn btn-header-action" title="Export Image (PNG, JPG, WebP) to Filesystem (⇧⌘E)" aria-label="Export Image">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span class="btn-label">Export</span>
        </button>

        <!-- Keyboard Shortcuts Help Button -->
        <button id="shortcuts-btn" class="icon-btn" title="Keyboard Shortcuts (?)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </button>

        <!-- Open Full Mode in Browser (visible in Preview mode) -->
        <a id="btn-full-studio" class="btn btn-header-action preview-only-btn" target="_blank" rel="noopener noreferrer" title="Open Full Mode in Browser">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
          <span>Full Mode</span>
        </a>

        <!-- Send to Agent Primary Action -->
        <button id="send-to-agent-btn" class="btn btn-send-agent" title="Send Artwork to Active Antigravity Agent">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          <span>Send</span>
        </button>
      </div>
    `;

    this.updateSessionUI();
  }

  private renderAiRefineBar() {
    const bar = document.getElementById('ai-refine-bar');
    if (!bar) return;

    bar.innerHTML = `
      <div class="ai-preset-group" role="group" aria-label="AI Style Presets">
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="beautify" title="Beautify: Creatively interpret sketch and bring it to life">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path>
          </svg>
          <span>Beautify</span>
        </button>
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="apply-notes" title="Apply Notes: Execute drawn or written annotation edits and remove markings">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Notes</span>
        </button>
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="watercolor" title="Watercolor: Expressive wet-on-wet watercolour painting on textured paper">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
          </svg>
          <span>Watercolor</span>
        </button>
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="concept-art" title="Concept Art: Polished digital concept art with cinematic lighting">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>
          </svg>
          <span>Concept Art</span>
        </button>
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="vector" title="Vector: Sharp minimalist vector graphic with bold outlines and gradients">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          <span>Vector</span>
        </button>
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="pixel-art" title="Pixel Art: Clean 16-bit retro pixel art sprite">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span>Pixel Art</span>
        </button>
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="3d-clay" title="3D Clay: Tactile 3D clay model with soft studio lighting">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <span>3D Clay</span>
        </button>
        <button type="button" class="btn btn-xs btn-outline ai-preset-btn" data-ai-preset="anime" title="Anime: Lush hand-painted studio anime illustration">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>Anime</span>
        </button>
      </div>
      <input
        type="text"
        id="ai-refine-prompt"
        class="input-text ai-prompt-input"
        placeholder="Describe AI changes or click a preset..."
        aria-label="AI refinement prompt"
      />
      <button type="button" id="btn-ai-refine-generate" class="btn btn-xs btn-ai-refine-submit" title="Apply AI prompt to canvas (Enter)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"></path>
        </svg>
        <span>Refine</span>
      </button>
    `;

    const promptInput = bar.querySelector('#ai-refine-prompt') as HTMLInputElement | null;
    const generateBtn = bar.querySelector('#btn-ai-refine-generate') as HTMLButtonElement | null;
    const presetButtons = bar.querySelectorAll('.ai-preset-btn');
    if (!promptInput || !generateBtn) return;

    const triggerAiRefine = async (presetOverride?: string) => {
      const prompt = promptInput.value.trim();
      const stylePreset = presetOverride || 'beautify';
      if (!presetOverride && !prompt) {
        NotificationManager.info('Type a prompt in the AI bar or click a style preset.');
        promptInput.focus();
        return;
      }
      if (generateBtn.disabled) return;

      const originalHtml = generateBtn.innerHTML;
      generateBtn.disabled = true;
      generateBtn.textContent = 'Generating...';
      presetButtons.forEach((b) => ((b as HTMLButtonElement).disabled = true));

      try {
        const compCanvas = this.engine.getCompositeCanvas();
        const base64Data = compCanvas.toDataURL('image/png');

        const res = await sidecarFetch('/api/ai/refine', {
          method: 'POST',
          body: JSON.stringify({
            image: base64Data,
            stylePreset,
            prompt: prompt || undefined,
            width: this.engine.width,
            height: this.engine.height
          })
        });

        if (!res.ok) {
          const bodyText = await res.text();
          let errMsg = `HTTP ${res.status}: ${res.statusText}`;
          if (bodyText) {
            try {
              const parsed = JSON.parse(bodyText);
              if (parsed.error) errMsg = parsed.error;
            } catch {
              errMsg = bodyText;
            }
          }
          throw new Error(errMsg);
        }

        const result = await res.json();
        const resultImage = result.image || result.imageBase64;
        if (!resultImage) {
          throw new Error('AI service returned an empty image response.');
        }

        const imgSrc = resultImage.startsWith('data:')
          ? resultImage
          : `data:${result.mimeType || 'image/png'};base64,${resultImage}`;

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () =>
            reject(new Error('Failed to decode the image returned by the AI refinement model.'));
          image.src = imgSrc;
        });

        const labelSource = prompt || presetOverride || 'Refine';
        const layerName = `AI: ${labelSource.substring(0, 24)}`;
        const newLayer = this.engine.addLayer(layerName);
        newLayer.ctx.drawImage(img, 0, 0, this.engine.width, this.engine.height);
        this.engine.render();
        this.engine.commitHistory();
        promptInput.value = '';
        NotificationManager.success('AI refinement applied as a new layer!');
      } catch (err: any) {
        console.error('[Header] AI refinement failed:', err);
        NotificationManager.fatal('AI Refine Failed', err);
      } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = originalHtml;
        presetButtons.forEach((b) => ((b as HTMLButtonElement).disabled = false));
      }
    };

    generateBtn.addEventListener('click', () => {
      triggerAiRefine();
    });

    promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerAiRefine();
      }
    });

    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-ai-preset');
        if (preset) {
          triggerAiRefine(preset);
        }
      });
    });
  }

  private bindEvents() {
    // Undo / Redo
    this.container.querySelector('#undo-btn')?.addEventListener('click', () => this.engine.undo());
    this.container.querySelector('#redo-btn')?.addEventListener('click', () => this.engine.redo());
    this.container.querySelector('#menu-undo')?.addEventListener('click', () => this.engine.undo());
    this.container.querySelector('#menu-redo')?.addEventListener('click', () => this.engine.redo());

    // Zoom
    this.container.querySelector('#zoom-in-btn')?.addEventListener('click', () => this.engine.zoomAt(0.2));
    this.container.querySelector('#zoom-out-btn')?.addEventListener('click', () => this.engine.zoomAt(-0.2));
    this.container.querySelector('#zoom-reset-btn')?.addEventListener('click', () => this.engine.fitToViewport());

    this.container.querySelector('#menu-zoom-in')?.addEventListener('click', () => this.engine.zoomAt(0.2));
    this.container.querySelector('#menu-zoom-out')?.addEventListener('click', () => this.engine.zoomAt(-0.2));
    this.container.querySelector('#menu-zoom-100')?.addEventListener('click', () => this.engine.resetZoom());
    this.container.querySelector('#menu-zoom-fit')?.addEventListener('click', () => this.engine.fitToViewport());

    // New Canvas (opens dimension prompt modal and resets document)
    this.container.querySelector('#menu-new-canvas')?.addEventListener('click', () => {
      this.openDimensionsModal('new');
    });

    // Clear Active Layer (clears only the currently selected layer)
    const clearActiveLayer = () => {
      const active = this.engine.getActiveLayer();
      if (!active) return;
      if (active.locked) {
        NotificationManager.info(`Layer "${active.name}" is locked.`);
        return;
      }
      active.clear();
      this.engine.render();
      this.engine.commitHistory();
      NotificationManager.info(`Cleared active layer "${active.name}"`);
    };
    this.container.querySelector('#menu-clear-layer')?.addEventListener('click', clearActiveLayer);
    this.container.querySelector('#clear-layer-btn')?.addEventListener('click', clearActiveLayer);

    // Resize Canvas
    this.container.querySelector('#menu-resize-canvas')?.addEventListener('click', () => {
      this.openDimensionsModal('resize');
    });

    // Flatten Image
    this.container.querySelector('#menu-flatten-image')?.addEventListener('click', () => {
      this.engine.flatten();
      NotificationManager.info('Flattened all layers into Background');
    });

    // File Open / Import
    const openAnyInput = this.container.querySelector('#hidden-open-any-input') as HTMLInputElement | null;
    const openImageInput = this.container.querySelector('#hidden-open-image-input') as HTMLInputElement | null;
    const importLayerInput = this.container.querySelector('#hidden-import-layer-input') as HTMLInputElement | null;
    const openPsdInput = this.container.querySelector('#hidden-open-psd-input') as HTMLInputElement | null;

    this.container.querySelector('#open-file-btn')?.addEventListener('click', () => openAnyInput?.click());
    this.container.querySelector('#menu-open-image')?.addEventListener('click', () => openImageInput?.click());
    this.container.querySelector('#menu-import-layer')?.addEventListener('click', () => importLayerInput?.click());
    this.container.querySelector('#menu-open-psd')?.addEventListener('click', () => openPsdInput?.click());

    openAnyInput?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        if (file.name.toLowerCase().endsWith('.psd')) {
          await importPsdFile(file, this.engine);
          NotificationManager.success(`Opened PSD "${file.name}" (${this.engine.layers.length} layers)`);
        } else {
          await this.handleImageUpload(file, false);
        }
      } catch (err: any) {
        console.error('[Header] Failed to open file:', err);
        NotificationManager.fatal('Failed to Open File', err);
      } finally {
        openAnyInput.value = '';
      }
    });

    openImageInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleImageUpload(file, false);
        openImageInput.value = '';
      }
    });

    importLayerInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleImageUpload(file, true);
        importLayerInput.value = '';
      }
    });

    openPsdInput?.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        await importPsdFile(file, this.engine);
        NotificationManager.success(`Opened PSD "${file.name}" (${this.engine.layers.length} layers)`);
      } catch (err: any) {
        console.error('[Header] Failed to open PSD:', err);
        NotificationManager.fatal('Failed to Open PSD', err);
      } finally {
        openPsdInput.value = '';
      }
    });

    // Save & Export (Filesystem Dialog)
    this.container.querySelector('#save-psd-btn')?.addEventListener('click', () => this.openSaveExportModal('psd'));
    this.container.querySelector('#export-img-btn')?.addEventListener('click', () => this.openSaveExportModal('png'));
    this.container.querySelector('#menu-export-psd')?.addEventListener('click', () => this.openSaveExportModal('psd'));
    this.container.querySelector('#menu-export-png')?.addEventListener('click', () => this.openSaveExportModal('png'));
    this.container.querySelector('#menu-export-jpg')?.addEventListener('click', () => this.openSaveExportModal('jpg'));
    this.container.querySelector('#menu-export-webp')?.addEventListener('click', () => this.openSaveExportModal('webp'));

    // Modals
    this.container.querySelector('#artifacts-btn')?.addEventListener('click', () => {
      this.artifactModal.open();
    });

    this.container.querySelector('#shortcuts-btn')?.addEventListener('click', () => {
      this.openShortcutsModal();
    });

    const openSessionSelector = () => {
      this.conversationModal.open('set', this.sessionId, (newSessionId) => {
        this.setSessionId(newSessionId);
        NotificationManager.success(`Switched active session to ${newSessionId.substring(0, 8)}...`);
      });
    };

    this.container.querySelector('#header-session-badge')?.addEventListener('click', openSessionSelector);

    // Send to Agent
    this.container.querySelector('#send-to-agent-btn')?.addEventListener('click', () => {
      if (!this.sessionId || this.sessionId === 'standalone') {
        this.conversationModal.open('send', this.sessionId, async (targetSessionId) => {
          this.setSessionId(targetSessionId);
          await this.handleSendToAgent();
        });
        return;
      }
      this.handleSendToAgent();
    });

    // Global Menu & Document Keyboard Shortcuts
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable) ||
        document.querySelector('.modal-overlay')
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      if (isCmdOrCtrl) {
        if (key === 's' && !e.shiftKey) {
          e.preventDefault();
          this.openSaveExportModal('psd');
        } else if (key === 'e' && e.shiftKey) {
          e.preventDefault();
          this.openSaveExportModal('png');
        } else if (key === 'o' && e.shiftKey) {
          e.preventDefault();
          openPsdInput?.click();
        } else if (key === 'o' && !e.shiftKey) {
          e.preventDefault();
          openImageInput?.click();
        } else if (key === 'i' && e.shiftKey) {
          e.preventDefault();
          importLayerInput?.click();
        } else if (key === 'n' && !e.shiftKey) {
          e.preventDefault();
          this.openDimensionsModal('new');
        } else if (key === '0') {
          e.preventDefault();
          this.engine.resetZoom();
        } else if (key === '9') {
          e.preventDefault();
          this.engine.fitToViewport();
        }
        return;
      }

      if (!e.altKey && !e.metaKey && !e.ctrlKey && e.key === '?') {
        e.preventDefault();
        this.openShortcutsModal();
      } else if (
        !e.altKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        (e.key === 'Backspace' || e.key === 'Delete') &&
        !(this.engine.activeTool instanceof SelectionTool)
      ) {
        e.preventDefault();
        clearActiveLayer();
      }
    });
  }

  private async handleImageUpload(file: File, asNewLayer: boolean) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error(`FileReader produced an empty result for "${file.name}".`));
          }
        };
        reader.onerror = () => {
          reject(reader.error || new Error(`Failed to read file "${file.name}".`));
        };
        reader.readAsDataURL(file);
      });

      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error(`Failed to decode image "${file.name}". The file may be corrupted or in an unsupported format.`));
        image.src = dataUrl;
      });

      if (asNewLayer) {
        const layer = this.engine.addLayer(file.name);
        layer.ctx.drawImage(img, 0, 0);
        this.engine.render();
        this.engine.commitHistory();
        NotificationManager.success(`Imported "${file.name}" as layer`);
      } else {
        this.engine.resizeDocument(img.naturalWidth, img.naturalHeight);
        this.engine.initDefaultDocument();
        const active = this.engine.getActiveLayer();
        if (active) {
          active.ctx.drawImage(img, 0, 0);
          this.engine.render();
          this.engine.commitHistory();
        }
        NotificationManager.success(`Opened "${file.name}" (${img.naturalWidth}×${img.naturalHeight})`);
      }
    } catch (err: any) {
      console.error('[Header] Image upload failed:', err);
      NotificationManager.fatal('Image Load Failed', err);
    }
  }

  private openDimensionsModal(mode: 'new' | 'resize') {
    const existing = document.getElementById('dimensions-modal-overlay');
    if (existing) existing.remove();
    if (this.newCanvasEscHandler) {
      window.removeEventListener('keydown', this.newCanvasEscHandler);
      this.newCanvasEscHandler = null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'dimensions-modal-overlay';
    overlay.className = 'modal-overlay';

    const titleText = mode === 'new' ? 'New Canvas' : 'Resize Canvas';
    const actionText = mode === 'new' ? 'Create Canvas' : 'Resize Canvas';

    const modal = document.createElement('div');
    modal.className = 'modal-dialog';
    modal.style.maxWidth = '380px';
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title"><span>${titleText}</span></div>
        <button class="modal-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="800" data-h="600">800×600</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1024" data-h="768">1024×768</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1280" data-h="720">1280×720</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1024" data-h="1024">1024×1024</button>
          <button type="button" class="btn btn-sm btn-outline dim-preset-btn" data-w="1920" data-h="1080">1920×1080</button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary);">
            <span>Width (px)</span>
            <input type="number" id="dim-width-input" class="input-text" min="1" max="8192" value="${this.engine.width}">
          </label>
          <label style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-secondary);">
            <span>Height (px)</span>
            <input type="number" id="dim-height-input" class="input-text" min="1" max="8192" value="${this.engine.height}">
          </label>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
          <button type="button" id="dim-cancel-btn" class="btn btn-outline">Cancel</button>
          <button type="button" id="dim-confirm-btn" class="btn btn-primary">${actionText}</button>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
      if (this.newCanvasEscHandler) {
        window.removeEventListener('keydown', this.newCanvasEscHandler);
        this.newCanvasEscHandler = null;
      }
      overlay.remove();
    };

    this.newCanvasEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', this.newCanvasEscHandler);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    modal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('#dim-cancel-btn')?.addEventListener('click', closeModal);

    const widthInput = modal.querySelector('#dim-width-input') as HTMLInputElement;
    const heightInput = modal.querySelector('#dim-height-input') as HTMLInputElement;

    modal.querySelectorAll('.dim-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const w = btn.getAttribute('data-w');
        const h = btn.getAttribute('data-h');
        if (w) widthInput.value = w;
        if (h) heightInput.value = h;
      });
    });

    modal.querySelector('#dim-confirm-btn')?.addEventListener('click', () => {
      const w = parseInt(widthInput.value, 10);
      const h = parseInt(heightInput.value, 10);
      if (isNaN(w) || isNaN(h) || w < 1 || h < 1 || w > 8192 || h > 8192) {
        NotificationManager.error('Invalid Dimensions', 'Width and height must be between 1 and 8192 pixels.');
        return;
      }
      if (mode === 'new') {
        this.engine.resizeDocument(w, h);
        this.engine.initDefaultDocument();
        this.engine.fitToViewport();
        NotificationManager.success(`Created new canvas (${w}×${h})`);
      } else {
        this.engine.resizeDocument(w, h);
        NotificationManager.success(`Resized canvas to ${w}×${h}`);
      }
      closeModal();
    });
  }

  private openShortcutsModal() {
    const existing = document.getElementById('shortcuts-modal');
    if (existing) existing.remove();
    if (this.shortcutsEscHandler) {
      window.removeEventListener('keydown', this.shortcutsEscHandler);
      this.shortcutsEscHandler = null;
    }

    const overlay = document.createElement('div');
    overlay.id = 'shortcuts-modal';
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-dialog shortcuts-modal-dialog';
    modal.style.maxWidth = '500px';
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">
          <span>Keyboard Shortcuts</span>
        </div>
        <button class="modal-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="modal-body" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; font-size: 12px;">
        <div><strong>V</strong> — Select / Cut / Move</div>
        <div><strong>B</strong> — Smooth Brush</div>
        <div><strong>P</strong> — Pixel Pencil</div>
        <div><strong>E</strong> — Eraser Tool</div>
        <div><strong>U / O</strong> — Rectangle / Ellipse</div>
        <div><strong>L / A</strong> — Line / Arrow</div>
        <div><strong>T</strong> — Text Tool</div>
        <div><strong>G</strong> — Paint Bucket</div>
        <div><strong>I</strong> — Eyedropper</div>
        <div><strong>H / Space</strong> — Pan Canvas</div>
        <div><strong>X</strong> — Swap FG/BG Colors</div>
        <div><strong>[ / ]</strong> — Decrease / Increase Size</div>
        <div><strong>⌘Z / ⇧⌘Z</strong> — Undo / Redo</div>
        <div><strong>⌘C / ⌘X / ⌘V</strong> — Copy / Cut / Paste</div>
        <div><strong>⌘S / ⇧⌘E</strong> — Export PSD / PNG</div>
        <div><strong>⌘0 / ⌘9</strong> — 100% / Fit View</div>
        <div><strong>⌫</strong> — Clear Selection / Layer</div>
        <div><strong>Esc</strong> — Deselect / Close Modal</div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
      if (this.shortcutsEscHandler) {
        window.removeEventListener('keydown', this.shortcutsEscHandler);
        this.shortcutsEscHandler = null;
      }
      overlay.remove();
    };

    this.shortcutsEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', this.shortcutsEscHandler);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    modal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
  }

  private async openSaveExportModal(initialFormat: 'psd' | 'png' | 'jpg' | 'webp') {
    const existing = document.getElementById('save-export-modal-overlay');
    if (existing) existing.remove();
    if (this.saveExportEscHandler) {
      window.removeEventListener('keydown', this.saveExportEscHandler);
      this.saveExportEscHandler = null;
    }

    let currentFormat: 'psd' | 'png' | 'jpg' | 'webp' = initialFormat;
    const baseName = this.lastSaveBasename || `artwork-${Date.now()}`;
    const initialDir = this.lastSaveDirectory || '~/Downloads';

    const overlay = document.createElement('div');
    overlay.id = 'save-export-modal-overlay';
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-dialog';
    modal.style.width = '460px';
    modal.style.maxWidth = '94vw';
    modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-title">
          <span id="save-modal-title">${initialFormat === 'psd' ? 'Save Project (PSD)' : 'Export Image'}</span>
        </div>
        <button class="modal-close-btn" title="Close (Esc)">✕</button>
      </div>
      <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Format</span>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="save-format-pills">
            <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'psd' ? 'active' : ''}" data-format="psd">PSD (With Layers)</button>
            <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'png' ? 'active' : ''}" data-format="png">PNG</button>
            <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'jpg' ? 'active' : ''}" data-format="jpg">JPEG</button>
            <button type="button" class="btn btn-sm btn-outline save-format-btn ${currentFormat === 'webp' ? 'active' : ''}" data-format="webp">WebP</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Destination Folder</span>
            <div id="save-dir-pills" style="display: flex; gap: 4px; flex-wrap: wrap;"></div>
          </div>
          <input type="text" id="save-dir-input" class="input-text" value="${initialDir}" placeholder="~/Downloads" spellcheck="false">
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px;">
          <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary);">Filename</span>
          <input type="text" id="save-filename-input" class="input-text" value="${baseName}.${currentFormat}" placeholder="artwork.${currentFormat}" spellcheck="false">
        </div>

        <div id="save-fullpath-preview" style="font-size: 11px; color: var(--text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--surface-hover); padding: 6px 8px; border-radius: 6px; border: 1px solid var(--border-color); word-break: break-all;"></div>

        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 2px;">
          <button type="button" id="save-browser-download-btn" class="btn btn-sm btn-outline" title="Download via Browser">Browser Download</button>
          <div style="display: flex; gap: 8px;">
            <button type="button" id="save-cancel-btn" class="btn btn-sm btn-outline">Cancel</button>
            <button type="button" id="save-confirm-btn" class="btn btn-sm btn-primary">Save to Filesystem</button>
          </div>
        </div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
      if (this.saveExportEscHandler) {
        window.removeEventListener('keydown', this.saveExportEscHandler);
        this.saveExportEscHandler = null;
      }
      overlay.remove();
    };

    this.saveExportEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    window.addEventListener('keydown', this.saveExportEscHandler);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    modal.querySelector('.modal-close-btn')?.addEventListener('click', closeModal);
    modal.querySelector('#save-cancel-btn')?.addEventListener('click', closeModal);

    const titleEl = modal.querySelector('#save-modal-title') as HTMLElement;
    const dirInput = modal.querySelector('#save-dir-input') as HTMLInputElement;
    const filenameInput = modal.querySelector('#save-filename-input') as HTMLInputElement;
    const previewEl = modal.querySelector('#save-fullpath-preview') as HTMLElement;
    const dirPillsEl = modal.querySelector('#save-dir-pills') as HTMLElement;
    const confirmBtn = modal.querySelector('#save-confirm-btn') as HTMLButtonElement;
    const browserDownloadBtn = modal.querySelector('#save-browser-download-btn') as HTMLButtonElement;
    const formatBtns = modal.querySelectorAll('.save-format-btn');

    const ensureExtension = (name: string, fmt: string): string => {
      const stripped = name.trim().replace(/\.(psd|png|jpg|jpeg|webp)$/i, '') || `artwork-${Date.now()}`;
      return `${stripped}.${fmt}`;
    };

    const updatePreview = () => {
      const dir = dirInput.value.trim().replace(/\/+$/, '') || '.';
      const fn = ensureExtension(filenameInput.value, currentFormat);
      previewEl.textContent = `${dir}/${fn}`;
    };

    updatePreview();

    formatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const fmt = btn.getAttribute('data-format') as 'psd' | 'png' | 'jpg' | 'webp' | null;
        if (!fmt) return;
        currentFormat = fmt;
        formatBtns.forEach((b) => b.classList.toggle('active', b === btn));
        titleEl.textContent = currentFormat === 'psd' ? 'Save Project (PSD)' : `Export ${currentFormat.toUpperCase()} Image`;
        filenameInput.value = ensureExtension(filenameInput.value, currentFormat);
        updatePreview();
      });
    });

    dirInput.addEventListener('input', updatePreview);
    filenameInput.addEventListener('input', updatePreview);

    // Fetch filesystem info from sidecar server to populate default directory and quick pills
    (async () => {
      try {
        const workspaceUris = await getWorkspaceUris();
        const query = new URLSearchParams();
        if (this.sessionId) {
          query.set('session_id', this.sessionId);
        }
        if (workspaceUris.length > 0) {
          query.set('workspace_uri', workspaceUris[0]);
        }
        const qs = query.toString();
        const res = await sidecarFetch(`/api/fs/info${qs ? `?${qs}` : ''}`);
        if (!res.ok) return;
        const info = await res.json();
        if (!this.lastSaveDirectory && info.defaultDir) {
          dirInput.value = info.defaultDir;
          updatePreview();
        }

        const quickDirs: Array<{ label: string; path: string }> = [];
        if (info.downloadsDir) quickDirs.push({ label: 'Downloads', path: info.downloadsDir });
        if (info.desktopDir) quickDirs.push({ label: 'Desktop', path: info.desktopDir });
        if (info.workspaceDir) quickDirs.push({ label: 'Workspace', path: info.workspaceDir });
        if (info.sessionDir) quickDirs.push({ label: 'Session', path: info.sessionDir });

        dirPillsEl.innerHTML = '';
        for (const q of quickDirs) {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'btn btn-xs btn-outline';
          pill.textContent = q.label;
          pill.title = q.path;
          pill.addEventListener('click', () => {
            dirInput.value = q.path;
            updatePreview();
          });
          dirPillsEl.appendChild(pill);
        }
      } catch (err) {
        console.warn('[Header] Failed to load filesystem info:', err);
      }
    })();

    const encodePayloadBase64 = (fmt: 'psd' | 'png' | 'jpg' | 'webp'): string => {
      if (fmt === 'psd') {
        const psdBuffer = serializePsd(this.engine);
        const psdBytes = new Uint8Array(psdBuffer);
        let binary = '';
        for (let i = 0; i < psdBytes.byteLength; i++) {
          binary += String.fromCharCode(psdBytes[i]);
        }
        return btoa(binary);
      }
      const comp = this.engine.getCompositeCanvas();
      const mime = fmt === 'jpg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
      return comp.toDataURL(mime, 0.95);
    };

    const handleFilesystemSave = async () => {
      const directory = dirInput.value.trim();
      const finalFilename = ensureExtension(filenameInput.value, currentFormat);
      if (!directory) {
        NotificationManager.error('Missing Directory', 'Specify a destination folder path.');
        return;
      }

      confirmBtn.disabled = true;
      const origText = confirmBtn.textContent;
      confirmBtn.textContent = 'Saving...';

      try {
        const workspaceUris = await getWorkspaceUris();
        const data = encodePayloadBase64(currentFormat);
        const res = await sidecarFetch('/api/fs/save', {
          method: 'POST',
          body: JSON.stringify({
            directory,
            filename: finalFilename,
            data,
            workspaceUris,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          let errMsg = `HTTP ${res.status}: ${res.statusText}`;
          if (errText) {
            try {
              const parsed = JSON.parse(errText);
              if (parsed.error) errMsg = parsed.error;
            } catch {
              errMsg = errText;
            }
          }
          throw new Error(errMsg);
        }

        const result = await res.json();
        this.lastSaveDirectory = directory;
        this.lastSaveBasename = finalFilename.replace(/\.(psd|png|jpg|jpeg|webp)$/i, '');
        NotificationManager.success(`Saved to ${result.path}`);
        closeModal();
      } catch (err: any) {
        console.error('[Header] Filesystem save failed:', err);
        NotificationManager.fatal('Save to Filesystem Failed', err);
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = origText;
      }
    };

    confirmBtn.addEventListener('click', handleFilesystemSave);

    filenameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFilesystemSave();
      }
    });

    dirInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFilesystemSave();
      }
    });

    browserDownloadBtn.addEventListener('click', () => {
      const finalFilename = ensureExtension(filenameInput.value, currentFormat);
      try {
        if (currentFormat === 'psd') {
          exportPsdFile(this.engine, finalFilename);
          NotificationManager.success(`Downloaded "${finalFilename}"`);
        } else {
          this.exportRaster(currentFormat, finalFilename);
        }
        closeModal();
      } catch (err: any) {
        NotificationManager.fatal('Download Failed', err);
      }
    });

    filenameInput.focus();
    const dotIndex = filenameInput.value.lastIndexOf('.');
    if (dotIndex > 0) {
      filenameInput.setSelectionRange(0, dotIndex);
    } else {
      filenameInput.select();
    }
  }

  private exportRaster(format: 'png' | 'jpg' | 'webp', customFilename?: string) {
    const comp = this.engine.getCompositeCanvas();
    const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const dataUrl = comp.toDataURL(mime, 0.95);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = customFilename || `artwork-${Date.now()}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    NotificationManager.success(`Exported ${format.toUpperCase()} image`);
  }

  private async handleSendToAgent() {
    if (!this.sessionId) {
      this.sessionId = getSessionId();
    }

    if (!this.sessionId) {
      NotificationManager.error(
        'No Session Connected',
        'Click "Session" in the header to connect to an active Antigravity conversation.'
      );
      return;
    }

    const sendBtn = this.container.querySelector('#send-to-agent-btn') as HTMLButtonElement | null;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const timestamp = Date.now();
      const pngFilename = `paint-studio-${timestamp}.png`;

      NotificationManager.info('Sending artwork to active agent session...');

      const comp = this.engine.getCompositeCanvas();
      const pngBase64 = comp.toDataURL('image/png');

      // 1. Save PNG artifact to session brain directory
      const pngRes = await sidecarFetch('/api/artifact', {
        method: 'POST',
        body: JSON.stringify({
          session_id: this.sessionId,
          filename: pngFilename,
          data: pngBase64
        })
      });

      if (!pngRes.ok) {
        const errText = await pngRes.text();
        throw new Error(`Failed to save PNG artifact: ${errText || pngRes.statusText}`);
      }
      const pngResult = await pngRes.json();

      // 2. Deliver PNG message directly to the active Antigravity conversation via window.sidecar.agent
      const messageContent = `![${pngFilename}](${pngResult.path})\n\n*Drawing sent from Paint Studio.*`;
      await sendAgentMessage(messageContent, this.sessionId);

      NotificationManager.success(
        `Delivered "${pngFilename}" directly to Antigravity chat!`
      );
    } catch (err: any) {
      console.error('[Header] Send to Agent failed:', err);
      NotificationManager.fatal('Send to Agent Failed', err);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }
}
