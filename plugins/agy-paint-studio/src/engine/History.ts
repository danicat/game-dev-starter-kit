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

import { Layer } from './Layer.ts';

export interface LayerSnapshot {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: GlobalCompositeOperation;
  version: number;
  canvas: HTMLCanvasElement;
}

export interface HistoryState {
  width: number;
  height: number;
  activeLayerIndex: number;
  layers: LayerSnapshot[];
}

export class HistoryManager {
  public history: HistoryState[] = [];
  public currentIndex = -1;
  private maxStates: number;

  constructor(maxStates = 30) {
    if (maxStates <= 0 || !Number.isFinite(maxStates)) {
      throw new Error(`Invalid maxStates for HistoryManager: ${maxStates}`);
    }
    this.maxStates = maxStates;
  }

  public pushState(layers: Layer[], activeLayerIndex: number): void {
    if (!Array.isArray(layers) || layers.length === 0) {
      throw new Error('Cannot push history state with an empty layer stack.');
    }

    const prevState = this.currentIndex >= 0 ? this.history[this.currentIndex] : undefined;

    // Truncate any future redo states if we branched after an undo
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    const layerSnapshots: LayerSnapshot[] = layers.map((layer) => {
      const existingSnap = prevState?.layers.find(
        (s) =>
          s.id === layer.id &&
          s.version === layer.version &&
          s.canvas.width === layer.canvas.width &&
          s.canvas.height === layer.canvas.height
      );

      let snapCanvas: HTMLCanvasElement;
      if (existingSnap) {
        // Copy-on-Write: reuse the previous snapshot's immutable canvas reference when unmodified
        snapCanvas = existingSnap.canvas;
      } else {
        snapCanvas = document.createElement('canvas');
        snapCanvas.width = layer.canvas.width;
        snapCanvas.height = layer.canvas.height;
        const snapCtx = snapCanvas.getContext('2d');
        if (!snapCtx) {
          throw new Error(
            `Failed to create 2D rendering context for history snapshot of layer "${layer.name}" (${layer.id})`
          );
        }
        snapCtx.drawImage(layer.canvas, 0, 0);
      }

      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        version: layer.version,
        canvas: snapCanvas
      };
    });

    const width = layers[0].canvas.width;
    const height = layers[0].canvas.height;

    this.history.push({
      width,
      height,
      activeLayerIndex,
      layers: layerSnapshots
    });

    if (this.history.length > this.maxStates) {
      this.history.shift();
    }

    this.currentIndex = this.history.length - 1;
  }

  public canUndo(): boolean {
    return this.currentIndex > 0;
  }

  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  public undo(): HistoryState | null {
    if (!this.canUndo()) {
      return null;
    }
    this.currentIndex--;
    return this.history[this.currentIndex];
  }

  public redo(): HistoryState | null {
    if (!this.canRedo()) {
      return null;
    }
    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  public clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}
