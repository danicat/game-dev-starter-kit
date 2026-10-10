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
import { ShapeTool } from '../engine/tools/ShapeTool.ts';
import { SelectionTool } from '../engine/tools/SelectionTool.ts';
import { DragTool } from '../engine/tools/DragTool.ts';
import { BucketTool } from '../engine/tools/BucketTool.ts';
import { TextTool } from '../engine/tools/TextTool.ts';
import { EraserTool } from '../engine/tools/EraserTool.ts';

export class PropertyBar {
  private engine: CanvasEngine;
  private container: HTMLElement;

  private sizeLabel: HTMLElement | null = null;
  private sizeSlider: HTMLInputElement | null = null;
  private sizeValueLabel: HTMLElement | null = null;
  private opacitySlider: HTMLInputElement | null = null;
  private opacityValueLabel: HTMLElement | null = null;
  private shapeOptionsContainer: HTMLElement | null = null;
  private selectionOptionsContainer: HTMLElement | null = null;
  private dragOptionsContainer: HTMLElement | null = null;

  constructor(engine: CanvasEngine, container: HTMLElement) {
    this.engine = engine;
    this.container = container;

    this.render();
    this.bindEvents();
    this.syncActiveTool(this.engine.activeTool);
  }

  private render() {
    this.container.innerHTML = `
      <div class="property-bar-inner" role="toolbar" aria-label="Tool Properties">
        <!-- Size / Font / Proximity Slider -->
        <div class="prop-group prop-slider-group" title="Brush / Stroke Width">
          <span class="prop-label" id="prop-size-label">Size</span>
          <input type="range" id="prop-brush-size" min="1" max="100" value="${this.engine.brushSize}" class="range-slider range-sm" aria-label="Brush or Stroke Size" />
          <span id="prop-brush-size-val" class="prop-value-pill">${this.engine.brushSize}px</span>
        </div>

        <div class="prop-divider"></div>

        <!-- Opacity Slider -->
        <div class="prop-group prop-slider-group" title="Tool Opacity">
          <span class="prop-label">Opacity</span>
          <input type="range" id="prop-brush-opacity" min="1" max="100" value="${Math.round(this.engine.brushOpacity * 100)}" class="range-slider range-sm" aria-label="Tool Opacity" />
          <span id="prop-brush-opacity-val" class="prop-value-pill">${Math.round(this.engine.brushOpacity * 100)}%</span>
        </div>

        <div class="prop-divider"></div>

        <!-- Quick Palette -->
        <div class="prop-group prop-color-group">
          <div class="prop-quick-palette" role="group" aria-label="Quick Color Palette">
            <div class="palette-dot" style="background:#09090b;" data-color="#09090b" title="Black" role="button" tabindex="0" aria-label="Select Black color"></div>
            <div class="palette-dot" style="background:#ffffff; border:1px solid #d4d4d8;" data-color="#ffffff" title="White" role="button" tabindex="0" aria-label="Select White color"></div>
            <div class="palette-dot" style="background:#ef4444;" data-color="#ef4444" title="Red" role="button" tabindex="0" aria-label="Select Red color"></div>
            <div class="palette-dot" style="background:#f97316;" data-color="#f97316" title="Orange" role="button" tabindex="0" aria-label="Select Orange color"></div>
            <div class="palette-dot" style="background:#eab308;" data-color="#eab308" title="Yellow" role="button" tabindex="0" aria-label="Select Yellow color"></div>
            <div class="palette-dot" style="background:#22c55e;" data-color="#22c55e" title="Green" role="button" tabindex="0" aria-label="Select Green color"></div>
            <div class="palette-dot" style="background:#06b6d4;" data-color="#06b6d4" title="Cyan" role="button" tabindex="0" aria-label="Select Cyan color"></div>
            <div class="palette-dot" style="background:#3b82f6;" data-color="#3b82f6" title="Blue" role="button" tabindex="0" aria-label="Select Blue color"></div>
            <div class="palette-dot" style="background:#8b5cf6;" data-color="#8b5cf6" title="Purple" role="button" tabindex="0" aria-label="Select Purple color"></div>
            <div class="palette-dot" style="background:#ec4899;" data-color="#ec4899" title="Pink" role="button" tabindex="0" aria-label="Select Pink color"></div>
          </div>
        </div>

        <!-- Contextual Tool Controls -->
        <div id="prop-shape-options" class="prop-context-group" style="display: none;">
          <div class="prop-divider"></div>
          <label class="checkbox-label text-xs" title="Fill closed shape with Foreground Color">
            <input type="checkbox" id="prop-shape-fill" aria-label="Fill Shape" />
            <span>Fill Shape</span>
          </label>
        </div>

        <div id="prop-selection-options" class="prop-context-group" style="display: none;">
          <div class="prop-divider"></div>
          <span class="prop-label">Selection</span>
          <button id="prop-sel-cut" class="btn btn-xs btn-outline" title="Cut Selection (Cmd/Ctrl+X)" aria-label="Cut Selection">Cut</button>
          <button id="prop-sel-copy" class="btn btn-xs btn-outline" title="Copy Selection (Cmd/Ctrl+C)" aria-label="Copy Selection">Copy</button>
          <button id="prop-sel-paste" class="btn btn-xs btn-outline" title="Paste (Cmd/Ctrl+V)" aria-label="Paste Selection">Paste</button>
          <button id="prop-sel-delete" class="btn btn-xs btn-outline" title="Clear Pixels (Del)" aria-label="Clear Selection Pixels">Clear</button>
          <button id="prop-sel-deselect" class="btn btn-xs btn-ghost" title="Deselect (Esc)" aria-label="Deselect">✕</button>
        </div>

        <div id="prop-drag-options" class="prop-context-group" style="display: none;">
          <div class="prop-divider"></div>
          <button id="prop-drag-recenter" class="btn btn-xs btn-outline" title="Recenter & Fit View (⌘9)" aria-label="Recenter and Fit View">⛶ Fit View</button>
        </div>
      </div>
    `;

    this.sizeLabel = this.container.querySelector('#prop-size-label');
    this.sizeSlider = this.container.querySelector('#prop-brush-size');
    this.sizeValueLabel = this.container.querySelector('#prop-brush-size-val');
    this.opacitySlider = this.container.querySelector('#prop-brush-opacity');
    this.opacityValueLabel = this.container.querySelector('#prop-brush-opacity-val');
    this.shapeOptionsContainer = this.container.querySelector('#prop-shape-options');
    this.selectionOptionsContainer = this.container.querySelector('#prop-selection-options');
    this.dragOptionsContainer = this.container.querySelector('#prop-drag-options');
  }

  private bindEvents() {
    // Brush size / font size / tolerance slider
    this.sizeSlider?.addEventListener('input', () => {
      const val = parseInt(this.sizeSlider!.value, 10);
      if (this.engine.activeTool instanceof BucketTool) {
        this.engine.activeTool.tolerance = val;
        if (this.sizeValueLabel) this.sizeValueLabel.textContent = `±${val}`;
      } else if (this.engine.activeTool instanceof TextTool) {
        this.engine.activeTool.fontSize = val;
        if (this.sizeValueLabel) this.sizeValueLabel.textContent = `${val}px`;
      } else if (this.engine.activeTool instanceof EraserTool) {
        this.engine.activeTool.size = val;
        if (this.sizeValueLabel) this.sizeValueLabel.textContent = `${val}px`;
        this.engine.renderOverlay();
      } else {
        this.engine.brushSize = val;
        if (this.sizeValueLabel) this.sizeValueLabel.textContent = `${val}px`;
      }
    });

    // Opacity slider
    this.opacitySlider?.addEventListener('input', () => {
      const val = parseInt(this.opacitySlider!.value, 10);
      this.engine.brushOpacity = val / 100;
      if (this.opacityValueLabel) this.opacityValueLabel.textContent = `${val}%`;
    });

    // Quick palette dots
    this.container.querySelectorAll('.palette-dot').forEach((dot) => {
      const selectPaletteColor = () => {
        const color = dot.getAttribute('data-color');
        if (color) {
          this.engine.primaryColor = color;
          this.engine.notifyColorChange(color);
        }
      };
      dot.addEventListener('click', selectPaletteColor);
      dot.addEventListener('keydown', (e: Event) => {
        const ke = e as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          selectPaletteColor();
        }
      });
    });

    // Shape fill option
    const shapeFillCheckbox = this.container.querySelector('#prop-shape-fill') as HTMLInputElement;
    shapeFillCheckbox?.addEventListener('change', () => {
      if (this.engine.activeTool instanceof ShapeTool) {
        this.engine.activeTool.fill = shapeFillCheckbox.checked;
      }
    });

    // Selection action buttons
    this.container.querySelector('#prop-sel-cut')?.addEventListener('click', () => {
      if (this.engine.activeTool instanceof SelectionTool) {
        this.engine.activeTool.cut(this.engine);
      }
    });
    this.container.querySelector('#prop-sel-copy')?.addEventListener('click', () => {
      if (this.engine.activeTool instanceof SelectionTool) {
        this.engine.activeTool.copy(this.engine);
      }
    });
    this.container.querySelector('#prop-sel-paste')?.addEventListener('click', () => {
      if (this.engine.activeTool instanceof SelectionTool) {
        this.engine.activeTool.paste(this.engine);
      }
    });
    this.container.querySelector('#prop-sel-delete')?.addEventListener('click', () => {
      if (this.engine.activeTool instanceof SelectionTool) {
        this.engine.activeTool.deleteSelection(this.engine);
      }
    });
    this.container.querySelector('#prop-sel-deselect')?.addEventListener('click', () => {
      if (this.engine.activeTool instanceof SelectionTool) {
        this.engine.activeTool.deselect(this.engine);
      }
    });

    // Drag Recenter
    this.container.querySelector('#prop-drag-recenter')?.addEventListener('click', () => {
      this.engine.fitToViewport();
    });

    // Engine multi-subscriber callbacks
    this.engine.addToolChangeListener((tool) => {
      this.syncActiveTool(tool);
    });
  }

  public syncActiveTool(toolOrId: any) {
    const tool = typeof toolOrId === 'string' ? this.engine.getActiveTool() : (toolOrId || this.engine.activeTool);
    if (!tool) return;

    const isShape = tool instanceof ShapeTool || tool.id === 'shape';
    const isClosedShape =
      isShape &&
      tool instanceof ShapeTool &&
      (tool.shapeType === 'rect' ||
        tool.shapeType === 'rectangle' ||
        tool.shapeType === 'circle' ||
        tool.shapeType === 'ellipse');
    const isSelection = tool instanceof SelectionTool || tool.id === 'select';
    const isDrag = tool instanceof DragTool || tool.id === 'drag';
    const isBucket = tool instanceof BucketTool || tool.id === 'bucket';
    const isText = tool instanceof TextTool || tool.id === 'text';
    const isEraser = tool instanceof EraserTool || tool.id === 'eraser';

    if (this.sizeLabel && this.sizeSlider && this.sizeValueLabel) {
      if (isBucket && tool instanceof BucketTool) {
        this.sizeLabel.textContent = 'Proximity';
        this.sizeSlider.title = 'Colour Proximity Threshold (0 - 100)';
        this.sizeSlider.setAttribute('aria-label', 'Color Proximity Threshold');
        this.sizeSlider.min = '0';
        this.sizeSlider.max = '100';
        this.sizeSlider.value = String(tool.tolerance);
        this.sizeValueLabel.textContent = `±${tool.tolerance}`;
      } else if (isText && tool instanceof TextTool) {
        this.sizeLabel.textContent = 'Font';
        this.sizeSlider.title = 'Text Font Size (8 - 120px)';
        this.sizeSlider.setAttribute('aria-label', 'Text Font Size');
        this.sizeSlider.min = '8';
        this.sizeSlider.max = '120';
        this.sizeSlider.value = String(tool.fontSize);
        this.sizeValueLabel.textContent = `${tool.fontSize}px`;
      } else if (isEraser && tool instanceof EraserTool) {
        this.sizeLabel.textContent = 'Size';
        this.sizeSlider.title = 'Eraser Width (1 - 100px)';
        this.sizeSlider.setAttribute('aria-label', 'Eraser Size');
        this.sizeSlider.min = '1';
        this.sizeSlider.max = '100';
        this.sizeSlider.value = String(tool.size);
        this.sizeValueLabel.textContent = `${tool.size}px`;
      } else {
        this.sizeLabel.textContent = 'Size';
        this.sizeSlider.title = 'Brush / Stroke Width';
        this.sizeSlider.setAttribute('aria-label', 'Brush or Stroke Size');
        this.sizeSlider.min = '1';
        this.sizeSlider.max = '100';
        this.sizeSlider.value = String(this.engine.brushSize);
        this.sizeValueLabel.textContent = `${this.engine.brushSize}px`;
      }
    }

    if (this.shapeOptionsContainer) {
      this.shapeOptionsContainer.style.display = isClosedShape ? 'flex' : 'none';
      if (isClosedShape && tool instanceof ShapeTool) {
        const shapeFill = this.container.querySelector('#prop-shape-fill') as HTMLInputElement;
        if (shapeFill) shapeFill.checked = tool.fill;
      }
    }

    if (this.selectionOptionsContainer) {
      this.selectionOptionsContainer.style.display = isSelection ? 'flex' : 'none';
    }

    if (this.dragOptionsContainer) {
      this.dragOptionsContainer.style.display = isDrag ? 'flex' : 'none';
    }
  }
}
