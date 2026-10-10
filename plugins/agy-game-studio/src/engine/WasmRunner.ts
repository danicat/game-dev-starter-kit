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

import { getApiBaseUrl } from '../utils/api.ts';
import type { FrameDvrBuffer } from './FrameDvrBuffer.ts';

export interface WasmRunnerCallbacks {
  onFrameRecorded?: () => void;
  onPauseChange?: (paused: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  onLog?: (level: 'log' | 'warn' | 'error', line: string, allLogs: string[]) => void;
  onPanic?: (message: string, allLogs: string[]) => void;
  onStateChange?: (state: 'idle' | 'loading' | 'running' | 'paused' | 'error') => void;
}

interface ChildMessage {
  source: 'playtest-runner-child';
  runnerId: number;
  type:
    | 'READY'
    | 'FRAME'
    | 'LOG'
    | 'PANIC'
    | 'TOGGLE_PAUSE'
    | 'FOCUS_CHANGE';
  dataUrl?: string;
  width?: number;
  height?: number;
  timestampMs?: number;
  level?: 'log' | 'warn' | 'error';
  text?: string;
  message?: string;
  focused?: boolean;
}

const MAX_LOG_LINES = 200;
const BOOT_TIMEOUT_MS = 15_000;

export class WasmRunner {
  private container: HTMLElement;
  private dvrBuffer: FrameDvrBuffer;
  private callbacks: WasmRunnerCallbacks;

  private iframe: HTMLIFrameElement | null = null;
  private currentRunnerId = 0;
  private activeMessageHandler: ((e: MessageEvent) => void) | null = null;

  private paused = false;
  private muted = false;
  private focused = false;
  private running = false;
  private consoleLogs: string[] = [];

  constructor(
    container: HTMLElement,
    dvrBuffer: FrameDvrBuffer,
    callbacks: WasmRunnerCallbacks = {}
  ) {
    this.container = container;
    this.dvrBuffer = dvrBuffer;
    this.callbacks = callbacks;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isFocused(): boolean {
    return this.focused;
  }

  public getConsoleLogs(): string[] {
    return [...this.consoleLogs];
  }

  public clearConsoleLogs(): void {
    this.consoleLogs = [];
  }

  public getGameCanvas(): HTMLCanvasElement | null {
    try {
      const doc = this.iframe?.contentWindow?.document;
      if (!doc) return null;
      return (
        ((this.iframe?.contentWindow as any)?.__ACTIVE_GAME_CANVAS__ as HTMLCanvasElement) ||
        doc.querySelector('canvas')
      );
    } catch {
      return null;
    }
  }

  /**
   * Mounts the sidecar-hosted `/api/playtest/runner?buildId=...` endpoint inside an `<iframe>`.
   * Inside Antigravity's UI Extension Aux Pane, this runs directly over HTTP on the sidecar origin
   * with full WebAssembly, WebGL2, and WebAudio support.
   */
  public async launchBuild(buildId: string): Promise<void> {
    if (!buildId || typeof buildId !== 'string') {
      throw new Error('[WasmRunner] launchBuild requires a non-empty buildId.');
    }

    this.destroy();
    this.dvrBuffer.clear();
    this.clearConsoleLogs();
    this.paused = false;
    this.callbacks.onStateChange?.('loading');

    await this.mountSidecarRunnerIframe({ buildId });
  }

  private postToChild(payload: Record<string, unknown>): void {
    if (!this.iframe?.contentWindow) {
      return;
    }
    this.iframe.contentWindow.postMessage(
      {
        source: 'playtest-runner-parent',
        runnerId: this.currentRunnerId,
        ...payload,
      },
      '*'
    );
  }

  private mountSidecarRunnerIframe(options: { buildId: string }): Promise<void> {
    return new Promise((resolve, reject) => {
      const runnerId = ++this.currentRunnerId;
      let settled = false;

      const bootTimer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.callbacks.onStateChange?.('error');
          reject(
            new Error(
              `[WasmRunner] Timed out after ${BOOT_TIMEOUT_MS}ms waiting for sidecar runner iframe (/api/playtest/runner) to initialize.`
            )
          );
        }
      }, BOOT_TIMEOUT_MS);

      const onMessage = (event: MessageEvent) => {
        const data = event.data as ChildMessage | null;
        if (!data || data.source !== 'playtest-runner-child' || data.runnerId !== runnerId) {
          return;
        }

        switch (data.type) {
          case 'READY': {
            this.running = true;
            this.callbacks.onStateChange?.('running');
            if (!settled) {
              settled = true;
              window.clearTimeout(bootTimer);
              resolve();
            }
            break;
          }

          case 'FRAME': {
            if (
              typeof data.dataUrl === 'string' &&
              typeof data.width === 'number' &&
              typeof data.height === 'number' &&
              data.width > 0 &&
              data.height > 0
            ) {
              try {
                this.dvrBuffer.recordFrameDataUrl(
                  data.dataUrl,
                  data.width,
                  data.height,
                  data.timestampMs ?? performance.now()
                );
                this.callbacks.onFrameRecorded?.();
              } catch (err) {
                console.error('[WasmRunner] Frame DVR capture error:', err);
              }
            }
            break;
          }

          case 'LOG': {
            const level = data.level || 'log';
            this.appendLog(level, data.text || '');
            break;
          }

          case 'PANIC': {
            const msg = data.message || 'Unknown Go WASM runtime error';
            this.appendLog('error', msg);
            this.callbacks.onPanic?.(msg, this.getConsoleLogs());
            if (!settled) {
              settled = true;
              window.clearTimeout(bootTimer);
              reject(new Error(msg));
            }
            break;
          }

          case 'TOGGLE_PAUSE': {
            this.togglePause();
            break;
          }

          case 'FOCUS_CHANGE': {
            const isFocused = Boolean(data.focused);
            this.focused = isFocused;
            this.callbacks.onFocusChange?.(isFocused);
            break;
          }
        }
      };

      this.activeMessageHandler = onMessage;
      window.addEventListener('message', onMessage);

      const baseUrl = getApiBaseUrl();
      const params = new URLSearchParams({
        runnerId: String(runnerId),
        muted: this.muted ? '1' : '0',
        captureIntervalMs: String(this.dvrBuffer.captureIntervalMs),
        buildId: options.buildId,
      });
      const pageToken = new URLSearchParams(window.location.search).get('token');
      if (pageToken) {
        params.set('token', pageToken);
      }

      const runnerUrl = `${baseUrl}/api/playtest/runner?${params.toString()}`;
      const iframe = document.createElement('iframe');
      iframe.className = 'wasm-runner-iframe';
      iframe.setAttribute('title', 'Ebitengine Playtest Viewport');
      iframe.src = runnerUrl;

      this.container.innerHTML = '';
      this.container.appendChild(iframe);
      this.iframe = iframe;
    });
  }

  public syncDvrFromChild(): void {
    try {
      const childWin = this.iframe?.contentWindow as any;
      if (!childWin || typeof childWin.__PLAYTEST_GET_DVR_FRAMES__ !== 'function') {
        return;
      }
      const rawSlots = childWin.__PLAYTEST_GET_DVR_FRAMES__();
      if (!Array.isArray(rawSlots) || rawSlots.length === 0) {
        return;
      }
      this.dvrBuffer.clear();
      for (let i = 0; i < rawSlots.length; i++) {
        const s = rawSlots[i];
        if (s && s.canvas && s.width > 0 && s.height > 0) {
          this.dvrBuffer.recordCanvasSlot(s.canvas, s.width, s.height, s.timestampMs);
        }
      }
    } catch {
      // Ignore cross-origin restrictions if any
    }
  }

  public captureImmediateFrame(): void {
    if (!this.running) {
      return;
    }
    this.postToChild({ type: 'CAPTURE_NOW' });
    this.syncDvrFromChild();
  }

  public setPaused(paused: boolean): void {
    if (!this.running || this.paused === paused) {
      return;
    }
    this.paused = paused;
    this.postToChild({ type: 'SET_PAUSED', paused });
    if (paused) {
      this.syncDvrFromChild();
    }
    this.callbacks.onPauseChange?.(paused);
    this.callbacks.onStateChange?.(paused ? 'paused' : 'running');
  }

  public togglePause(): boolean {
    if (!this.running) {
      return false;
    }
    this.setPaused(!this.paused);
    return this.paused;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.postToChild({ type: 'SET_MUTED', muted });
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public focus(): void {
    try {
      this.iframe?.contentWindow?.focus();
    } catch {
      // Ignore cross-origin focus restrictions
    }
    this.postToChild({ type: 'FOCUS_GAME' });
  }

  public dispatchVirtualKey(
    code: string,
    key: string,
    type: 'keydown' | 'keyup'
  ): void {
    this.postToChild({
      type: 'DISPATCH_KEY',
      code,
      key,
      keyEventType: type,
    });
  }

  public destroy(): void {
    if (this.activeMessageHandler) {
      window.removeEventListener('message', this.activeMessageHandler);
      this.activeMessageHandler = null;
    }
    this.running = false;
    this.paused = false;
    this.focused = false;
    if (this.iframe) {
      this.iframe.src = 'about:blank';
      this.iframe.remove();
      this.iframe = null;
    }
    this.container.innerHTML = '';
    this.callbacks.onFocusChange?.(false);
  }

  private appendLog(level: 'log' | 'warn' | 'error', rawLine: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${rawLine}`;
    this.consoleLogs.push(formatted);
    if (this.consoleLogs.length > MAX_LOG_LINES) {
      this.consoleLogs.splice(0, this.consoleLogs.length - MAX_LOG_LINES);
    }
    this.callbacks.onLog?.(level, formatted, this.getConsoleLogs());
  }
}
