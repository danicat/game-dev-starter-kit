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

export class EraserTool extends BaseTool {
  public size = 20;
  private isDrawing = false;
  private lastPt: Point | null = null;
  private cursorPt: Point | null = null;
  private strokeBaseImageData: ImageData | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    super('eraser', 'Eraser', 'crosshair');
  }

  private getMaskContext(width: number, height: number): CanvasRenderingContext2D {
    if (!this.maskCanvas || !this.maskCtx) {
      this.maskCanvas = document.createElement('canvas');
      const ctx = this.maskCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to create 2D context for EraserTool mask canvas.');
      }
      this.maskCtx = ctx;
    }
    if (this.maskCanvas.width !== width || this.maskCanvas.height !== height) {
      this.maskCanvas.width = width;
      this.maskCanvas.height = height;
    }
    return this.maskCtx;
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    this.isDrawing = true;
    this.lastPt = pt;
    this.cursorPt = pt;
    this.strokeBaseImageData = layer.ctx.getImageData(0, 0, engine.width, engine.height);

    const eraserSize = Math.max(1, this.size);
    const mCtx = this.getMaskContext(engine.width, engine.height);
    mCtx.clearRect(0, 0, engine.width, engine.height);

    mCtx.save();
    mCtx.globalAlpha = 1.0;
    mCtx.fillStyle = '#000000';
    mCtx.beginPath();
    mCtx.arc(pt.x, pt.y, Math.max(0.5, eraserSize / 2), 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();

    this.applyErasePreview(engine, layer);
  }

  onPointerMove(engine: CanvasEngine, pt: Point): void {
    this.cursorPt = pt;
    if (!this.isDrawing || !this.lastPt) {
      engine.renderOverlay();
      return;
    }
    const layer = engine.getActiveLayer();
    if (!layer || !layer.visible || layer.locked) return;

    const eraserSize = Math.max(1, this.size);
    const mCtx = this.getMaskContext(engine.width, engine.height);
    mCtx.save();
    mCtx.globalAlpha = 1.0;
    mCtx.strokeStyle = '#000000';
    mCtx.lineWidth = eraserSize;
    mCtx.lineCap = 'round';
    mCtx.lineJoin = 'round';

    mCtx.beginPath();
    mCtx.moveTo(this.lastPt.x, this.lastPt.y);
    mCtx.lineTo(pt.x, pt.y);
    mCtx.stroke();
    mCtx.restore();

    this.lastPt = pt;
    this.applyErasePreview(engine, layer);
  }

  onPointerUp(engine: CanvasEngine): void {
    if (this.isDrawing) {
      this.finishStroke(engine);
    }
  }

  deactivate(engine: CanvasEngine): void {
    this.cursorPt = null;
    if (this.isDrawing) {
      this.finishStroke(engine);
    } else {
      this.lastPt = null;
      this.strokeBaseImageData = null;
      if (this.maskCtx && this.maskCanvas) {
        this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
      }
    }
  }

  public renderOverlay(_engine: CanvasEngine, ctx: CanvasRenderingContext2D): void {
    const pt = this.cursorPt || this.lastPt;
    if (!pt) return;
    const radius = Math.max(1, this.size / 2);
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private applyErasePreview(engine: CanvasEngine, layer: Layer): void {
    if (!this.maskCanvas) return;
    if (this.strokeBaseImageData) {
      layer.ctx.putImageData(this.strokeBaseImageData, 0, 0);
    }
    const opacity = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = 'destination-out';
    layer.ctx.globalAlpha = opacity;
    layer.ctx.drawImage(this.maskCanvas, 0, 0);
    layer.ctx.restore();
    layer.markDirty();
    engine.render();
  }

  private finishStroke(engine: CanvasEngine): void {
    this.isDrawing = false;
    this.lastPt = null;
    this.strokeBaseImageData = null;
    if (this.maskCtx && this.maskCanvas) {
      this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    }
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.render();
    engine.commitHistory();
  }
}
