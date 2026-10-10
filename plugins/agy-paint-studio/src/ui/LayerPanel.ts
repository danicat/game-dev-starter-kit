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

export class LayerPanel {
  private engine: CanvasEngine;
  private container: HTMLElement;

  constructor(engine: CanvasEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;

    this.render();
    this.engine.addLayerChangeListener(() => {
      this.render();
    });
  }

  public render() {
    this.container.innerHTML = `
      <div class="layer-panel-header">
        <div class="layer-panel-title-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
          <span class="layer-panel-title">Layers</span>
          <span id="layer-count-badge" class="layer-count-badge"></span>
        </div>
        <div class="layer-panel-actions">
          <button id="btn-add-layer" class="btn btn-icon btn-xs" title="New Layer" aria-label="New Layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button id="btn-dup-layer" class="btn btn-icon btn-xs" title="Duplicate Active Layer" aria-label="Duplicate Active Layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="13" height="13" x="9" y="9" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button id="btn-merge-down" class="btn btn-icon btn-xs" title="Merge Down" aria-label="Merge Down">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3v13"></path>
              <polyline points="7 11 12 16 17 11"></polyline>
              <line x1="4" y1="21" x2="20" y2="21"></line>
            </svg>
          </button>
          <button id="btn-del-layer" class="btn btn-icon btn-xs" title="Delete Active Layer" aria-label="Delete Active Layer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Active Layer Properties (Opacity & Blend Mode) -->
      <div class="layer-properties-box">
        <div class="layer-prop-row">
          <span class="text-xs text-muted">Blend</span>
          <select id="layer-blend-select" class="select-box select-xs" aria-label="Layer Blend Mode">
            <option value="source-over">Normal</option>
            <option value="multiply">Multiply</option>
            <option value="screen">Screen</option>
            <option value="overlay">Overlay</option>
            <option value="darken">Darken</option>
            <option value="lighten">Lighten</option>
            <option value="color-dodge">Color Dodge</option>
            <option value="color-burn">Color Burn</option>
            <option value="hard-light">Hard Light</option>
            <option value="soft-light">Soft Light</option>
            <option value="difference">Difference</option>
            <option value="exclusion">Exclusion</option>
          </select>
        </div>
        <div class="layer-prop-row">
          <span class="text-xs text-muted">Opacity</span>
          <input type="range" id="layer-opacity-slider" min="0" max="100" value="100" class="range-slider range-xs" aria-label="Layer Opacity" />
          <span id="layer-opacity-val" class="text-xs text-muted">100%</span>
        </div>
      </div>

      <!-- Layers Stack List (Top to Bottom) -->
      <div id="layers-stack-list" class="layers-stack-list" role="list" aria-label="Layers Stack"></div>

      <!-- Footer Reorder Controls -->
      <div class="layer-panel-footer">
        <button id="btn-layer-up" class="btn btn-xs btn-outline" title="Move Active Layer Up" aria-label="Move Active Layer Up">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
          <span>Up</span>
        </button>
        <button id="btn-layer-down" class="btn btn-xs btn-outline" title="Move Active Layer Down" aria-label="Move Active Layer Down">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
          <span>Down</span>
        </button>
      </div>
    `;

    const countBadge = this.container.querySelector('#layer-count-badge');
    if (countBadge) {
      countBadge.textContent = String(this.engine.layers.length);
    }

    this.bindHeaderActions();
    this.renderLayersList();
    this.updateActiveLayerProps();
  }

  private bindHeaderActions() {
    this.container.querySelector('#btn-add-layer')?.addEventListener('click', () => {
      this.engine.addLayer();
    });

    this.container.querySelector('#btn-dup-layer')?.addEventListener('click', () => {
      this.engine.duplicateLayer();
    });

    this.container.querySelector('#btn-merge-down')?.addEventListener('click', () => {
      this.engine.mergeDown();
    });

    this.container.querySelector('#btn-del-layer')?.addEventListener('click', () => {
      this.engine.deleteLayer();
    });

    this.container.querySelector('#btn-layer-up')?.addEventListener('click', () => {
      const idx = this.engine.activeLayerIndex;
      if (idx < this.engine.layers.length - 1) {
        this.engine.moveLayer(idx, idx + 1);
      }
    });

    this.container.querySelector('#btn-layer-down')?.addEventListener('click', () => {
      const idx = this.engine.activeLayerIndex;
      if (idx > 0) {
        this.engine.moveLayer(idx, idx - 1);
      }
    });

    // Active layer properties
    const blendSelect = this.container.querySelector('#layer-blend-select') as HTMLSelectElement;
    blendSelect?.addEventListener('change', () => {
      const active = this.engine.getActiveLayer();
      if (active) {
        active.blendMode = blendSelect.value as GlobalCompositeOperation;
        active.markDirty();
        this.engine.render();
        this.engine.commitHistory();
      }
    });

    const opacitySlider = this.container.querySelector('#layer-opacity-slider') as HTMLInputElement;
    const opacityLabel = this.container.querySelector('#layer-opacity-val') as HTMLElement;
    opacitySlider?.addEventListener('input', () => {
      const active = this.engine.getActiveLayer();
      const val = parseInt(opacitySlider.value, 10);
      if (active) {
        active.opacity = val / 100;
        if (opacityLabel) opacityLabel.textContent = `${val}%`;
        this.engine.render();
      }
    });
    opacitySlider?.addEventListener('change', () => {
      const active = this.engine.getActiveLayer();
      if (active) {
        active.markDirty();
      }
      this.engine.commitHistory();
    });
  }

  private updateActiveLayerProps() {
    const active = this.engine.getActiveLayer();
    if (!active) return;

    const blendSelect = this.container.querySelector('#layer-blend-select') as HTMLSelectElement;
    if (blendSelect) blendSelect.value = active.blendMode;

    const opacitySlider = this.container.querySelector('#layer-opacity-slider') as HTMLInputElement;
    const opacityLabel = this.container.querySelector('#layer-opacity-val') as HTMLElement;
    if (opacitySlider) {
      const pct = Math.round(active.opacity * 100);
      opacitySlider.value = String(pct);
      if (opacityLabel) opacityLabel.textContent = `${pct}%`;
    }
  }

  private renderLayersList() {
    const listEl = this.container.querySelector('#layers-stack-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    // Render in reverse order (top of visual stack = highest layer index)
    for (let i = this.engine.layers.length - 1; i >= 0; i--) {
      const layer = this.engine.layers[i];
      const isActive = i === this.engine.activeLayerIndex;

      const row = document.createElement('div');
      row.className = `layer-item ${isActive ? 'active' : ''} ${layer.locked ? 'locked' : ''}`;
      row.setAttribute('role', 'listitem');
      row.onclick = () => {
        this.engine.setActiveLayerIndex(i);
        this.render();
      };

      // Visibility Eye Toggle
      const eyeBtn = document.createElement('button');
      eyeBtn.className = `layer-eye-btn ${layer.visible ? '' : 'hidden-layer'}`;
      eyeBtn.innerHTML = layer.visible
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
            <line x1="2" y1="2" x2="22" y2="22"></line>
          </svg>`;
      eyeBtn.title = layer.visible ? 'Hide Layer' : 'Show Layer';
      eyeBtn.setAttribute('aria-label', layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`);
      eyeBtn.setAttribute('aria-pressed', String(layer.visible));
      eyeBtn.onclick = (e) => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        layer.markDirty();
        this.engine.render();
        this.engine.commitHistory();
        this.render();
      };

      // Lock / Unlock Toggle
      const lockBtn = document.createElement('button');
      lockBtn.className = `layer-eye-btn layer-lock-btn ${layer.locked ? 'locked-layer' : 'unlocked-layer'}`;
      lockBtn.style.color = layer.locked ? 'var(--accent-color)' : 'var(--text-muted)';
      lockBtn.style.opacity = layer.locked ? '1' : '0.45';
      lockBtn.innerHTML = layer.locked
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
          </svg>`;
      lockBtn.title = layer.locked ? 'Unlock Layer' : 'Lock Layer';
      lockBtn.setAttribute('aria-label', layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`);
      lockBtn.setAttribute('aria-pressed', String(layer.locked));
      lockBtn.onclick = (e) => {
        e.stopPropagation();
        layer.locked = !layer.locked;
        layer.markDirty();
        this.engine.commitHistory();
        this.render();
      };

      // Thumbnail
      const thumb = document.createElement('canvas');
      thumb.className = 'layer-thumb';
      thumb.width = 36;
      thumb.height = 24;
      const tCtx = thumb.getContext('2d');
      if (tCtx) {
        tCtx.clearRect(0, 0, 36, 24);
        tCtx.drawImage(layer.canvas, 0, 0, 36, 24);
      }

      // Name (built via textContent)
      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name';
      nameSpan.textContent = layer.name;
      nameSpan.title = 'Double-click to rename';
      nameSpan.ondblclick = (e) => {
        e.stopPropagation();
        const rawName = prompt('Rename Layer:', layer.name);
        if (rawName !== null) {
          const sanitized = rawName.trim().slice(0, 64);
          if (sanitized) {
            layer.name = sanitized;
            layer.markDirty();
            this.engine.commitHistory();
            this.render();
          }
        }
      };

      row.appendChild(eyeBtn);
      row.appendChild(lockBtn);
      row.appendChild(thumb);
      row.appendChild(nameSpan);

      listEl.appendChild(row);
    }
  }
}
