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

import { BaseTool, type Point } from './BaseTool.ts';
import type { CanvasEngine } from '../CanvasEngine.ts';

export class TextTool extends BaseTool {
  public fontSize = 24;
  public fontFamily = 'system-ui, -apple-system, sans-serif';
  public isEditing = false;
  private boxElement: HTMLDivElement | null = null;
  private inputElement: HTMLInputElement | null = null;
  private textPt: Point | null = null;
  private focusTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super('text', 'Text Tool', 'text');
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    // If an input box is already active at another location, commit existing text first
    if (this.isEditing) {
      this.commitText(engine);
    }

    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    this.createInput(engine, pt);
  }

  onPointerMove(): void {}
  onPointerUp(): void {}

  private createInput(engine: CanvasEngine, pt: Point): void {
    this.removeInputDOM();

    this.isEditing = true;
    this.textPt = { x: pt.x, y: pt.y };

    const overlayRect = engine.overlayCanvas.getBoundingClientRect();
    const containerRect = engine.container.getBoundingClientRect();

    const screenX = overlayRect.left + pt.x * engine.zoom;
    const screenY = overlayRect.top + pt.y * engine.zoom;

    let relX = screenX - containerRect.left;
    let relY = screenY - containerRect.top;

    if (containerRect.width > 250) {
      relX = Math.max(8, Math.min(relX, containerRect.width - 240));
    }
    if (containerRect.height > 50) {
      relY = Math.max(8, Math.min(relY, containerRect.height - 40));
    }

    const box = document.createElement('div');
    box.id = 'engine-floating-text-box';
    box.style.position = 'absolute';
    box.style.left = `${relX}px`;
    box.style.top = `${relY}px`;
    box.style.zIndex = '1000';
    box.style.display = 'flex';
    box.style.alignItems = 'center';
    box.style.gap = '4px';
    box.style.padding = '4px 6px';
    box.style.borderRadius = '6px';
    box.style.backgroundColor = 'var(--surface-color, #ffffff)';
    box.style.border = '2px solid var(--accent-color, #6366f1)';
    box.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type text & Enter...';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.background = 'transparent';
    input.style.color = 'var(--text-primary, #111827)';
    input.style.fontSize = '13px';
    input.style.width = '160px';

    const commitBtn = document.createElement('button');
    commitBtn.type = 'button';
    commitBtn.textContent = 'Add';
    commitBtn.style.padding = '2px 6px';
    commitBtn.style.fontSize = '11px';
    commitBtn.style.fontWeight = '600';
    commitBtn.style.borderRadius = '4px';
    commitBtn.style.backgroundColor = 'var(--accent-color, #6366f1)';
    commitBtn.style.color = '#ffffff';
    commitBtn.style.border = 'none';
    commitBtn.style.cursor = 'pointer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '✕';
    cancelBtn.style.padding = '2px 6px';
    cancelBtn.style.fontSize = '11px';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.backgroundColor = 'transparent';
    cancelBtn.style.color = 'var(--text-muted, #6b7280)';
    cancelBtn.style.border = 'none';
    cancelBtn.style.cursor = 'pointer';

    box.appendChild(input);
    box.appendChild(commitBtn);
    box.appendChild(cancelBtn);
    engine.container.appendChild(box);

    this.boxElement = box;
    this.inputElement = input;

    if (this.focusTimerId !== null) {
      clearTimeout(this.focusTimerId);
    }
    this.focusTimerId = setTimeout(() => {
      this.focusTimerId = null;
      if (this.isEditing && this.inputElement) {
        this.inputElement.focus();
      }
    }, 10);

    commitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.commitText(engine);
    });

    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancelText();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitText(engine);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelText();
      }
    });

    box.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });
    box.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  public commitText(engine: CanvasEngine): void {
    if (!this.isEditing) return;

    const text = this.inputElement ? this.inputElement.value.trim() : '';
    const pt = this.textPt;

    this.removeInputDOM();

    if (!text || !pt) return;

    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    const ctx = layer.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
    ctx.fillStyle = engine.primaryColor;
    ctx.font = `${Math.max(8, this.fontSize)}px ${this.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillText(text, pt.x, pt.y);
    ctx.restore();
    layer.markDirty();

    engine.render();
    engine.commitHistory();
  }

  public cancelText(): void {
    this.removeInputDOM();
  }

  private removeInputDOM(): void {
    if (this.focusTimerId !== null) {
      clearTimeout(this.focusTimerId);
      this.focusTimerId = null;
    }
    this.isEditing = false;
    this.textPt = null;
    if (this.boxElement) {
      this.boxElement.remove();
      this.boxElement = null;
    }
    const existing = document.getElementById('engine-floating-text-box');
    if (existing) {
      existing.remove();
    }
    this.inputElement = null;
  }

  deactivate(engine: CanvasEngine): void {
    if (this.isEditing) {
      this.commitText(engine);
    } else {
      this.removeInputDOM();
    }
  }
}
