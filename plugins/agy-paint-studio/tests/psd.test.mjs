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
import { writePsdUint8Array, readPsd, initializeCanvas } from 'ag-psd';

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

function createMockCanvas(initialWidth = 1, initialHeight = 1, initialData) {
  let w = initialWidth;
  let h = initialHeight;
  let pixelData = initialData
    ? new Uint8ClampedArray(initialData)
    : new Uint8ClampedArray(w * h * 4);

  return {
    get width() {
      return w;
    },
    set width(val) {
      w = val;
      pixelData = new Uint8ClampedArray(w * h * 4);
    },
    get height() {
      return h;
    },
    set height(val) {
      h = val;
      pixelData = new Uint8ClampedArray(w * h * 4);
    },
    getContext: () => ({
      getImageData: (_x = 0, _y = 0, reqW = w, reqH = h) => {
        if (reqW === w && reqH === h) {
          return { data: pixelData, width: w, height: h };
        }
        return { data: new Uint8ClampedArray(reqW * reqH * 4), width: reqW, height: reqH };
      },
      createImageData: (reqW, reqH) => ({
        data: new Uint8ClampedArray(reqW * reqH * 4),
        width: reqW,
        height: reqH,
      }),
      putImageData: (imgData) => {
        pixelData.set(imgData.data.subarray(0, pixelData.length));
      },
      drawImage: (srcCanvas) => {
        if (srcCanvas && typeof srcCanvas.getContext === 'function') {
          const srcData = srcCanvas
            .getContext('2d')
            .getImageData(0, 0, srcCanvas.width, srcCanvas.height).data;
          pixelData.set(srcData.subarray(0, pixelData.length));
        }
      },
      clearRect: () => {
        pixelData.fill(0);
      },
      fillRect: () => {},
      save: () => {},
      restore: () => {},
    }),
  };
}

describe('PSD Utilities & ag-psd Serialization / Deserialization', () => {
  let psdMod;
  let mapBlendModeToPsd;
  let mapPsdToBlendMode;

  before(async () => {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') {
          return createMockCanvas(1, 1);
        }
        return {};
      },
    };

    initializeCanvas(
      (width, height) => createMockCanvas(width, height),
      (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height })
    );

    const psdModuleUrl = transpileTsToDataUrl(
      path.resolve(__dirname, '../src/utils/psd.ts')
    );
    psdMod = await import(psdModuleUrl);
    mapBlendModeToPsd = psdMod.mapBlendModeToPsd;
    mapPsdToBlendMode = psdMod.mapPsdToBlendMode;

    assert.equal(typeof mapBlendModeToPsd, 'function', 'mapBlendModeToPsd must be exported from src/utils/psd.ts');
    assert.equal(typeof mapPsdToBlendMode, 'function', 'mapPsdToBlendMode must be exported from src/utils/psd.ts');
  });

  test('mapBlendModeToPsd and mapPsdToBlendMode round-trip all supported blend modes', () => {
    const pairs = [
      ['source-over', 'normal'],
      ['multiply', 'multiply'],
      ['screen', 'screen'],
      ['overlay', 'overlay'],
      ['darken', 'darken'],
      ['lighten', 'lighten'],
      ['color-dodge', 'color dodge'],
      ['color-burn', 'color burn'],
      ['hard-light', 'hard light'],
      ['soft-light', 'soft light'],
      ['difference', 'difference'],
      ['exclusion', 'exclusion'],
    ];

    for (const [canvasMode, psdMode] of pairs) {
      assert.equal(mapBlendModeToPsd(canvasMode), psdMode);
      assert.equal(mapPsdToBlendMode(psdMode), canvasMode);
    }

    assert.equal(mapPsdToBlendMode('pass through'), 'source-over');
    assert.equal(mapPsdToBlendMode(undefined), 'source-over');
  });

  test('round-trip PSD serialization preserves layers, blend modes, opacity, and composite preview image data', () => {
    const width = 64;
    const height = 48;

    const layer1Data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < layer1Data.length; i += 4) {
      layer1Data[i] = 255;
      layer1Data[i + 1] = 20;
      layer1Data[i + 2] = 40;
      layer1Data[i + 3] = 255;
    }

    const layer2Data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < layer2Data.length; i += 4) {
      layer2Data[i] = 10;
      layer2Data[i + 1] = 200;
      layer2Data[i + 2] = 240;
      layer2Data[i + 3] = 180;
    }

    const compositeData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < compositeData.length; i += 4) {
      compositeData[i] = 120;
      compositeData[i + 1] = 150;
      compositeData[i + 2] = 180;
      compositeData[i + 3] = 255;
    }

    const psdStructure = {
      width,
      height,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3,
      canvas: createMockCanvas(width, height, compositeData),
      children: [
        {
          name: 'Background Layer',
          opacity: 1,
          hidden: false,
          blendMode: mapBlendModeToPsd('source-over'),
          canvas: createMockCanvas(width, height, layer1Data),
        },
        {
          name: 'Multiply Accent',
          opacity: 0.75,
          hidden: false,
          blendMode: mapBlendModeToPsd('multiply'),
          canvas: createMockCanvas(width, height, layer2Data),
        },
      ],
    };

    const psdBytes = writePsdUint8Array(psdStructure);
    assert.ok(psdBytes instanceof Uint8Array);
    assert.equal(String.fromCharCode(psdBytes[0], psdBytes[1], psdBytes[2], psdBytes[3]), '8BPS');

    const readDoc = readPsd(psdBytes.buffer, { skipCompositeImageData: false });
    assert.equal(readDoc.width, width);
    assert.equal(readDoc.height, height);
    assert.ok(readDoc.canvas, 'Composite preview canvas must be present on readPsd');
    assert.equal(readDoc.children.length, 2);
    assert.equal(readDoc.children[0].name, 'Background Layer');
    assert.equal(readDoc.children[1].name, 'Multiply Accent');
    assert.equal(mapPsdToBlendMode(readDoc.children[1].blendMode), 'multiply');
    assert.ok(Math.abs(readDoc.children[1].opacity - 0.75) < 0.01);
  });

  test('flattens nested PSD layer groups recursively during import/leaf collection', async () => {
    const width = 32;
    const height = 32;
    const solidPixels = new Uint8ClampedArray(width * height * 4).fill(200);

    const nestedPsd = {
      width,
      height,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3,
      canvas: createMockCanvas(width, height, solidPixels),
      children: [
        {
          name: 'Base Layer',
          opacity: 1,
          hidden: false,
          blendMode: 'normal',
          canvas: createMockCanvas(width, height, solidPixels),
        },
        {
          name: 'UI Group',
          children: [
            {
              name: 'Nested Icon Layer',
              opacity: 0.8,
              hidden: false,
              blendMode: 'screen',
              canvas: createMockCanvas(width, height, solidPixels),
            },
          ],
        },
      ],
    };

    const psdBytes = writePsdUint8Array(nestedPsd);
    const parsed = readPsd(psdBytes.buffer, { skipCompositeImageData: false });
    assert.equal(parsed.children.length, 2);
    assert.ok(Array.isArray(parsed.children[1].children), 'Second child is a group');
    assert.equal(parsed.children[1].children[0].name, 'Nested Icon Layer');

    const flattened = psdMod.flattenPsdLayers(parsed.children);
    assert.equal(flattened.length, 2);
    assert.equal(flattened[0].name, 'Base Layer');
    assert.equal(flattened[1].name, 'Nested Icon Layer');

    const doc = psdMod.parsePsd(psdBytes.buffer);
    assert.equal(doc.layers.length, 2);
    assert.equal(doc.layers[0].name, 'Base Layer');
    assert.equal(doc.layers[1].name, 'Nested Icon Layer');
    assert.equal(doc.layers[1].blendMode, 'screen');
  });

  test('fails fast when given corrupted or truncated PSD buffer', () => {
    const invalidBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    assert.throws(() => {
      readPsd(invalidBuffer);
    }, /Invalid|signature|header|PSD/i);
  });
});
