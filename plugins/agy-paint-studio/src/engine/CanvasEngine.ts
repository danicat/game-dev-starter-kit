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

import { Layer } from './Layer.ts';
import { HistoryManager, type HistoryState } from './History.ts';
import { BaseTool, type Point } from './tools/BaseTool.ts';
import { PencilTool } from './tools/PencilTool.ts';
import { BrushTool } from './tools/BrushTool.ts';
import { EraserTool } from './tools/EraserTool.ts';
import { BucketTool } from './tools/BucketTool.ts';
import { SelectionTool } from './tools/SelectionTool.ts';
import { ShapeTool } from './tools/ShapeTool.ts';
import { TextTool } from './tools/TextTool.ts';
import { EyedropperTool } from './tools/EyedropperTool.ts';
import { DragTool } from './tools/DragTool.ts';
import { serializePsd, parsePsd, exportPsdFile } from '../utils/psd.ts';

export type Tool = BaseTool;

export class CanvasEngine {
  public width: number;
  public height: number;
  public layers: Layer[] = [];
  public activeLayerIndex = 0;

  // Viewport Zoom & Pan
  public zoom = 1.0;
  public panX = 0;
  public panY = 0;
  private isPanning = false;
  public isDrawing = false;
  private panStartPt: Point = { x: 0, y: 0 };
  public isSpacePressed = false;

  // Tool & Drawing State
  public primaryColor = '#1F2937';
  public secondaryColor = '#FFFFFF';
  public brushSize = 4;
  public brushOpacity = 1.0;
  public activeTool: BaseTool;
  private tools: Map<string, BaseTool> = new Map();

  // Canvas DOM Elements
  public container: HTMLElement;
  public displayCanvas: HTMLCanvasElement;
  public displayCtx: CanvasRenderingContext2D;
  public overlayCanvas: HTMLCanvasElement;
  public overlayCtx: CanvasRenderingContext2D;

  // History
  public history: HistoryManager;

  // Multi-subscriber listener sets
  private layerChangeListeners = new Set<() => void>();
  private historyChangeListeners = new Set<() => void>();
  private zoomChangeListeners = new Set<(zoom: number) => void>();
  private colorChangeListeners = new Set<(color: string) => void>();
  private toolChangeListeners = new Set<(toolOrId: any) => void>();

  constructor(container: HTMLElement, width = 800, height = 600) {
    if (!container) {
      throw new Error('CanvasEngine requires a valid container HTMLElement.');
    }
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`Invalid initial canvas dimensions: ${width}x${height}`);
    }

    this.container = container;
    this.width = width;
    this.height = height;

    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.className = 'canvas-main';
    const dCtx = this.displayCanvas.getContext('2d');
    if (!dCtx) throw new Error('Failed to get 2D context for display canvas');
    this.displayCtx = dCtx;

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'canvas-overlay';
    const oCtx = this.overlayCanvas.getContext('2d');
    if (!oCtx) throw new Error('Failed to get 2D context for overlay canvas');
    this.overlayCtx = oCtx;

    this.history = new HistoryManager();

    const defaultPencil = new PencilTool();
    const defaultBrush = new BrushTool();
    const defaultEraser = new EraserTool();
    const defaultBucket = new BucketTool();
    const defaultSelect = new SelectionTool();
    const defaultShape = new ShapeTool('rect');
    const defaultText = new TextTool();
    const defaultEyedropper = new EyedropperTool();
    const defaultDrag = new DragTool();

    this.tools.set('pencil', defaultPencil);
    this.tools.set('brush', defaultBrush);
    this.tools.set('eraser', defaultEraser);
    this.tools.set('bucket', defaultBucket);
    this.tools.set('select', defaultSelect);
    this.tools.set('shape', defaultShape);
    this.tools.set('rect', defaultShape);
    this.tools.set('rectangle', defaultShape);
    this.tools.set('circle', defaultShape);
    this.tools.set('ellipse', defaultShape);
    this.tools.set('line', defaultShape);
    this.tools.set('arrow', defaultShape);
    this.tools.set('text', defaultText);
    this.tools.set('eyedropper', defaultEyedropper);
    this.tools.set('drag', defaultDrag);

    this.activeTool = defaultBrush;

    this.setupDOM();
    this.initDefaultDocument();
    this.bindEvents();

    requestAnimationFrame(() => {
      this.fitToViewport();
    });
  }

  public get canvas(): HTMLCanvasElement {
    return this.overlayCanvas;
  }

  // Multi-listener subscription methods
  public addLayerChangeListener(cb: () => void): void {
    this.layerChangeListeners.add(cb);
  }

  public addHistoryChangeListener(cb: () => void): void {
    this.historyChangeListeners.add(cb);
  }

  public addZoomChangeListener(cb: (zoom: number) => void): void {
    this.zoomChangeListeners.add(cb);
  }

  public addColorChangeListener(cb: (color: string) => void): void {
    this.colorChangeListeners.add(cb);
  }

  public addToolChangeListener(cb: (toolId: string) => void): void {
    this.toolChangeListeners.add(cb);
  }

  private notifyLayerChange(): void {
    for (const cb of this.layerChangeListeners) {
      cb();
    }
  }

  private notifyHistoryChange(): void {
    for (const cb of this.historyChangeListeners) {
      cb();
    }
  }

  private notifyZoomChange(): void {
    for (const cb of this.zoomChangeListeners) {
      cb(this.zoom);
    }
  }

  public notifyColorChange(hex: string): void {
    for (const cb of this.colorChangeListeners) {
      cb(hex);
    }
  }

  private notifyToolChange(toolId: string): void {
    for (const cb of this.toolChangeListeners) {
      cb(toolId);
    }
  }

  public getTool(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  public getActiveTool(): Tool | null {
    return this.activeTool;
  }

  private setupDOM(): void {
    this.container.innerHTML = '';
    this.container.classList.add('canvas-viewport-container');

    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-stage-wrapper';
    wrapper.style.position = 'relative';

    this.updateCanvasSizes();

    wrapper.appendChild(this.displayCanvas);
    wrapper.appendChild(this.overlayCanvas);
    this.container.appendChild(wrapper);
  }

  private updateCanvasSizes(): void {
    this.displayCanvas.width = this.width;
    this.displayCanvas.height = this.height;
    this.overlayCanvas.width = this.width;
    this.overlayCanvas.height = this.height;

    this.applyTransform();
  }

  public applyTransform(): void {
    const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.displayCanvas.style.transform = transform;
    this.displayCanvas.style.transformOrigin = '0 0';
    this.overlayCanvas.style.transform = transform;
    this.overlayCanvas.style.transformOrigin = '0 0';

    this.notifyZoomChange();
  }

  public initDefaultDocument(): void {
    this.layers = [];
    const bgLayer = new Layer(this.width, this.height, 'Background');
    bgLayer.fill('#FFFFFF');
    this.layers.push(bgLayer);

    const drawLayer = new Layer(this.width, this.height, 'Layer 1');
    this.layers.push(drawLayer);

    this.activeLayerIndex = 1;
    this.history.clear();
    this.commitHistory();
    this.render();
    this.notifyLayerChange();
  }

  public setDocumentState(width: number, height: number, newLayers: Layer[]): void {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(`Invalid document dimensions: ${width}x${height}`);
    }
    if (!Array.isArray(newLayers) || newLayers.length === 0) {
      throw new Error('Document state requires at least one layer.');
    }

    this.width = width;
    this.height = height;
    this.layers = newLayers;
    this.activeLayerIndex = Math.max(0, newLayers.length - 1);

    this.updateCanvasSizes();
    this.history.clear();
    this.commitHistory();
    this.render();
    this.fitToViewport();
    this.notifyLayerChange();
  }

  public getActiveLayer(): Layer | null {
    if (this.activeLayerIndex >= 0 && this.activeLayerIndex < this.layers.length) {
      return this.layers[this.activeLayerIndex];
    }
    return null;
  }

  public setActiveLayerIndex(index: number): void {
    if (index >= 0 && index < this.layers.length) {
      this.activeLayerIndex = index;
      this.notifyLayerChange();
    }
  }

  public setTool(toolOrId: BaseTool | string): void {
    let resolvedTool: BaseTool;
    let notifyKey: string;
    if (typeof toolOrId === 'string') {
      const found = this.tools.get(toolOrId);
      if (!found) {
        throw new Error(`Tool with id "${toolOrId}" is not registered in CanvasEngine.`);
      }
      if (found instanceof ShapeTool) {
        if (toolOrId === 'rect' || toolOrId === 'rectangle') {
          found.shapeType = 'rect';
        } else if (toolOrId === 'circle' || toolOrId === 'ellipse') {
          found.shapeType = 'circle';
        } else if (toolOrId === 'line') {
          found.shapeType = 'line';
        } else if (toolOrId === 'arrow') {
          found.shapeType = 'arrow';
        }
      }
      resolvedTool = found;
      notifyKey = toolOrId;
    } else {
      resolvedTool = toolOrId;
      this.tools.set(resolvedTool.id, resolvedTool);
      if (resolvedTool instanceof ShapeTool) {
        this.tools.set(resolvedTool.shapeType, resolvedTool);
      }
      notifyKey = resolvedTool.id;
    }

    if (this.activeTool && this.activeTool !== resolvedTool) {
      this.activeTool.deactivate(this);
    }
    this.activeTool = resolvedTool;
    this.overlayCanvas.style.cursor = this.isSpacePressed ? 'grab' : resolvedTool.cursor;
    this.container.style.cursor = (this.isSpacePressed || resolvedTool.id === 'drag') ? 'grab' : 'default';
    this.renderOverlay();
    this.notifyToolChange(notifyKey);
  }

  public async loadPsd(buffer: ArrayBuffer): Promise<void> {
    parsePsd(buffer, this);
  }

  public exportPsd(): Uint8Array {
    return new Uint8Array(serializePsd(this));
  }

  public downloadPsd(filename?: string): void {
    exportPsdFile(this, filename);
  }

  public addLayer(name?: string): Layer {
    const layerName = name || `Layer ${this.layers.length + 1}`;
    const newLayer = new Layer(this.width, this.height, layerName);
    this.layers.splice(this.activeLayerIndex + 1, 0, newLayer);
    this.activeLayerIndex = this.activeLayerIndex + 1;

    this.render();
    this.commitHistory();
    return newLayer;
  }

  public deleteLayer(index = this.activeLayerIndex): void {
    if (this.layers.length <= 1) {
      return;
    }
    if (index < 0 || index >= this.layers.length) {
      return;
    }
    this.layers.splice(index, 1);
    this.activeLayerIndex = Math.max(0, Math.min(this.activeLayerIndex, this.layers.length - 1));

    this.render();
    this.commitHistory();
  }

  public duplicateLayer(index = this.activeLayerIndex): void {
    const target = this.layers[index];
    if (!target) return;

    const copy = target.clone();
    this.layers.splice(index + 1, 0, copy);
    this.activeLayerIndex = index + 1;

    this.render();
    this.commitHistory();
  }

  public moveLayer(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.layers.length || toIndex < 0 || toIndex >= this.layers.length) {
      return;
    }
    const [removed] = this.layers.splice(fromIndex, 1);
    this.layers.splice(toIndex, 0, removed);
    this.activeLayerIndex = toIndex;

    this.render();
    this.commitHistory();
  }

  public mergeDown(index = this.activeLayerIndex): void {
    if (index <= 0 || index >= this.layers.length) return;
    const upper = this.layers[index];
    const lower = this.layers[index - 1];

    lower.ctx.save();
    lower.ctx.globalAlpha = upper.opacity;
    lower.ctx.globalCompositeOperation = upper.blendMode;
    lower.ctx.drawImage(upper.canvas, 0, 0);
    lower.ctx.restore();
    lower.markDirty();

    this.layers.splice(index, 1);
    this.activeLayerIndex = index - 1;

    this.render();
    this.commitHistory();
  }

  public flatten(): void {
    const comp = this.getCompositeCanvas();
    const flatLayer = new Layer(this.width, this.height, 'Background');
    flatLayer.ctx.drawImage(comp, 0, 0);
    flatLayer.markDirty();

    this.layers = [flatLayer];
    this.activeLayerIndex = 0;

    this.render();
    this.commitHistory();
  }

  public resizeDocument(newWidth: number, newHeight: number): void {
    if (newWidth <= 0 || newHeight <= 0 || !Number.isFinite(newWidth) || !Number.isFinite(newHeight)) {
      throw new Error(`Invalid dimensions for resizeDocument: ${newWidth}x${newHeight}`);
    }
    this.width = Math.round(newWidth);
    this.height = Math.round(newHeight);

    for (const layer of this.layers) {
      layer.resize(this.width, this.height, true);
    }

    this.updateCanvasSizes();
    this.render();
    this.commitHistory();
    this.fitToViewport();
  }

  public fitToViewport(): void {
    const rect = this.container.getBoundingClientRect();
    const pad = 24;
    const availW = Math.max(100, rect.width - pad * 2);
    const availH = Math.max(100, rect.height - pad * 2);

    const scaleW = availW / this.width;
    const scaleH = availH / this.height;
    this.zoom = Math.min(scaleW, scaleH, 1.5);
    this.zoom = Math.round(this.zoom * 100) / 100;

    this.panX = Math.round((rect.width - this.width * this.zoom) / 2);
    this.panY = Math.round((rect.height - this.height * this.zoom) / 2);

    this.applyTransform();
  }

  public zoomAt(deltaZoom: number, clientX?: number, clientY?: number): void {
    const prevZoom = this.zoom;
    const nextZoom = Math.max(0.1, Math.min(8.0, prevZoom + deltaZoom));
    if (nextZoom === prevZoom) return;

    const rect = this.container.getBoundingClientRect();
    const anchorX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
    const anchorY = clientY !== undefined ? clientY - rect.top : rect.height / 2;

    this.panX = anchorX - ((anchorX - this.panX) / prevZoom) * nextZoom;
    this.panY = anchorY - ((anchorY - this.panY) / prevZoom) * nextZoom;

    this.zoom = nextZoom;
    this.applyTransform();
  }

  public resetZoom(): void {
    this.zoom = 1.0;
    const rect = this.container.getBoundingClientRect();
    this.panX = Math.round((rect.width - this.width) / 2);
    this.panY = Math.round((rect.height - this.height) / 2);
    this.applyTransform();
  }

  public render(): void {
    // Clear display canvas (checkerboard is rendered via CSS on .canvas-main)
    this.displayCtx.clearRect(0, 0, this.width, this.height);

    // Composite visible layers from bottom to top
    for (const layer of this.layers) {
      if (!layer.visible) continue;

      this.displayCtx.save();
      this.displayCtx.globalAlpha = Math.min(1.0, Math.max(0.0, layer.opacity));
      this.displayCtx.globalCompositeOperation = layer.blendMode;
      this.displayCtx.drawImage(layer.canvas, 0, 0);
      this.displayCtx.restore();
    }

    this.renderOverlay();
  }

  public renderOverlay(): void {
    this.overlayCtx.clearRect(0, 0, this.width, this.height);
    if (this.activeTool) {
      this.activeTool.renderOverlay(this, this.overlayCtx);
    }
  }

  public getCompositeCanvas(): HTMLCanvasElement {
    const comp = document.createElement('canvas');
    comp.width = this.width;
    comp.height = this.height;
    const ctx = comp.getContext('2d');
    if (!ctx) throw new Error('Failed to create composite context');

    for (const layer of this.layers) {
      if (!layer.visible) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1.0, Math.max(0.0, layer.opacity));
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.restore();
    }
    return comp;
  }

  public commitHistory(): void {
    this.getActiveLayer()?.markDirty();
    this.history.pushState(this.layers, this.activeLayerIndex);
    this.notifyHistoryChange();
    this.notifyLayerChange();
  }

  public undo(): void {
    const state = this.history.undo();
    if (state) {
      this.restoreHistoryState(state);
    }
  }

  public redo(): void {
    const state = this.history.redo();
    if (state) {
      this.restoreHistoryState(state);
    }
  }

  private restoreHistoryState(state: HistoryState): void {
    this.activeTool?.deactivate(this);

    const targetWidth = state.layers[0]?.canvas.width ?? state.width;
    const targetHeight = state.layers[0]?.canvas.height ?? state.height;
    this.width = targetWidth;
    this.height = targetHeight;
    this.activeLayerIndex = Math.max(0, Math.min(state.activeLayerIndex, state.layers.length - 1));

    this.layers = state.layers.map((snap) => {
      const layer = new Layer(snap.canvas.width, snap.canvas.height, snap.name);
      layer.id = snap.id;
      layer.visible = snap.visible;
      layer.locked = snap.locked;
      layer.opacity = snap.opacity;
      layer.blendMode = snap.blendMode;
      layer.version = snap.version;

      const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error(
          `Failed to acquire 2D rendering context when restoring layer "${snap.name}" (${snap.id}) from history`
        );
      }
      ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      ctx.drawImage(snap.canvas, 0, 0);
      return layer;
    });

    this.updateCanvasSizes();
    this.render();
    this.notifyLayerChange();
    this.notifyHistoryChange();
  }

  // Convert pointer/mouse/touch event coordinates to canvas pixel space
  public eventToCanvasPoint(e: MouseEvent | TouchEvent): Point {
    const rect = this.displayCanvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
      const touch = e.touches[0] || e.changedTouches[0];
      if (touch) {
        clientX = touch.clientX;
        clientY = touch.clientY;
      }
    } else if ('clientX' in e && 'clientY' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) / this.zoom;
    const y = (clientY - rect.top) / this.zoom;
    return { x, y };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 1 || this.isSpacePressed) {
      this.isPanning = true;
      this.panStartPt = { x: e.clientX - this.panX, y: e.clientY - this.panY };
      this.overlayCanvas.style.cursor = 'grabbing';
      this.container.style.cursor = 'grabbing';
      return;
    }
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }

    this.isDrawing = true;
    const pt = this.eventToCanvasPoint(e);
    this.activeTool.onPointerDown(this, pt, e);
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.isPanning) {
      if (e.buttons === 0 && e.pointerType === 'mouse') {
        this.onPointerUp(e);
        return;
      }
      this.panX = e.clientX - this.panStartPt.x;
      this.panY = e.clientY - this.panStartPt.y;
      this.applyTransform();
      return;
    }

    if (this.isDrawing && e.buttons === 0 && e.pointerType === 'mouse') {
      this.onPointerUp(e);
      return;
    }

    const pt = this.eventToCanvasPoint(e);
    this.activeTool.onPointerMove(this, pt, e);
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.isPanning) {
      this.isPanning = false;
      this.overlayCanvas.style.cursor = this.isSpacePressed ? 'grab' : this.activeTool.cursor;
      this.container.style.cursor = (this.isSpacePressed || this.activeTool?.id === 'drag') ? 'grab' : 'default';
      return;
    }

    this.isDrawing = false;
    const pt = this.eventToCanvasPoint(e);
    this.activeTool.onPointerUp(this, pt, e);
  }

  private bindEvents(): void {
    // Unified Pointer Events on overlayCanvas and window
    this.overlayCanvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.onPointerDown(e);
    });

    // Pointer down on container background (for panning when zoomed out or using drag tool)
    this.container.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.target === this.overlayCanvas) return;
      if (e.button === 1 || this.isSpacePressed || this.activeTool?.id === 'drag') {
        this.isPanning = true;
        this.panStartPt = { x: e.clientX - this.panX, y: e.clientY - this.panY };
        this.container.style.cursor = 'grabbing';
      }
    });

    // Double click to recenter view when Drag tool is active or Space is held
    this.container.addEventListener('dblclick', () => {
      if (this.activeTool?.id === 'drag' || this.isSpacePressed) {
        this.fitToViewport();
      }
    });

    window.addEventListener('pointermove', (e: PointerEvent) => {
      this.onPointerMove(e);
    });

    window.addEventListener('pointerup', (e: PointerEvent) => {
      this.onPointerUp(e);
    });

    window.addEventListener('pointercancel', (e: PointerEvent) => {
      this.onPointerUp(e);
    });

    // Mouse wheel / trackpad scroll: smooth proportional zoom centered on cursor
    this.container.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        if (e.deltaY === 0) return;

        // Normalize deltaY across pixel (0), line (1), and page (2) wheel modes
        const modeMultiplier = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
        const normalizedDelta = Math.max(-60, Math.min(60, e.deltaY * modeMultiplier));

        // Gentle exponential scale factor (~0.12% per pixel on trackpad, ~0.35% on pinch/ctrl)
        const sensitivity = e.ctrlKey ? 0.0035 : 0.0012;
        const zoomFactor = Math.exp(-normalizedDelta * sensitivity);
        const targetZoom = Math.max(0.1, Math.min(8.0, this.zoom * zoomFactor));
        const delta = targetZoom - this.zoom;

        this.zoomAt(delta, e.clientX, e.clientY);
      },
      { passive: false }
    );

    // Spacebar pan & Escape deselect
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

      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.isSpacePressed) {
          this.isSpacePressed = true;
          this.overlayCanvas.style.cursor = 'grab';
          this.container.style.cursor = 'grab';
        }
        return;
      }

      if (e.key === 'Escape' && this.activeTool instanceof SelectionTool) {
        e.preventDefault();
        this.activeTool.deselect(this);
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        if (!this.isPanning) {
          this.overlayCanvas.style.cursor = this.activeTool.cursor;
          this.container.style.cursor = this.activeTool?.id === 'drag' ? 'grab' : 'default';
        }
      }
    });

    window.addEventListener('blur', () => {
      this.isSpacePressed = false;
      if (!this.isPanning) {
        this.overlayCanvas.style.cursor = this.activeTool.cursor;
        this.container.style.cursor = this.activeTool?.id === 'drag' ? 'grab' : 'default';
      }
    });

    if (typeof ResizeObserver !== 'undefined') {
      let lastWidth = 0;
      let lastHeight = 0;
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          const h = Math.round(entry.contentRect.height);
          if (w > 0 && h > 0 && (w !== lastWidth || h !== lastHeight)) {
            if (lastWidth === 0 || lastHeight === 0) {
              lastWidth = w;
              lastHeight = h;
              this.fitToViewport();
            } else {
              this.panX += Math.round((w - lastWidth) / 2);
              this.panY += Math.round((h - lastHeight) / 2);
              lastWidth = w;
              lastHeight = h;
              this.applyTransform();
            }
          }
        }
      });
      ro.observe(this.container);
    }
  }
}
