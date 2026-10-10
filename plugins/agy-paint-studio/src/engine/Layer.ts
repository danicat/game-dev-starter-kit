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

export class Layer {
  public id: string;
  public name: string;
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public visible: boolean = true;
  public locked: boolean = false;
  public opacity: number = 1.0;
  public blendMode: GlobalCompositeOperation = 'source-over';
  public version: number = 0;

  constructor(width: number, height: number, name = 'Layer') {
    if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
      throw new Error(
        `Invalid dimensions for Layer "${name}": width=${width}, height=${height}. Dimensions must be positive finite numbers.`
      );
    }

    this.id = 'layer_' + Math.random().toString(36).substring(2, 9);
    this.name = name;
    this.visible = true;
    this.locked = false;
    this.opacity = 1.0;
    this.blendMode = 'source-over';
    this.version = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width);
    this.canvas.height = Math.round(height);
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error(`Failed to create 2D rendering context for layer "${name}"`);
    }
    this.ctx = ctx;
  }

  public markDirty(): void {
    this.version++;
  }

  public resize(newWidth: number, newHeight: number, preserveContent = true): void {
    if (newWidth <= 0 || newHeight <= 0 || !Number.isFinite(newWidth) || !Number.isFinite(newHeight)) {
      throw new Error(`Invalid dimensions for layer resize: ${newWidth}x${newHeight}`);
    }
    if (this.canvas.width === newWidth && this.canvas.height === newHeight) {
      return;
    }

    if (!preserveContent) {
      this.canvas.width = Math.round(newWidth);
      this.canvas.height = Math.round(newHeight);
      this.markDirty();
      return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      throw new Error(`Failed to create temporary 2D context while resizing layer "${this.name}"`);
    }
    tempCtx.drawImage(this.canvas, 0, 0);

    this.canvas.width = Math.round(newWidth);
    this.canvas.height = Math.round(newHeight);
    this.ctx.drawImage(tempCanvas, 0, 0);
    this.markDirty();
  }

  public clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.markDirty();
  }

  public fill(color: string): void {
    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.markDirty();
  }

  public clone(): Layer {
    const cloned = new Layer(this.canvas.width, this.canvas.height, `${this.name} Copy`);
    cloned.visible = this.visible;
    cloned.locked = this.locked;
    cloned.opacity = this.opacity;
    cloned.blendMode = this.blendMode;
    cloned.version = this.version;
    cloned.ctx.drawImage(this.canvas, 0, 0);
    return cloned;
  }

  public getImageData(): ImageData {
    return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }

  public putImageData(imageData: ImageData, dx = 0, dy = 0): void {
    this.ctx.putImageData(imageData, dx, dy);
    this.markDirty();
  }
}
