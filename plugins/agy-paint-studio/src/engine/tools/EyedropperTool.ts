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

export class EyedropperTool extends BaseTool {
  private isPicking = false;
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    super('eyedropper', 'Eyedropper', 'crosshair');
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    this.isPicking = true;
    this.pickColor(engine, pt);
  }

  onPointerMove(engine: CanvasEngine, pt: Point): void {
    if (!this.isPicking) return;
    this.pickColor(engine, pt);
  }

  onPointerUp(): void {
    this.isPicking = false;
  }

  deactivate(): void {
    this.isPicking = false;
  }

  private pickColor(engine: CanvasEngine, pt: Point): void {
    const ix = Math.floor(pt.x);
    const iy = Math.floor(pt.y);

    if (ix < 0 || ix >= engine.width || iy < 0 || iy >= engine.height) return;

    const ctx = this.getSampleContext();
    ctx.clearRect(0, 0, 1, 1);

    for (const layer of engine.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1.0, Math.max(0.0, layer.opacity));
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(layer.canvas, ix, iy, 1, 1, 0, 0, 1, 1);
      ctx.restore();
    }

    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    if (pixel[3] === 0) {
      return;
    }

    const hex = this.rgbToHex(pixel[0], pixel[1], pixel[2]);
    engine.primaryColor = hex;
    engine.notifyColorChange(hex);
  }

  private getSampleContext(): CanvasRenderingContext2D {
    if (!this.sampleCanvas || !this.sampleCtx) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error('Failed to create 1x1 2D rendering context for EyedropperTool');
      }
      this.sampleCanvas = canvas;
      this.sampleCtx = ctx;
    }
    return this.sampleCtx;
  }

  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }
}
