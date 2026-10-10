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

export type ShapeType = 'line' | 'rectangle' | 'rect' | 'ellipse' | 'circle' | 'arrow';

export class ShapeTool extends BaseTool {
  public shapeType: ShapeType = 'rectangle';
  public fill = false;
  private isDrawing = false;
  private hasMoved = false;
  private isShiftDown = false;
  private startPt: Point | null = null;
  private currentPt: Point | null = null;

  constructor(shapeType: ShapeType = 'rectangle') {
    super('shape', 'Shapes', 'crosshair');
    this.shapeType = shapeType;
  }

  onPointerDown(engine: CanvasEngine, pt: Point, originalEvent?: MouseEvent | TouchEvent): void {
    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    this.isDrawing = true;
    this.hasMoved = false;
    this.isShiftDown = Boolean(originalEvent && 'shiftKey' in originalEvent && originalEvent.shiftKey);
    this.startPt = { x: pt.x, y: pt.y };
    this.currentPt = { x: pt.x, y: pt.y };
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
  }

  onPointerMove(engine: CanvasEngine, pt: Point, originalEvent?: MouseEvent | TouchEvent): void {
    if (!this.isDrawing || !this.startPt) return;

    this.isShiftDown = Boolean(originalEvent && 'shiftKey' in originalEvent && originalEvent.shiftKey);
    this.currentPt = this.constrainEndPoint(this.startPt, pt, this.isShiftDown);

    if (Math.hypot(this.currentPt.x - this.startPt.x, this.currentPt.y - this.startPt.y) >= 1) {
      this.hasMoved = true;
    }

    engine.renderOverlay();
  }

  onPointerUp(engine: CanvasEngine, pt?: Point, originalEvent?: MouseEvent | TouchEvent): void {
    if (!this.isDrawing || !this.startPt) {
      this.isDrawing = false;
      this.hasMoved = false;
      return;
    }

    const shiftKey =
      originalEvent && 'shiftKey' in originalEvent ? originalEvent.shiftKey : this.isShiftDown;
    const rawEnd = pt ?? this.currentPt ?? this.startPt;
    const endPt = this.constrainEndPoint(this.startPt, rawEnd, shiftKey);
    const distance = Math.hypot(endPt.x - this.startPt.x, endPt.y - this.startPt.y);

    if (this.hasMoved && distance >= 1) {
      const layer = this.getWritableActiveLayer(engine);
      if (layer) {
        this.drawShape(layer.ctx, this.startPt, endPt, engine, false);
        layer.markDirty();
        engine.render();
        engine.commitHistory();
      }
    }

    this.isDrawing = false;
    this.hasMoved = false;
    this.isShiftDown = false;
    this.startPt = null;
    this.currentPt = null;
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.renderOverlay();
  }

  public renderOverlay(engine: CanvasEngine, ctx: CanvasRenderingContext2D): void {
    if (!this.isDrawing || !this.startPt || !this.currentPt || !this.hasMoved) return;
    if (Math.hypot(this.currentPt.x - this.startPt.x, this.currentPt.y - this.startPt.y) < 1) {
      return;
    }
    this.drawShape(ctx, this.startPt, this.currentPt, engine, true);
  }

  private constrainEndPoint(start: Point, end: Point, shiftKey: boolean): Point {
    if (!shiftKey) {
      return { x: end.x, y: end.y };
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (
      this.shapeType === 'rectangle' ||
      this.shapeType === 'rect' ||
      this.shapeType === 'ellipse' ||
      this.shapeType === 'circle'
    ) {
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      const signX = dx < 0 ? -1 : 1;
      const signY = dy < 0 ? -1 : 1;
      return {
        x: start.x + signX * size,
        y: start.y + signY * size
      };
    }

    // Constrain line and arrow angles to multiples of 45 degrees (PI / 4)
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return {
      x: start.x + dist * Math.cos(snapAngle),
      y: start.y + dist * Math.sin(snapAngle)
    };
  }

  private drawShape(
    ctx: CanvasRenderingContext2D,
    start: Point,
    end: Point,
    engine: CanvasEngine,
    isPreview: boolean
  ): void {
    ctx.save();
    ctx.globalAlpha = Math.min(1.0, Math.max(0.01, engine.brushOpacity));
    ctx.strokeStyle = engine.primaryColor;
    ctx.fillStyle = this.fill ? engine.primaryColor : 'transparent';
    ctx.lineWidth = Math.max(1, engine.brushSize);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isPreview) {
      ctx.setLineDash([4, 4]);
    }

    if (this.shapeType === 'line') {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (this.shapeType === 'arrow') {
      // Main arrow shaft
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLength = Math.max(10, Math.min(32, engine.brushSize * 3 + 6));
      const arrowAngle = Math.PI / 6; // 30 degrees

      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLength * Math.cos(angle - arrowAngle),
        end.y - headLength * Math.sin(angle - arrowAngle)
      );
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLength * Math.cos(angle + arrowAngle),
        end.y - headLength * Math.sin(angle + arrowAngle)
      );
      ctx.stroke();
    } else if (this.shapeType === 'rectangle' || this.shapeType === 'rect') {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x);
      const h = Math.abs(end.y - start.y);

      if (this.fill) {
        ctx.fillRect(x, y, w, h);
      }
      ctx.strokeRect(x, y, w, h);
    } else if (this.shapeType === 'ellipse' || this.shapeType === 'circle') {
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const cx = Math.min(start.x, end.x) + rx;
      const cy = Math.min(start.y, end.y) + ry;

      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
      if (this.fill) {
        ctx.fill();
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  deactivate(engine: CanvasEngine): void {
    this.isDrawing = false;
    this.hasMoved = false;
    this.isShiftDown = false;
    this.startPt = null;
    this.currentPt = null;
    engine.overlayCtx.clearRect(0, 0, engine.width, engine.height);
    engine.renderOverlay();
  }
}
