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

import {
  readPsd,
  writePsdUint8Array,
  type BlendMode,
  type Layer as PsdLayer,
  type Psd,
} from 'ag-psd';
import type { CanvasEngine } from '../engine/CanvasEngine.ts';
import { Layer } from '../engine/Layer.ts';

export interface PsdDocumentData {
  width: number;
  height: number;
  layers: Layer[];
}

/**
 * Map HTML Canvas GlobalCompositeOperation to Adobe Photoshop BlendMode.
 */
export function mapBlendModeToPsd(mode: GlobalCompositeOperation | string): BlendMode {
  switch (mode) {
    case 'source-over':
      return 'normal';
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'darken':
      return 'darken';
    case 'lighten':
      return 'lighten';
    case 'color-dodge':
      return 'color dodge';
    case 'color-burn':
      return 'color burn';
    case 'hard-light':
      return 'hard light';
    case 'soft-light':
      return 'soft light';
    case 'difference':
      return 'difference';
    case 'exclusion':
      return 'exclusion';
    case 'hue':
      return 'hue';
    case 'saturation':
      return 'saturation';
    case 'color':
      return 'color';
    case 'luminosity':
      return 'luminosity';
    case 'lighter':
      return 'linear dodge';
    default:
      return 'normal';
  }
}

/**
 * Map Adobe Photoshop BlendMode to HTML Canvas GlobalCompositeOperation.
 */
export function mapPsdToBlendMode(mode?: BlendMode | string): GlobalCompositeOperation {
  if (!mode) {
    return 'source-over';
  }
  const normalized = mode.toLowerCase().trim();
  switch (normalized) {
    case 'normal':
    case 'pass':
    case 'passthrough':
    case 'pass through':
      return 'source-over';
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'darken':
      return 'darken';
    case 'lighten':
      return 'lighten';
    case 'color dodge':
    case 'colordodge':
    case 'color-dodge':
      return 'color-dodge';
    case 'color burn':
    case 'colorburn':
    case 'color-burn':
      return 'color-burn';
    case 'hard light':
    case 'hardlight':
    case 'hard-light':
      return 'hard-light';
    case 'soft light':
    case 'softlight':
    case 'soft-light':
      return 'soft-light';
    case 'difference':
      return 'difference';
    case 'exclusion':
      return 'exclusion';
    case 'hue':
      return 'hue';
    case 'saturation':
      return 'saturation';
    case 'color':
      return 'color';
    case 'luminosity':
      return 'luminosity';
    case 'linear dodge':
    case 'lineardodge':
    case 'linear-dodge':
    case 'lighter':
      return 'lighter';
    default:
      return 'source-over';
  }
}

const MAX_PSD_GROUP_DEPTH = 16;
const MAX_PSD_LAYERS = 64;

/**
 * Recursively flatten PSD layer groups (`node.children`) in bottom-to-top order
 * so PSD files containing folders/groups do not silently lose their layers.
 */
export function flattenPsdLayers(
  nodes: PsdLayer[],
  parentHidden = false,
  depth = 0
): PsdLayer[] {
  if (depth > MAX_PSD_GROUP_DEPTH) {
    throw new Error(`PSD layer group nesting exceeds maximum depth of ${MAX_PSD_GROUP_DEPTH}.`);
  }
  const flat: PsdLayer[] = [];
  for (const node of nodes) {
    const isHidden = parentHidden || Boolean(node.hidden);
    if (Array.isArray(node.children) && node.children.length > 0) {
      const childLayers = flattenPsdLayers(node.children, isHidden, depth + 1);
      for (const child of childLayers) {
        if (flat.length >= MAX_PSD_LAYERS) {
          throw new Error(`PSD layer count exceeds maximum supported limit of ${MAX_PSD_LAYERS} layers.`);
        }
        flat.push(child);
      }
    } else if (!Array.isArray(node.children)) {
      if (flat.length >= MAX_PSD_LAYERS) {
        throw new Error(`PSD layer count exceeds maximum supported limit of ${MAX_PSD_LAYERS} layers.`);
      }
      flat.push(isHidden && !node.hidden ? { ...node, hidden: true } : node);
    }
  }
  return flat;
}

/**
 * Serialize a CanvasEngine's multi-layer state into a valid Adobe Photoshop (.psd) ArrayBuffer.
 */
export function serializePsd(engine: CanvasEngine): ArrayBuffer & Uint8Array<ArrayBuffer> {
  if (!engine || !Array.isArray(engine.layers) || engine.layers.length === 0) {
    throw new Error('Cannot serialize PSD: CanvasEngine has no layers.');
  }
  if (
    typeof engine.width !== 'number' ||
    typeof engine.height !== 'number' ||
    !Number.isFinite(engine.width) ||
    !Number.isFinite(engine.height) ||
    engine.width < 1 ||
    engine.width > 8192 ||
    engine.height < 1 ||
    engine.height > 8192
  ) {
    throw new Error(
      `Cannot serialize PSD with invalid dimensions: width=${engine.width}, height=${engine.height}. Dimensions must be between 1 and 8192.`
    );
  }

  const children: PsdLayer[] = engine.layers.map((layer) => ({
    name: layer.name,
    canvas: layer.canvas,
    opacity: Math.max(0, Math.min(1, layer.opacity)),
    hidden: !layer.visible,
    blendMode: mapBlendModeToPsd(layer.blendMode),
    protected: layer.locked
      ? { transparency: true, composite: true, position: true }
      : undefined,
  }));

  const psd: Psd = {
    width: engine.width,
    height: engine.height,
    channels: 4,
    bitsPerChannel: 8,
    colorMode: 3, // RGB
    canvas: engine.getCompositeCanvas(),
    children,
  };

  let result: Uint8Array;
  try {
    result = writePsdUint8Array(psd);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to serialize CanvasEngine layers to PSD: ${message}`);
  }

  return result.buffer.slice(
    result.byteOffset,
    result.byteOffset + result.byteLength
  ) as ArrayBuffer as ArrayBuffer & Uint8Array<ArrayBuffer>;
}

/**
 * Parse a PSD ArrayBuffer into Layer instances and optionally load them into a CanvasEngine.
 * Validates dimensions (1..8192), flattens nested layer groups bottom-to-top,
 * preserves lock state, marks layers dirty, and commits an undo history baseline.
 */
export function parsePsd(buffer: ArrayBuffer, engine?: CanvasEngine): PsdDocumentData {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Cannot parse PSD: Input ArrayBuffer is empty (0 bytes).');
  }

  let psd: Psd;
  try {
    psd = readPsd(buffer, {
      skipCompositeImageData: false,
      skipLayerImageData: false,
      skipThumbnail: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to decode PSD binary: ${message}`);
  }

  if (
    typeof psd.width !== 'number' ||
    typeof psd.height !== 'number' ||
    !Number.isFinite(psd.width) ||
    !Number.isFinite(psd.height) ||
    psd.width < 1 ||
    psd.width > 8192 ||
    psd.height < 1 ||
    psd.height > 8192
  ) {
    throw new Error(
      `Invalid PSD dimensions: width=${psd.width}, height=${psd.height}. Dimensions must be between 1 and 8192 pixels.`
    );
  }

  const layers: Layer[] = [];
  const flatNodes =
    Array.isArray(psd.children) && psd.children.length > 0
      ? flattenPsdLayers(psd.children)
      : [];

  if (flatNodes.length > 0) {
    for (let i = 0; i < flatNodes.length; i++) {
      const node = flatNodes[i];
      const layerName = node.name?.trim() || `Layer ${i + 1}`;
      const layer = new Layer(psd.width, psd.height, layerName);

      layer.visible = node.hidden !== true;
      layer.opacity =
        typeof node.opacity === 'number' ? Math.max(0, Math.min(1, node.opacity)) : 1.0;
      layer.blendMode = mapPsdToBlendMode(node.blendMode);
      layer.locked = Boolean(
        node.protected?.transparency ||
          node.protected?.composite ||
          node.protected?.position
      );

      if (node.canvas) {
        const left = node.left ?? 0;
        const top = node.top ?? 0;
        layer.ctx.drawImage(node.canvas as unknown as CanvasImageSource, left, top);
      }

      layer.markDirty();
      layers.push(layer);
    }
  } else if (psd.canvas) {
    const layer = new Layer(psd.width, psd.height, 'Background');
    layer.ctx.drawImage(psd.canvas as unknown as CanvasImageSource, 0, 0);
    layer.markDirty();
    layers.push(layer);
  } else {
    throw new Error(
      'Invalid or corrupted PSD: file contains neither layer records nor a composite image canvas.'
    );
  }

  if (engine) {
    engine.width = psd.width;
    engine.height = psd.height;
    if (engine.displayCanvas) {
      engine.displayCanvas.width = psd.width;
      engine.displayCanvas.height = psd.height;
    }
    if (engine.overlayCanvas) {
      engine.overlayCanvas.width = psd.width;
      engine.overlayCanvas.height = psd.height;
    }
    engine.layers = layers;
    engine.activeLayerIndex = Math.max(0, layers.length - 1);

    if (engine.history && typeof engine.history.clear === 'function') {
      engine.history.clear();
    }
    if (typeof engine.commitHistory === 'function') {
      engine.commitHistory();
    }
    if (typeof engine.render === 'function') {
      engine.render();
    }
    if (typeof engine.fitToViewport === 'function') {
      engine.fitToViewport();
    }
  }

  return {
    width: psd.width,
    height: psd.height,
    layers,
  };
}

/**
 * Trigger a browser download of the CanvasEngine layers as an Adobe Photoshop (.psd) file.
 */
export function exportPsdFile(engine: CanvasEngine, filename = 'painting.psd'): void {
  const buffer: ArrayBuffer = serializePsd(engine);
  const blob = new Blob([buffer], { type: 'image/vnd.adobe.photoshop' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.toLowerCase().endsWith('.psd') ? filename : `${filename}.psd`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read a File object as an ArrayBuffer and parse its PSD layers into a CanvasEngine instance.
 */
export async function importPsdFile(file: File, engine: CanvasEngine): Promise<void> {
  if (!file) {
    throw new Error('Cannot import PSD: No File provided to importPsdFile.');
  }
  const buffer = await file.arrayBuffer();
  parsePsd(buffer, engine);
}
