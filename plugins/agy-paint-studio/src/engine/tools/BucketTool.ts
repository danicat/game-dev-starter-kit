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

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function runScanlineFloodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillColor: RgbaColor | ArrayLike<number>,
  tolerance?: number
): boolean;
export function runScanlineFloodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillR: number,
  fillG: number,
  fillB: number,
  fillA: number,
  tolerance?: number
): boolean;
export function runScanlineFloodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fillROrColor: number | RgbaColor | ArrayLike<number>,
  fillGOrTolerance?: number,
  fillB?: number,
  fillA?: number,
  tolerance = 32
): boolean {
  if (width <= 0 || height <= 0) return false;

  const px = Math.floor(startX);
  const py = Math.floor(startY);

  if (px < 0 || px >= width || py < 0 || py >= height) return false;

  let r: number;
  let g: number;
  let b: number;
  let a: number;
  let rawTol: number;

  if (typeof fillROrColor === 'object' && fillROrColor !== null) {
    if ('r' in fillROrColor) {
      r = fillROrColor.r;
      g = fillROrColor.g;
      b = fillROrColor.b;
      a = fillROrColor.a;
    } else {
      r = fillROrColor[0];
      g = fillROrColor[1];
      b = fillROrColor[2];
      a = fillROrColor[3];
    }
    rawTol = fillGOrTolerance !== undefined ? fillGOrTolerance : 32;
  } else {
    r = fillROrColor;
    g = fillGOrTolerance!;
    b = fillB!;
    a = fillA!;
    rawTol = tolerance;
  }

  const startPos = py * width + px;
  const startIdx = startPos * 4;
  const startR = data[startIdx];
  const startG = data[startIdx + 1];
  const startB = data[startIdx + 2];
  const startA = data[startIdx + 3];

  if (startA === 0 && a === 0) {
    return false;
  }

  if (startR === r && startG === g && startB === b && startA === a) {
    return false;
  }

  const tol = Math.max(0, Math.min(255, Number.isFinite(rawTol) ? rawTol : 0));

  const matchesTarget = (idx: number): boolean => {
    const a = data[idx + 3];
    if (startA === 0) {
      if (a === 0) return true;
      if (tol === 0) return false;
    }
    if (tol === 0) {
      return (
        data[idx] === startR &&
        data[idx + 1] === startG &&
        data[idx + 2] === startB &&
        a === startA
      );
    }
    return (
      Math.abs(data[idx] - startR) <= tol &&
      Math.abs(data[idx + 1] - startG) <= tol &&
      Math.abs(data[idx + 2] - startB) <= tol &&
      Math.abs(a - startA) <= tol
    );
  };

  const visited = new Uint8Array(width * height);
  const stack: number[] = [px, py];
  let filledPixels = 0;
  const maxPixels = width * height;

  while (stack.length > 0) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;

    const curStartPos = cy * width + cx;
    if (visited[curStartPos]) continue;
    if (!matchesTarget(curStartPos * 4)) continue;

    let leftX = cx;
    let pos = curStartPos;

    // Scan leftward
    while (leftX > 0) {
      const nextPos = pos - 1;
      if (visited[nextPos] || !matchesTarget(nextPos * 4)) break;
      leftX--;
      pos = nextPos;
    }

    let rightX = cx;
    pos = curStartPos;

    // Scan rightward
    while (rightX < width - 1) {
      const nextPos = pos + 1;
      if (visited[nextPos] || !matchesTarget(nextPos * 4)) break;
      rightX++;
      pos = nextPos;
    }

    // Fill horizontal segment [leftX, rightX]
    let checkAbove = true;
    let checkBelow = true;

    for (let i = leftX; i <= rightX; i++) {
      const curPos = cy * width + i;
      if (visited[curPos]) continue;
      visited[curPos] = 1;
      filledPixels++;

      const curIdx = curPos * 4;
      data[curIdx] = r;
      data[curIdx + 1] = g;
      data[curIdx + 2] = b;
      data[curIdx + 3] = a;

      if (cy > 0) {
        const upPos = (cy - 1) * width + i;
        if (!visited[upPos] && matchesTarget(upPos * 4)) {
          if (checkAbove) {
            stack.push(i, cy - 1);
            checkAbove = false;
          }
        } else {
          checkAbove = true;
        }
      }

      if (cy < height - 1) {
        const downPos = (cy + 1) * width + i;
        if (!visited[downPos] && matchesTarget(downPos * 4)) {
          if (checkBelow) {
            stack.push(i, cy + 1);
            checkBelow = false;
          }
        } else {
          checkBelow = true;
        }
      }
    }

    if (filledPixels >= maxPixels) break;
  }

  return filledPixels > 0;
}

export class BucketTool extends BaseTool {
  public tolerance = 25;
  public isFilling = false;

  constructor() {
    super('bucket', 'Paint Bucket', 'crosshair');
  }

  onPointerDown(engine: CanvasEngine, pt: Point): void {
    if (this.isFilling) {
      console.warn('[BucketTool] Bucket fill in progress, ignoring extra click.');
      return;
    }

    const layer = this.getWritableActiveLayer(engine);
    if (!layer) return;

    const x = Math.floor(pt.x);
    const y = Math.floor(pt.y);

    if (x < 0 || x >= layer.canvas.width || y < 0 || y >= layer.canvas.height) {
      return;
    }

    this.isFilling = true;
    let prevCursor = this.cursor;

    try {
      prevCursor = engine.overlayCanvas.style.cursor;
      engine.overlayCanvas.style.cursor = 'wait';

      const fillColor = this.parseColor(engine.primaryColor, engine.brushOpacity);
      const imgData = layer.getImageData();

      const changed = runScanlineFloodFill(
        imgData.data,
        imgData.width,
        imgData.height,
        x,
        y,
        fillColor.r,
        fillColor.g,
        fillColor.b,
        fillColor.a,
        this.tolerance
      );

      if (changed) {
        layer.putImageData(imgData);
        engine.render();
        engine.commitHistory();
      }
    } finally {
      this.isFilling = false;
      engine.overlayCanvas.style.cursor = prevCursor || this.cursor;
    }
  }

  onPointerMove(): void {}
  onPointerUp(): void {}

  public static parseColor(color: string, opacity = 1): { r: number; g: number; b: number; a: number } {
    if (typeof color !== 'string' || !color.trim()) {
      throw new Error(`Invalid color string: "${String(color)}"`);
    }
    if (typeof opacity !== 'number' || Number.isNaN(opacity)) {
      throw new Error(`Invalid opacity value: ${String(opacity)}`);
    }

    const clampedOpacity = Math.min(1, Math.max(0, opacity));
    const str = color.trim();

    const hex3Match = /^#([0-9a-fA-F]{3})$/.exec(str);
    if (hex3Match) {
      const hex = hex3Match[1];
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: Math.round(255 * clampedOpacity),
      };
    }

    const hex6Match = /^#([0-9a-fA-F]{6})$/.exec(str);
    if (hex6Match) {
      const hex = hex6Match[1];
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: Math.round(255 * clampedOpacity),
      };
    }

    const rgbMatch = /^rgb\(\s*([^)]+)\s*\)$/i.exec(str);
    if (rgbMatch) {
      const parts = rgbMatch[1].split(',').map(p => p.trim());
      if (parts.length !== 3) {
        throw new Error(`Invalid rgb() color string: "${color}"`);
      }
      const nums = parts.map(p => {
        if (!/^\d+(\.\d+)?$/.test(p)) {
          throw new Error(`Invalid rgb() channel value "${p}" in "${color}"`);
        }
        const v = Number(p);
        if (v < 0 || v > 255) {
          throw new Error(`RGB channel out of range [0, 255]: ${v} in "${color}"`);
        }
        return Math.round(v);
      });
      return {
        r: nums[0],
        g: nums[1],
        b: nums[2],
        a: Math.round(255 * clampedOpacity),
      };
    }

    const rgbaMatch = /^rgba\(\s*([^)]+)\s*\)$/i.exec(str);
    if (rgbaMatch) {
      const parts = rgbaMatch[1].split(',').map(p => p.trim());
      if (parts.length !== 4) {
        throw new Error(`Invalid rgba() color string: "${color}"`);
      }
      const rgbNums = parts.slice(0, 3).map(p => {
        if (!/^\d+(\.\d+)?$/.test(p)) {
          throw new Error(`Invalid rgba() channel value "${p}" in "${color}"`);
        }
        const v = Number(p);
        if (v < 0 || v > 255) {
          throw new Error(`RGBA channel out of range [0, 255]: ${v} in "${color}"`);
        }
        return Math.round(v);
      });
      const alphaStr = parts[3];
      if (!/^\d+(\.\d+)?$/.test(alphaStr) && !/^\.\d+$/.test(alphaStr)) {
        throw new Error(`Invalid rgba() alpha value "${alphaStr}" in "${color}"`);
      }
      const alphaVal = Number(alphaStr);
      if (alphaVal < 0 || alphaVal > 1) {
        throw new Error(`RGBA alpha out of range [0, 1]: ${alphaVal} in "${color}"`);
      }
      return {
        r: rgbNums[0],
        g: rgbNums[1],
        b: rgbNums[2],
        a: Math.round(alphaVal * 255 * clampedOpacity),
      };
    }

    throw new Error(`Unsupported or invalid color format: "${color}"`);
  }

  public parseColor(color: string, opacity = 1): { r: number; g: number; b: number; a: number } {
    return BucketTool.parseColor(color, opacity);
  }
}
