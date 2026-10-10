// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  normalizeWorkspacePath,
  discoverMainPackage,
  resolveWasmExecJsPath,
  compileGoWasm,
  resolveCompiledWasm,
} from './services/wasm-builder.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, '..');
const distPath = path.join(pluginRoot, 'dist');
const STARTED_AT = Date.now();

const SESSION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const SEND_TO_CHAT_FILENAME_REGEX = /^[a-zA-Z0-9_\-]+\.(png|jpg|jpeg|webp|gif)$/i;
const MAX_JSON_BODY_BYTES = 50 * 1024 * 1024; // 50MB
const AGENTAPI_TIMEOUT_MS = 15_000; // 15 seconds

let activeServerPort = null;

function createHttpError(message, statusCode, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, extra);
  return err;
}

export function getDefaultWorkspace() {
  if (process.env.PLAYTEST_WORKSPACE && process.env.PLAYTEST_WORKSPACE.trim()) {
    return normalizeWorkspacePath(process.env.PLAYTEST_WORKSPACE.trim());
  }
  const cwd = process.cwd();
  const demoDir = path.join(pluginRoot, 'examples', 'playtest-demo');
  if (!fs.existsSync(path.join(cwd, 'go.mod')) && fs.existsSync(path.join(demoDir, 'go.mod'))) {
    return demoDir;
  }
  return cwd;
}

function hasEnclosingGoMod(startDir) {
  let current = path.resolve(startDir);
  for (let depth = 0; depth < 6; depth++) {
    if (fs.existsSync(path.join(current, 'go.mod'))) {
      return true;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return false;
}

export function resolveWorkspaceInfo(workspaceInput) {
  const resolvedPath =
    workspaceInput && typeof workspaceInput === 'string' && workspaceInput.trim()
      ? normalizeWorkspacePath(workspaceInput)
      : getDefaultWorkspace();

  let pkg = '.';
  try {
    pkg = discoverMainPackage(resolvedPath);
  } catch {
    pkg = '.';
  }

  const projectPath =
    pkg && pkg !== '.' ? path.resolve(resolvedPath, pkg) : resolvedPath;
  const hasGoMod =
    fs.existsSync(path.join(resolvedPath, 'go.mod')) ||
    fs.existsSync(path.join(projectPath, 'go.mod')) ||
    hasEnclosingGoMod(projectPath);

  return { workspace: resolvedPath, pkg, projectPath, hasGoMod };
}

// Determine Antigravity app data directory portably with fail-fast validation
export function getAppDataDir() {
  if (process.env.ANTIGRAVITY_APP_DATA_DIR) {
    const envDir = process.env.ANTIGRAVITY_APP_DATA_DIR.trim();
    if (!fs.existsSync(envDir)) {
      throw createHttpError(
        `Configured ANTIGRAVITY_APP_DATA_DIR does not exist: "${envDir}"`,
        500
      );
    }
    return path.resolve(envDir);
  }

  // If ANTIGRAVITY_EXECUTABLE_DATA_DIR is set by Antigravity (<app data dir>/sidecar_data/<plugin>/<sidecar>/data),
  // walk up 4 levels to <app data dir> if it contains brain/.
  if (process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR) {
    const candidateFromExec = path.resolve(
      process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR,
      '..',
      '..',
      '..',
      '..'
    );
    if (fs.existsSync(path.join(candidateFromExec, 'brain'))) {
      return candidateFromExec;
    }
  }

  const home = os.homedir();
  const candidates = [
    path.join(home, '.gemini', 'antigravity'),
    path.join(home, 'Library', 'Application Support', 'Antigravity'),
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Antigravity'),
    path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'Antigravity'),
    path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Antigravity'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const geminiRoot = path.join(home, '.gemini');
  if (fs.existsSync(geminiRoot)) {
    const entries = fs.readdirSync(geminiRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const candidateDir = path.join(geminiRoot, entry.name);
        if (fs.existsSync(path.join(candidateDir, 'brain'))) {
          return candidateDir;
        }
      }
    }
  }

  throw createHttpError(
    `Antigravity app data directory not found. Set ANTIGRAVITY_APP_DATA_DIR to a valid directory.`,
    500
  );
}

export function validateSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_REGEX.test(sessionId)) {
    throw createHttpError(
      `Invalid or missing session_id: "${sessionId}". Must match ${SESSION_ID_REGEX}.`,
      400
    );
  }
  return sessionId;
}

// Resolve session brain directory with strict existence check (fail-fast 404 for unknown sessions)
export function resolveSessionBrainDir(sessionId) {
  validateSessionId(sessionId);
  const appDataDir = getAppDataDir();
  const brainDir = path.join(appDataDir, 'brain');
  const sessionDir = path.join(brainDir, sessionId);

  if (sessionId === 'standalone') {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  if (!fs.existsSync(sessionDir) || !fs.statSync(sessionDir).isDirectory()) {
    throw createHttpError(
      `Session brain directory not found for session_id "${sessionId}" at "${sessionDir}".`,
      404
    );
  }

  return sessionDir;
}

// Discover recent Antigravity session IDs from brain directories
export function getRecentSessions() {
  const appData = getAppDataDir();
  const brainDir = path.join(appData, 'brain');
  if (!fs.existsSync(brainDir)) {
    return [];
  }

  const entries = fs.readdirSync(brainDir, { withFileTypes: true });
  const list = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'tempmediaStorage') {
      continue;
    }
    const id = entry.name;
    if (!SESSION_ID_REGEX.test(id)) {
      continue;
    }
    const sessionPath = path.join(brainDir, id);
    const transcriptPath = path.join(sessionPath, '.system_generated', 'logs', 'transcript.jsonl');
    const targetPath = fs.existsSync(transcriptPath) ? transcriptPath : sessionPath;
    const stat = fs.statSync(targetPath);
    list.push({
      id,
      title: `Session ${id.slice(0, 8)}`,
      updatedAt: new Date(stat.mtimeMs).toISOString(),
      mtimeMs: stat.mtimeMs,
    });
  }

  list.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return list.slice(0, 20).map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

export function getActiveSessionId() {
  const recent = getRecentSessions();
  if (process.env.ANTIGRAVITY_CONVERSATION_ID) {
    const envConv = process.env.ANTIGRAVITY_CONVERSATION_ID.trim();
    if (recent.some((s) => s.id === envConv)) {
      return envConv;
    }
  }
  return recent.length > 0 ? recent[0].id : null;
}

export function getConfig() {
  const rawPort =
    process.env.ANTIGRAVITY_SIDECAR_WEB_PORT !== undefined
      ? String(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT).trim()
      : process.env.PORT !== undefined
      ? String(process.env.PORT).trim()
      : '7789';
  const port = Number.parseInt(rawPort, 10);
  if (
    Number.isNaN(port) ||
    (port !== 0 && (port < 1024 || port > 65535)) ||
    String(port) !== rawPort
  ) {
    throw new Error(
      `Invalid port environment variable: "${rawPort}". Must be 0 (ephemeral) or an integer between 1024 and 65535.`
    );
  }

  return {
    port,
    host: process.env.HOST || '127.0.0.1',
  };
}

export const readConfig = getConfig;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

// Parse JSON request body with strict byte-limit enforcement before buffering
export function parseJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytesRead = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      bytesRead += chunkBuf.length;
      if (bytesRead > maxBytes) {
        aborted = true;
        req.destroy();
        reject(
          createHttpError(
            `Payload Too Large: request body exceeds limit of ${maxBytes} bytes.`,
            413
          )
        );
        return;
      }
      chunks.push(chunkBuf);
    });

    req.on('end', () => {
      if (aborted) return;
      if (bytesRead === 0) {
        resolve({});
        return;
      }
      try {
        const raw = Buffer.concat(chunks, bytesRead).toString('utf-8');
        if (!raw.trim()) {
          resolve({});
        } else {
          resolve(JSON.parse(raw));
        }
      } catch (err) {
        reject(createHttpError(`Malformed JSON request body: ${err.message}`, 400));
      }
    });

    req.on('error', (err) => {
      if (aborted) return;
      reject(err);
    });
  });
}

function getAgentApiExecutable() {
  if (process.env.AGENTAPI_BIN) {
    const customBin = process.env.AGENTAPI_BIN.trim();
    if (!fs.existsSync(customBin)) {
      throw createHttpError(
        `Configured AGENTAPI_BIN executable not found at "${customBin}".`,
        500
      );
    }
    return { file: customBin, prefixArgs: [] };
  }

  if (process.env.ANTIGRAVITY_AGENTAPI_EXE) {
    const exe = process.env.ANTIGRAVITY_AGENTAPI_EXE.trim();
    if (fs.existsSync(exe)) {
      return { file: exe, prefixArgs: ['agentapi'] };
    }
  }

  const appDataDir = getAppDataDir();
  const binaryName = process.platform === 'win32' ? 'agentapi.exe' : 'agentapi';
  const binPath = path.join(appDataDir, 'bin', binaryName);
  if (fs.existsSync(binPath)) {
    return { file: binPath, prefixArgs: [] };
  }

  return { file: binaryName, prefixArgs: [] };
}

function spawnAgentApiSendMessage(title, sessionId, messageContent) {
  const { file, prefixArgs } = getAgentApiExecutable();
  return new Promise((resolve, reject) => {
    const proc = spawn(
      file,
      [...prefixArgs, 'send-message', `--title=${title}`, sessionId, messageContent],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
      reject(
        createHttpError(
          `agentapi send-message timed out after ${AGENTAPI_TIMEOUT_MS}ms.`,
          504
        )
      );
    }, AGENTAPI_TIMEOUT_MS);

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          createHttpError(
            `agentapi send-message failed with exit code ${code}: ${stderr || stdout}`,
            502
          )
        );
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      reject(
        createHttpError(
          `Failed to execute agentapi binary "${file}": ${err.message}`,
          500
        )
      );
    });
  });
}

async function deliverMessageToChat(sidecarApp, sessionId, title, messageContent) {
  if (process.env.AGENTAPI_BIN || !sidecarApp) {
    await spawnAgentApiSendMessage(title, sessionId, messageContent);
    return;
  }

  let projectId = '';
  try {
    const metaData = sidecarApp.getConversationMetadata(sessionId);
    const metaEvent =
      metaData?.response?.conversationMetadata || metaData?.response?.conversation_metadata;
    projectId = metaEvent?.metadata?.projectId || metaEvent?.metadata?.project_id || '';
  } catch {
    // Proceed with default projectId if metadata lookup is unavailable
  }

  sidecarApp.sendMessage(sessionId, messageContent, {
    title,
    ...(projectId ? { projectId } : {}),
  });
}

export function buildRunnerHtml(params = {}) {
  const buildId = params.buildId ? String(params.buildId) : '';
  const runnerId = Number.parseInt(String(params.runnerId || '1'), 10) || 1;
  const demoMode =
    params.demo === '1' || params.demo === 'true' || params.demo === true;
  const initialMuted =
    params.muted === '1' || params.muted === 'true' || params.muted === true;
  const captureIntervalMs =
    Number.parseInt(String(params.captureIntervalMs || '40'), 10) || 40;

  let wasmExecInline = '';
  if (!demoMode) {
    if (!buildId) {
      throw createHttpError('Missing "buildId" query parameter for /api/playtest/runner.', 400);
    }
    resolveCompiledWasm(buildId);
    const wasmExecPath = resolveWasmExecJsPath();
    wasmExecInline = fs
      .readFileSync(wasmExecPath, 'utf-8')
      .replace(/<\/script/gi, '<\\/script');
  }

  const tokenSuffix = params.token ? `&token=${encodeURIComponent(String(params.token))}` : '';
  const wasmBinaryUrl = demoMode
    ? ''
    : `/api/playtest/wasm?buildId=${encodeURIComponent(buildId)}${tokenSuffix}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Ebitengine Playtest Runner</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      background: #090D16;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
    }
    canvas {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      image-rendering: pixelated;
      outline: none;
    }
  </style>
</head>
<body tabindex="0">
  <script>
    (function() {
      const runnerId = ${JSON.stringify(runnerId)};
      const demoMode = ${JSON.stringify(demoMode)};
      const wasmBinaryUrl = ${JSON.stringify(wasmBinaryUrl)};
      let captureIntervalMs = ${JSON.stringify(captureIntervalMs)};
      let lastCaptureTimeMs = -Infinity;
      let isMuted = ${JSON.stringify(initialMuted)};

      function postToParent(payload) {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            Object.assign({ source: 'playtest-runner-child', runnerId: runnerId }, payload),
            '*'
          );
        }
      }

      window.__RUNNER_CONFIG__ = {
        runnerId: runnerId,
        demoMode: demoMode,
        wasmBinaryUrl: wasmBinaryUrl,
        postToParent: postToParent
      };

      // 1. WebGL preserveDrawingBuffer: true Shim
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attrs) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
          attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
          window.__ACTIVE_GAME_CANVAS__ = this;
        } else if (type === '2d' && !window.__ACTIVE_GAME_CANVAS__) {
          window.__ACTIVE_GAME_CANVAS__ = this;
        }
        return origGetContext.call(this, type, attrs);
      };

      // 2. WebAudio Context Tracker for Mute & Pause Support
      const audioContexts = [];
      const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
      if (OrigAudioContext) {
        const WrappedAudioContext = function(...args) {
          const ctx = new OrigAudioContext(...args);
          audioContexts.push(ctx);
          if (isMuted || window.__PLAYTEST_PAUSED__) {
            ctx.suspend().catch(function() {});
          }
          return ctx;
        };
        WrappedAudioContext.prototype = OrigAudioContext.prototype;
        window.AudioContext = WrappedAudioContext;
        if (window.webkitAudioContext) {
          window.webkitAudioContext = WrappedAudioContext;
        }
      }

      function syncAudioState() {
        const shouldSuspend = isMuted || Boolean(window.__PLAYTEST_PAUSED__);
        for (let i = 0; i < audioContexts.length; i++) {
          const ctx = audioContexts[i];
          if (ctx.state === 'closed') continue;
          if (shouldSuspend && ctx.state === 'running') {
            ctx.suspend().catch(function() {});
          } else if (!shouldSuspend && ctx.state === 'suspended') {
            ctx.resume().catch(function() {});
          }
        }
      }

      // 3. Zero-Encoding GPU Blit Ring Buffer for 10s DVR (250 frames @ 25 FPS)
      const maxDvrSlots = 250;
      const dvrSlots = new Array(maxDvrSlots);
      let dvrWritePtr = 0;
      let dvrCount = 0;

      window.__PLAYTEST_GET_DVR_FRAMES__ = function() {
        if (dvrCount === 0) return [];
        const startSlot = dvrCount < maxDvrSlots ? 0 : dvrWritePtr;
        const out = new Array(dvrCount);
        for (let i = 0; i < dvrCount; i++) {
          out[i] = dvrSlots[(startSlot + i) % maxDvrSlots];
        }
        return out;
      };

      function captureFrameSnapshot(timestampMs, force) {
        if (!force && (timestampMs - lastCaptureTimeMs < captureIntervalMs)) {
          return;
        }
        const canvas = window.__ACTIVE_GAME_CANVAS__ || document.querySelector('canvas');
        if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
          return;
        }
        try {
          let slot = dvrSlots[dvrWritePtr];
          if (!slot) {
            const c = document.createElement('canvas');
            slot = {
              canvas: c,
              ctx: c.getContext('2d'),
              width: 0,
              height: 0,
              timestampMs: 0
            };
            dvrSlots[dvrWritePtr] = slot;
          }
          const maxW = 480;
          const scale = canvas.width > maxW ? maxW / canvas.width : 1;
          const targetW = Math.max(64, Math.round(canvas.width * scale));
          const targetH = Math.max(36, Math.round(canvas.height * scale));
          if (slot.width !== targetW || slot.height !== targetH) {
            slot.canvas.width = targetW;
            slot.canvas.height = targetH;
            slot.width = targetW;
            slot.height = targetH;
            if (slot.ctx) {
              slot.ctx.imageSmoothingEnabled = false;
            }
          }
          if (slot.ctx) {
            slot.ctx.clearRect(0, 0, targetW, targetH);
            slot.ctx.drawImage(canvas, 0, 0, targetW, targetH);
          }
          slot.timestampMs = timestampMs;
          dvrWritePtr = (dvrWritePtr + 1) % maxDvrSlots;
          if (dvrCount < maxDvrSlots) {
            dvrCount++;
          }
          lastCaptureTimeMs = timestampMs;
        } catch (err) {
          // Ignore transient canvas snapshot errors
        }
      }

      // 4. requestAnimationFrame Pause & DVR Hook
      window.__PLAYTEST_PAUSED__ = false;
      const pausedCallbacks = [];
      const origRAF = window.requestAnimationFrame.bind(window);

      window.requestAnimationFrame = function(callback) {
        return origRAF(function(timestamp) {
          if (window.__PLAYTEST_PAUSED__) {
            pausedCallbacks.push(callback);
            return;
          }
          callback(timestamp);
          captureFrameSnapshot(timestamp, false);
        });
      };

      // 5. Console & Go Panic Ring Buffer Hook
      function formatArgs(args) {
        return Array.from(args).map(function(a) {
          if (typeof a === 'string') return a;
          if (a instanceof Error) return a.stack || a.message;
          try { return JSON.stringify(a); } catch (e) { return String(a); }
        }).join(' ');
      }

      const origLog = console.log.bind(console);
      const origWarn = console.warn.bind(console);
      const origError = console.error.bind(console);

      console.log = function(...args) {
        origLog(...args);
        const text = formatArgs(args);
        postToParent({ type: 'LOG', level: 'log', text: text });
        if (text.startsWith('panic:') || text.includes('runtime error:')) {
          postToParent({ type: 'PANIC', message: text });
        }
      };

      console.warn = function(...args) {
        origWarn(...args);
        postToParent({ type: 'LOG', level: 'warn', text: formatArgs(args) });
      };

      console.error = function(...args) {
        origError(...args);
        const text = formatArgs(args);
        postToParent({ type: 'LOG', level: 'error', text: text });
        if (text.startsWith('panic:') || text.includes('runtime error:')) {
          postToParent({ type: 'PANIC', message: text });
        }
      };

      window.addEventListener('error', function(e) {
        const msg = e.error ? (e.error.stack || e.error.message) : e.message;
        postToParent({ type: 'PANIC', message: 'Uncaught WASM Error: ' + msg });
      });

      window.addEventListener('unhandledrejection', function(e) {
        const msg = e.reason ? (e.reason.stack || e.reason.message || String(e.reason)) : 'Unknown rejection';
        postToParent({ type: 'PANIC', message: 'Unhandled WASM Rejection: ' + msg });
      });

      // 6. Capture-Phase Hotkey & Scroll-Lock Listener
      window.addEventListener('keydown', function(e) {
        if (e.code === 'F8' || e.code === 'Backquote') {
          e.preventDefault();
          e.stopPropagation();
          captureFrameSnapshot(performance.now(), true);
          postToParent({ type: 'TOGGLE_PAUSE' });
          return;
        }
        if (
          e.code === 'Space' ||
          e.code === 'ArrowUp' ||
          e.code === 'ArrowDown' ||
          e.code === 'ArrowLeft' ||
          e.code === 'ArrowRight' ||
          e.code === 'Tab'
        ) {
          e.preventDefault();
        }
      }, { capture: true });

      // 7. Focus & Audio Unlock Tracking
      window.addEventListener('focus', function() {
        postToParent({ type: 'FOCUS_CHANGE', focused: true });
        syncAudioState();
      });
      window.addEventListener('blur', function() {
        postToParent({ type: 'FOCUS_CHANGE', focused: false });
      });
      window.addEventListener('pointerdown', function() {
        window.focus();
        document.body.focus();
        const canvas = window.__ACTIVE_GAME_CANVAS__ || document.querySelector('canvas');
        if (canvas && typeof canvas.focus === 'function') {
          canvas.focus();
        }
        postToParent({ type: 'FOCUS_CHANGE', focused: true });
        syncAudioState();
      }, { capture: true });

      // 8. Parent Message Receiver
      window.addEventListener('message', function(event) {
        const msg = event.data;
        if (!msg || msg.source !== 'playtest-runner-parent' || msg.runnerId !== runnerId) {
          return;
        }

        if (msg.type === 'SET_PAUSED') {
          const nextPaused = Boolean(msg.paused);
          const wasPaused = Boolean(window.__PLAYTEST_PAUSED__);
          if (nextPaused && !wasPaused) {
            captureFrameSnapshot(performance.now(), true);
          }
          window.__PLAYTEST_PAUSED__ = nextPaused;
          syncAudioState();
          if (wasPaused && !nextPaused && pausedCallbacks.length > 0) {
            const pending = pausedCallbacks.splice(0, pausedCallbacks.length);
            origRAF(function(ts) {
              for (let i = 0; i < pending.length; i++) {
                pending[i](ts);
              }
              captureFrameSnapshot(ts, false);
            });
          }
          return;
        }

        if (msg.type === 'SET_MUTED') {
          isMuted = Boolean(msg.muted);
          syncAudioState();
          return;
        }

        if (msg.type === 'CAPTURE_NOW') {
          captureFrameSnapshot(performance.now(), true);
          return;
        }

        if (msg.type === 'DISPATCH_KEY') {
          const code = msg.code || 'Space';
          const key = msg.key || ' ';
          const type = msg.keyEventType || 'keydown';
          const keyCodeMap = {
            ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39,
            Space: 32, KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68,
            KeyZ: 90, KeyX: 88, Enter: 13
          };
          const keyCode = keyCodeMap[code] || key.toUpperCase().charCodeAt(0) || 0;
          const ev = new KeyboardEvent(type, {
            code: code,
            key: key,
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
          });
          const canvas = window.__ACTIVE_GAME_CANVAS__ || document.querySelector('canvas');
          if (canvas) {
            canvas.focus();
            canvas.dispatchEvent(ev);
          } else {
            window.dispatchEvent(ev);
          }
          return;
        }

        if (msg.type === 'FOCUS_GAME') {
          window.focus();
          document.body.focus();
          const canvas = window.__ACTIVE_GAME_CANVAS__ || document.querySelector('canvas');
          if (canvas && typeof canvas.focus === 'function') {
            canvas.focus();
          }
          postToParent({ type: 'FOCUS_CHANGE', focused: true });
          syncAudioState();
          return;
        }
      });
    })();
  </script>
  <script>
${wasmExecInline}
  </script>
  <script>
    (async function() {
      const cfg = window.__RUNNER_CONFIG__;
      if (!cfg) return;
      const postToParent = cfg.postToParent;

      if (cfg.demoMode) {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        document.body.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        const keys = {};
        window.addEventListener('keydown', function(e) { keys[e.code] = true; });
        window.addEventListener('keyup', function(e) { keys[e.code] = false; });

        let playerX = 140;
        let playerY = 230;
        let velY = 0;
        let tick = 0;

        console.log('[Playtest Calibration Scene] Ready (640x360 @ 60fps). Use WASD/Arrows + Space.');
        postToParent({ type: 'READY' });

        function step() {
          tick++;
          const speed = 3.5;
          if (keys['ArrowLeft'] || keys['KeyA']) playerX = Math.max(24, playerX - speed);
          if (keys['ArrowRight'] || keys['KeyD']) playerX = Math.min(616, playerX + speed);
          if ((keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || keys['KeyZ']) && playerY >= 230) {
            velY = -9.5;
          }
          playerY += velY;
          if (playerY < 230) {
            velY += 0.48;
          } else {
            playerY = 230;
            velY = 0;
          }

          ctx.fillStyle = '#0F172A';
          ctx.fillRect(0, 0, 640, 360);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.lineWidth = 1;
          for (let x = 0; x < 640; x += 32) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke();
          }
          for (let y = 0; y < 360; y += 32) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke();
          }

          ctx.fillStyle = '#1E293B';
          ctx.fillRect(0, 262, 640, 98);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(0, 262, 640, 3);

          const obsX = 480 - ((tick * 2.4) % 420);
          ctx.fillStyle = '#F43F5E';
          ctx.fillRect(obsX, 230, 32, 32);
          ctx.strokeStyle = '#FACC15';
          ctx.strokeRect(obsX + 6, 224, 32, 32);

          ctx.fillStyle = '#22C55E';
          ctx.fillRect(playerX - 16, playerY - 32, 32, 32);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(playerX + 4, playerY - 24, 6, 6);

          ctx.fillStyle = '#E2E8F0';
          ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillText('EBITENGINE QA CALIBRATION LOOP | TICK #' + tick, 16, 26);
          ctx.fillStyle = '#94A3B8';
          ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillText('POS: (' + Math.round(playerX) + ', ' + Math.round(playerY) + ')  OBS_X: ' + Math.round(obsX), 16, 46);

          window.requestAnimationFrame(step);
        }
        window.requestAnimationFrame(step);
        return;
      }

      if (typeof window.Go !== 'function') {
        postToParent({
          type: 'PANIC',
          message: 'Go WASM runtime (window.Go) was not defined by wasm_exec.js.'
        });
        return;
      }

      try {
        const res = await fetch(cfg.wasmBinaryUrl, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to fetch WASM binary (HTTP ' + res.status + ')');
        }
        const wasmBytes = await res.arrayBuffer();
        const go = new window.Go();
        const result = await WebAssembly.instantiate(wasmBytes, go.importObject);
        postToParent({ type: 'READY' });
        await go.run(result.instance);
      } catch (err) {
        const errMsg = err instanceof Error ? (err.stack || err.message) : String(err);
        postToParent({
          type: 'PANIC',
          message: 'Failed to instantiate or run Go WASM binary: ' + errMsg
        });
      }
    })();
  </script>
</body>
</html>`;
}

export async function processSendToChat(body, sidecarApp = null) {
  const sessionId = body.session_id || body.sessionId || getActiveSessionId() || 'standalone';
  const { filename, note, consoleLogs, metadata, buildError, workspace, pkg } = body;
  const image = body.image ?? body.data;

  const sessionDir = resolveSessionBrainDir(sessionId);
  const realSessionDir = fs.realpathSync(sessionDir);

  if (filename !== undefined && filename !== null) {
    if (typeof filename !== 'string' || !SEND_TO_CHAT_FILENAME_REGEX.test(filename)) {
      throw createHttpError(
        `Invalid filename "${filename}" in send-to-chat request. Must match ${SEND_TO_CHAT_FILENAME_REGEX}.`,
        400
      );
    }
  }

  // Payload (B): Compiler build error
  if (typeof buildError === 'string' && buildError.trim().length > 0) {
    const metaObj = metadata && typeof metadata === 'object' ? metadata : {};
    const effectiveWorkspace = workspace || metaObj.workspace || getDefaultWorkspace();
    const effectivePkg = pkg || metaObj.pkg || metaObj.package || '.';

    const lines = [
      '### 🚨 Ebitengine WASM Build Error',
      '',
      `**Workspace**: \`${effectiveWorkspace}\` | **Package**: \`${effectivePkg}\``,
    ];

    if (typeof note === 'string' && note.trim()) {
      lines.push('', `**Note**: ${note.trim()}`);
    }

    lines.push('', '```text', buildError.trim(), '```');
    const messageContent = lines.join('\n');

    await deliverMessageToChat(
      sidecarApp,
      sessionId,
      'Playtest WASM Build Error',
      messageContent
    );

    return {
      success: true,
      mode: 'build-error',
    };
  }

  // Payload (A): Annotated / clean screenshot
  if (image !== undefined && image !== null && image !== '') {
    if (typeof image !== 'string' || !image.trim()) {
      throw createHttpError('Invalid "image" data in send-to-chat request.', 400);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFilename = filename || `playtest-bug-${timestamp}.png`;
    if (!SEND_TO_CHAT_FILENAME_REGEX.test(finalFilename)) {
      throw createHttpError(
        `Invalid filename "${finalFilename}" in send-to-chat request.`,
        400
      );
    }

    const resolvedPath = path.resolve(sessionDir, finalFilename);
    if (!resolvedPath.startsWith(sessionDir + path.sep)) {
      throw createHttpError(
        'Access denied: path traversal attempt in send-to-chat filename.',
        400
      );
    }

    const existingLstat = fs.lstatSync(resolvedPath, { throwIfNoEntry: false });
    if (existingLstat) {
      let realExisting;
      try {
        realExisting = fs.realpathSync(resolvedPath);
      } catch (err) {
        throw createHttpError(
          `Access denied: invalid existing symlink "${finalFilename}": ${err.message}`,
          400
        );
      }
      if (!realExisting.startsWith(realSessionDir + path.sep)) {
        throw createHttpError(
          'Access denied: target file symlink points outside session directory.',
          400
        );
      }
    }

    const rawBase64 = image.includes(',') ? image.split(',')[1] : image;
    const buffer = Buffer.from(rawBase64, 'base64');
    fs.writeFileSync(resolvedPath, buffer);

    const realWrittenPath = fs.realpathSync(resolvedPath);
    if (!realWrittenPath.startsWith(realSessionDir + path.sep)) {
      throw createHttpError(
        'Access denied: resolved file path escapes session directory.',
        400
      );
    }

    const metaObj = metadata && typeof metadata === 'object' ? metadata : {};
    const effectiveWorkspace = metaObj.workspace || workspace || getDefaultWorkspace();
    const effectivePkg = metaObj.pkg || metaObj.package || pkg || '.';
    const effectiveFrameOffset =
      metaObj.frameOffset ?? metaObj.timestamp ?? metaObj.frame ?? 'live';
    const effectiveResolution =
      metaObj.resolution ||
      (metaObj.width && metaObj.height ? `${metaObj.width}x${metaObj.height}` : 'canvas');

    const lines = [`![${finalFilename}](${resolvedPath})`];

    if (typeof note === 'string' && note.trim()) {
      lines.push('', `**Bug Note**: ${note.trim()}`);
    }

    lines.push(
      '',
      `**Workspace**: \`${effectiveWorkspace}\` | **Package**: \`${effectivePkg}\` | **Frame Offset**: \`${effectiveFrameOffset}\` | **Resolution**: \`${effectiveResolution}\``
    );

    let formattedLogs = '';
    if (Array.isArray(consoleLogs)) {
      formattedLogs = consoleLogs
        .map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
        .join('\n')
        .trim();
    } else if (typeof consoleLogs === 'string') {
      formattedLogs = consoleLogs.trim();
    }

    if (formattedLogs.length > 0) {
      lines.push('', '### Captured WASM Console / Stderr', '```text', formattedLogs, '```');
    }

    const messageContent = lines.join('\n');
    await deliverMessageToChat(
      sidecarApp,
      sessionId,
      `Playtest Bug: ${finalFilename}`,
      messageContent
    );

    return {
      success: true,
      mode: 'screenshot',
      filePath: resolvedPath,
      filename: finalFilename,
    };
  }

  throw createHttpError(
    'Missing "image" (screenshot) or "buildError" (compiler traceback) in send-to-chat request.',
    400
  );
}

/**
 * Registers all Playtest Studio pages and API routes onto an Antigravity `SidecarApp` instance
 * per the official `/ui-extension` specification.
 */
export function configureSidecarApp(app, ResponseClass) {
  const readDistText = (name) => {
    const filePath = path.join(distPath, name);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw createHttpError(
        `Built frontend asset "${name}" not found at "${filePath}". Run "npm run build" first.`,
        500
      );
    }
    return fs.readFileSync(filePath, 'utf-8');
  };

  const wrapApi = (handler) => async (data = {}) => {
    try {
      return await handler(data);
    } catch (err) {
      const status = err.statusCode || 500;
      return new ResponseClass(
        JSON.stringify({
          error: err.message,
          statusCode: status,
          ...(err.compilerOutput !== undefined ? { compilerOutput: err.compilerOutput } : {}),
          ...(err.workspace !== undefined ? { workspace: err.workspace } : {}),
          ...(err.pkg !== undefined ? { pkg: err.pkg } : {}),
          ...(err.exitCode !== undefined ? { exitCode: err.exitCode } : {}),
        }),
        {
          contentType: 'application/json; charset=utf-8',
          status,
        }
      );
    }
  };

  // Static Frontend Routes (re-read on every request per /ui-extension)
  app.page(
    '/',
    () =>
      new ResponseClass(readDistText('index.html'), {
        contentType: 'text/html; charset=utf-8',
        headers: { 'Cache-Control': 'no-store' },
      })
  );
  app.page(
    '/index.html',
    () =>
      new ResponseClass(readDistText('index.html'), {
        contentType: 'text/html; charset=utf-8',
        headers: { 'Cache-Control': 'no-store' },
      })
  );
  app.page(
    '/app.js',
    () =>
      new ResponseClass(readDistText('app.js'), {
        contentType: 'application/javascript; charset=utf-8',
        headers: { 'Cache-Control': 'no-store' },
      })
  );
  app.api(
    '/styles.css',
    wrapApi(
      () =>
        new ResponseClass(readDistText('styles.css'), {
          contentType: 'text/css; charset=utf-8',
          headers: { 'Cache-Control': 'no-store' },
        })
    ),
    'GET'
  );

  // Status & Health APIs
  app.api(
    '/api/status',
    wrapApi(() => ({
      status: 'ok',
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      activeSessionId: getActiveSessionId(),
      defaultWorkspace: getDefaultWorkspace(),
    })),
    'GET'
  );

  app.api(
    '/api/health',
    wrapApi(() => {
      const cfg = getConfig();
      return {
        status: 'ok',
        port: activeServerPort || cfg.port,
        host: cfg.host,
        activeSessionId: getActiveSessionId(),
        defaultWorkspace: getDefaultWorkspace(),
      };
    }),
    'GET'
  );

  app.api(
    '/api/session/active',
    wrapApi(() => ({ sessionId: getActiveSessionId() })),
    'GET'
  );

  app.api(
    '/api/sessions',
    wrapApi(() => ({ sessions: getRecentSessions() })),
    'GET'
  );

  // Convert file:// workspace URIs with fileURLToPath from node:url per /ui-extension
  app.api(
    '/api/workspace/resolve',
    wrapApi((data) => resolveWorkspaceInfo(data.workspaceUri || data.workspace)),
    'POST'
  );

  // On-demand Go WASM compiler
  app.api(
    '/api/playtest/build',
    wrapApi((data) =>
      compileGoWasm({
        workspace: data.workspace,
        pkg: data.pkg,
      })
    ),
    'POST'
  );

  // Compiled WASM binary stream
  app.api(
    '/api/playtest/wasm',
    wrapApi((data) => {
      const record = resolveCompiledWasm(data.buildId);
      const buf = fs.readFileSync(record.wasmPath);
      return new ResponseClass(buf, {
        contentType: 'application/wasm',
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }),
    'GET'
  );

  // Go WASM JS runtime
  app.api(
    '/api/playtest/wasm_exec.js',
    wrapApi(() => {
      const wasmExecPath = resolveWasmExecJsPath();
      const content = fs.readFileSync(wasmExecPath, 'utf-8');
      return new ResponseClass(content, {
        contentType: 'application/javascript; charset=utf-8',
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }),
    'GET'
  );

  // Playtest Runner page
  app.api(
    '/api/playtest/runner',
    wrapApi((data) => {
      const runnerHtml = buildRunnerHtml(data);
      return new ResponseClass(runnerHtml, {
        contentType: 'text/html; charset=utf-8',
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }),
    'GET'
  );

  // Send Bug / Build Error to active Antigravity conversation
  app.api(
    '/api/send-to-chat',
    wrapApi((data) => processSendToChat(data, app)),
    'POST'
  );

  return app;
}

// Apply CORS and security headers on standalone HTTP responses (used in Vite dev & unit tests)
function applySecurityAndCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader(
    'Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data: blob:; frame-ancestors *;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

// Standalone HTTP Request Handler (used by `vite dev` middleware and `tests/playtest-server.test.mjs`)
export async function handleRequest(req, res) {
  const startTime = Date.now();
  res.on('finish', () => {
    const elapsed = Date.now() - startTime;
    console.log(
      `[playtest-studio HTTP] ${new Date().toISOString()} ${req.method} ${req.url} -> ${res.statusCode} (${elapsed}ms)`
    );
  });

  if (typeof req.destroy === 'function' && res && typeof res.once === 'function') {
    const origDestroy = req.destroy.bind(req);
    req.destroy = (err) => {
      if (typeof req.pause === 'function') {
        req.pause();
      }
      if (!res.writableEnded) {
        res.setHeader('Connection', 'close');
        res.once('finish', () => origDestroy(err));
        return req;
      }
      return origDestroy(err);
    };
  }

  applySecurityAndCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let config;
  try {
    config = getConfig();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  try {
    if ((pathname === '/api/health' || pathname === '/api/status') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          status: 'ok',
          port: activeServerPort || config.port,
          host: config.host,
          node: process.version,
          platform: `${os.platform()} ${os.release()}`,
          uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
          activeSessionId: getActiveSessionId(),
          defaultWorkspace: getDefaultWorkspace(),
        })
      );
      return;
    }

    if (pathname === '/api/session/active' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ sessionId: getActiveSessionId() }));
      return;
    }

    if (pathname === '/api/sessions' && req.method === 'GET') {
      const sessions = getRecentSessions();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    if (pathname === '/api/workspace/resolve' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const info = resolveWorkspaceInfo(body.workspaceUri || body.workspace);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(info));
      return;
    }

    if (pathname === '/api/playtest/build' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      try {
        const result = await compileGoWasm({
          workspace: body.workspace,
          pkg: body.pkg,
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        if (err.statusCode === 422) {
          res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              error: err.message,
              compilerOutput: err.compilerOutput,
              workspace: err.workspace,
              pkg: err.pkg,
              exitCode: err.exitCode,
            })
          );
          return;
        }
        throw err;
      }
      return;
    }

    if (pathname === '/api/playtest/wasm' && (req.method === 'GET' || req.method === 'HEAD')) {
      const buildId = searchParams.get('buildId') || undefined;
      const record = resolveCompiledWasm(buildId);
      const stat = fs.statSync(record.wasmPath);

      res.writeHead(200, {
        'Content-Type': 'application/wasm',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(record.wasmPath);
      stream.on('error', (err) => {
        console.error('[playtest-studio] Error streaming wasm:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        if (!res.writableEnded) {
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      stream.pipe(res);
      return;
    }

    if (
      pathname === '/api/playtest/wasm_exec.js' &&
      (req.method === 'GET' || req.method === 'HEAD')
    ) {
      const wasmExecPath = resolveWasmExecJsPath();
      const stat = fs.statSync(wasmExecPath);

      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(wasmExecPath);
      stream.on('error', (err) => {
        console.error('[playtest-studio] Error streaming wasm_exec.js:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        }
        if (!res.writableEnded) {
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      stream.pipe(res);
      return;
    }

    if (pathname === '/api/playtest/runner' && req.method === 'GET') {
      const queryObj = Object.fromEntries(searchParams.entries());
      const runnerHtml = buildRunnerHtml(queryObj);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(runnerHtml);
      return;
    }

    if (pathname === '/api/send-to-chat' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const result = await processSendToChat(body, null);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname === '/' || pathname === '/index.html') {
        const indexPath = path.join(distPath, 'index.html');
        if (!fs.existsSync(indexPath) || !fs.statSync(indexPath).isFile()) {
          throw createHttpError(
            `Built frontend index.html not found at "${indexPath}". Run "npm run build" first.`,
            500
          );
        }
        const content = fs.readFileSync(indexPath);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': content.length,
          'Cache-Control': 'no-cache',
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.end(content);
        return;
      }

      if (!pathname.startsWith('/api/') && !pathname.includes('\0') && !pathname.includes('..')) {
        const staticFilePath = path.resolve(distPath, '.' + pathname);
        if (
          staticFilePath.startsWith(distPath + path.sep) &&
          fs.existsSync(staticFilePath) &&
          fs.statSync(staticFilePath).isFile()
        ) {
          const realDist = fs.realpathSync(distPath);
          const realStatic = fs.realpathSync(staticFilePath);
          if (realStatic.startsWith(realDist + path.sep)) {
            const ext = path.extname(realStatic).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const content = fs.readFileSync(realStatic);
            const headers = {
              'Content-Type': contentType,
              'Content-Length': content.length,
              'X-Content-Type-Options': 'nosniff',
            };
            if (ext === '.svg') {
              headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
            }
            res.writeHead(200, headers);
            if (req.method === 'HEAD') {
              res.end();
              return;
            }
            res.end(content);
            return;
          }
        }
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: `Resource not found: ${req.method} ${pathname}`,
        pathname,
        statusCode: 404,
      })
    );
  } catch (err) {
    console.error(`[playtest-studio] Error processing ${req.method} ${pathname}:`, err);
    const statusCode = err.statusCode || 500;
    if (!res.headersSent) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: err.message, statusCode }));
    }
  }
}

export function createStudioServer() {
  const srv = http.createServer(handleRequest);
  srv.on('listening', () => {
    const addr = srv.address();
    if (addr && typeof addr === 'object' && addr.port) {
      activeServerPort = addr.port;
    }
  });
  srv.on('close', () => {
    activeServerPort = null;
  });
  return srv;
}

export function startServer(options = {}) {
  const config = getConfig();
  const requestedPort =
    typeof options === 'number'
      ? options
      : options.port !== undefined
      ? options.port
      : config.port;
  const requestedHost =
    (typeof options === 'object' && options !== null && options.host) || config.host || '127.0.0.1';

  const srv = createStudioServer();
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      console.error(`[playtest-studio] Server error on port ${requestedPort}:`, err);
      reject(err);
    };
    srv.once('error', onError);
    srv.listen(requestedPort, requestedHost, () => {
      srv.removeListener('error', onError);
      const addr = srv.address();
      const boundPort = addr && typeof addr === 'object' ? addr.port : requestedPort;
      activeServerPort = boundPort;
      srv.port = boundPort;
      srv.host = requestedHost;
      srv.server = srv;
      console.log(`[playtest-studio sidecar] Listening on http://${requestedHost}:${boundPort}`);
      resolve(srv);
    });
  });
}
