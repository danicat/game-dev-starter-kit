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

export interface GifFrameInput {
  /** RGBA pixel buffer of length width * height * 4 */
  rgba: Uint8ClampedArray | Uint8Array;
  /** Frame delay in milliseconds (e.g. 66ms for ~15fps, 1500ms for annotated hold frame) */
  delayMs: number;
}

export interface EncodeGifOptions {
  width: number;
  height: number;
  frames: GifFrameInput[];
}

/**
 * Build a 256-color Global Color Table optimized for 2D games, dark UI backgrounds,
 * and QA annotation callout swatches, paired with an O(1) 15-bit RGB lookup table.
 */
function buildPaletteAndLut(): { palette: Uint8Array; lut15: Uint8Array } {
  const palette = new Uint8Array(256 * 3);
  let idx = 0;

  const setColor = (r: number, g: number, b: number) => {
    if (idx >= 256) return;
    palette[idx * 3] = r;
    palette[idx * 3 + 1] = g;
    palette[idx * 3 + 2] = b;
    idx++;
  };

  // 1. 6x6x6 RGB cube (216 colors: indices 0..215)
  const steps = [0, 51, 102, 153, 204, 255];
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        setColor(steps[r], steps[g], steps[b]);
      }
    }
  }

  // 2. 24-step fine grayscale ramp (indices 216..239)
  for (let i = 0; i < 24; i++) {
    const v = Math.round(8 + (i * 238) / 23);
    setColor(v, v, v);
  }

  // 3. Exact QA Annotation Swatches + Dark Game Backgrounds + Neon Game Accents (indices 240..255)
  const exactHexColors = [
    [239, 68, 68],   // QA Red (#EF4444)
    [250, 204, 21],  // QA Yellow (#FACC15)
    [6, 182, 212],   // QA Cyan (#06B6D4)
    [34, 197, 94],   // QA Lime (#22C55E)
    [255, 255, 255], // QA White (#FFFFFF)
    [9, 13, 22],     // Studio Viewport Dark (#090D16)
    [11, 15, 26],    // Studio Bg (#0B0F1A)
    [16, 23, 38],    // Neon Bastion Deep Space (#101726)
    [20, 12, 14],    // Error Dark (#140C0E)
    [56, 189, 248],  // Neon Sky (#38BDF8)
    [244, 63, 94],   // Neon Rose (#F43F5E)
    [168, 85, 247],  // Neon Purple (#A855F7)
    [16, 185, 129],  // Neon Emerald (#10B981)
    [245, 158, 11],  // Neon Amber (#F59E0B)
    [99, 102, 241],  // Studio Indigo (#6366F1)
    [236, 72, 153]   // Neon Pink (#EC4899)
  ];
  for (const [r, g, b] of exactHexColors) {
    setColor(r, g, b);
  }

  // Precompute 15-bit RGB (32x32x32 = 32768) nearest palette index lookup table
  const lut15 = new Uint8Array(32768);
  for (let r5 = 0; r5 < 32; r5++) {
    const r = (r5 << 3) | (r5 >> 2);
    for (let g5 = 0; g5 < 32; g5++) {
      const g = (g5 << 3) | (g5 >> 2);
      for (let b5 = 0; b5 < 32; b5++) {
        const b = (b5 << 3) | (b5 >> 2);
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < 256; i++) {
          const pr = palette[i * 3];
          const pg = palette[i * 3 + 1];
          const pb = palette[i * 3 + 2];
          const dr = r - pr;
          const dg = g - pg;
          const db = b - pb;
          const dist = dr * dr * 2 + dg * dg * 4 + db * db;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
            if (dist === 0) break;
          }
        }
        lut15[(r5 << 10) | (g5 << 5) | b5] = bestIdx;
      }
    }
  }

  return { palette, lut15 };
}

let cachedPaletteAndLut: { palette: Uint8Array; lut15: Uint8Array } | null = null;

function getPaletteAndLut(): { palette: Uint8Array; lut15: Uint8Array } {
  if (!cachedPaletteAndLut) {
    cachedPaletteAndLut = buildPaletteAndLut();
  }
  return cachedPaletteAndLut;
}

class ByteBuilder {
  private buf: Uint8Array;
  public length = 0;

  constructor(initialCapacity = 262144) {
    this.buf = new Uint8Array(initialCapacity);
  }

  private ensure(extra: number): void {
    const needed = this.length + extra;
    if (needed <= this.buf.length) return;
    let nextCap = this.buf.length * 2;
    while (nextCap < needed) {
      nextCap *= 2;
    }
    const next = new Uint8Array(nextCap);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }

  public writeByte(b: number): void {
    this.ensure(1);
    this.buf[this.length++] = b & 0xff;
  }

  public writeUint16LE(v: number): void {
    this.ensure(2);
    this.buf[this.length++] = v & 0xff;
    this.buf[this.length++] = (v >> 8) & 0xff;
  }

  public writeBytes(bytes: Uint8Array | number[]): void {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.length);
    this.length += bytes.length;
  }

  public writeAscii(str: string): void {
    this.ensure(str.length);
    for (let i = 0; i < str.length; i++) {
      this.buf[this.length++] = str.charCodeAt(i) & 0xff;
    }
  }

  public toUint8Array(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

/**
 * LZW-compress indexed pixel indices (0..255) into GIF sub-blocks.
 */
function writeLzwImageData(out: ByteBuilder, indexedPixels: Uint8Array, trie: Int32Array): void {
  const minCodeSize = 8;
  const clearCode = 256;
  const eoiCode = 257;

  out.writeByte(minCodeSize);

  let codeSize = minCodeSize + 1; // 9 bits initially
  let nextCode = eoiCode + 1;     // 258
  let maxCode = (1 << codeSize) - 1;

  trie.fill(-1);

  const subBlock = new Uint8Array(255);
  let subBlockLen = 0;
  let bitBuf = 0;
  let bitCount = 0;

  const flushSubBlock = () => {
    if (subBlockLen > 0) {
      out.writeByte(subBlockLen);
      out.writeBytes(subBlock.subarray(0, subBlockLen));
      subBlockLen = 0;
    }
  };

  const emitCode = (code: number) => {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      subBlock[subBlockLen++] = bitBuf & 0xff;
      if (subBlockLen === 255) {
        flushSubBlock();
      }
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  emitCode(clearCode);

  if (indexedPixels.length > 0) {
    let prefix = indexedPixels[0];

    for (let i = 1; i < indexedPixels.length; i++) {
      const k = indexedPixels[i];
      const trieKey = (prefix << 8) | k;
      const existing = trie[trieKey];

      if (existing !== -1) {
        prefix = existing;
      } else {
        emitCode(prefix);
        if (nextCode < 4096) {
          trie[trieKey] = nextCode;
          if (nextCode > maxCode && codeSize < 12) {
            codeSize++;
            maxCode = (1 << codeSize) - 1;
          }
          nextCode++;
        } else {
          emitCode(clearCode);
          trie.fill(-1);
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
          maxCode = (1 << codeSize) - 1;
        }
        prefix = k;
      }
    }

    emitCode(prefix);
  }

  emitCode(eoiCode);

  if (bitCount > 0) {
    subBlock[subBlockLen++] = bitBuf & 0xff;
  }
  flushSubBlock();

  // Block terminator
  out.writeByte(0x00);
}

/**
 * Encode a sequence of RGBA frames into an animated GIF89a binary (`Uint8Array`).
 * Fails fast if dimensions or frame buffers are invalid.
 */
export function encodeAnimatedGif(options: EncodeGifOptions): Uint8Array {
  const { width, height, frames } = options;

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`[GifEncoder] Invalid GIF dimensions: ${width}x${height}.`);
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('[GifEncoder] encodeAnimatedGif requires at least 1 frame.');
  }

  const expectedByteLength = width * height * 4;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (!f || !f.rgba || f.rgba.length !== expectedByteLength) {
      throw new Error(
        `[GifEncoder] Frame ${i} RGBA length (${f?.rgba?.length ?? 0}) does not match ${width}x${height}x4 (${expectedByteLength}).`
      );
    }
  }

  const { palette, lut15 } = getPaletteAndLut();
  const out = new ByteBuilder(Math.max(65536, width * height * Math.min(frames.length, 8)));

  // 1. GIF89a Header
  out.writeAscii('GIF89a');

  // 2. Logical Screen Descriptor
  out.writeUint16LE(width);
  out.writeUint16LE(height);
  out.writeByte(0xf7); // Global Color Table (256 colors, 8-bit primary resolution)
  out.writeByte(0x00); // Background color index
  out.writeByte(0x00); // Default pixel aspect ratio

  // 3. Global Color Table (768 bytes)
  out.writeBytes(palette);

  // 4. Netscape 2.0 Application Extension (infinite loop = 0)
  out.writeBytes([
    0x21, 0xff, 0x0b,
    0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // "NETSCAPE2.0"
    0x03, 0x01, 0x00, 0x00, 0x00
  ]);

  // Reusable buffers across frames for zero GC churn
  const pixelCount = width * height;
  const indexedPixels = new Uint8Array(pixelCount);
  const trie = new Int32Array(4096 * 256);

  // 5. Encode each frame
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const rgba = frame.rgba;
    const delayCs = Math.max(2, Math.round((frame.delayMs || 66) / 10));

    // Quantize RGBA to palette index via 15-bit LUT
    for (let p = 0, src = 0; p < pixelCount; p++, src += 4) {
      const r5 = rgba[src] >> 3;
      const g5 = rgba[src + 1] >> 3;
      const b5 = rgba[src + 2] >> 3;
      indexedPixels[p] = lut15[(r5 << 10) | (g5 << 5) | b5];
    }

    // Graphic Control Extension
    out.writeBytes([0x21, 0xf9, 0x04, 0x00]);
    out.writeUint16LE(delayCs);
    out.writeBytes([0x00, 0x00]);

    // Image Descriptor
    out.writeByte(0x2c);
    out.writeUint16LE(0);
    out.writeUint16LE(0);
    out.writeUint16LE(width);
    out.writeUint16LE(height);
    out.writeByte(0x00);

    // LZW Image Data
    writeLzwImageData(out, indexedPixels, trie);
  }

  // 6. GIF Trailer
  out.writeByte(0x3b);

  return out.toUint8Array();
}

export interface ViewportCropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Detects the active rendered game viewport inside a potentially letterboxed or pillarboxed
 * canvas RGBA buffer. Ebitengine's WebGL canvas leaves letterbox bars transparent (`alpha === 0`)
 * or pure black (`rgb(0,0,0)`). Returns the tight `{ x, y, width, height }` of the game screen.
 */
export function detectActiveViewportBounds(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): ViewportCropBounds {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) {
    return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) };
  }

  const lastIdx = (width * height - 1) * 4;
  const topLeftAlpha = rgba[3];
  const bottomRightAlpha = rgba[lastIdx + 3];
  const useAlphaMask = topLeftAlpha === 0 || bottomRightAlpha === 0;

  // Check if top-left and bottom-right corners share a uniform dark letterbox background (#000000 or #090D16)
  const bgR = rgba[0];
  const bgG = rgba[1];
  const bgB = rgba[2];
  const cornersMatchDarkBg =
    !useAlphaMask &&
    bgR <= 12 &&
    bgG <= 16 &&
    bgB <= 26 &&
    Math.abs(rgba[lastIdx] - bgR) <= 2 &&
    Math.abs(rgba[lastIdx + 1] - bgG) <= 2 &&
    Math.abs(rgba[lastIdx + 2] - bgB) <= 2;

  const isGamePixel = (idx: number): boolean => {
    const a = rgba[idx + 3];
    if (useAlphaMask) {
      return a > 16;
    }
    if (cornersMatchDarkBg) {
      return (
        a > 16 &&
        (Math.abs(rgba[idx] - bgR) > 2 ||
          Math.abs(rgba[idx + 1] - bgG) > 2 ||
          Math.abs(rgba[idx + 2] - bgB) > 2)
      );
    }
    return a > 16 && (rgba[idx] > 0 || rgba[idx + 1] > 0 || rgba[idx + 2] > 0);
  };

  let minY = 0;
  let foundTop = false;
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 2) {
      if (isGamePixel(rowOffset + x * 4)) {
        minY = y;
        foundTop = true;
        break;
      }
    }
    if (foundTop) break;
  }

  if (!foundTop) {
    return { x: 0, y: 0, width, height };
  }

  let maxY = height - 1;
  for (let y = height - 1; y >= minY; y--) {
    const rowOffset = y * width * 4;
    let rowHasPixel = false;
    for (let x = 0; x < width; x += 2) {
      if (isGamePixel(rowOffset + x * 4)) {
        maxY = y;
        rowHasPixel = true;
        break;
      }
    }
    if (rowHasPixel) break;
  }

  let minX = 0;
  let foundLeft = false;
  for (let x = 0; x < width; x++) {
    for (let y = minY; y <= maxY; y += 2) {
      if (isGamePixel((y * width + x) * 4)) {
        minX = x;
        foundLeft = true;
        break;
      }
    }
    if (foundLeft) break;
  }

  let maxX = width - 1;
  for (let x = width - 1; x >= minX; x--) {
    let colHasPixel = false;
    for (let y = minY; y <= maxY; y += 2) {
      if (isGamePixel((y * width + x) * 4)) {
        maxX = x;
        colHasPixel = true;
        break;
      }
    }
    if (colHasPixel) break;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  if (cropW < 64 || cropH < 36) {
    return { x: 0, y: 0, width, height };
  }

  return { x: minX, y: minY, width: cropW, height: cropH };
}

/**
 * Convert a GIF binary `Uint8Array` into a `data:image/gif;base64,...` data URL.
 */
export function gifBytesToDataUrl(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  const binaryString = parts.join('');
  return `data:image/gif;base64,${btoa(binaryString)}`;
}


