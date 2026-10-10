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
  detectActiveViewportBounds,
  type ViewportCropBounds
} from './GifEncoder.ts';

export type AnnotationTool = 'pen' | 'arrow' | 'box' | 'text';

export interface Point2D {
  x: number;
  y: number;
}

export interface PenAnnotationShape {
  id: string;
  type: 'pen';
  color: string;
  strokeWidth: number;
  points: Point2D[];
}

export interface ArrowAnnotationShape {
  id: string;
  type: 'arrow';
  color: string;
  strokeWidth: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface BoxAnnotationShape {
  id: string;
  type: 'box';
  color: string;
  strokeWidth: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextAnnotationShape {
  id: string;
  type: 'text';
  color: string;
  x: number;
  y: number;
  text: string;
}

export type AnnotationShape =
  | PenAnnotationShape
  | ArrowAnnotationShape
  | BoxAnnotationShape
  | TextAnnotationShape;

export const QA_COLOR_SWATCHES = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Yellow', hex: '#FACC15' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Lime', hex: '#22C55E' },
  { name: 'White', hex: '#FFFFFF' }
] as const;

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(239, 68, 68, ${alpha})`;
}

function cloneShape(shape: AnnotationShape): AnnotationShape {
  if (shape.type === 'pen') {
    return {
      ...shape,
      points: shape.points.map((p) => ({ x: p.x, y: p.y }))
    };
  }
  return { ...shape };
}

function cloneShapeList(shapes: AnnotationShape[]): AnnotationShape[] {
  return shapes.map(cloneShape);
}

export interface BugAnnotatorOptions {
  baseCanvas?: HTMLCanvasElement | null;
  overlayCanvas?: HTMLCanvasElement | null;
  width?: number;
  height?: number;
  onHistoryChange?: () => void;
}

export class BugAnnotator {
  public baseCanvas: HTMLCanvasElement | null;
  public overlayCanvas: HTMLCanvasElement | null;
  public onHistoryChange: (() => void) | null;

  private activeTool: AnnotationTool = 'box';
  private activeColor: string = QA_COLOR_SWATCHES[0].hex;
  private strokeWidth = 3;

  private shapes: AnnotationShape[] = [];
  private undoStack: AnnotationShape[][] = [];
  private redoStack: AnnotationShape[][] = [];

  private isDrawing = false;
  private draftShape: AnnotationShape | null = null;
  private shapeCounter = 0;
  private activeTextInputEl: HTMLInputElement | null = null;

  private width: number;
  private height: number;
  private hasBaseSnapshot = false;

  constructor(options: BugAnnotatorOptions = {}) {
    this.baseCanvas = options.baseCanvas ?? null;
    this.overlayCanvas = options.overlayCanvas ?? null;
    this.onHistoryChange = options.onHistoryChange ?? null;
    this.width = options.width ?? (this.baseCanvas?.width || 640);
    this.height = options.height ?? (this.baseCanvas?.height || 360);

    if (this.baseCanvas) {
      this.baseCanvas.width = this.width;
      this.baseCanvas.height = this.height;
    }
    if (this.overlayCanvas) {
      this.overlayCanvas.width = this.width;
      this.overlayCanvas.height = this.height;
      this.bindPointerEvents(this.overlayCanvas);
    }
  }

  public getTool(): AnnotationTool {
    return this.activeTool;
  }

  public setTool(tool: AnnotationTool): void {
    this.commitOrCloseActiveTextInput();
    this.activeTool = tool;
  }

  public getColor(): string {
    return this.activeColor;
  }

  public setColor(color: string): void {
    if (!color || typeof color !== 'string') {
      throw new Error('[BugAnnotator] Invalid color value.');
    }
    this.activeColor = color;
  }

  public getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public setDimensions(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error(`[BugAnnotator] Invalid dimensions: ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    if (this.baseCanvas && (this.baseCanvas.width !== width || this.baseCanvas.height !== height)) {
      this.baseCanvas.width = width;
      this.baseCanvas.height = height;
    }
    if (
      this.overlayCanvas &&
      (this.overlayCanvas.width !== width || this.overlayCanvas.height !== height)
    ) {
      this.overlayCanvas.width = width;
      this.overlayCanvas.height = height;
    }
    this.renderOverlay();
  }

  public getShapes(): AnnotationShape[] {
    return cloneShapeList(this.shapes);
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public addShape(shape: AnnotationShape): void {
    this.undoStack.push(cloneShapeList(this.shapes));
    this.redoStack = [];
    this.shapes.push(cloneShape(shape));
    this.renderOverlay();
    this.notifyHistoryChange();
  }

  public addTextAnnotation(x: number, y: number, text: string): TextAnnotationShape | null {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    const shape: TextAnnotationShape = {
      id: this.nextShapeId(),
      type: 'text',
      color: this.activeColor,
      x: Math.round(x),
      y: Math.round(y),
      text: trimmed
    };
    this.addShape(shape);
    return shape;
  }

  public undo(): boolean {
    if (this.undoStack.length === 0) {
      return false;
    }
    this.commitOrCloseActiveTextInput();
    this.redoStack.push(cloneShapeList(this.shapes));
    const prev = this.undoStack.pop()!;
    this.shapes = cloneShapeList(prev);
    this.renderOverlay();
    this.notifyHistoryChange();
    return true;
  }

  public redo(): boolean {
    if (this.redoStack.length === 0) {
      return false;
    }
    this.commitOrCloseActiveTextInput();
    this.undoStack.push(cloneShapeList(this.shapes));
    const next = this.redoStack.pop()!;
    this.shapes = cloneShapeList(next);
    this.renderOverlay();
    this.notifyHistoryChange();
    return true;
  }

  public clearAnnotations(): void {
    this.commitOrCloseActiveTextInput();
    if (this.shapes.length === 0) {
      return;
    }
    this.undoStack.push(cloneShapeList(this.shapes));
    this.redoStack = [];
    this.shapes = [];
    this.draftShape = null;
    this.renderOverlay();
    this.notifyHistoryChange();
  }

  public resetHistory(): void {
    this.commitOrCloseActiveTextInput();
    this.shapes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.draftShape = null;
    this.renderOverlay();
    this.notifyHistoryChange();
  }

  /**
   * Synchronously copies a source canvas onto the base frozen-frame canvas.
   */
  public loadBaseFromCanvas(sourceCanvas: HTMLCanvasElement): void {
    if (!this.baseCanvas) {
      throw new Error('[BugAnnotator] No baseCanvas configured to receive snapshot.');
    }
    if (sourceCanvas.width > 0 && sourceCanvas.height > 0) {
      this.setDimensions(sourceCanvas.width, sourceCanvas.height);
    }
    const ctx = this.baseCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('[BugAnnotator] Failed to acquire 2D context on baseCanvas.');
    }
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(sourceCanvas, 0, 0, this.width, this.height);
    this.hasBaseSnapshot = true;
    this.renderOverlay();
  }

  /**
   * Loads a DVR frame data URL (`data:image/png;base64,...`) onto the base frozen-frame canvas.
   */
  public loadBaseFrameDataUrl(
    dataUrl: string,
    width?: number,
    height?: number
  ): Promise<void> {
    if (!this.baseCanvas) {
      throw new Error('[BugAnnotator] No baseCanvas configured to load frame data URL.');
    }
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      throw new Error('[BugAnnotator] Invalid image dataUrl passed to loadBaseFrameDataUrl.');
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const targetW = width && width > 0 ? width : img.naturalWidth || this.width;
        const targetH = height && height > 0 ? height : img.naturalHeight || this.height;
        this.setDimensions(targetW, targetH);
        const ctx = this.baseCanvas!.getContext('2d');
        if (!ctx) {
          reject(new Error('[BugAnnotator] Failed to acquire 2D context on baseCanvas.'));
          return;
        }
        ctx.clearRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);
        this.hasBaseSnapshot = true;
        this.renderOverlay();
        resolve();
      };
      img.onerror = () => {
        reject(new Error('[BugAnnotator] Failed to decode DVR frame dataUrl into Image.'));
      };
      img.src = dataUrl;
    });
  }

  public hasFrozenFrame(): boolean {
    return this.hasBaseSnapshot;
  }

  /**
   * Renders all committed shapes + active draft shape onto the overlay canvas.
   */
  public renderOverlay(): void {
    if (!this.overlayCanvas) {
      return;
    }
    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    for (const shape of this.shapes) {
      this.renderShape(ctx, shape);
    }
    if (this.draftShape) {
      this.renderShape(ctx, this.draftShape);
    }
  }

  /**
   * Renders a single AnnotationShape onto any 2D canvas context.
   */
  public renderShape(ctx: CanvasRenderingContext2D, shape: AnnotationShape): void {
    ctx.save();

    if (shape.type === 'pen') {
      if (shape.points.length > 0) {
        // Dark contrast halo for visibility on any game background
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = shape.strokeWidth + 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        if (shape.points.length === 1) {
          ctx.lineTo(shape.points[0].x + 0.5, shape.points[0].y + 0.5);
        }
        ctx.stroke();

        // Main colored stroke
        ctx.beginPath();
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
          ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        if (shape.points.length === 1) {
          ctx.lineTo(shape.points[0].x + 0.5, shape.points[0].y + 0.5);
        }
        ctx.stroke();
      }
    } else if (shape.type === 'arrow') {
      const dx = shape.endX - shape.startX;
      const dy = shape.endY - shape.startY;
      const len = Math.hypot(dx, dy);
      if (len >= 2) {
        const angle = Math.atan2(dy, dx);
        const headLength = Math.max(12, shape.strokeWidth * 4.5);
        const headAngle = Math.PI / 6.5;

        const x1 = shape.endX - headLength * Math.cos(angle - headAngle);
        const y1 = shape.endY - headLength * Math.sin(angle - headAngle);
        const x2 = shape.endX - headLength * Math.cos(angle + headAngle);
        const y2 = shape.endY - headLength * Math.sin(angle + headAngle);

        // Dark outer shaft halo
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.lineWidth = shape.strokeWidth + 2.5;
        ctx.lineCap = 'round';
        ctx.moveTo(shape.startX, shape.startY);
        ctx.lineTo(shape.endX - headLength * 0.55 * Math.cos(angle), shape.endY - headLength * 0.55 * Math.sin(angle));
        ctx.stroke();

        // Colored shaft
        ctx.beginPath();
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineCap = 'round';
        ctx.moveTo(shape.startX, shape.startY);
        ctx.lineTo(shape.endX - headLength * 0.55 * Math.cos(angle), shape.endY - headLength * 0.55 * Math.sin(angle));
        ctx.stroke();

        // Filled triangular arrowhead with dark border
        ctx.beginPath();
        ctx.moveTo(shape.endX, shape.endY);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.fillStyle = shape.color;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fill();
      }
    } else if (shape.type === 'box') {
      const rx = shape.width >= 0 ? shape.x : shape.x + shape.width;
      const ry = shape.height >= 0 ? shape.y : shape.y + shape.height;
      const rw = Math.abs(shape.width);
      const rh = Math.abs(shape.height);
      if (rw >= 1 || rh >= 1) {
        // Subtle translucent fill
        ctx.fillStyle = hexToRgba(shape.color, 0.14);
        ctx.fillRect(rx, ry, rw, rh);

        // Contrast outer border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = shape.strokeWidth + 2;
        ctx.strokeRect(rx, ry, rw, rh);

        // Crisp colored border
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.strokeWidth;
        ctx.strokeRect(rx, ry, rw, rh);
      }
    } else if (shape.type === 'text') {
      const font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.font = font;
      const metrics = ctx.measureText(shape.text);
      const padX = 8;
      const padY = 5;
      const pillW = Math.ceil(metrics.width) + padX * 2;
      const pillH = 24;
      const pillX = Math.max(4, Math.min(this.width - pillW - 4, shape.x));
      const pillY = Math.max(4, Math.min(this.height - pillH - 4, shape.y - pillH / 2));

      // Pill background
      ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 2;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(pillX, pillY, pillW, pillH, 6);
      } else {
        ctx.rect(pillX, pillY, pillW, pillH);
      }
      ctx.fill();
      ctx.stroke();

      // Label text
      ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'middle';
      ctx.fillText(shape.text, pillX + padX, pillY + pillH / 2 + padY * 0.05);
    }

    ctx.restore();
  }

  /**
   * Composites the underlying frozen game frame (`baseCanvas`) and all active `AnnotationShape`s
   * onto an offscreen canvas and returns a crisp `image/png` data URL.
   */
  public exportCompositeDataUrl(
    customOffscreenCanvas?: HTMLCanvasElement
  ): string {
    const outCanvas =
      customOffscreenCanvas ??
      (typeof document !== 'undefined' ? document.createElement('canvas') : null);

    if (!outCanvas) {
      throw new Error(
        '[BugAnnotator] Cannot export composite image without a DOM document or customOffscreenCanvas.'
      );
    }

    outCanvas.width = this.width;
    outCanvas.height = this.height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('[BugAnnotator] Failed to acquire 2D context for composite export.');
    }

    // 1. Draw underlying frozen game frame if available
    if (this.baseCanvas) {
      ctx.drawImage(this.baseCanvas, 0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. Render all active vector/stroke annotations on top
    for (const shape of this.shapes) {
      this.renderShape(ctx, shape);
    }

    return outCanvas.toDataURL('image/png');
  }

  /**
   * Computes a smart composite PNG export that:
   * 1. Crops out empty letterbox/pillarbox space if no annotations were drawn in it (true-to-resolution screenshot).
   * 2. Expands the crop bounds if and only if annotations extend into the empty scratch space.
   */
  public exportSmartComposite(
    customOffscreenCanvas?: HTMLCanvasElement
  ): {
    dataUrl: string;
    width: number;
    height: number;
    crop: ViewportCropBounds;
  } {
    const outCanvas =
      customOffscreenCanvas ??
      (typeof document !== 'undefined' ? document.createElement('canvas') : null);

    if (!outCanvas) {
      throw new Error(
        '[BugAnnotator] Cannot export composite image without a DOM document or customOffscreenCanvas.'
      );
    }

    let gameBounds: ViewportCropBounds = {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height
    };

    if (this.baseCanvas && typeof this.baseCanvas.getContext === 'function') {
      const baseCtx = this.baseCanvas.getContext('2d');
      if (baseCtx && typeof baseCtx.getImageData === 'function') {
        const baseData = baseCtx.getImageData(0, 0, this.width, this.height);
        gameBounds = detectActiveViewportBounds(baseData.data, this.width, this.height);
      }
    }

    const annBounds = getAnnotationShapesBounds(this.shapes, this.width, this.height);
    const crop = unionViewportAndAnnotationBounds(
      gameBounds,
      annBounds,
      this.width,
      this.height
    );

    outCanvas.width = crop.width;
    outCanvas.height = crop.height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('[BugAnnotator] Failed to acquire 2D context for smart composite export.');
    }

    // Fill studio dark background so any scratch-space margin with annotations is legible
    if (
      typeof ctx.fillRect === 'function' &&
      (crop.x < gameBounds.x ||
        crop.y < gameBounds.y ||
        crop.x + crop.width > gameBounds.x + gameBounds.width ||
        crop.y + crop.height > gameBounds.y + gameBounds.height ||
        !this.baseCanvas)
    ) {
      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, crop.width, crop.height);
    }

    if (this.baseCanvas) {
      if (crop.x === 0 && crop.y === 0 && crop.width === this.width && crop.height === this.height) {
        ctx.drawImage(this.baseCanvas, 0, 0, this.width, this.height);
      } else {
        ctx.drawImage(
          this.baseCanvas,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          crop.width,
          crop.height
        );
      }
    }

    const needsTranslate = (crop.x !== 0 || crop.y !== 0) && typeof ctx.translate === 'function';
    if (needsTranslate) {
      ctx.save();
      ctx.translate(-crop.x, -crop.y);
    }
    for (const shape of this.shapes) {
      this.renderShape(ctx, shape);
    }
    if (needsTranslate) {
      ctx.restore();
    }

    return {
      dataUrl: outCanvas.toDataURL('image/png'),
      width: crop.width,
      height: crop.height,
      crop
    };
  }

  private bindPointerEvents(canvas: HTMLCanvasElement): void {
    const toCanvasCoords = (e: PointerEvent): Point2D => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
      const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    };

    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) {
        return;
      }
      e.preventDefault();
      const pt = toCanvasCoords(e);

      if (this.activeTool === 'text') {
        this.openInlineTextInput(pt.x, pt.y, e.clientX, e.clientY);
        return;
      }

      this.commitOrCloseActiveTextInput();
      this.isDrawing = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if synthetic event in test environment
      }

      const id = this.nextShapeId();
      if (this.activeTool === 'pen') {
        this.draftShape = {
          id,
          type: 'pen',
          color: this.activeColor,
          strokeWidth: this.strokeWidth,
          points: [pt]
        };
      } else if (this.activeTool === 'arrow') {
        this.draftShape = {
          id,
          type: 'arrow',
          color: this.activeColor,
          strokeWidth: this.strokeWidth,
          startX: pt.x,
          startY: pt.y,
          endX: pt.x,
          endY: pt.y
        };
      } else if (this.activeTool === 'box') {
        this.draftShape = {
          id,
          type: 'box',
          color: this.activeColor,
          strokeWidth: this.strokeWidth,
          x: pt.x,
          y: pt.y,
          width: 0,
          height: 0
        };
      }
      this.renderOverlay();
    });

    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!this.isDrawing || !this.draftShape) {
        return;
      }
      const pt = toCanvasCoords(e);
      if (this.draftShape.type === 'pen') {
        this.draftShape.points.push(pt);
      } else if (this.draftShape.type === 'arrow') {
        this.draftShape.endX = pt.x;
        this.draftShape.endY = pt.y;
      } else if (this.draftShape.type === 'box') {
        this.draftShape.width = pt.x - this.draftShape.x;
        this.draftShape.height = pt.y - this.draftShape.y;
      }
      this.renderOverlay();
    });

    const finishPointer = (e: PointerEvent) => {
      if (!this.isDrawing || !this.draftShape) {
        return;
      }
      this.isDrawing = false;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }

      const finalized = this.draftShape;
      this.draftShape = null;

      // Ignore accidental zero-size clicks for pen/box/arrow
      if (finalized.type === 'pen') {
        let minPx = Infinity;
        let maxPx = -Infinity;
        let minPy = Infinity;
        let maxPy = -Infinity;
        for (const p of finalized.points) {
          if (p.x < minPx) minPx = p.x;
          if (p.x > maxPx) maxPx = p.x;
          if (p.y < minPy) minPy = p.y;
          if (p.y > maxPy) maxPy = p.y;
        }
        if (Math.hypot(maxPx - minPx, maxPy - minPy) < 3) {
          this.renderOverlay();
          return;
        }
      } else if (finalized.type === 'arrow') {
        const dist = Math.hypot(finalized.endX - finalized.startX, finalized.endY - finalized.startY);
        if (dist < 4) {
          this.renderOverlay();
          return;
        }
      } else if (finalized.type === 'box') {
        if (Math.abs(finalized.width) < 3 && Math.abs(finalized.height) < 3) {
          this.renderOverlay();
          return;
        }
      }

      this.addShape(finalized);
    };

    canvas.addEventListener('pointerup', finishPointer);
    canvas.addEventListener('pointercancel', finishPointer);
  }

  private openInlineTextInput(
    canvasX: number,
    canvasY: number,
    clientX: number,
    clientY: number
  ): void {
    this.commitOrCloseActiveTextInput();
    if (!this.overlayCanvas || !this.overlayCanvas.parentElement) {
      return;
    }

    const parent = this.overlayCanvas.parentElement;
    const parentRect = parent.getBoundingClientRect();

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'annotation-inline-text-input';
    input.placeholder = 'Type bug label & press Enter...';
    input.style.position = 'absolute';
    input.style.left = `${Math.max(8, Math.min(parentRect.width - 180, clientX - parentRect.left))}px`;
    input.style.top = `${Math.max(8, Math.min(parentRect.height - 34, clientY - parentRect.top - 14))}px`;
    input.style.zIndex = '50';
    input.style.background = 'rgba(9, 13, 22, 0.95)';
    input.style.color = '#FFFFFF';
    input.style.border = `2px solid ${this.activeColor}`;
    input.style.borderRadius = '6px';
    input.style.padding = '4px 8px';
    input.style.fontSize = '12px';
    input.style.fontWeight = '600';
    input.style.outline = 'none';
    input.style.minWidth = '160px';
    input.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.45)';

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const val = input.value.trim();
      if (input.parentElement) {
        input.remove();
      }
      if (this.activeTextInputEl === input) {
        this.activeTextInputEl = null;
      }
      if (val) {
        this.addTextAnnotation(canvasX, canvasY, val);
      }
    };

    const cancel = () => {
      if (committed) return;
      committed = true;
      if (input.parentElement) {
        input.remove();
      }
      if (this.activeTextInputEl === input) {
        this.activeTextInputEl = null;
      }
    };

    input.addEventListener('keydown', (ev: KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
      }
    });

    input.addEventListener('blur', () => {
      commit();
    });

    this.activeTextInputEl = input;
    parent.appendChild(input);
    requestAnimationFrame(() => input.focus());
  }

  private commitOrCloseActiveTextInput(): void {
    if (this.activeTextInputEl) {
      this.activeTextInputEl.blur();
      this.activeTextInputEl = null;
    }
  }

  private nextShapeId(): string {
    return `ann-${++this.shapeCounter}-${Date.now()}`;
  }

  private notifyHistoryChange(): void {
    if (this.onHistoryChange) {
      this.onHistoryChange();
    }
  }
}

/**
 * Computes the bounding box of all drawn `AnnotationShape`s on a `(canvasWidth x canvasHeight)` stage,
 * including stroke/arrowhead/pill padding and an optional safety margin. Returns `null` if no shapes exist.
 */
export function getAnnotationShapesBounds(
  shapes: AnnotationShape[],
  canvasWidth: number,
  canvasHeight: number,
  marginPx = 12
): ViewportCropBounds | null {
  if (!shapes || shapes.length === 0 || canvasWidth <= 0 || canvasHeight <= 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includeRect = (x1: number, y1: number, x2: number, y2: number, pad: number) => {
    const left = Math.min(x1, x2) - pad;
    const right = Math.max(x1, x2) + pad;
    const top = Math.min(y1, y2) - pad;
    const bottom = Math.max(y1, y2) + pad;
    if (left < minX) minX = left;
    if (top < minY) minY = top;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  };

  for (const shape of shapes) {
    if (shape.type === 'pen') {
      const pad = (shape.strokeWidth || 3) + 4 + marginPx;
      for (const pt of shape.points) {
        includeRect(pt.x, pt.y, pt.x, pt.y, pad);
      }
    } else if (shape.type === 'arrow') {
      const pad = Math.max(16, (shape.strokeWidth || 3) * 4.5) + marginPx;
      includeRect(shape.startX, shape.startY, shape.endX, shape.endY, pad);
    } else if (shape.type === 'box') {
      const pad = (shape.strokeWidth || 3) + 4 + marginPx;
      includeRect(
        shape.x,
        shape.y,
        shape.x + shape.width,
        shape.y + shape.height,
        pad
      );
    } else if (shape.type === 'text') {
      const estTextW = Math.ceil((shape.text || '').length * 8.5) + 16;
      const pillH = 24;
      const pillX = Math.max(4, Math.min(canvasWidth - estTextW - 4, shape.x));
      const pillY = Math.max(4, Math.min(canvasHeight - pillH - 4, shape.y - pillH / 2));
      includeRect(pillX, pillY, pillX + estTextW, pillY + pillH, 4 + marginPx);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  const clampedX = Math.max(0, Math.floor(minX));
  const clampedY = Math.max(0, Math.floor(minY));
  const clampedMaxX = Math.min(canvasWidth, Math.ceil(maxX));
  const clampedMaxY = Math.min(canvasHeight, Math.ceil(maxY));

  return {
    x: clampedX,
    y: clampedY,
    width: Math.max(1, clampedMaxX - clampedX),
    height: Math.max(1, clampedMaxY - clampedY)
  };
}

/**
 * Unions the active game viewport bounds with any annotation bounds.
 * - If no annotations exist (or all annotations lie inside the game viewport), returns `gameBounds`
 *   so the exported screenshot/GIF is 100% true to the game's resolution without padding.
 * - If annotations extend into the empty scratch space, expands the bounds just enough to include them.
 */
export function unionViewportAndAnnotationBounds(
  gameBounds: ViewportCropBounds,
  annotationBounds: ViewportCropBounds | null,
  maxWidth: number,
  maxHeight: number
): ViewportCropBounds {
  if (!annotationBounds) {
    return gameBounds;
  }

  const minX = Math.max(0, Math.min(gameBounds.x, annotationBounds.x));
  const minY = Math.max(0, Math.min(gameBounds.y, annotationBounds.y));
  const maxX = Math.min(
    maxWidth,
    Math.max(gameBounds.x + gameBounds.width, annotationBounds.x + annotationBounds.width)
  );
  const maxY = Math.min(
    maxHeight,
    Math.max(gameBounds.y + gameBounds.height, annotationBounds.y + annotationBounds.height)
  );

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

