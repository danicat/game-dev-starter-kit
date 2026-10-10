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

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import { GeminiRefineService, STYLE_PRESETS } from './services/gemini.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, '..');
const distPath = path.join(pluginRoot, 'dist');

const SESSION_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const ALLOWED_ARTIFACT_EXTENSIONS = new Set([
  '.psd',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.svg',
  '.gif',
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.psd': 'image/vnd.adobe.photoshop',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

function createHttpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function withErrorHandling(handler) {
  return async (data) => {
    try {
      return await handler(data || {});
    } catch (err) {
      let statusCode = err.statusCode || 500;
      if (!err.statusCode) {
        const msg = err.message || '';
        if (msg.includes('timed out')) {
          statusCode = 504;
        } else if (msg.includes('Access denied') || msg.includes('Illegal filename')) {
          statusCode = 400;
        } else if (msg.includes('not found') || msg.includes('Not found')) {
          statusCode = 404;
        } else if (
          msg.includes('Invalid') ||
          msg.includes('Missing') ||
          msg.includes('Unsupported') ||
          msg.includes('Malformed')
        ) {
          statusCode = 400;
        } else if (msg.includes('Authentication failed')) {
          statusCode = 401;
        }
      }
      console.error(`[agy-paint] API error (${statusCode}):`, err.message);
      return new Response(JSON.stringify({ error: err.message, statusCode }), {
        contentType: 'application/json; charset=utf-8',
        status: statusCode,
      });
    }
  };
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
    'Antigravity app data directory not found. Set ANTIGRAVITY_APP_DATA_DIR to a valid directory.',
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
function getRecentSessions() {
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

function getActiveSessionId() {
  if (process.env.ANTIGRAVITY_CONVERSATION_ID) {
    return process.env.ANTIGRAVITY_CONVERSATION_ID;
  }
  const recent = getRecentSessions();
  return recent.length > 0 ? recent[0].id : null;
}

function validateArtifactRelativePath(relPath) {
  if (!relPath || typeof relPath !== 'string' || !relPath.trim()) {
    throw createHttpError('Missing or empty artifact filename/path.', 400);
  }
  if (relPath.includes('\0')) {
    throw createHttpError('Invalid artifact filename: null byte detected.', 400);
  }
  if (path.isAbsolute(relPath) || relPath.startsWith('/') || relPath.startsWith('\\')) {
    throw createHttpError(`Invalid artifact filename "${relPath}": must be a relative path.`, 400);
  }

  const normalized = relPath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (relPath.includes('..') || segments.some((seg) => seg === '..' || seg === '.')) {
    throw createHttpError(
      `Access denied: path traversal sequence ".." is not allowed in "${relPath}".`,
      400
    );
  }

  if (
    normalized === '.system_generated' ||
    normalized.startsWith('.system_generated/') ||
    segments[0] === '.system_generated'
  ) {
    throw createHttpError(
      `Access denied: access to ".system_generated" is forbidden ("${relPath}").`,
      400
    );
  }

  const ext = path.extname(relPath).toLowerCase();
  if (!ALLOWED_ARTIFACT_EXTENSIONS.has(ext)) {
    throw createHttpError(
      `Unsupported file extension "${ext}" for "${relPath}". Allowed extensions: ${Array.from(ALLOWED_ARTIFACT_EXTENSIONS).join(', ')}.`,
      400
    );
  }

  return { normalized, ext };
}

function scanConversationMedia(sessionDir) {
  if (!fs.existsSync(sessionDir)) {
    return [];
  }
  const realSessionDir = fs.realpathSync(sessionDir);
  const results = [];

  function walk(currentDir, relPrefix = '', source = 'Artifact') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.system_generated'
      ) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

      let realEntryPath;
      try {
        realEntryPath = fs.realpathSync(fullPath);
      } catch (err) {
        console.warn(`[agy-paint] Skipping unresolvable entry "${fullPath}": ${err.message}`);
        continue;
      }

      if (
        realEntryPath !== realSessionDir &&
        !realEntryPath.startsWith(realSessionDir + path.sep)
      ) {
        console.warn(`[agy-paint] Skipping symlink outside session directory: "${fullPath}"`);
        continue;
      }

      const stat = fs.statSync(realEntryPath);
      if (stat.isDirectory()) {
        if (entry.name === '.user_uploaded') {
          walk(fullPath, relPath, 'User Upload');
        } else if (entry.name === '.tempmediaStorage') {
          walk(fullPath, relPath, 'Temp Media');
        } else if (!entry.name.startsWith('.')) {
          walk(fullPath, relPath, source);
        }
      } else if (stat.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_ARTIFACT_EXTENSIONS.has(ext)) {
          results.push({
            filename: relPath,
            displayName: entry.name,
            source,
            size: stat.size,
            modifiedTime: stat.mtimeMs,
            ext,
          });
        }
      }
    }
  }

  walk(sessionDir);
  return results.sort((a, b) => b.modifiedTime - a.modifiedTime);
}

export function getConfig() {
  return {
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '',
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    model: process.env.MODEL || 'gemini-3.1-flash-lite-image',
  };
}

function parseWorkspaceUri(uri) {
  if (typeof uri !== 'string' || !uri.trim()) return null;
  const trimmed = uri.trim();
  if (trimmed.startsWith('file://')) {
    return path.resolve(fileURLToPath(trimmed));
  }
  return null;
}

export function createSidecarApp() {
  const app = new SidecarApp();

  // ---------------------------------------------------------------------------
  // Static Pages & Assets (re-read from disk on each request)
  // ---------------------------------------------------------------------------
  const serveIndexHtml = () => {
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
      throw createHttpError(
        `Built frontend index.html not found at "${indexPath}". Run "npm run build" first.`,
        500
      );
    }
    return new Response(fs.readFileSync(indexPath, 'utf-8'), {
      contentType: 'text/html; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
    });
  };

  const serveAppJs = () => {
    const jsPath = path.join(distPath, 'app.js');
    if (!fs.existsSync(jsPath)) {
      throw createHttpError(
        `Built frontend app.js not found at "${jsPath}". Run "npm run build" first.`,
        500
      );
    }
    return new Response(fs.readFileSync(jsPath, 'utf-8'), {
      contentType: 'application/javascript; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
    });
  };

  const serveStylesCss = () => {
    const cssPath = path.join(distPath, 'styles.css');
    if (!fs.existsSync(cssPath)) {
      throw createHttpError(
        `Built frontend styles.css not found at "${cssPath}". Run "npm run build" first.`,
        500
      );
    }
    return new Response(fs.readFileSync(cssPath, 'utf-8'), {
      contentType: 'text/css; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
    });
  };

  app.page('/', serveIndexHtml);
  app.page('/index.html', serveIndexHtml);
  app.page('/app.js', serveAppJs);
  app.api('/styles.css', serveStylesCss, 'GET');

  app.api(
    '/assets/logo.svg',
    () => {
      const logoPath = path.join(pluginRoot, 'assets', 'logo.svg');
      return new Response(fs.readFileSync(logoPath, 'utf-8'), {
        contentType: 'image/svg+xml',
      });
    },
    'GET'
  );

  // Register any additional compiled assets in dist/assets/
  const distAssetsDir = path.join(distPath, 'assets');
  if (fs.existsSync(distAssetsDir)) {
    for (const file of fs.readdirSync(distAssetsDir)) {
      const routePath = `/assets/${file}`;
      if (routePath === '/assets/logo.svg') {
        continue;
      }
      const ext = path.extname(file).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fullPath = path.join(distAssetsDir, file);
      if (ext === '.js' || ext === '.mjs') {
        app.page(routePath, () => fs.readFileSync(fullPath, 'utf-8'));
      } else {
        app.api(
          routePath,
          () => new Response(fs.readFileSync(fullPath), { contentType }),
          'GET'
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // API Endpoints
  // ---------------------------------------------------------------------------

  // 1. GET /api/health
  app.api(
    '/api/health',
    () => ({
      status: 'ok',
      port: Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
    'GET'
  );

  // 2. GET /api/sessions
  app.api(
    '/api/sessions',
    withErrorHandling(() => ({
      sessions: getRecentSessions(),
    })),
    'GET'
  );

  // 3. GET /api/session/active
  app.api(
    '/api/session/active',
    withErrorHandling(() => ({
      sessionId: getActiveSessionId(),
    })),
    'GET'
  );

  // 4. GET /api/artifacts
  app.api(
    '/api/artifacts',
    withErrorHandling((data) => {
      const sessionId = data.session_id || data.sessionId;
      const sessionDir = resolveSessionBrainDir(sessionId);
      const media = scanConversationMedia(sessionDir);
      return { artifacts: media, media };
    }),
    'GET'
  );

  // 5. GET /api/artifact
  app.api(
    '/api/artifact',
    withErrorHandling((data) => {
      const sessionId = data.session_id || data.sessionId;
      const filename = data.filename || data.path;
      const sessionDir = resolveSessionBrainDir(sessionId);
      const { ext } = validateArtifactRelativePath(filename);

      const targetPath = path.resolve(sessionDir, filename);
      const realSessionDir = fs.realpathSync(sessionDir);

      if (targetPath !== sessionDir && !targetPath.startsWith(sessionDir + path.sep)) {
        throw createHttpError(
          'Access denied: path traversal attempt outside session directory.',
          400
        );
      }

      const lstat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
      if (!lstat) {
        throw createHttpError(`Artifact file not found: "${filename}"`, 404);
      }

      let realTargetPath;
      try {
        realTargetPath = fs.realpathSync(targetPath);
      } catch (err) {
        throw createHttpError(
          `Access denied: unable to resolve real path for "${filename}": ${err.message}`,
          400
        );
      }

      if (!realTargetPath.startsWith(realSessionDir + path.sep)) {
        throw createHttpError(
          'Access denied: resolved artifact path escapes session directory.',
          400
        );
      }

      const stat = fs.statSync(realTargetPath);
      if (!stat.isFile()) {
        throw createHttpError(`Artifact path is not a regular file: "${filename}"`, 400);
      }

      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const headers = {
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      };
      if (ext === '.svg') {
        headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
      }

      const fileData = fs.readFileSync(realTargetPath);
      return new Response(fileData, { contentType, status: 200, headers });
    }),
    'GET'
  );

  // 6. POST /api/artifact
  app.api(
    '/api/artifact',
    withErrorHandling((data) => {
      const sessionId = data.session_id || data.sessionId;
      const filename = data.filename || data.path;
      const payload = data.data ?? data.image;

      const sessionDir = resolveSessionBrainDir(sessionId);
      validateArtifactRelativePath(filename);

      if (!payload || typeof payload !== 'string' || !payload.trim()) {
        throw createHttpError(
          'Missing or invalid "data" in save artifact request. Expected non-empty base64 string.',
          400
        );
      }

      const targetPath = path.resolve(sessionDir, filename);
      if (targetPath !== sessionDir && !targetPath.startsWith(sessionDir + path.sep)) {
        throw createHttpError(
          'Access denied: path traversal attempt outside session directory.',
          400
        );
      }

      const realSessionDir = fs.realpathSync(sessionDir);
      const targetDir = path.dirname(targetPath);

      let existingAncestor = targetDir;
      while (!fs.existsSync(existingAncestor)) {
        const parent = path.dirname(existingAncestor);
        if (parent === existingAncestor) break;
        existingAncestor = parent;
      }
      const realAncestor = fs.realpathSync(existingAncestor);
      if (
        realAncestor !== realSessionDir &&
        !realAncestor.startsWith(realSessionDir + path.sep)
      ) {
        throw createHttpError(
          'Access denied: target ancestor directory escapes session directory.',
          400
        );
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const realParentDir = fs.realpathSync(targetDir);
      if (
        realParentDir !== realSessionDir &&
        !realParentDir.startsWith(realSessionDir + path.sep)
      ) {
        throw createHttpError(
          'Access denied: target parent directory escapes session directory.',
          400
        );
      }

      const existingLstat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
      if (existingLstat) {
        let realExisting;
        try {
          realExisting = fs.realpathSync(targetPath);
        } catch (err) {
          throw createHttpError(
            `Access denied: invalid existing symlink at "${filename}": ${err.message}`,
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

      const rawBase64 = payload.includes(',') ? payload.split(',')[1] : payload;
      const buffer = Buffer.from(rawBase64, 'base64');
      fs.writeFileSync(targetPath, buffer);

      return { success: true, filename, path: targetPath };
    }),
    'POST'
  );

  // 7. GET /api/fs/info
  app.api(
    '/api/fs/info',
    withErrorHandling((data) => {
      const homeDir = os.homedir();
      const downloadsDir = path.join(homeDir, 'Downloads');
      const desktopDir = path.join(homeDir, 'Desktop');

      const hostWorkspaceDir = parseWorkspaceUri(data.workspace_uri || data.workspaceUri);
      const workspaceDir =
        hostWorkspaceDir ||
        (process.env.WORKSPACE_ROOT ? path.resolve(process.env.WORKSPACE_ROOT) : process.cwd());

      const sessionId = data.session_id || data.sessionId;
      let sessionDir = null;
      if (sessionId && SESSION_ID_REGEX.test(sessionId)) {
        try {
          sessionDir = resolveSessionBrainDir(sessionId);
        } catch {
          sessionDir = null;
        }
      }

      const defaultDir = fs.existsSync(downloadsDir) ? downloadsDir : homeDir;
      return {
        defaultDir,
        downloadsDir,
        desktopDir,
        homeDir,
        workspaceDir,
        sessionDir,
      };
    }),
    'GET'
  );

  // 8. POST /api/fs/save
  app.api(
    '/api/fs/save',
    withErrorHandling((data) => {
      const { directory, filename, filePath, workspaceUris } = data;
      const payload = data.data ?? data.image;

      if (!payload || typeof payload !== 'string' || !payload.trim()) {
        throw createHttpError(
          'Missing or invalid "data" in filesystem save request. Expected non-empty base64 string.',
          400
        );
      }

      const homeDir = os.homedir();
      const expandTilde = (p) => {
        const trimmed = p.trim();
        if (trimmed === '~') return homeDir;
        if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
          return path.join(homeDir, trimmed.slice(2));
        }
        return trimmed;
      };

      let targetPath;
      if (
        typeof directory === 'string' &&
        directory.trim() &&
        typeof filename === 'string' &&
        filename.trim()
      ) {
        if (
          filename.includes('\0') ||
          filename.includes('/') ||
          filename.includes('\\') ||
          filename === '.' ||
          filename === '..'
        ) {
          throw createHttpError(
            `Invalid filename "${filename}": must be a single file name without directory separators.`,
            400
          );
        }
        if (directory.includes('\0')) {
          throw createHttpError('Invalid directory path: null byte detected.', 400);
        }
        const resolvedDir = path.resolve(expandTilde(directory));
        targetPath = path.join(resolvedDir, filename.trim());
      } else if (typeof filePath === 'string' && filePath.trim()) {
        if (filePath.includes('\0')) {
          throw createHttpError('Invalid filePath: null byte detected.', 400);
        }
        targetPath = path.resolve(expandTilde(filePath));
      } else {
        throw createHttpError(
          'Missing target location: provide either ("directory" and "filename") or "filePath".',
          400
        );
      }

      const ext = path.extname(targetPath).toLowerCase();
      if (!ALLOWED_ARTIFACT_EXTENSIONS.has(ext)) {
        throw createHttpError(
          `Unsupported file extension "${ext}". Allowed extensions: ${Array.from(ALLOWED_ARTIFACT_EXTENSIONS).join(', ')}.`,
          400
        );
      }

      const normalizedSegments = targetPath.split(path.sep);
      if (normalizedSegments.includes('.system_generated')) {
        throw createHttpError(
          'Access denied: writing into ".system_generated" is forbidden.',
          400
        );
      }

      const allowedRoots = [
        path.resolve(homeDir),
        path.resolve(os.tmpdir()),
        path.resolve(process.cwd()),
      ];
      try {
        allowedRoots.push(fs.realpathSync(os.tmpdir()));
      } catch {
        // ignore if tmpdir realpath fails
      }
      if (process.env.WORKSPACE_ROOT) {
        allowedRoots.push(path.resolve(process.env.WORKSPACE_ROOT));
      }
      if (process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR) {
        allowedRoots.push(path.resolve(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR));
      }
      if (Array.isArray(workspaceUris)) {
        for (const uri of workspaceUris) {
          const parsed = parseWorkspaceUri(uri);
          if (parsed) allowedRoots.push(parsed);
        }
      }
      try {
        allowedRoots.push(path.resolve(getAppDataDir()));
      } catch {
        // ignore if appDataDir is not configured
      }

      const isWithinAllowedRoot = (candidate) =>
        allowedRoots.some(
          (root) => candidate === root || candidate.startsWith(root + path.sep)
        );

      if (!isWithinAllowedRoot(targetPath)) {
        throw createHttpError(
          `Access denied: target path "${targetPath}" must be within your home, workspace, or temp directory.`,
          403
        );
      }

      const targetDir = path.dirname(targetPath);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const realTargetDir = fs.realpathSync(targetDir);
      if (!isWithinAllowedRoot(realTargetDir)) {
        throw createHttpError(
          `Access denied: resolved target directory "${realTargetDir}" is outside allowed user directories.`,
          403
        );
      }

      const rawBase64 = payload.includes(',') ? payload.split(',')[1] : payload;
      const buffer = Buffer.from(rawBase64, 'base64');
      fs.writeFileSync(targetPath, buffer);

      return {
        success: true,
        filename: path.basename(targetPath),
        path: targetPath,
        size: buffer.length,
      };
    }),
    'POST'
  );

  // 8b. GET /api/fs/open
  app.api(
    '/api/fs/open',
    withErrorHandling((data) => {
      const rawFile = data.file || data.filePath || data.path;
      if (!rawFile || typeof rawFile !== 'string' || !rawFile.trim()) {
        throw createHttpError('Missing or empty "file" query parameter.', 400);
      }
      if (rawFile.includes('\0')) {
        throw createHttpError('Invalid file path: null byte detected.', 400);
      }

      const homeDir = os.homedir();
      const expandTilde = (p) => {
        const trimmed = p.trim();
        if (trimmed === '~') return homeDir;
        if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
          return path.join(homeDir, trimmed.slice(2));
        }
        if (trimmed.startsWith('file://')) {
          return fileURLToPath(trimmed);
        }
        return trimmed;
      };

      const targetPath = path.resolve(expandTilde(rawFile));
      const ext = path.extname(targetPath).toLowerCase();
      if (!ALLOWED_ARTIFACT_EXTENSIONS.has(ext)) {
        throw createHttpError(
          `Unsupported file extension "${ext}". Allowed extensions: ${Array.from(ALLOWED_ARTIFACT_EXTENSIONS).join(', ')}.`,
          400
        );
      }

      const normalizedSegments = targetPath.split(path.sep);
      if (normalizedSegments.includes('.system_generated')) {
        throw createHttpError(
          'Access denied: reading from ".system_generated" is forbidden.',
          400
        );
      }

      const allowedRoots = [
        path.resolve(homeDir),
        path.resolve(os.tmpdir()),
        path.resolve(process.cwd()),
      ];
      try {
        allowedRoots.push(fs.realpathSync(os.tmpdir()));
      } catch {
        // ignore if tmpdir realpath fails
      }
      if (process.env.WORKSPACE_ROOT) {
        allowedRoots.push(path.resolve(process.env.WORKSPACE_ROOT));
      }
      if (process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR) {
        allowedRoots.push(path.resolve(process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR));
      }
      try {
        allowedRoots.push(path.resolve(getAppDataDir()));
      } catch {
        // ignore if appDataDir is not configured
      }

      const isWithinAllowedRoot = (candidate) =>
        allowedRoots.some(
          (root) => candidate === root || candidate.startsWith(root + path.sep)
        );

      if (!isWithinAllowedRoot(targetPath)) {
        throw createHttpError(
          `Access denied: file path "${targetPath}" must be within your home, workspace, or temp directory.`,
          403
        );
      }

      if (!fs.existsSync(targetPath)) {
        throw createHttpError(`File not found: "${targetPath}"`, 404);
      }

      const realTargetPath = fs.realpathSync(targetPath);
      if (!isWithinAllowedRoot(realTargetPath)) {
        throw createHttpError(
          `Access denied: resolved file path "${realTargetPath}" is outside allowed user directories.`,
          403
        );
      }

      const stat = fs.statSync(realTargetPath);
      if (!stat.isFile()) {
        throw createHttpError(`Path is not a regular file: "${targetPath}"`, 400);
      }

      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileData = fs.readFileSync(realTargetPath);
      return new Response(fileData, {
        contentType,
        status: 200,
        headers: {
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }),
    'GET'
  );

  // 9. POST /api/ai/refine
  app.api(
    '/api/ai/refine',
    withErrorHandling(async (data) => {
      const { image, stylePreset, prompt, width, height } = data;

      if (!image || typeof image !== 'string' || !image.trim()) {
        throw createHttpError(
          'Missing or invalid "image" in refine request: must be a non-empty string.',
          400
        );
      }

      const hasStylePreset =
        stylePreset !== undefined && stylePreset !== null && stylePreset !== '';
      const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;

      if (hasStylePreset) {
        if (
          typeof stylePreset !== 'string' ||
          !Object.prototype.hasOwnProperty.call(STYLE_PRESETS, stylePreset)
        ) {
          throw createHttpError(
            `Invalid stylePreset "${stylePreset}". Allowed presets: ${Object.keys(STYLE_PRESETS).join(', ')}.`,
            400
          );
        }
      }

      if (!hasStylePreset && !hasPrompt) {
        throw createHttpError(
          'Invalid refine request: at least one of "stylePreset" or "prompt" is required.',
          400
        );
      }

      const config = getConfig();
      const geminiService = new GeminiRefineService(config);
      const result = await geminiService.refineImage({
        image,
        stylePreset: hasStylePreset ? stylePreset : undefined,
        prompt: hasPrompt ? prompt : undefined,
        width: width !== undefined ? Number(width) : undefined,
        height: height !== undefined ? Number(height) : undefined,
      });

      return {
        status: 'ok',
        image: result.image,
        mimeType: result.mimeType,
        text: result.text,
      };
    }),
    'POST'
  );

  // 10. GET /api/template (Self-contained inline <agent-embed> HTML artifact generator)
  app.api(
    '/api/template',
    withErrorHandling((data) => {
      const requestedSessionId = data.session_id || data.sessionId || getActiveSessionId() || 'standalone';
      const sessionId = validateSessionId(requestedSessionId);

      const indexPath = path.join(distPath, 'index.html');
      const cssPath = path.join(distPath, 'styles.css');
      const jsPath = path.join(distPath, 'app.js');

      if (!fs.existsSync(indexPath) || !fs.existsSync(cssPath) || !fs.existsSync(jsPath)) {
        throw createHttpError(
          `Built frontend assets not found in "${distPath}". Run "npm run build" first.`,
          500
        );
      }

      const rawHtml = fs.readFileSync(indexPath, 'utf-8');
      const rawCss = fs.readFileSync(cssPath, 'utf-8').replace(/<\/style>/gi, '<\\/style>');
      const rawJs = fs.readFileSync(jsPath, 'utf-8').replace(/<\/script>/gi, '<\\/script>');

      const port = Number(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT);
      const token = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN || '';
      const baseUrl = `http://127.0.0.1:${port}`;

      const embedConfigJson = JSON.stringify({
        baseUrl,
        token,
        conversationId: sessionId,
      });

      const inlineBridgeJs = `(function() {
  const cfg = ${embedConfigJson};
  window.__STUDIO_EMBED__ = cfg;

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'theme-change' && event.data.payload && event.data.payload.cssVariables) {
      for (const [k, v] of Object.entries(event.data.payload.cssVariables)) {
        document.documentElement.style.setProperty(k, v);
      }
    }
  });

  function secureFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (cfg.token) {
      headers.set('X-Sidecar-Token', cfg.token);
    }
    const targetUrl = url.startsWith('http://') || url.startsWith('https://')
      ? url
      : cfg.baseUrl + (url.startsWith('/') ? url : '/' + url);
    return fetch(targetUrl, { ...options, headers });
  }

  async function resolveProjectId(convId) {
    if (!convId || convId === 'standalone') return '';
    try {
      const res = await secureFetch('/_sidecar/get-conversation-metadata', {
        method: 'POST',
        body: JSON.stringify({ conversationId: convId })
      });
      if (!res.ok) return '';
      const data = await res.json();
      const metaEvent = data && data.response && (data.response.conversationMetadata || data.response.conversation_metadata);
      const meta = metaEvent && metaEvent.metadata;
      return (meta && (meta.projectId || meta.project_id)) || '';
    } catch {
      return '';
    }
  }

  window.sidecar = {
    conversationId: cfg.conversationId,
    fetch: secureFetch,
    getWorkspaceUris: async () => [],
    onWorkspaceChange: () => () => {},
    agent: {
      async sendMessage(message, convId) {
        const targetConv = convId || window.sidecar.conversationId || cfg.conversationId;
        const projectId = await resolveProjectId(targetConv);
        const res = await secureFetch('/_sidecar/send-message', {
          method: 'POST',
          body: JSON.stringify({ conversationId: targetConv, message, projectId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      },
      async startConversation(message, title) {
        const projectId = await resolveProjectId(cfg.conversationId);
        const res = await secureFetch('/_sidecar/new-conversation', {
          method: 'POST',
          body: JSON.stringify({ message, title, projectId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      },
      async getConversationMetadata(convId) {
        const res = await secureFetch('/_sidecar/get-conversation-metadata', {
          method: 'POST',
          body: JSON.stringify({ conversationId: convId })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      }
    },
    ui: {
      toggleAuxPane(request) {
        window.parent.postMessage({ type: 'toggle-aux-pane', payload: request }, '*');
      },
      toggleConversation(convId) {
        window.parent.postMessage({ type: 'toggle-conversation', payload: { conversationId: convId } }, '*');
      }
    }
  };
})();`;

      const inlinedHtml = rawHtml
        .replace(
          /class="studio-container studio-mode-preview"/g,
          'class="studio-container studio-mode-preview studio-mode-inline"'
        )
        .replace(
          /<link\s+rel="stylesheet"\s+href="\/styles\.css"\s*\/?>/i,
          `<style>\n${rawCss}\n</style>`
        )
        .replace(
          /<script\s+src="\/preload\.js"\s*><\/script>/i,
          `<script>\n${inlineBridgeJs}\n</script>`
        )
        .replace(
          /<script\s+src="\/app\.js"\s*><\/script>/i,
          `<script>\n${rawJs}\n</script>`
        );

      return new Response(inlinedHtml, {
        contentType: 'text/html; charset=utf-8',
        headers: { 'Cache-Control': 'no-cache' },
      });
    }),
    'GET'
  );

  // Wrap app.run() so cross-origin requests from inline <agent-embed> widgets succeed with CORS + OPTIONS preflight
  const origRun = app.run.bind(app);
  app.run = async () => {
    const server = await origRun();
    const origListeners = server.listeners('request');
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      const safeUrl = (req.url || '/').replace(/([?&]token=)[^&]+/gi, '$1[REDACTED]');
      console.log(`[paint-studio HTTP] ${req.method} ${safeUrl}`);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sidecar-Token');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      for (const listener of origListeners) {
        listener.call(server, req, res);
      }
    });
    return server;
  };

  return app;
}

const isDirectRun =
  Boolean(process.argv[1]) && process.argv[1].endsWith(path.join('server', 'index.mjs'));

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  const app = createSidecarApp();
  await app.run();
}
