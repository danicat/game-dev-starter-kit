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

describe('BucketTool & runScanlineFloodFill (Real TypeScript Implementation)', () => {
  let BucketTool;
  let runScanlineFloodFill;

  before(async () => {
    const bucketModuleUrl = transpileTsToDataUrl(
      path.resolve(__dirname, '../src/engine/tools/BucketTool.ts')
    );
    const mod = await import(bucketModuleUrl);
    BucketTool = mod.BucketTool;
    runScanlineFloodFill = mod.runScanlineFloodFill;

    assert.equal(typeof BucketTool, 'function', 'BucketTool class must be exported');
    assert.equal(typeof BucketTool.parseColor, 'function', 'BucketTool.parseColor static method must be exported');
    assert.equal(typeof runScanlineFloodFill, 'function', 'runScanlineFloodFill function must be exported');
  });

  test('BucketTool.parseColor parses hex and rgb colors with opacity', () => {
    const red = BucketTool.parseColor('#ff0000', 1);
    assert.deepEqual(red, { r: 255, g: 0, b: 0, a: 255 });

    const shortHex = BucketTool.parseColor('#0f0', 0.5);
    assert.equal(shortHex.r, 0);
    assert.equal(shortHex.g, 255);
    assert.equal(shortHex.b, 0);
    assert.equal(shortHex.a, 128);

    const rgb = BucketTool.parseColor('rgb(10, 20, 30)', 1);
    assert.deepEqual(rgb, { r: 10, g: 20, b: 30, a: 255 });
  });

  test('fills an empty/solid canvas', () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    data.fill(255);

    const fillColor = BucketTool.parseColor('#ff0000', 1);
    const changed = runScanlineFloodFill(data, w, h, 0, 0, fillColor, 0);
    assert.equal(changed, true);

    for (let i = 0; i < w * h; i++) {
      assert.equal(data[i * 4], 255);
      assert.equal(data[i * 4 + 1], 0);
      assert.equal(data[i * 4 + 2], 0);
      assert.equal(data[i * 4 + 3], 255);
    }
  });

  test('fills a bounded region without leaking outside the boundary', () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    // Initialize all pixels to white (255, 255, 255, 255)
    data.fill(255);

    // Draw a closed black border box from (2,2) to (7,7)
    for (let y = 2; y <= 7; y++) {
      for (let x = 2; x <= 7; x++) {
        if (x === 2 || x === 7 || y === 2 || y === 7) {
          const idx = (y * w + x) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }

    // Fill inside the box at (4, 4) with green
    const fillColor = BucketTool.parseColor('#00ff00', 1);
    const changed = runScanlineFloodFill(data, w, h, 4, 4, fillColor, 10);
    assert.equal(changed, true);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (x > 2 && x < 7 && y > 2 && y < 7) {
          // Inside boundary: filled with green
          assert.equal(data[idx], 0);
          assert.equal(data[idx + 1], 255);
          assert.equal(data[idx + 2], 0);
          assert.equal(data[idx + 3], 255);
        } else if ((x === 2 || x === 7 || y === 2 || y === 7) && x >= 2 && x <= 7 && y >= 2 && y <= 7) {
          // Border remains black
          assert.equal(data[idx], 0);
          assert.equal(data[idx + 1], 0);
          assert.equal(data[idx + 2], 0);
          assert.equal(data[idx + 3], 255);
        } else {
          // Outside boundary remains untouched white
          assert.equal(data[idx], 255);
          assert.equal(data[idx + 1], 255);
          assert.equal(data[idx + 2], 255);
          assert.equal(data[idx + 3], 255);
        }
      }
    }
  });

  test('returns false immediately with no infinite loop when target color already equals fill color', () => {
    const w = 10;
    const h = 10;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }

    const fillColor = BucketTool.parseColor('#ff0000', 1);
    const changed = runScanlineFloodFill(data, w, h, 2, 2, fillColor, 30);
    assert.equal(changed, false);
  });

  test('visited bitmap prevents infinite loop when target color is within tolerance of fill color', () => {
    const w = 20;
    const h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = 100;
      data[i * 4 + 1] = 100;
      data[i * 4 + 2] = 100;
      data[i * 4 + 3] = 255;
    }

    const fillColor = { r: 110, g: 100, b: 100, a: 255 };
    const startTime = Date.now();
    const changed = runScanlineFloodFill(data, w, h, 0, 0, fillColor, 25);
    const elapsed = Date.now() - startTime;

    assert.equal(changed, true);
    assert.ok(elapsed < 200, `Flood fill took too long (${elapsed}ms)`);
    for (let i = 0; i < w * h; i++) {
      assert.equal(data[i * 4], 110);
      assert.equal(data[i * 4 + 1], 100);
      assert.equal(data[i * 4 + 2], 100);
      assert.equal(data[i * 4 + 3], 255);
    }
  });

  test('fills transparent (alpha === 0) region even when transparent pixels have differing hidden RGB values', () => {
    const w = 6;
    const h = 6;
    const data = new Uint8ClampedArray(w * h * 4);

    // Populate canvas with alpha === 0 but wildly different hidden RGB values
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = (i * 73) % 256;
      data[i * 4 + 1] = (i * 151) % 256;
      data[i * 4 + 2] = (i * 211) % 256;
      data[i * 4 + 3] = 0;
    }

    // Place a solid opaque barrier column at x = 4
    for (let y = 0; y < h; y++) {
      const idx = (y * w + 4) * 4;
      data[idx] = 20;
      data[idx + 1] = 40;
      data[idx + 2] = 60;
      data[idx + 3] = 255;
    }

    const fillColor = BucketTool.parseColor('#3366ff', 1);
    const changed = runScanlineFloodFill(data, w, h, 0, 0, fillColor, 0);
    assert.equal(changed, true);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        if (x < 4) {
          // All connected alpha === 0 pixels to the left of the barrier must be filled
          assert.equal(data[idx], fillColor.r);
          assert.equal(data[idx + 1], fillColor.g);
          assert.equal(data[idx + 2], fillColor.b);
          assert.equal(data[idx + 3], 255);
        } else if (x === 4) {
          // Barrier remains untouched
          assert.equal(data[idx], 20);
          assert.equal(data[idx + 3], 255);
        } else {
          // Transparent pixel beyond the barrier remains alpha === 0
          assert.equal(data[idx + 3], 0);
        }
      }
    }
  });
});
