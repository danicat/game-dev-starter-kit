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

export class BrushTool extends BaseTool {
  private isDrawing = false;
  private points: Point[] = [];

  constructor() {
    super('brush', 'Brush', 'crosshair');
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    this.isDrawing = true;
    this.points = [pt];

    const opacity = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.overlayCanvas.style.opacity = String(opacity);

    const ctx = engine.overlayCtx;
    ctx.save();
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = engine.primaryColor;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(0.5, engine.brushSize / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  onPointerMove(engine: CanvasEngine, pt: Point): void {
    if (!this.isDrawing) return;
    const layer = engine.getActiveLayer();
    if (!layer || !layer.visible || layer.locked) return;

    this.points.push(pt);
    if (this.points.length < 2) return;

    const ctx = engine.overlayCtx;
    ctx.clearRect(0, 0, engine.width, engine.height);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = engine.primaryColor;
    ctx.lineWidth = Math.max(1, engine.brushSize);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(this.points[0].x, this.points[0].y);

    if (this.points.length === 2) {
      ctx.lineTo(this.points[1].x, this.points[1].y);
    } else {
      for (let i = 1; i < this.points.length - 1; i++) {
        const midX = (this.points[i].x + this.points[i + 1].x) / 2;
        const midY = (this.points[i].y + this.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(this.points[i].x, this.points[i].y, midX, midY);
      }
      const last = this.points[this.points.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  onPointerUp(engine: CanvasEngine): void {
    if (!this.isDrawing) return;
    this.finishStroke(engine);
  }

  deactivate(engine: CanvasEngine): void {
    if (this.isDrawing) {
      this.finishStroke(engine);
    } else {
      this.points = [];
      engine.overlayCanvas.style.opacity = '1';
    }
  }

  private finishStroke(engine: CanvasEngine): void {
    this.isDrawing = false;
    this.points = [];

    const layer = engine.getActiveLayer();
    if (layer && layer.visible && !layer.locked) {
      const opacity = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
      layer.ctx.save();
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
