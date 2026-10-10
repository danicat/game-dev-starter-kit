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

export class PencilTool extends BaseTool {
  private isDrawing = false;
  private lastPt: Point | null = null;

  constructor() {
    super('pencil', 'Pencil', 'crosshair');
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    const snappedPt: Point = { x: Math.floor(pt.x), y: Math.floor(pt.y) };
    this.isDrawing = true;
    this.lastPt = snappedPt;

    const opacity = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.overlayCanvas.style.opacity = String(opacity);

    const size = Math.max(1, Math.round(engine.brushSize));
    const ctx = engine.overlayCtx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = engine.primaryColor;
    const offset = Math.floor(size / 2);
    ctx.fillRect(snappedPt.x - offset, snappedPt.y - offset, size, size);
    ctx.restore();
  }

  onPointerMove(engine: CanvasEngine, pt: Point): void {
    if (!this.isDrawing || !this.lastPt) return;
    const layer = engine.getActiveLayer();
    if (!layer || !layer.visible || layer.locked) return;

    const snappedPt: Point = { x: Math.floor(pt.x), y: Math.floor(pt.y) };
    const size = Math.max(1, Math.round(engine.brushSize));
    const ctx = engine.overlayCtx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = engine.primaryColor;
    ctx.lineWidth = size;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    ctx.beginPath();
    ctx.moveTo(this.lastPt.x, this.lastPt.y);
    ctx.lineTo(snappedPt.x, snappedPt.y);
    ctx.stroke();
    ctx.restore();

    this.lastPt = snappedPt;
  }

  onPointerUp(engine: CanvasEngine): void {
    if (!this.isDrawing) return;
    this.finishStroke(engine);
  }

  deactivate(engine: CanvasEngine): void {
    if (this.isDrawing) {
      this.finishStroke(engine);
    } else {
      this.lastPt = null;
      engine.overlayCanvas.style.opacity = '1';
    }
  }

  private finishStroke(engine: CanvasEngine): void {
    this.isDrawing = false;
    this.lastPt = null;

    const layer = engine.getActiveLayer();
    if (layer && layer.visible && !layer.locked) {
      const opacity = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
      layer.ctx.save();
      layer.ctx.imageSmoothingEnabled = false;
      layer.ctx.globalAlpha = opacity;
      layer.ctx.drawImage(engine.overlayCanvas, 0, 0);
      layer.ctx.restore();
      layer.markDirty();
    }

    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.overlayCanvas.style.opacity = '1';
    engine.render();
    engine.commitHistory();
  }
}
