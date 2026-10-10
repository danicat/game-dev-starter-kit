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

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { startServer } from '../server/index.mjs';

describe('Playtest Studio Sidecar Server & WASM Builder Integration Tests', () => {
  let srv;
  let baseUrl;
  let tempRootDir;
  let fakeAppDataDir;
  let fakeBrainDir;
  let testSessionId;
  let testSessionDir;
  let mockAgentApiPath;
  let agentApiCaptureFile;

  before(async () => {
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playtest-server-test-'));
    fakeAppDataDir = path.join(tempRootDir, 'antigravity');
    fakeBrainDir = path.join(fakeAppDataDir, 'brain');
    testSessionId = 'test-session-12345678';
    testSessionDir = path.join(fakeBrainDir, testSessionId);
    fs.mkdirSync(testSessionDir, { recursive: true });

    // Create a mock agentapi executable that records its CLI arguments to a JSON file
    agentApiCaptureFile = path.join(tempRootDir, 'agentapi-capture.json');
    mockAgentApiPath = path.join(tempRootDir, 'mock-agentapi.sh');
    const scriptContent = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(agentApiCaptureFile)}, JSON.stringify({ args }, null, 2));
process.stdout.write('ok\\n');
`;
    fs.writeFileSync(mockAgentApiPath, scriptContent, { mode: 0o755 });

    process.env.ANTIGRAVITY_APP_DATA_DIR = fakeAppDataDir;
    process.env.AGENTAPI_BIN = mockAgentApiPath;
    process.env.PLAYTEST_WORKSPACE = tempRootDir;

    srv = await startServer({ port: 0, host: '127.0.0.1' });
    baseUrl = `http://127.0.0.1:${srv.port}`;
  });

  after(async () => {
    if (srv) {
      await new Promise((resolve) => srv.close(resolve));
    }
    if (tempRootDir && fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  it('GET /api/health and GET /api/sessions return expected structure and CORS headers', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('access-control-allow-origin'), '*');
    assert.equal(healthRes.headers.get('access-control-allow-private-network'), 'true');

    const health = await healthRes.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.port, srv.port);
    assert.equal(health.host, '127.0.0.1');
    assert.equal(health.activeSessionId, testSessionId);
    assert.equal(health.defaultWorkspace, fs.realpathSync(tempRootDir).startsWith('/private') ? path.resolve(tempRootDir) : tempRootDir);

    const sessionsRes = await fetch(`${baseUrl}/api/sessions`);
    assert.equal(sessionsRes.status, 200);
    const sessionsData = await sessionsRes.json();
    assert.ok(Array.isArray(sessionsData.sessions));
    assert.equal(sessionsData.sessions.length, 1);
    assert.equal(sessionsData.sessions[0].id, testSessionId);

    const activeRes = await fetch(`${baseUrl}/api/session/active`);
    assert.equal(activeRes.status, 200);
    const activeData = await activeRes.json();
    assert.equal(activeData.sessionId, testSessionId);
  });

  it('GET /api/playtest/wasm_exec.js streams valid Go WASM JavaScript runtime', async () => {
    const res = await fetch(`${baseUrl}/api/playtest/wasm_exec.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/javascript/);

    const text = await res.text();
    assert.ok(text.length > 1000, 'wasm_exec.js should be non-trivial');
    assert.ok(
      text.includes('globalThis.Go') || text.includes('class Go') || text.includes('gojs'),
      'wasm_exec.js should define the Go WASM runtime'
    );
  });

  it('POST /api/playtest/build compiles valid Go main.go into a real WASM binary with \\0asm magic bytes', async () => {
    const validGoDir = path.join(tempRootDir, 'valid-go-game');
    fs.mkdirSync(validGoDir, { recursive: true });
    fs.writeFileSync(
      path.join(validGoDir, 'go.mod'),
      'module example.com/validgame\n\ngo 1.21\n'
    );
    fs.writeFileSync(
      path.join(validGoDir, 'main.go'),
      'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Playtest WASM ready")\n}\n'
    );

    const buildRes = await fetch(`${baseUrl}/api/playtest/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: validGoDir }),
    });

    assert.equal(buildRes.status, 200);
    const buildData = await buildRes.json();
    assert.equal(buildData.status, 'ok');
    assert.ok(buildData.buildId, 'buildId should be returned');
    assert.equal(buildData.pkg, '.');
    assert.ok(buildData.wasmBytes > 1000, 'Compiled WASM should have non-zero size');
    assert.equal(buildData.wasmUrl, `/api/playtest/wasm?buildId=${buildData.buildId}`);
    assert.equal(buildData.wasmExecUrl, '/api/playtest/wasm_exec.js');

    // Fetch the compiled WASM binary and verify \0asm magic header [0x00, 0x61, 0x73, 0x6d]
    const wasmRes = await fetch(`${baseUrl}${buildData.wasmUrl}`);
    assert.equal(wasmRes.status, 200);
    assert.equal(wasmRes.headers.get('content-type'), 'application/wasm');
    assert.equal(wasmRes.headers.get('cache-control'), 'no-store');

    const wasmBuf = Buffer.from(await wasmRes.arrayBuffer());
    assert.equal(wasmBuf.length, buildData.wasmBytes);
    assert.deepEqual(
      [wasmBuf[0], wasmBuf[1], wasmBuf[2], wasmBuf[3]],
      [0x00, 0x61, 0x73, 0x6d],
      'WASM binary must start with \\0asm magic bytes [0x00, 0x61, 0x73, 0x6d]'
    );

    // Verify GET /api/playtest/runner serves sidecar-hosted runner HTML with wasm-unsafe-eval CSP
    const runnerRes = await fetch(
      `${baseUrl}/api/playtest/runner?buildId=${encodeURIComponent(buildData.buildId)}&runnerId=1`
    );
    assert.equal(runnerRes.status, 200);
    assert.match(runnerRes.headers.get('content-security-policy') || '', /wasm-unsafe-eval/);
    const runnerHtml = await runnerRes.text();
    assert.ok(runnerHtml.includes(buildData.buildId));
    assert.ok(runnerHtml.includes('WebAssembly.instantiate'));
  });

  it('POST /api/playtest/build auto-discovers ./cmd/* package when root has no .go files', async () => {
    const cmdGoDir = path.join(tempRootDir, 'cmd-go-game');
    const subCmdDir = path.join(cmdGoDir, 'cmd', 'mygame');
    fs.mkdirSync(subCmdDir, { recursive: true });
    fs.writeFileSync(
      path.join(cmdGoDir, 'go.mod'),
      'module example.com/cmdgame\n\ngo 1.21\n'
    );
    fs.writeFileSync(
      path.join(subCmdDir, 'main.go'),
      'package main\n\nfunc main() {}\n'
    );

    const workspaceFileUri = pathToFileURL(cmdGoDir).href;
    const resolveRes = await fetch(`${baseUrl}/api/workspace/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceUri: workspaceFileUri }),
    });
    assert.equal(resolveRes.status, 200);
    const resolveData = await resolveRes.json();
    assert.equal(resolveData.workspace, path.resolve(cmdGoDir));
    assert.equal(resolveData.pkg, './cmd/mygame');

    const buildRes = await fetch(`${baseUrl}/api/playtest/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: workspaceFileUri }),
    });

    assert.equal(buildRes.status, 200);
    const buildData = await buildRes.json();
    assert.equal(buildData.status, 'ok');
    assert.equal(buildData.pkg, './cmd/mygame');
  });

  it('POST /api/playtest/build fails fast with HTTP 422 and exact compiler stderr on broken Go code', async () => {
    const brokenGoDir = path.join(tempRootDir, 'broken-go-game');
    fs.mkdirSync(brokenGoDir, { recursive: true });
    fs.writeFileSync(
      path.join(brokenGoDir, 'go.mod'),
      'module example.com/brokengame\n\ngo 1.21\n'
    );
    fs.writeFileSync(
      path.join(brokenGoDir, 'main.go'),
      'package main\n\nfunc main() {\n\tundefinedSymbolForPlaytestTest()\n}\n'
    );

    const buildRes = await fetch(`${baseUrl}/api/playtest/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: brokenGoDir, pkg: '.' }),
    });

    assert.equal(buildRes.status, 422);
    const errData = await buildRes.json();
    assert.equal(errData.error, 'Go WASM compilation failed');
    assert.ok(
      errData.compilerOutput.includes('undefinedSymbolForPlaytestTest'),
      `Expected compilerOutput to contain undefinedSymbolForPlaytestTest, got: ${errData.compilerOutput}`
    );
    assert.equal(errData.pkg, '.');
    assert.notEqual(errData.exitCode, 0);
  });

  it('POST /api/send-to-chat rejects path traversal and saves valid annotated screenshot + console logs via agentapi', async () => {
    // 1. Reject path traversal in filename
    const traversalRes = await fetch(`${baseUrl}/api/send-to-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: testSessionId,
        filename: '../evil.png',
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      }),
    });
    assert.equal(traversalRes.status, 400);

    // 2. Valid annotated screenshot with note, metadata, and consoleLogs
    const samplePngBase64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const validRes = await fetch(`${baseUrl}/api/send-to-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: testSessionId,
        filename: 'hitbox-bug.png',
        image: samplePngBase64,
        note: 'Player clips through right platform corner',
        metadata: {
          workspace: '/path/to/game',
          pkg: './cmd/game',
          frameOffset: '-1.5s',
          resolution: '640x480',
        },
        consoleLogs: ['[WASM] frame=120 collision=false', 'panic: nil bounds'],
      }),
    });

    assert.equal(validRes.status, 200);
    const validData = await validRes.json();
    assert.equal(validData.success, true);
    assert.equal(validData.mode, 'screenshot');
    assert.equal(validData.filename, 'hitbox-bug.png');
    assert.ok(fs.existsSync(validData.filePath), 'Saved PNG file must exist in session brain dir');

    const captured = JSON.parse(fs.readFileSync(agentApiCaptureFile, 'utf-8'));
    assert.equal(captured.args[0], 'send-message');
    assert.equal(captured.args[1], '--title=Playtest Bug: hitbox-bug.png');
    assert.equal(captured.args[2], testSessionId);
    assert.ok(captured.args[3].includes('![hitbox-bug.png]('));
    assert.ok(captured.args[3].includes('**Bug Note**: Player clips through right platform corner'));
    assert.ok(captured.args[3].includes('### Captured WASM Console / Stderr'));
    assert.ok(captured.args[3].includes('panic: nil bounds'));

    // 3. Valid buildError payload
    const buildErrRes = await fetch(`${baseUrl}/api/send-to-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: testSessionId,
        workspace: '/path/to/game',
        pkg: './cmd/game',
        note: 'Fails when building for js/wasm',
        buildError: './main.go:14:2: undefined: ebiten.RunGame',
      }),
    });

    assert.equal(buildErrRes.status, 200);
    const buildErrData = await buildErrRes.json();
    assert.equal(buildErrData.success, true);
    assert.equal(buildErrData.mode, 'build-error');

    const capturedErr = JSON.parse(fs.readFileSync(agentApiCaptureFile, 'utf-8'));
    assert.equal(capturedErr.args[0], 'send-message');
    assert.equal(capturedErr.args[1], '--title=Playtest WASM Build Error');
    assert.equal(capturedErr.args[2], testSessionId);
    assert.ok(capturedErr.args[3].includes('### 🚨 Ebitengine WASM Build Error'));
    assert.ok(capturedErr.args[3].includes('undefined: ebiten.RunGame'));

    // 4. Valid 5s DVR Animated GIF (.gif) payload
    const sampleGifBase64 =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const gifRes = await fetch(`${baseUrl}/api/send-to-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: testSessionId,
        filename: 'playtest-dvr-replay.gif',
        image: sampleGifBase64,
        note: '5s DVR replay showing enemy teleporting through wall',
        metadata: {
          workspace: '/path/to/game',
          pkg: './cmd/game',
          frameOffset: '5.0s DVR GIF (75 frames, ending at live (0.0s))',
          resolution: '480x270 (from 640x360)',
        },
      }),
    });

    assert.equal(gifRes.status, 200);
    const gifData = await gifRes.json();
    assert.equal(gifData.success, true);
    assert.equal(gifData.mode, 'screenshot');
    assert.equal(gifData.filename, 'playtest-dvr-replay.gif');
    assert.ok(fs.existsSync(gifData.filePath), 'Saved GIF file must exist in session brain dir');
  });
});

