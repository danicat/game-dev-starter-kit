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

import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameDvrBuffer } from '../src/engine/FrameDvrBuffer.ts';
import {
  BugAnnotator,
  QA_COLOR_SWATCHES,
  hexToRgba,
  getAnnotationShapesBounds,
  unionViewportAndAnnotationBounds
} from '../src/engine/BugAnnotator.ts';
import {
  encodeAnimatedGif,
  gifBytesToDataUrl,
  detectActiveViewportBounds
} from '../src/engine/GifEncoder.ts';

function createTestCanvasSource(label, width = 640, height = 360) {
  return {
    width,
    height,
    toDataURL(type = 'image/png') {
      return `data:${type};base64,FRAME_${label}`;
    }
  };
}

test('FrameDvrBuffer: records frames in chronological order and computes relativeSec', () => {
  const dvr = new FrameDvrBuffer(75, 66);
  assert.equal(dvr.length, 0);
  assert.equal(dvr.getLatestFrame(), null);
  assert.deepEqual(dvr.getFrames(), []);

  dvr.recordFrame(createTestCanvasSource('f1'), 1000);
  dvr.recordFrame(createTestCanvasSource('f2'), 1500);
  dvr.recordFrame(createTestCanvasSource('f3'), 2000);

  assert.equal(dvr.length, 3);

  const frames = dvr.getFrames();
  assert.equal(frames.length, 3);
  assert.equal(frames[0].index, 0);
  assert.equal(frames[0].frameNumber, 1);
  assert.equal(frames[0].relativeSec, -1);
  assert.equal(frames[0].dataUrl, 'data:image/png;base64,FRAME_f1');

  assert.equal(frames[1].index, 1);
  assert.equal(frames[1].frameNumber, 2);
  assert.equal(frames[1].relativeSec, -0.5);

  assert.equal(frames[2].index, 2);
  assert.equal(frames[2].frameNumber, 3);
  assert.equal(frames[2].relativeSec, 0);
  assert.equal(frames[2].dataUrl, 'data:image/png;base64,FRAME_f3');

  const latest = dvr.getLatestFrame();
  assert.ok(latest);
  assert.equal(latest.frameNumber, 3);
  assert.equal(latest.index, 2);
});

test('FrameDvrBuffer: overwrites oldest slots when circular capacity (75) is exceeded', () => {
  const dvr = new FrameDvrBuffer(75, 66);

  // Record 100 frames spaced by 66.67ms (~15 FPS)
  for (let i = 1; i <= 100; i++) {
    dvr.recordFrame(createTestCanvasSource(`seq_${i}`), i * 66.67);
  }

  assert.equal(dvr.length, 75);

  const frames = dvr.getFrames();
  assert.equal(frames.length, 75);

  // Oldest retained frame should be frame #26 at chronological index 0
  assert.equal(frames[0].index, 0);
  assert.equal(frames[0].frameNumber, 26);
  assert.equal(frames[0].dataUrl, 'data:image/png;base64,FRAME_seq_26');
  assert.ok(frames[0].relativeSec < -4.8 && frames[0].relativeSec >= -5.05);

  // Newest retained frame should be frame #100 at chronological index 74
  const last = frames[74];
  assert.equal(last.index, 74);
  assert.equal(last.frameNumber, 100);
  assert.equal(last.relativeSec, 0);
  assert.equal(last.dataUrl, 'data:image/png;base64,FRAME_seq_100');

  // Verify random access via getFrameAt() matches getFrames()
  const mid = dvr.getFrameAt(30);
  assert.deepEqual(mid, frames[30]);
  assert.equal(dvr.getFrameAt(-1), null);
  assert.equal(dvr.getFrameAt(75), null);

  // Clear resets state completely
  dvr.clear();
  assert.equal(dvr.length, 0);
  assert.deepEqual(dvr.getFrames(), []);
  assert.equal(dvr.getLatestFrame(), null);
});

test('FrameDvrBuffer: recordFrameIfDue throttles sampling to captureIntervalMs (66ms)', () => {
  const dvr = new FrameDvrBuffer(75, 66);

  const r1 = dvr.recordFrameIfDue(createTestCanvasSource('t0'), 0);
  assert.ok(r1);
  assert.equal(dvr.length, 1);

  // Too soon (16ms elapsed < 66ms)
  const r2 = dvr.recordFrameIfDue(createTestCanvasSource('t16'), 16);
  assert.equal(r2, null);
  assert.equal(dvr.length, 1);

  // Due (66ms elapsed >= 66ms)
  const r3 = dvr.recordFrameIfDue(createTestCanvasSource('t66'), 66);
  assert.ok(r3);
  assert.equal(dvr.length, 2);
});

test('FrameDvrBuffer: fails fast on invalid capacity or zero-sized canvas', () => {
  assert.throws(() => new FrameDvrBuffer(0, 66), /Invalid maxFrames/);
  const dvr = new FrameDvrBuffer(10, 66);
  assert.throws(
    () => dvr.recordFrame(createTestCanvasSource('bad', 0, 360), 100),
    /zero-sized canvas/
  );
});

test('BugAnnotator: manages shape history (add / undo / redo / clear) without mutation leaks', () => {
  let historyNotifications = 0;
  const annotator = new BugAnnotator({
    width: 640,
    height: 360,
    onHistoryChange: () => {
      historyNotifications++;
    }
  });

  assert.equal(annotator.canUndo(), false);
  assert.equal(annotator.canRedo(), false);
  assert.equal(annotator.getShapes().length, 0);

  const boxShape = {
    id: 'box-1',
    type: 'box',
    color: QA_COLOR_SWATCHES[0].hex,
    strokeWidth: 3,
    x: 100,
    y: 120,
    width: 80,
    height: 60
  };
  annotator.addShape(boxShape);

  assert.equal(annotator.getShapes().length, 1);
  assert.equal(annotator.canUndo(), true);
  assert.equal(annotator.canRedo(), false);
  assert.equal(historyNotifications, 1);

  const arrowShape = {
    id: 'arrow-1',
    type: 'arrow',
    color: QA_COLOR_SWATCHES[1].hex,
    strokeWidth: 3,
    startX: 40,
    startY: 40,
    endX: 95,
    endY: 115
  };
  annotator.addShape(arrowShape);

  const textShape = annotator.addTextAnnotation(200, 150, 'Collider offset by 6px');
  assert.ok(textShape);
  assert.equal(annotator.getShapes().length, 3);

  // Undo text annotation
  assert.equal(annotator.undo(), true);
  assert.equal(annotator.getShapes().length, 2);
  assert.equal(annotator.canRedo(), true);

  // Undo arrow annotation
  assert.equal(annotator.undo(), true);
  assert.equal(annotator.getShapes().length, 1);
  assert.equal(annotator.getShapes()[0].id, 'box-1');

  // Redo arrow annotation
  assert.equal(annotator.redo(), true);
  assert.equal(annotator.getShapes().length, 2);
  assert.equal(annotator.getShapes()[1].id, 'arrow-1');

  // Adding a new pen shape after undo clears the redo stack
  annotator.addShape({
    id: 'pen-1',
    type: 'pen',
    color: QA_COLOR_SWATCHES[2].hex,
    strokeWidth: 3,
    points: [
      { x: 10, y: 10 },
      { x: 20, y: 25 }
    ]
  });
  assert.equal(annotator.canRedo(), false);
  assert.equal(annotator.getShapes().length, 3);

  // Clear all annotations (and verify clear itself is undoable!)
  annotator.clearAnnotations();
  assert.equal(annotator.getShapes().length, 0);
  assert.equal(annotator.canUndo(), true);

  assert.equal(annotator.undo(), true);
  assert.equal(annotator.getShapes().length, 3);
});

test('BugAnnotator: exports composite PNG dataUrl combining baseCanvas and vector shapes', () => {
  const ops = [];
  const fakeBaseCanvas = { width: 640, height: 360 };
  const fakeOffscreenCanvas = {
    width: 0,
    height: 0,
    getContext(type) {
      assert.equal(type, '2d');
      return {
        save() { ops.push('save'); },
        restore() { ops.push('restore'); },
        beginPath() { ops.push('beginPath'); },
        closePath() { ops.push('closePath'); },
        moveTo(x, y) { ops.push(`moveTo:${x},${y}`); },
        lineTo(x, y) { ops.push(`lineTo:${Math.round(x)},${Math.round(y)}`); },
        stroke() { ops.push('stroke'); },
        fill() { ops.push('fill'); },
        fillRect(x, y, w, h) { ops.push(`fillRect:${x},${y},${w},${h}`); },
        strokeRect(x, y, w, h) { ops.push(`strokeRect:${x},${y},${w},${h}`); },
        roundRect(x, y, w, h) { ops.push(`roundRect:${x},${y},${w},${h}`); },
        fillText(text) { ops.push(`fillText:${text}`); },
        measureText(text) { return { width: text.length * 7 }; },
        drawImage(src, x, y, w, h) {
          assert.equal(src, fakeBaseCanvas);
          ops.push(`drawImage:${x},${y},${w},${h}`);
        }
      };
    },
    toDataURL(mime) {
      assert.equal(mime, 'image/png');
      return 'data:image/png;base64,COMPOSITE_OK';
    }
  };

  const annotator = new BugAnnotator({
    baseCanvas: fakeBaseCanvas,
    width: 640,
    height: 360
  });

  annotator.addShape({
    id: 'b1',
    type: 'box',
    color: '#EF4444',
    strokeWidth: 3,
    x: 50,
    y: 60,
    width: 100,
    height: 80
  });
  annotator.addTextAnnotation(120, 90, 'Sprite clipping');

  const dataUrl = annotator.exportCompositeDataUrl(fakeOffscreenCanvas);
  assert.equal(dataUrl, 'data:image/png;base64,COMPOSITE_OK');
  assert.ok(ops.includes('drawImage:0,0,640,360'));
  assert.ok(ops.includes('fillRect:50,60,100,80'));
  assert.ok(ops.includes('fillText:Sprite clipping'));
  assert.equal(hexToRgba('#EF4444', 0.14), 'rgba(239, 68, 68, 0.14)');
});

test('GifEncoder: encodes multi-frame RGBA animation into valid GIF89a with NETSCAPE2.0 loop and trailer 0x3B', () => {
  const width = 16;
  const height = 12;
  const pixelCount = width * height;

  const frame1 = new Uint8ClampedArray(pixelCount * 4);
  const frame2 = new Uint8ClampedArray(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    // Frame 1: dark background with red bar
    frame1[i * 4] = i < 48 ? 239 : 9;
    frame1[i * 4 + 1] = i < 48 ? 68 : 13;
    frame1[i * 4 + 2] = i < 48 ? 68 : 22;
    frame1[i * 4 + 3] = 255;

    // Frame 2: shifted cyan bar
    frame2[i * 4] = i >= 48 && i < 96 ? 6 : 9;
    frame2[i * 4 + 1] = i >= 48 && i < 96 ? 182 : 13;
    frame2[i * 4 + 2] = i >= 48 && i < 96 ? 212 : 22;
    frame2[i * 4 + 3] = 255;
  }

  const gifBytes = encodeAnimatedGif({
    width,
    height,
    frames: [
      { rgba: frame1, delayMs: 66 },
      { rgba: frame2, delayMs: 1500 }
    ]
  });

  assert.ok(gifBytes instanceof Uint8Array);
  assert.ok(gifBytes.length > 800, `Expected GIF bytes > 800, got ${gifBytes.length}`);

  // Check GIF89a magic signature
  const headerAscii = Buffer.from(gifBytes.subarray(0, 6)).toString('ascii');
  assert.equal(headerAscii, 'GIF89a');

  // Check Logical Screen Descriptor dimensions (little-endian 16x12)
  assert.equal(gifBytes[6] | (gifBytes[7] << 8), width);
  assert.equal(gifBytes[8] | (gifBytes[9] << 8), height);

  // Check NETSCAPE2.0 loop extension exists
  const fullAscii = Buffer.from(gifBytes).toString('latin1');
  assert.ok(fullAscii.includes('NETSCAPE2.0'), 'Expected NETSCAPE2.0 infinite loop block');

  // Check GIF trailer byte (0x3B)
  assert.equal(gifBytes[gifBytes.length - 1], 0x3b);

  // Check base64 data URL conversion
  const dataUrl = gifBytesToDataUrl(gifBytes);
  assert.ok(dataUrl.startsWith('data:image/gif;base64,R0lGODlh'));

  // Fail-fast checks
  assert.throws(() => encodeAnimatedGif({ width: 0, height: 10, frames: [{ rgba: frame1, delayMs: 66 }] }), /Invalid GIF dimensions/);
  assert.throws(() => encodeAnimatedGif({ width: 16, height: 12, frames: [] }), /requires at least 1 frame/);
});

test('GifEncoder: detectActiveViewportBounds crops transparent and black letterbox bars to true game resolution', () => {
  const fullW = 480;
  const fullH = 625;
  const gameY = 177;
  const gameH = 270;

  // 1. Transparent letterbox bars (alpha=0 outside 480x270 game viewport)
  const alphaRgba = new Uint8ClampedArray(fullW * fullH * 4);
  for (let y = gameY; y < gameY + gameH; y++) {
    for (let x = 0; x < fullW; x++) {
      const idx = (y * fullW + x) * 4;
      alphaRgba[idx] = 0;
      alphaRgba[idx + 1] = 0;
      alphaRgba[idx + 2] = 0;
      alphaRgba[idx + 3] = 255; // even pure-black game pixels have alpha=255
    }
  }
  const alphaCrop = detectActiveViewportBounds(alphaRgba, fullW, fullH);
  assert.deepEqual(alphaCrop, { x: 0, y: gameY, width: fullW, height: gameH });

  // 2. Opaque black letterbox bars (alpha=255 everywhere, rgb(0,0,0) outside game viewport)
  const blackRgba = new Uint8ClampedArray(fullW * fullH * 4);
  for (let i = 0; i < fullW * fullH; i++) {
    blackRgba[i * 4 + 3] = 255;
  }
  for (let y = gameY; y < gameY + gameH; y++) {
    for (let x = 0; x < fullW; x++) {
      const idx = (y * fullW + x) * 4;
      blackRgba[idx] = 16;
      blackRgba[idx + 1] = 23;
      blackRgba[idx + 2] = 38;
    }
  }
  const blackCrop = detectActiveViewportBounds(blackRgba, fullW, fullH);
  assert.deepEqual(blackCrop, { x: 0, y: gameY, width: fullW, height: gameH });

  // 3. When no annotations or annotations are inside the game viewport -> keeps exact 480x270 game resolution
  const insideAnn = getAnnotationShapesBounds(
    [{ id: 'a1', type: 'box', color: '#EF4444', strokeWidth: 3, x: 100, y: 200, width: 80, height: 50 }],
    fullW,
    fullH
  );
  const insideUnion = unionViewportAndAnnotationBounds(alphaCrop, insideAnn, fullW, fullH);
  assert.deepEqual(insideUnion, { x: 0, y: gameY, width: fullW, height: gameH });

  // 4. When an annotation is drawn in the top empty scratch space (y=40) -> expands top only, crops bottom padding
  const topScratchAnn = getAnnotationShapesBounds(
    [{ id: 't1', type: 'text', color: '#FACC15', x: 120, y: 40, text: 'Spawn bug here' }],
    fullW,
    fullH,
    12
  );
  const expandedUnion = unionViewportAndAnnotationBounds(alphaCrop, topScratchAnn, fullW, fullH);
  assert.equal(expandedUnion.x, 0);
  assert.ok(expandedUnion.y < gameY, `Expected top y (${expandedUnion.y}) to expand above gameY (${gameY})`);
  assert.equal(expandedUnion.width, fullW);
  assert.equal(
    expandedUnion.y + expandedUnion.height,
    gameY + gameH,
    'Bottom empty space without annotations should remain cropped out'
  );
});



