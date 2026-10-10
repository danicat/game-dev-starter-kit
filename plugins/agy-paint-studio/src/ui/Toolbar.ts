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
import type { BaseTool } from '../engine/tools/BaseTool.ts';
import { SelectionTool } from '../engine/tools/SelectionTool.ts';
import { ShapeTool } from '../engine/tools/ShapeTool.ts';
import { TextTool } from '../engine/tools/TextTool.ts';
import { BucketTool } from '../engine/tools/BucketTool.ts';

export class Toolbar {
  private engine: CanvasEngine;
  private container: HTMLElement;
  private primaryColorInput: HTMLInputElement | null = null;
  private secondaryColorInput: HTMLInputElement | null = null;
  private primarySwatch: HTMLElement | null = null;
  private secondarySwatch: HTMLElement | null = null;

  constructor(engine: CanvasEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;

    this.render();
    this.bindEvents();

    // Default active tool: Brush
    this.activateTool('brush');
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="toolbar-section tools-group" role="toolbar" aria-label="Drawing Tools">
        <!-- 1. Select / Cut / Move (V) -->
        <button id="tool-select" data-tool="select" class="tool-btn" title="Select / Cut / Move (V)" aria-label="Select / Cut / Move (V)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 3a2 2 0 0 0-2 2"></path>
            <path d="M19 3a2 2 0 0 1 2 2"></path>
            <path d="M21 19a2 2 0 0 1-2 2"></path>
            <path d="M5 21a2 2 0 0 1-2-2"></path>
            <path d="M9 3h1"></path>
            <path d="M9 21h1"></path>
            <path d="M14 3h1"></path>
            <path d="M14 21h1"></path>
            <path d="M3 9v1"></path>
            <path d="M21 9v1"></path>
            <path d="M3 14v1"></path>
            <path d="M21 14v1"></path>
          </svg>
        </button>

        <!-- 2. Brush (B) -->
        <button id="tool-brush" data-tool="brush" class="tool-btn active" title="Brush (B)" aria-label="Brush (B)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"></path>
            <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"></path>
          </svg>
        </button>

        <!-- 3. Pencil (P) -->
        <button id="tool-pencil" data-tool="pencil" class="tool-btn" title="Pencil (P)" aria-label="Pencil (P)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
            <path d="m15 5 4 4"></path>
          </svg>
        </button>

        <!-- 4. Eraser (E) -->
        <button id="tool-eraser" data-tool="eraser" class="tool-btn" title="Eraser (E)" aria-label="Eraser (E)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 1-2.5 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"></path>
            <path d="M22 21H7"></path>
            <path d="m5 11 9 9"></path>
          </svg>
        </button>

        <!-- 5. Rectangle (U) -->
        <button id="tool-rect" data-tool="rect" class="tool-btn" title="Rectangle (U)" aria-label="Rectangle (U)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="18" x="3" y="3" rx="2"></rect>
          </svg>
        </button>

        <!-- 6. Ellipse / Circle (O) -->
        <button id="tool-circle" data-tool="circle" class="tool-btn" title="Ellipse / Circle (O)" aria-label="Ellipse / Circle (O)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        </button>

        <!-- 7. Line (L) -->
        <button id="tool-line" data-tool="line" class="tool-btn" title="Line (L)" aria-label="Line (L)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 19 19 5"></path>
          </svg>
        </button>

        <!-- 8. Arrow (A) -->
        <button id="tool-arrow" data-tool="arrow" class="tool-btn" title="Arrow (A)" aria-label="Arrow (A)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
          </svg>
        </button>

        <!-- 9. Text (T) -->
        <button id="tool-text" data-tool="text" class="tool-btn" title="Text (T)" aria-label="Text (T)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 7 4 4 20 4 20 7"></polyline>
            <line x1="9" x2="15" y1="20" y2="20"></line>
            <line x1="12" x2="12" y1="4" y2="20"></line>
          </svg>
        </button>

        <!-- 10. Paint Bucket (G) -->
        <button id="tool-bucket" data-tool="bucket" class="tool-btn" title="Paint Bucket (G)" aria-label="Paint Bucket (G)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"></path>
            <path d="m5 2 5 5"></path>
            <path d="M2 13h15"></path>
            <path d="M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"></path>
          </svg>
        </button>

        <!-- 11. Eyedropper / Color Picker (I) -->
        <button id="tool-eyedropper" data-tool="eyedropper" class="tool-btn" title="Eyedropper / Color Picker (I)" aria-label="Eyedropper / Color Picker (I)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m2 22 1-1h3l9-9"></path>
            <path d="M12.5 7.5 16 11l4.5-4.5a2.12 2.12 0 1 0-3-3L13 8"></path>
            <path d="m15 5 4 4"></path>
          </svg>
        </button>

        <!-- 12. Drag / Pan (H) -->
        <button id="tool-drag" data-tool="drag" class="tool-btn" title="Drag / Pan View (H)" aria-label="Drag / Pan View (H)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v0"></path>
            <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"></path>
            <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"></path>
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
          </svg>
        </button>
      </div>

      <!-- Foreground / Background Color Selector & Swapper Dock -->
      <div class="toolbar-color-dock" role="group" aria-label="Foreground and Background Colors">
        <div class="toolbar-color-wells">
          <div id="prop-primary-swatch" class="prop-swatch toolbar-swatch-primary" title="Primary Foreground Color">
            <input type="color" id="prop-primary-color" value="${this.engine.primaryColor}" aria-label="Primary Foreground Color" />
          </div>
          <div id="prop-secondary-swatch" class="prop-swatch toolbar-swatch-secondary" title="Secondary Background Color">
            <input type="color" id="prop-secondary-color" value="${this.engine.secondaryColor}" aria-label="Secondary Background Color" />
          </div>
          <button id="prop-btn-swap-colors" class="btn-swap-colors" title="Swap Colors (X)" aria-label="Swap Foreground and Background Colors">⇄</button>
        </div>
      </div>
    `;

    this.primaryColorInput = this.container.querySelector('#prop-primary-color');
    this.secondaryColorInput = this.container.querySelector('#prop-secondary-color');
    this.primarySwatch = this.container.querySelector('#prop-primary-swatch');
    this.secondarySwatch = this.container.querySelector('#prop-secondary-swatch');
    this.updateColorSwatches();
  }

  public updateColorSwatches(): void {
    if (this.primarySwatch) this.primarySwatch.style.backgroundColor = this.engine.primaryColor;
    if (this.secondarySwatch) this.secondarySwatch.style.backgroundColor = this.engine.secondaryColor;
    if (this.primaryColorInput) this.primaryColorInput.value = this.engine.primaryColor;
    if (this.secondaryColorInput) this.secondaryColorInput.value = this.engine.secondaryColor;
  }

  public activateTool(toolId: string): void {
    this.engine.setTool(toolId);
    this.syncActiveButton(this.engine.activeTool);
  }

  private syncActiveButton(toolOrId: BaseTool | string | null | undefined): void {
    const tool =
      typeof toolOrId === 'string'
        ? this.engine.getActiveTool()
        : toolOrId || this.engine.activeTool;

    let activeBtnKey = typeof toolOrId === 'string' ? toolOrId : tool?.id || 'brush';
    if (tool instanceof ShapeTool || tool?.id === 'shape') {
      const st = (tool as ShapeTool).shapeType;
      if (st === 'rect' || st === 'rectangle') activeBtnKey = 'rect';
      else if (st === 'circle' || st === 'ellipse') activeBtnKey = 'circle';
      else if (st === 'line') activeBtnKey = 'line';
      else if (st === 'arrow') activeBtnKey = 'arrow';
    }

    this.container.querySelectorAll('.tool-btn').forEach((btn) => {
      const isMatch = btn.getAttribute('data-tool') === activeBtnKey;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', String(isMatch));
    });
  }

  public swapColors(): void {
    const temp = this.engine.primaryColor;
    this.engine.primaryColor = this.engine.secondaryColor;
    this.engine.secondaryColor = temp;
    this.updateColorSwatches();
    this.engine.notifyColorChange(this.engine.primaryColor);
  }

  public resetView(): void {
    this.engine.resetZoom();
  }

  private shouldIgnoreKeyboardShortcut(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      Boolean(target?.isContentEditable)
    ) {
      return true;
    }

    const overlays = document.querySelectorAll('.modal-overlay');
    for (const overlay of overlays) {
      const el = overlay as HTMLElement;
      const computedDisplay =
        typeof window.getComputedStyle === 'function'
          ? window.getComputedStyle(el).display
          : el.style.display;
      if (el.style.display !== 'none' && computedDisplay !== 'none') {
        return true;
      }
    }

    return false;
  }

  private adjustActiveToolSize(delta: number): void {
    const tool = this.engine.activeTool;
    if (tool instanceof TextTool) {
      tool.fontSize = Math.max(8, Math.min(120, tool.fontSize + delta));
    } else if (tool instanceof BucketTool) {
      tool.tolerance = Math.max(0, Math.min(100, tool.tolerance + delta));
    } else {
      this.engine.brushSize = Math.max(1, Math.min(100, this.engine.brushSize + delta));
    }
    this.engine.setTool(this.engine.activeTool);
  }

  private bindEvents(): void {
    // Tool button click listeners
    this.container.querySelectorAll('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const toolId = btn.getAttribute('data-tool');
        if (toolId) {
          this.activateTool(toolId);
        }
      });
    });

    // Color pickers & swap button
    this.primaryColorInput?.addEventListener('input', () => {
      this.engine.primaryColor = this.primaryColorInput!.value;
      this.updateColorSwatches();
      this.engine.notifyColorChange(this.engine.primaryColor);
    });

    this.secondaryColorInput?.addEventListener('input', () => {
      this.engine.secondaryColor = this.secondaryColorInput!.value;
      this.updateColorSwatches();
      this.engine.notifyColorChange(this.engine.primaryColor);
    });

    this.container.querySelector('#prop-btn-swap-colors')?.addEventListener('click', () => {
      this.swapColors();
    });

    this.engine.addColorChangeListener(() => {
      this.updateColorSwatches();
    });

    // Subscribe to programmatic tool changes on engine
    this.engine.addToolChangeListener((toolOrId) => {
      this.syncActiveButton(toolOrId);
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.shouldIgnoreKeyboardShortcut(e)) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      if (isCmdOrCtrl) {
        if (e.defaultPrevented) return;
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            this.engine.redo();
          } else {
            this.engine.undo();
          }
        } else if (key === 'y') {
          e.preventDefault();
          this.engine.redo();
        } else if (key === 'x' && this.engine.activeTool instanceof SelectionTool) {
          e.preventDefault();
          this.engine.activeTool.cut(this.engine);
        } else if (key === 'c' && this.engine.activeTool instanceof SelectionTool) {
          e.preventDefault();
          this.engine.activeTool.copy(this.engine);
        } else if (key === 'v' && this.engine.activeTool instanceof SelectionTool) {
          e.preventDefault();
          this.engine.activeTool.paste(this.engine);
        }
        return;
      }

      if (e.altKey || e.metaKey || e.ctrlKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!e.defaultPrevented && this.engine.activeTool instanceof SelectionTool) {
          e.preventDefault();
          this.engine.activeTool.deleteSelection(this.engine);
        }
        return;
      }

      switch (key) {
        case 'v':
          this.activateTool('select');
          break;
        case 'b':
          this.activateTool('brush');
          break;
        case 'p':
          this.activateTool('pencil');
          break;
        case 'e':
          this.activateTool('eraser');
          break;
        case 'u':
          this.activateTool('rect');
          break;
        case 'o':
          this.activateTool('circle');
          break;
        case 'l':
          this.activateTool('line');
          break;
        case 'a':
          this.activateTool('arrow');
          break;
        case 't':
          this.activateTool('text');
          break;
        case 'g':
          this.activateTool('bucket');
          break;
        case 'i':
          this.activateTool('eyedropper');
          break;
        case 'h':
          this.activateTool('drag');
          break;
        case 'x':
          this.swapColors();
          break;
        case '[':
          this.adjustActiveToolSize(-2);
          break;
        case ']':
          this.adjustActiveToolSize(2);
          break;
        case '-':
          this.engine.zoomAt(-0.15);
          break;
        case '+':
        case '=':
          this.engine.zoomAt(0.15);
          break;
        case '0':
          this.resetView();
          break;
      }
    });
  }
}
