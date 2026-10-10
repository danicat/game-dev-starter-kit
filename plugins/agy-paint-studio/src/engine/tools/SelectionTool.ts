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
import type { Layer } from '../Layer.ts';

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class SelectionTool extends BaseTool {
  public selection: SelectionRect | null = null;
  private isSelecting = false;
  private isMoving = false;
  private startPt: Point | null = null;
  private moveStartPt: Point | null = null;
  private floatingCanvas: HTMLCanvasElement | null = null;
  private floatingPos: Point | null = null;
  private animFrameId: number | null = null;
  private dashOffset = 0;
  private activeEngine: CanvasEngine | null = null;
  public static clipboardData: ImageData | null = null;

  constructor() {
    super('select', 'Selection & Cut', 'crosshair');
  }

  public get selectionRect(): SelectionRect | null {
    return this.selection;
  }

  public set selectionRect(rect: SelectionRect | null) {
    this.selection = rect;
  }

  public get clipboard(): ImageData | null {
    return SelectionTool.clipboardData;
  }

  public set clipboard(data: ImageData | null) {
    SelectionTool.clipboardData = data;
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    this.activeEngine = engine;

    // Check if clicked inside existing selection to move it
    if (this.selection && this.isPointInside(pt, this.selection)) {
      this.isMoving = true;
      this.moveStartPt = pt;

      // If we don't have a floating canvas yet, lift the pixels from active layer
      if (!this.floatingCanvas) {
        this.liftSelection(layer);
        engine.render();
      }
      return;
    }

    // Otherwise, if we were moving a floating selection, commit it before starting new selection
    if (this.floatingCanvas) {
      this.commitFloating(engine);
    }

    // Start new selection marquee
    this.isSelecting = true;
    this.startPt = pt;
    this.selection = {
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      width: 0,
      height: 0
    };
    this.stopMarchingAnts();
    engine.renderOverlay();
  }

  onPointerMove(engine: CanvasEngine, pt: Point): void {
    this.activeEngine = engine;

    if (this.isSelecting && this.startPt) {
      const x = Math.min(this.startPt.x, pt.x);
      const y = Math.min(this.startPt.y, pt.y);
      const width = Math.abs(pt.x - this.startPt.x);
      const height = Math.abs(pt.y - this.startPt.y);

      this.selection = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
      };
      if (this.selection.width >= 2 && this.selection.height >= 2) {
        this.startMarchingAnts(engine);
      } else {
        this.stopMarchingAnts();
      }
      engine.renderOverlay();
    } else if (this.isMoving && this.moveStartPt && this.selection && this.floatingPos) {
      const layer = this.getWritableActiveLayer(engine);
      if (!layer) {
        this.isMoving = false;
        this.moveStartPt = null;
        return;
      }

      const dx = pt.x - this.moveStartPt.x;
      const dy = pt.y - this.moveStartPt.y;

      this.selection.x = Math.round(this.floatingPos.x + dx);
      this.selection.y = Math.round(this.floatingPos.y + dy);
      engine.renderOverlay();
    }
  }

  onPointerUp(engine: CanvasEngine): void {
    this.activeEngine = engine;

    if (this.isSelecting) {
      this.isSelecting = false;
      this.startPt = null;
      if (!this.selection || this.selection.width < 2 || this.selection.height < 2) {
        this.selection = null;
        this.stopMarchingAnts();
      } else {
        this.startMarchingAnts(engine);
      }
      engine.renderOverlay();
    } else if (this.isMoving) {
      this.isMoving = false;
      if (this.selection) {
        this.floatingPos = { x: this.selection.x, y: this.selection.y };
      }
      this.moveStartPt = null;
      engine.renderOverlay();
    }
  }

  private isPointInside(pt: Point, rect: SelectionRect): boolean {
    return (
      pt.x >= rect.x &&
      pt.x <= rect.x + rect.width &&
      pt.y >= rect.y &&
      pt.y <= rect.y + rect.height
    );
  }

  private startMarchingAnts(engine: CanvasEngine): void {
    this.activeEngine = engine;
    if (this.animFrameId !== null || typeof requestAnimationFrame === 'undefined') {
      return;
    }

    const tick = () => {
      if (!this.selectionRect || this.selectionRect.width <= 0 || this.selectionRect.height <= 0) {
        this.animFrameId = null;
        return;
      }
      this.dashOffset = (this.dashOffset + 0.5) % 8;
      if (this.activeEngine && this.activeEngine.activeTool === this) {
        this.activeEngine.renderOverlay();
      }
      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopMarchingAnts(): void {
    if (this.animFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
    }
    this.animFrameId = null;
  }

  private liftSelection(layer: Layer): void {
    if (!this.selection || this.selection.width <= 0 || this.selection.height <= 0) return;

    this.floatingCanvas = document.createElement('canvas');
    this.floatingCanvas.width = this.selection.width;
    this.floatingCanvas.height = this.selection.height;
    const fCtx = this.floatingCanvas.getContext('2d');
    if (!fCtx) {
      throw new Error('Failed to create 2D rendering context for floating selection canvas.');
    }

    // Copy selected pixels to floating canvas
    fCtx.drawImage(
      layer.canvas,
      this.selection.x, this.selection.y, this.selection.width, this.selection.height,
      0, 0, this.selection.width, this.selection.height
    );

    // Clear pixels from layer
    layer.ctx.save();
    layer.ctx.clearRect(this.selection.x, this.selection.y, this.selection.width, this.selection.height);
    layer.ctx.restore();
    layer.markDirty();

    this.floatingPos = { x: this.selection.x, y: this.selection.y };
  }

  public commitFloating(engine: CanvasEngine): void {
    if (!this.floatingCanvas || !this.selection) return;

    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    layer.ctx.save();
    layer.ctx.drawImage(this.floatingCanvas, this.selection.x, this.selection.y);
    layer.ctx.restore();
    layer.markDirty();

    this.floatingCanvas = null;
    this.floatingPos = null;

    engine.render();
    engine.commitHistory();
  }

  public cut(engine: CanvasEngine): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;
    if (!this.selection || this.selection.width <= 0 || this.selection.height <= 0) return;

    if (this.floatingCanvas) {
      const fCtx = this.floatingCanvas.getContext('2d');
      if (!fCtx) {
        throw new Error('Failed to obtain 2D context from floating selection canvas during cut.');
      }
      this.clipboard = fCtx.getImageData(
        0, 0, this.floatingCanvas.width, this.floatingCanvas.height
      );
      this.floatingCanvas = null;
      this.floatingPos = null;
    } else {
      const imgData = layer.ctx.getImageData(
        this.selection.x, this.selection.y, this.selection.width, this.selection.height
      );
      this.clipboard = imgData;
      layer.ctx.clearRect(this.selection.x, this.selection.y, this.selection.width, this.selection.height);
      layer.markDirty();
    }

    this.selection = null;
    this.isSelecting = false;
    this.isMoving = false;
    this.stopMarchingAnts();

    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.render();
    engine.commitHistory();
  }

  public copy(engine: CanvasEngine): void {
    const layer = engine.getActiveLayer();
    if (!layer || !this.selection || this.selection.width <= 0 || this.selection.height <= 0) return;

    if (this.floatingCanvas) {
      const fCtx = this.floatingCanvas.getContext('2d');
      if (!fCtx) {
        throw new Error('Failed to obtain 2D context from floating selection canvas during copy.');
      }
      this.clipboard = fCtx.getImageData(0, 0, this.floatingCanvas.width, this.floatingCanvas.height);
    } else {
      this.clipboard = layer.ctx.getImageData(
        this.selection.x, this.selection.y, this.selection.width, this.selection.height
      );
    }
  }

  public paste(engine: CanvasEngine): void {
    if (!this.clipboard) return;
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    // Commit any existing floating selection without creating a duplicate history entry if nothing was floating
    this.deselect(engine);

    const clip = this.clipboard;
    const floating = document.createElement('canvas');
    floating.width = clip.width;
    floating.height = clip.height;
    const fCtx = floating.getContext('2d');
    if (!fCtx) {
      throw new Error('Failed to create 2D rendering context for pasted floating selection.');
    }
    fCtx.putImageData(clip, 0, 0);

    const pasteX = Math.max(0, Math.min(20, engine.width - clip.width));
    const pasteY = Math.max(0, Math.min(20, engine.height - clip.height));

    this.floatingCanvas = floating;
    this.floatingPos = { x: pasteX, y: pasteY };
    this.selection = {
      x: pasteX,
      y: pasteY,
      width: clip.width,
      height: clip.height
    };

    this.startMarchingAnts(engine);
    engine.renderOverlay();
  }

  public deleteSelection(engine: CanvasEngine): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer || !this.selection) return;

    if (this.floatingCanvas) {
      this.floatingCanvas = null;
      this.floatingPos = null;
    } else {
      layer.ctx.clearRect(this.selection.x, this.selection.y, this.selection.width, this.selection.height);
      layer.markDirty();
    }

    this.selection = null;
    this.isSelecting = false;
    this.isMoving = false;
    this.stopMarchingAnts();

    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.render();
    engine.commitHistory();
  }

  public deselect(engine: CanvasEngine): void {
    if (this.floatingCanvas) {
      this.commitFloating(engine);
    }
    this.selection = null;
    this.floatingCanvas = null;
    this.floatingPos = null;
    this.isSelecting = false;
    this.isMoving = false;
    this.startPt = null;
    this.moveStartPt = null;
    this.stopMarchingAnts();
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
  }

  public renderOverlay(_engine: CanvasEngine, ctx: CanvasRenderingContext2D): void {
    if (this.floatingCanvas && this.selection) {
      ctx.save();
      ctx.drawImage(this.floatingCanvas, this.selection.x, this.selection.y);
      ctx.restore();
    }

    if (!this.selection || this.selection.width <= 0 || this.selection.height <= 0) {
      this.stopMarchingAnts();
      return;
    }

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -this.dashOffset;
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.selection.x + 0.5, this.selection.y + 0.5, this.selection.width, this.selection.height);

    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = 4 - this.dashOffset;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.selection.x + 0.5, this.selection.y + 0.5, this.selection.width, this.selection.height);
    ctx.restore();
  }

  deactivate(engine: CanvasEngine): void {
    this.deselect(engine);
  }
}
