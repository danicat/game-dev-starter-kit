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

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const WASM_CACHE_DIR = path.join(os.tmpdir(), 'agy-playtest-wasm-cache');
const BUILD_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const recentBuilds = new Map();
let latestBuildId = null;

function createBuilderError(message, statusCode, extra = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  Object.assign(err, extra);
  return err;
}

/**
 * Normalizes a workspace input (either a `file://` URI from `window.sidecar.getWorkspaceUris()`
 * or a local filesystem path) into an absolute filesystem path using `fileURLToPath` from `node:url`.
 */
export function normalizeWorkspacePath(workspaceInput) {
  if (!workspaceInput || typeof workspaceInput !== 'string' || !workspaceInput.trim()) {
    throw createBuilderError(
      'Missing or empty "workspace" directory path for Go WASM compilation.',
      400
    );
  }

  const trimmed = workspaceInput.trim();
  if (trimmed.includes('\0')) {
    throw createBuilderError('Invalid workspace path: null byte detected.', 400);
  }

  if (trimmed.startsWith('file://')) {
    try {
      return path.resolve(fileURLToPath(trimmed));
    } catch (err) {
      throw createBuilderError(
        `Invalid workspace file:// URI "${trimmed}": ${err.message}`,
        400
      );
    }
  }

  return path.resolve(trimmed);
}

/**
 * Resolves the Go runtime's wasm_exec.js file by querying `go env GOROOT`.
 * Checks both Go 1.24+ (`lib/wasm/wasm_exec.js`) and older Go (`misc/wasm/wasm_exec.js`) locations.
 */
export function resolveWasmExecJsPath() {
  let goroot;
  try {
    goroot = execFileSync('go', ['env', 'GOROOT'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf-8',
    }).trim();
  } catch (err) {
    throw createBuilderError(
      `Failed to execute "go env GOROOT": ${err.message}. Ensure the Go toolchain is installed and in PATH.`,
      500
    );
  }

  if (!goroot) {
    throw createBuilderError(
      `"go env GOROOT" returned an empty path. Ensure the Go toolchain is properly configured.`,
      500
    );
  }

  const candidates = [
    path.join(goroot, 'lib', 'wasm', 'wasm_exec.js'),
    path.join(goroot, 'misc', 'wasm', 'wasm_exec.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw createBuilderError(
    `Go WASM runtime file "wasm_exec.js" not found under GOROOT "${goroot}". Checked: ${candidates.join(', ')}`,
    500
  );
}

/**
 * Discovers or validates the Go main package inside workspaceDir.
 */
export function discoverMainPackage(workspaceDir, requestedPkg) {
  const resolvedWorkspace = normalizeWorkspacePath(workspaceDir);

  if (!fs.existsSync(resolvedWorkspace)) {
    throw createBuilderError(
      `Workspace directory does not exist: "${resolvedWorkspace}".`,
      404
    );
  }

  const stat = fs.statSync(resolvedWorkspace);
  if (!stat.isDirectory()) {
    throw createBuilderError(
      `Workspace path is not a directory: "${resolvedWorkspace}".`,
      400
    );
  }

  const realWorkspace = fs.realpathSync(resolvedWorkspace);

  if (requestedPkg !== undefined && requestedPkg !== null && String(requestedPkg).trim() !== '') {
    const rawPkg = String(requestedPkg).trim();
    if (rawPkg.includes('\0')) {
      throw createBuilderError('Invalid package path: null byte detected.', 400);
    }
    if (path.isAbsolute(rawPkg) || rawPkg.startsWith('/') || rawPkg.startsWith('\\')) {
      throw createBuilderError(
        `Access denied: package path "${rawPkg}" must be relative to workspace "${resolvedWorkspace}".`,
        400
      );
    }

    const normalized = rawPkg.replace(/\\/g, '/');
    const segments = normalized.split('/');
    if (segments.some((seg) => seg === '..')) {
      throw createBuilderError(
        `Access denied: path traversal ".." is not allowed in package path "${rawPkg}".`,
        400
      );
    }

    const candidateDir = path.resolve(resolvedWorkspace, normalized);
    if (
      candidateDir !== resolvedWorkspace &&
      !candidateDir.startsWith(resolvedWorkspace + path.sep)
    ) {
      throw createBuilderError(
        `Access denied: package path "${rawPkg}" resolves outside workspace "${resolvedWorkspace}".`,
        400
      );
    }

    if (!fs.existsSync(candidateDir) || !fs.statSync(candidateDir).isDirectory()) {
      throw createBuilderError(
        `Requested Go package directory "${rawPkg}" not found inside workspace "${resolvedWorkspace}".`,
        400
      );
    }

    const realCandidate = fs.realpathSync(candidateDir);
    if (
      realCandidate !== realWorkspace &&
      !realCandidate.startsWith(realWorkspace + path.sep)
    ) {
      throw createBuilderError(
        `Access denied: package symlink "${rawPkg}" escapes workspace "${resolvedWorkspace}".`,
        400
      );
    }

    if (normalized !== '.') {
      return normalized.startsWith('./') ? normalized : `./${normalized}`;
    }
  }

  // Auto-discover: 1. Check root directory for .go files
  const rootEntries = fs.readdirSync(resolvedWorkspace, { withFileTypes: true });
  const hasRootGoFiles = rootEntries.some(
    (entry) =>
      entry.isFile() &&
      entry.name.endsWith('.go') &&
      !entry.name.endsWith('_test.go')
  );
  if (hasRootGoFiles) {
    return '.';
  }

  // 2. Search ./cmd/* and ./examples/* for a subdirectory containing main.go (or .go files)
  for (const parentFolder of ['cmd', 'examples']) {
    const searchDir = path.join(resolvedWorkspace, parentFolder);
    if (fs.existsSync(searchDir) && fs.statSync(searchDir).isDirectory()) {
      const subEntries = fs
        .readdirSync(searchDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const sub of subEntries) {
        const subDir = path.join(searchDir, sub.name);
        if (fs.existsSync(path.join(subDir, 'main.go'))) {
          return `./${parentFolder}/${sub.name}`;
        }
      }

      for (const sub of subEntries) {
        const subDir = path.join(searchDir, sub.name);
        const subFiles = fs.readdirSync(searchDir ? subDir : '', { withFileTypes: true });
        if (
          subFiles.some(
            (f) => f.isFile() && f.name.endsWith('.go') && !f.name.endsWith('_test.go')
          )
        ) {
          return `./${parentFolder}/${sub.name}`;
        }
      }
    }
  }

  throw createBuilderError(
    `No buildable Go package found in workspace "${resolvedWorkspace}". Expected .go files in workspace root (".") or under "./cmd/<name>/main.go".`,
    400
  );
}

/**
 * Compiles a Go workspace package to WebAssembly (`GOOS=js GOARCH=wasm`).
 */
export async function compileGoWasm({ workspace, pkg, timeoutMs = 60_000 } = {}) {
  const resolvedWorkspace = normalizeWorkspacePath(workspace);
  const resolvedPkg = discoverMainPackage(resolvedWorkspace, pkg);

  // If root workspace has no go.mod but the discovered subpackage has its own go.mod,
  // execute go build inside that submodule directory.
  let buildCwd = resolvedWorkspace;
  let buildTargetPkg = resolvedPkg;
  if (
    resolvedPkg !== '.' &&
    !fs.existsSync(path.join(resolvedWorkspace, 'go.mod'))
  ) {
    const candidateModDir = path.resolve(resolvedWorkspace, resolvedPkg);
    if (fs.existsSync(path.join(candidateModDir, 'go.mod'))) {
      buildCwd = candidateModDir;
      buildTargetPkg = '.';
    }
  }

  fs.mkdirSync(WASM_CACHE_DIR, { recursive: true });

  const buildId = crypto.randomUUID();
  const outputWasmPath = path.join(WASM_CACHE_DIR, `${buildId}.wasm`);
  const startTime = Date.now();

  await new Promise((resolve, reject) => {
    const proc = spawn('go', ['build', '-o', outputWasmPath, buildTargetPkg], {
      cwd: buildCwd,
      env: {
        ...process.env,
        GOOS: 'js',
        GOARCH: 'wasm',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
      reject(
        createBuilderError(
          `Go WASM compilation timed out after ${timeoutMs}ms in "${resolvedWorkspace}" (${resolvedPkg}).`,
          504,
          {
            workspace: resolvedWorkspace,
            pkg: resolvedPkg,
            compilerOutput: (stderr || stdout).trim(),
          }
        )
      );
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (timedOut) return;
      reject(
        createBuilderError(
          `Failed to spawn "go build": ${err.message}`,
          500,
          {
            workspace: resolvedWorkspace,
            pkg: resolvedPkg,
          }
        )
      );
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      if (code !== 0) {
        const compilerOutput = (stderr || stdout).trim() || `go build exited with code ${code}`;
        reject(
          createBuilderError('Go WASM compilation failed', 422, {
            compilerOutput,
            workspace: resolvedWorkspace,
            pkg: resolvedPkg,
            exitCode: code,
          })
        );
        return;
      }

      resolve();
    });
  });

  const durationMs = Date.now() - startTime;
  if (!fs.existsSync(outputWasmPath)) {
    throw createBuilderError(
      `Go build exited 0 but output WASM file was not created at "${outputWasmPath}".`,
      500
    );
  }

  const stat = fs.statSync(outputWasmPath);
  const buildRecord = {
    status: 'ok',
    buildId,
    workspace: resolvedWorkspace,
    pkg: resolvedPkg,
    wasmPath: outputWasmPath,
    wasmBytes: stat.size,
    durationMs,
    createdAt: new Date().toISOString(),
    wasmUrl: `/api/playtest/wasm?buildId=${buildId}`,
    wasmExecUrl: '/api/playtest/wasm_exec.js',
  };

  recentBuilds.set(buildId, buildRecord);
  latestBuildId = buildId;

  return {
    status: 'ok',
    buildId,
    workspace: resolvedWorkspace,
    pkg: resolvedPkg,
    wasmPath: outputWasmPath,
    wasmBytes: stat.size,
    durationMs,
    wasmUrl: `/api/playtest/wasm?buildId=${buildId}`,
    wasmExecUrl: '/api/playtest/wasm_exec.js',
  };
}

/**
 * Resolves a compiled WASM binary record by buildId (or the latest build if buildId is omitted).
 */
export function resolveCompiledWasm(buildId) {
  if (buildId !== undefined && buildId !== null && String(buildId).trim() !== '') {
    const id = String(buildId).trim();
    if (!BUILD_ID_REGEX.test(id)) {
      throw createBuilderError(
        `Invalid buildId "${id}". Must be a valid UUID.`,
        400
      );
    }

    const cached = recentBuilds.get(id);
    if (cached && fs.existsSync(cached.wasmPath)) {
      return cached;
    }

    const diskPath = path.join(WASM_CACHE_DIR, `${id}.wasm`);
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
      const stat = fs.statSync(diskPath);
      return {
        buildId: id,
        wasmPath: diskPath,
        wasmBytes: stat.size,
      };
    }

    throw createBuilderError(
      `Compiled WASM binary not found for buildId "${id}". Trigger POST /api/playtest/build first.`,
      404
    );
  }

  if (latestBuildId && recentBuilds.has(latestBuildId)) {
    const latest = recentBuilds.get(latestBuildId);
    if (fs.existsSync(latest.wasmPath)) {
      return latest;
    }
  }

  throw createBuilderError(
    'No compiled WASM binary available. Trigger POST /api/playtest/build first.',
    404
  );
}
