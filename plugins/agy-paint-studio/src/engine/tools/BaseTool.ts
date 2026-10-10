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

import type { CanvasEngine } from '../CanvasEngine.ts';
import type { Layer } from '../Layer.ts';
import { NotificationManager } from '../../ui/Notification.ts';

export interface Point {
  x: number;
  y: number;
}

export abstract class BaseTool {
  public id: string;
  public name: string;
  public cursor: string;

  constructor(id: string, name: string, cursor = 'crosshair') {
    this.id = id;
    this.name = name;
    this.cursor = cursor;
  }

  protected getWritableActiveLayer(engine: CanvasEngine): Layer | null {
    const layer = engine.getActiveLayer();
    if (!layer) {
      NotificationManager.error('No active layer selected.');
      return null;
    }
    if (!layer.visible) {
      NotificationManager.error('Cannot draw on a hidden layer.');
      return null;
    }
    if (layer.locked) {
      NotificationManager.error('Cannot draw on a locked layer.');
      return null;
    }
    return layer;
  }

  abstract onPointerDown(engine: CanvasEngine, pt: Point, originalEvent: MouseEvent | TouchEvent): void;
  abstract onPointerMove(engine: CanvasEngine, pt: Point, originalEvent: MouseEvent | TouchEvent): void;
  abstract onPointerUp(engine: CanvasEngine, pt: Point, originalEvent: MouseEvent | TouchEvent): void;

  // Optional tool overlay rendering (e.g. selection marching ants or shape preview)
  public renderOverlay(_engine: CanvasEngine, _ctx: CanvasRenderingContext2D): void {}

  // Cancel or cleanup when switching tools
  public deactivate(_engine: CanvasEngine): void {}
}
