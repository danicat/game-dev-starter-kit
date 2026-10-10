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
  private isDrawing = false;
  private lastPt: Point | null = null;
  private strokeBaseImageData: ImageData | null = null;

  constructor() {
    super('eraser', 'Eraser', 'crosshair');
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    this.isDrawing = true;
    this.lastPt = pt;
    this.strokeBaseImageData = layer.ctx.getImageData(0, 0, engine.width, engine.height);

    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.overlayCanvas.style.opacity = '0';

    const mCtx = engine.overlayCtx;
    mCtx.save();
    mCtx.globalAlpha = 1.0;
    mCtx.fillStyle = '#000000';
    mCtx.beginPath();
    mCtx.arc(pt.x, pt.y, Math.max(0.5, engine.brushSize / 2), 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();

    this.applyErasePreview(engine, layer);
  }

  onPointerMove(engine: CanvasEngine, pt: Point): void {
    if (!this.isDrawing || !this.lastPt) return;
    const layer = engine.getActiveLayer();
    if (!layer || !layer.visible || layer.locked) return;

    const mCtx = engine.overlayCtx;
    mCtx.save();
    mCtx.globalAlpha = 1.0;
    mCtx.strokeStyle = '#000000';
    mCtx.lineWidth = Math.max(1, engine.brushSize);
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
    if (this.isDrawing) {
      this.finishStroke(engine);
    } else {
      this.lastPt = null;
      this.strokeBaseImageData = null;
      engine.overlayCanvas.style.opacity = '1';
    }
  }

  private applyErasePreview(engine: CanvasEngine, layer: Layer): void {
    if (this.strokeBaseImageData) {
      layer.ctx.putImageData(this.strokeBaseImageData, 0, 0);
    }
    const opacity = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
    layer.ctx.save();
    layer.ctx.globalCompositeOperation = 'destination-out';
    layer.ctx.globalAlpha = opacity;
    layer.ctx.drawImage(engine.overlayCanvas, 0, 0);
    layer.ctx.restore();
    layer.markDirty();
    engine.render();
  }

  private finishStroke(engine: CanvasEngine): void {
    this.isDrawing = false;
    this.lastPt = null;
    this.strokeBaseImageData = null;
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.overlayCanvas.style.opacity = '1';
    engine.render();
    engine.commitHistory();
  }
}
