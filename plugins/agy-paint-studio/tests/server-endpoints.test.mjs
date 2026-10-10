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

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on('error', reject);
  });
}

describe('SidecarApp UI Extension Endpoints & Security Integration Tests', () => {
  let tempRoot;
  let appDataDir;
  let workspaceRoot;
  let serverProc;
  let testPort;
  let baseUrl;
  let testPngBase64;
  const sidecarToken = 'test-sidecar-secret-token-123';

  before(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-paint-test-'));
    appDataDir = path.join(tempRoot, 'appdata');
    workspaceRoot = path.join(tempRoot, 'workspace');

    const session1Dir = path.join(appDataDir, 'brain', 'valid-session-1');
    const logsDir = path.join(session1Dir, '.system_generated', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'transcript.jsonl'), '{"step_index":0}\n', 'utf-8');
    fs.mkdirSync(workspaceRoot, { recursive: true });

    const pngBuf = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 4,
        background: { r: 10, g: 120, b: 230, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    testPngBase64 = `data:image/png;base64,${pngBuf.toString('base64')}`;

    testPort = await getFreePort();
    baseUrl = `http://127.0.0.1:${testPort}`;

    const loaderPath = path.join(
      os.homedir(),
      '.gemini',
      'antigravity',
      'lib',
      'node_modules',
      'sidecar_sdk',
      'register_loader.js'
    );
    const loaderUrl = pathToFileURL(loaderPath).href;

    serverProc = spawn(
      process.execPath,
      [`--import=${loaderUrl}`, path.join(projectRoot, 'sidecars/studio/run.mjs')],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          ANTIGRAVITY_CONVERSATION_ID: '',
          ANTIGRAVITY_SIDECAR_WEB_PORT: String(testPort),
          ANTIGRAVITY_SIDECAR_UI_TOKEN: sidecarToken,
          ANTIGRAVITY_LS_ADDRESS: '127.0.0.1:50000',
          ANTIGRAVITY_CSRF_TOKEN: 'test-csrf-token',
          ANTIGRAVITY_APP_DATA_DIR: appDataDir,
          WORKSPACE_ROOT: workspaceRoot,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    const deadline = Date.now() + 8000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        // Server still starting
      }
      await new Promise((r) => setTimeout(r, 80));
    }
    assert.ok(ready, `SidecarApp failed to start on port ${testPort}`);
  });

  after(async () => {
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
      await new Promise((resolve) => {
        serverProc.once('exit', resolve);
        setTimeout(resolve, 1000);
      });
    }
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('GET /api/health returns 200 with ok status and sidecar port', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.port, testPort);
  });

  test('GET /, /preload.js, /app.js, /styles.css, and /assets/logo.svg serve classic UI extension assets without crossorigin', async () => {
    const indexRes = await fetch(`${baseUrl}/`);
    assert.strictEqual(indexRes.status, 200);
    const html = await indexRes.text();
    assert.ok(html.includes('<link rel="stylesheet" href="/styles.css">'));
    assert.ok(html.includes('<script src="/preload.js"></script>'));
    assert.ok(html.includes('<script src="/app.js"></script>'));
    assert.ok(!html.includes('crossorigin'), 'index.html must not contain crossorigin attributes');
    assert.ok(!html.includes('type="module"'), 'index.html must not contain type="module" scripts');

    const preloadRes = await fetch(`${baseUrl}/preload.js`);
    assert.strictEqual(preloadRes.status, 200);
    const preloadText = await preloadRes.text();
    assert.ok(preloadText.includes('window.sidecar'));

    const jsRes = await fetch(`${baseUrl}/app.js`);
    assert.strictEqual(jsRes.status, 200);

    const cssRes = await fetch(`${baseUrl}/styles.css`);
    assert.strictEqual(cssRes.status, 200);
    assert.ok(cssRes.headers.get('content-type')?.includes('text/css'));

    const logoRes = await fetch(`${baseUrl}/assets/logo.svg`);
    assert.strictEqual(logoRes.status, 200);
    assert.strictEqual(logoRes.headers.get('content-type'), 'image/svg+xml');

    const templateRes = await fetch(`${baseUrl}/api/template?session_id=valid-session-1`);
    assert.strictEqual(templateRes.status, 200);
    assert.ok(templateRes.headers.get('content-type')?.includes('text/html'));
    assert.strictEqual(templateRes.headers.get('access-control-allow-origin'), '*');
    const templateHtml = await templateRes.text();
    assert.ok(templateHtml.includes('window.__STUDIO_EMBED__'));
    assert.ok(templateHtml.includes('studio-mode-inline'));

    const optionsRes = await fetch(`${baseUrl}/api/ai/refine`, { method: 'OPTIONS' });
    assert.strictEqual(optionsRes.status, 204);
    assert.strictEqual(optionsRes.headers.get('access-control-allow-origin'), '*');
  });

  test('POST requests without X-Sidecar-Token are rejected with 401 unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/artifact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'valid-session-1',
        filename: 'unauth.png',
        data: testPngBase64,
      }),
    });
    assert.strictEqual(res.status, 401);
  });

  test('GET /api/sessions and GET /api/session/active discover isolated temp brain session', async () => {
    const sessionsRes = await fetch(`${baseUrl}/api/sessions`);
    assert.strictEqual(sessionsRes.status, 200);
    const sessionsData = await sessionsRes.json();
    assert.ok(Array.isArray(sessionsData.sessions));
    assert.ok(sessionsData.sessions.some((s) => s.id === 'valid-session-1'));

    const activeRes = await fetch(`${baseUrl}/api/session/active`);
    assert.strictEqual(activeRes.status, 200);
    const activeData = await activeRes.json();
    assert.strictEqual(activeData.sessionId, 'valid-session-1');
  });

  test('POST /api/artifact and GET /api/artifact allow valid .png/.psd and block traversal and .jsonl', async () => {
    const sessionId = 'valid-session-1';
    const authHeaders = {
      'Content-Type': 'application/json',
      'X-Sidecar-Token': sidecarToken,
    };

    // Save valid .png artifact
    const postPng = await fetch(`${baseUrl}/api/artifact`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: sessionId,
        filename: 'test-sketch.png',
        data: testPngBase64,
      }),
    });
    assert.strictEqual(postPng.status, 200);

    // Retrieve valid .png artifact
    const getPng = await fetch(
      `${baseUrl}/api/artifact?session_id=${sessionId}&filename=test-sketch.png`
    );
    assert.strictEqual(getPng.status, 200);
    assert.strictEqual(getPng.headers.get('content-type'), 'image/png');

    // Save valid .psd artifact
    const psdStubBase64 = Buffer.from('8BPS\x00\x01', 'binary').toString('base64');
    const postPsd = await fetch(`${baseUrl}/api/artifact`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: sessionId,
        filename: 'layers.psd',
        data: psdStubBase64,
      }),
    });
    assert.strictEqual(postPsd.status, 200);

    // Block path traversal outside session directory
    const traversalGet = await fetch(
      `${baseUrl}/api/artifact?session_id=${sessionId}&filename=${encodeURIComponent('../../etc/passwd')}`
    );
    assert.ok(
      traversalGet.status === 400 || traversalGet.status === 403,
      `Expected 400 or 403 for ../../etc/passwd, got ${traversalGet.status}`
    );

    // Block reading internal transcript.jsonl
    const transcriptGet = await fetch(
      `${baseUrl}/api/artifact?session_id=${sessionId}&filename=${encodeURIComponent('.system_generated/logs/transcript.jsonl')}`
    );
    assert.ok(
      transcriptGet.status === 400 || transcriptGet.status === 403,
      `Expected 400 or 403 for transcript.jsonl, got ${transcriptGet.status}`
    );

    // Block saving forbidden .jsonl extension
    const postJsonl = await fetch(`${baseUrl}/api/artifact`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        session_id: sessionId,
        filename: 'evil.jsonl',
        data: Buffer.from('{}').toString('base64'),
      }),
    });
    assert.ok(
      postJsonl.status === 400 || postJsonl.status === 403,
      `Expected 400 or 403 for .jsonl upload, got ${postJsonl.status}`
    );
  });

  test('POST /api/ai/refine rejects missing image or unknown stylePreset with 400', async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
      'X-Sidecar-Token': sidecarToken,
    };

    const missingImgRes = await fetch(`${baseUrl}/api/ai/refine`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        prompt: 'Make it clean',
        stylePreset: 'auto',
      }),
    });
    assert.strictEqual(missingImgRes.status, 400);

    const badPresetRes = await fetch(`${baseUrl}/api/ai/refine`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        image: testPngBase64,
        stylePreset: 'unknown_invalid_preset_xyz',
      }),
    });
    assert.strictEqual(badPresetRes.status, 400);
  });

  test('GET /api/fs/info and POST /api/fs/save resolve file:// workspace URIs, save PSD/PNG, and block disallowed paths', async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
      'X-Sidecar-Token': sidecarToken,
    };
    const workspaceUri = pathToFileURL(workspaceRoot).href;

    const infoRes = await fetch(
      `${baseUrl}/api/fs/info?session_id=valid-session-1&workspace_uri=${encodeURIComponent(workspaceUri)}`
    );
    assert.strictEqual(infoRes.status, 200);
    const infoData = await infoRes.json();
    assert.strictEqual(infoData.workspaceDir, workspaceRoot);
    assert.ok(infoData.sessionDir);

    // Save PSD to workspaceDir
    const psdStubBase64 = Buffer.from('8BPS\x00\x01', 'binary').toString('base64');
    const savePsdRes = await fetch(`${baseUrl}/api/fs/save`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        directory: workspaceRoot,
        filename: 'saved-project.psd',
        data: psdStubBase64,
        workspaceUris: [workspaceUri],
      }),
    });
    assert.strictEqual(savePsdRes.status, 200);
    const savePsdData = await savePsdRes.json();
    assert.strictEqual(savePsdData.success, true);
    assert.ok(fs.existsSync(savePsdData.path));

    // Save PNG to workspaceDir
    const savePngRes = await fetch(`${baseUrl}/api/fs/save`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        directory: workspaceRoot,
        filename: 'exported.png',
        data: testPngBase64,
        workspaceUris: [workspaceUri],
      }),
    });
    assert.strictEqual(savePngRes.status, 200);
    const savePngData = await savePngRes.json();
    assert.strictEqual(savePngData.success, true);
    assert.ok(fs.existsSync(savePngData.path));

    // Block saving outside user/workspace directories
    const badPathRes = await fetch(`${baseUrl}/api/fs/save`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        directory: '/etc',
        filename: 'forbidden.png',
        data: testPngBase64,
      }),
    });
    assert.strictEqual(badPathRes.status, 403);
  });
});
