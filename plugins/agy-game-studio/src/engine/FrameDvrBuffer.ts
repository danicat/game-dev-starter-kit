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

export interface DvrFrame {
  /** Chronological index within the current buffer (0 = oldest, length - 1 = newest/live) */
  index: number;
  /** Monotonic capture sequence number since buffer reset */
  frameNumber: number;
  /** Capture timestamp in milliseconds */
  timestampMs: number;
  /** Time offset in seconds relative to the newest frame in the buffer (<= 0, e.g. -9.96s .. 0.0s) */
  relativeSec: number;
  /** Captured frame width in pixels */
  width: number;
  /** Captured frame height in pixels */
  height: number;
  /** Encoded image data URL (computed lazily when backed by an offscreen canvas slot) */
  dataUrl: string;
  /** Optional direct offscreen 2D canvas slot for zero-copy scrubbing and GIF encoding */
  canvas?: HTMLCanvasElement;
}

export interface CanvasSnapshotSource {
  width: number;
  height: number;
  toDataURL(type?: string, quality?: any): string;
}

interface InternalSlot {
  frameNumber: number;
  timestampMs: number;
  width: number;
  height: number;
  dataUrl: string;
  canvas?: HTMLCanvasElement;
}

export class FrameDvrBuffer {
  public readonly maxFrames: number;
  public readonly captureIntervalMs: number;

  private slots: Array<InternalSlot | null>;
  private writePtr = 0;
  private count = 0;
  private sequence = 0;
  private lastCaptureTimeMs = -Infinity;

  constructor(maxFrames = 250, captureIntervalMs = 40) {
    if (!Number.isInteger(maxFrames) || maxFrames < 1) {
      throw new Error(`[FrameDvrBuffer] Invalid maxFrames=${maxFrames}. Must be a positive integer.`);
    }
    if (!Number.isFinite(captureIntervalMs) || captureIntervalMs < 1) {
      throw new Error(
        `[FrameDvrBuffer] Invalid captureIntervalMs=${captureIntervalMs}. Must be a positive number.`
      );
    }
    this.maxFrames = maxFrames;
    this.captureIntervalMs = captureIntervalMs;
    this.slots = new Array<InternalSlot | null>(maxFrames).fill(null);
  }

  /**
   * Current number of frames stored in the circular buffer (0 .. maxFrames).
   */
  public get length(): number {
    return this.count;
  }

  /**
   * Returns true if enough time has elapsed since the last recorded frame to sample at ~25 FPS.
   */
  public shouldCapture(timestampMs: number): boolean {
    return timestampMs - this.lastCaptureTimeMs >= this.captureIntervalMs;
  }

  /**
   * Records a snapshot from a canvas (or canvas-like snapshot source) into the circular ring buffer.
   * Overwrites the oldest slot when capacity (`maxFrames`) is reached.
   */
  public recordFrame(
    sourceCanvas: CanvasSnapshotSource,
    timestampMs: number = performance.now()
  ): DvrFrame {
    if (
      !sourceCanvas ||
      typeof sourceCanvas.toDataURL !== 'function' ||
      typeof sourceCanvas.width !== 'number' ||
      typeof sourceCanvas.height !== 'number'
    ) {
      throw new Error(
        '[FrameDvrBuffer] recordFrame requires a valid canvas element with width, height, and toDataURL().'
      );
    }
    if (sourceCanvas.width <= 0 || sourceCanvas.height <= 0) {
      throw new Error(
        `[FrameDvrBuffer] Cannot record frame from zero-sized canvas (${sourceCanvas.width}x${sourceCanvas.height}).`
      );
    }

    const dataUrl = sourceCanvas.toDataURL('image/png');
    return this.recordFrameDataUrl(dataUrl, sourceCanvas.width, sourceCanvas.height, timestampMs);
  }

  /**
   * Records a pre-encoded image data URL snapshot directly into the circular ring buffer.
   */
  public recordFrameDataUrl(
    dataUrl: string,
    width: number,
    height: number,
    timestampMs: number = performance.now()
  ): DvrFrame {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new Error('[FrameDvrBuffer] Canvas toDataURL() did not return a valid image data URI.');
    }
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error(
        `[FrameDvrBuffer] Cannot record frame from zero-sized canvas (${width}x${height}).`
      );
    }

    const frameNumber = ++this.sequence;
    const slot: InternalSlot = {
      frameNumber,
      timestampMs,
      width,
      height,
      dataUrl
    };

    // Overwrite oldest slot in circular buffer without allocating new array capacity
    this.slots[this.writePtr] = slot;
    this.writePtr = (this.writePtr + 1) % this.maxFrames;
    if (this.count < this.maxFrames) {
      this.count++;
    }
    this.lastCaptureTimeMs = timestampMs;

    return {
      index: this.count - 1,
      frameNumber,
      timestampMs,
      relativeSec: 0,
      width: slot.width,
      height: slot.height,
      dataUrl: slot.dataUrl
    };
  }

  /**
   * Records a pre-blitted offscreen 2D `<canvas>` slot without calling `toDataURL()` on the hot path.
   */
  public recordCanvasSlot(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    timestampMs: number
  ): void {
    const frameNumber = ++this.sequence;
    const slot: InternalSlot = {
      frameNumber,
      timestampMs,
      width,
      height,
      dataUrl: '',
      canvas
    };
    this.slots[this.writePtr] = slot;
    this.writePtr = (this.writePtr + 1) % this.maxFrames;
    if (this.count < this.maxFrames) {
      this.count++;
    }
    this.lastCaptureTimeMs = timestampMs;
  }

  /**
   * Records a frame only if `captureIntervalMs` has elapsed since the previous capture.
   */
  public recordFrameIfDue(
    sourceCanvas: CanvasSnapshotSource,
    timestampMs: number = performance.now()
  ): DvrFrame | null {
    if (!this.shouldCapture(timestampMs)) {
      return null;
    }
    return this.recordFrame(sourceCanvas, timestampMs);
  }

  private createDvrFrameFromSlot(slot: InternalSlot, index: number, relativeSec: number): DvrFrame {
    return {
      index,
      frameNumber: slot.frameNumber,
      timestampMs: slot.timestampMs,
      relativeSec,
      width: slot.width,
      height: slot.height,
      canvas: slot.canvas,
      get dataUrl(): string {
        if (!slot.dataUrl && slot.canvas) {
          slot.dataUrl = slot.canvas.toDataURL('image/png');
        }
        return slot.dataUrl;
      }
    };
  }

  /**
   * Returns all buffered frames ordered chronologically from oldest (index 0) to newest (index length - 1).
   */
  public getFrames(): DvrFrame[] {
    if (this.count === 0) {
      return [];
    }

    const startSlot = this.count < this.maxFrames ? 0 : this.writePtr;
    const newestSlotIdx = (startSlot + this.count - 1) % this.maxFrames;
    const newestSlot = this.slots[newestSlotIdx];
    const newestTimestamp = newestSlot ? newestSlot.timestampMs : 0;

    const result: DvrFrame[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const physicalIdx = (startSlot + i) % this.maxFrames;
      const slot = this.slots[physicalIdx]!;
      const rawRel = (slot.timestampMs - newestTimestamp) / 1000;
      const relativeSec = rawRel === 0 ? 0 : Number(rawRel.toFixed(2));
      result[i] = this.createDvrFrameFromSlot(slot, i, relativeSec);
    }

    return result;
  }

  /**
   * Retrieves the frame at chronological index `index` (0 = oldest, length - 1 = newest).
   */
  public getFrameAt(index: number): DvrFrame | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      return null;
    }
    const startSlot = this.count < this.maxFrames ? 0 : this.writePtr;
    const physicalIdx = (startSlot + index) % this.maxFrames;
    const slot = this.slots[physicalIdx];
    if (!slot) {
      return null;
    }

    const newestSlotIdx = (startSlot + this.count - 1) % this.maxFrames;
    const newestSlot = this.slots[newestSlotIdx];
    const newestTimestamp = newestSlot ? newestSlot.timestampMs : slot.timestampMs;
    const rawRel = (slot.timestampMs - newestTimestamp) / 1000;
    const relativeSec = rawRel === 0 ? 0 : Number(rawRel.toFixed(2));

    return this.createDvrFrameFromSlot(slot, index, relativeSec);
  }

  /**
   * Returns the most recently recorded frame (live head), or null if the buffer is empty.
   */
  public getLatestFrame(): DvrFrame | null {
    if (this.count === 0) {
      return null;
    }
    return this.getFrameAt(this.count - 1);
  }

  /**
   * Clears all recorded frames and resets pointers.
   */
  public clear(): void {
    this.slots.fill(null);
    this.writePtr = 0;
    this.count = 0;
    this.lastCaptureTimeMs = -Infinity;
  }
}
