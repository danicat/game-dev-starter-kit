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

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const moduleCache = new Map();

function transpileTsToDataUrl(filePath) {
  const absPath = path.resolve(filePath);
  if (moduleCache.has(absPath)) {
    return moduleCache.get(absPath);
  }
  const source = fs.readFileSync(absPath, 'utf-8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absPath,
  });

  const rewritten = outputText.replace(
    /(from\s+['"])([^'"]+)(['"])/g,
    (_match, prefix, specifier, suffix) => {
      if (specifier.startsWith('.')) {
        let targetPath = path.resolve(path.dirname(absPath), specifier);
        if (!fs.existsSync(targetPath) && fs.existsSync(`${targetPath}.ts`)) {
          targetPath = `${targetPath}.ts`;
        }
        const depUrl = transpileTsToDataUrl(targetPath);
        return `${prefix}${depUrl}${suffix}`;
      }
      return `${prefix}${import.meta.resolve(specifier)}${suffix}`;
    }
  );

  const dataUrl = `data:text/javascript;base64,${Buffer.from(rewritten, 'utf-8').toString('base64')}`;
  moduleCache.set(absPath, dataUrl);
  return dataUrl;
}

function createRasterCanvas(initialWidth = 40, initialHeight = 40) {
  let w = initialWidth;
  let h = initialHeight;
  let pixels = new Uint8ClampedArray(w * h * 4);

  const stateStack = [];
  let globalAlpha = 1.0;
  let globalCompositeOperation = 'source-over';
  let lineWidth = 1;
  let currentPath = [];

  function setOpaqueMaskPixel(x, y) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;
    const idx = (iy * w + ix) * 4;
    pixels[idx] = 0;
    pixels[idx + 1] = 0;
    pixels[idx + 2] = 0;
    pixels[idx + 3] = 255;
  }

  function fillCircle(cx, cy, radius) {
    const r = Math.max(0.5, radius);
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(w - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(h - 1, Math.ceil(cy + r));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (Math.hypot(x - cx, y - cy) <= r) {
          setOpaqueMaskPixel(x, y);
        }
      }
    }
  }

  const ctx = {
    get globalAlpha() {
      return globalAlpha;
    },
    set globalAlpha(val) {
      globalAlpha = val;
    },
    get globalCompositeOperation() {
      return globalCompositeOperation;
    },
    set globalCompositeOperation(val) {
      globalCompositeOperation = val;
    },
    get lineWidth() {
      return lineWidth;
    },
    set lineWidth(val) {
      lineWidth = val;
    },
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineCap: 'round',
    lineJoin: 'round',
    save() {
      stateStack.push({ globalAlpha, globalCompositeOperation, lineWidth });
    },
    restore() {
      const prev = stateStack.pop();
      if (prev) {
        globalAlpha = prev.globalAlpha;
        globalCompositeOperation = prev.globalCompositeOperation;
        lineWidth = prev.lineWidth;
      }
    },
    clearRect(x, y, cw, ch) {
      if (x === 0 && y === 0 && cw >= w && ch >= h) {
        pixels.fill(0);
      }
    },
    getImageData(_x, _y, cw, ch) {
      return {
        width: cw,
        height: ch,
        data: new Uint8ClampedArray(pixels),
      };
    },
    putImageData(imgData) {
      pixels.set(imgData.data.subarray(0, pixels.length));
    },
    beginPath() {
      currentPath = [];
    },
    arc(cx, cy, radius) {
      currentPath.push({ type: 'arc', cx, cy, radius });
    },
    moveTo(x, y) {
      currentPath.push({ type: 'move', x, y });
    },
    lineTo(x, y) {
      currentPath.push({ type: 'line', x, y });
    },
    fill() {
      for (const seg of currentPath) {
        if (seg.type === 'arc') {
          fillCircle(seg.cx, seg.cy, seg.radius);
        }
      }
    },
    stroke() {
      let last = null;
      const radius = Math.max(0.5, lineWidth / 2);
      for (const seg of currentPath) {
        if (seg.type === 'move') {
          last = { x: seg.x, y: seg.y };
        } else if (seg.type === 'line' && last) {
          const steps = Math.max(1, Math.ceil(Math.hypot(seg.x - last.x, seg.y - last.y)));
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            fillCircle(last.x + (seg.x - last.x) * t, last.y + (seg.y - last.y) * t, radius);
          }
          last = { x: seg.x, y: seg.y };
        }
      }
    },
    drawImage(srcCanvas) {
      const srcPixels = srcCanvas._getPixels();
      for (let i = 0; i < pixels.length; i += 4) {
        const srcAlpha = (srcPixels[i + 3] / 255) * globalAlpha;
        if (srcAlpha <= 0) continue;
        if (globalCompositeOperation === 'destination-out') {
          pixels[i + 3] = Math.max(0, Math.round(pixels[i + 3] * (1 - srcAlpha)));
        } else {
          pixels[i] = srcPixels[i];
          pixels[i + 1] = srcPixels[i + 1];
          pixels[i + 2] = srcPixels[i + 2];
          pixels[i + 3] = Math.round(srcAlpha * 255);
        }
      }
    },
  };

  return {
    get width() {
      return w;
    },
    set width(val) {
      w = val;
      pixels = new Uint8ClampedArray(w * h * 4);
    },
    get height() {
      return h;
    },
    set height(val) {
      h = val;
      pixels = new Uint8ClampedArray(w * h * 4);
    },
    style: {},
    getContext() {
      return ctx;
    },
    _getPixels() {
      return pixels;
    },
  };
}

describe('EraserTool multi-move stroke accumulation', () => {
  let EraserTool;

  before(async () => {
    globalThis.document = {
      createElement(tag) {
        if (tag === 'canvas') {
          return createRasterCanvas(40, 40);
        }
        throw new Error(`Unexpected tag: ${tag}`);
      },
    };

    const eraserModuleUrl = transpileTsToDataUrl(
      path.resolve(__dirname, '../src/engine/tools/EraserTool.ts')
    );
    const mod = await import(eraserModuleUrl);
    EraserTool = mod.EraserTool;
  });

  test('erases along the entire pointer path even when engine.render() clears overlayCanvas on every frame', () => {
    const width = 40;
    const height = 40;
    const layerCanvas = createRasterCanvas(width, height);
    const layerCtx = layerCanvas.getContext('2d');
    const rawPixels = layerCanvas._getPixels();

    // Fill active layer with opaque blue pixels
    for (let i = 0; i < rawPixels.length; i += 4) {
      rawPixels[i] = 30;
      rawPixels[i + 1] = 64;
      rawPixels[i + 2] = 255;
      rawPixels[i + 3] = 255;
    }

    const overlayCanvas = createRasterCanvas(width, height);
    const overlayCtx = overlayCanvas.getContext('2d');

    let historyCommits = 0;
    const activeLayer = {
      visible: true,
      locked: false,
      canvas: layerCanvas,
      ctx: layerCtx,
      markDirty() {},
    };

    const engine = {
      width,
      height,
      brushSize: 4,
      brushOpacity: 1.0,
      overlayCanvas,
      overlayCtx,
      activeTool: null,
      getActiveLayer() {
        return activeLayer;
      },
      renderOverlay() {
        // Real CanvasEngine.renderOverlay() clears overlayCtx on every render
        this.overlayCtx.clearRect(0, 0, this.width, this.height);
        if (this.activeTool) {
          this.activeTool.renderOverlay(this, this.overlayCtx);
        }
      },
      render() {
        this.renderOverlay();
      },
      commitHistory() {
        historyCommits++;
      },
    };

    const eraser = new EraserTool();
    engine.activeTool = eraser;
    assert.equal(eraser.size, 20, 'EraserTool should default to 20px size');

    eraser.size = 6;
    eraser.onPointerDown(engine, { x: 5, y: 20 });
    eraser.onPointerMove(engine, { x: 15, y: 20 });
    eraser.onPointerMove(engine, { x: 25, y: 20 });
    eraser.onPointerMove(engine, { x: 35, y: 20 });
    eraser.onPointerUp(engine);

    assert.equal(historyCommits, 1, 'EraserTool should commit history once on pointerUp');

    const pixelAlphaAt = (x, y) => rawPixels[(y * width + x) * 4 + 3];

    // Every point along the horizontal erase stroke must remain erased (alpha === 0)
    assert.equal(pixelAlphaAt(5, 20), 0, 'Start of stroke at (5, 20) must remain erased');
    assert.equal(pixelAlphaAt(15, 20), 0, 'First move segment at (15, 20) must remain erased');
    assert.equal(pixelAlphaAt(25, 20), 0, 'Second move segment at (25, 20) must remain erased');
    assert.equal(pixelAlphaAt(35, 20), 0, 'End of stroke at (35, 20) must be erased');

    // Pixels far away from the stroke must remain untouched (alpha === 255)
    assert.equal(pixelAlphaAt(20, 5), 255, 'Untouched pixel at (20, 5) must remain opaque');
    assert.equal(pixelAlphaAt(20, 35), 255, 'Untouched pixel at (20, 35) must remain opaque');
  });
});
