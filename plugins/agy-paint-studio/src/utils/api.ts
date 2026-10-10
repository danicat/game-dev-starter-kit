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

export interface SidecarBridge {
  conversationId: string | null;
  fetch: (url: string, options?: RequestInit) => Promise<Response>;
  getWorkspaceUris: () => Promise<string[]>;
  onWorkspaceChange: (listener: (uris: string[]) => void) => () => void;
  agent: {
    sendMessage: (message: string, conversationId?: string) => Promise<unknown>;
    startConversation: (message: string, title?: string) => Promise<unknown>;
    getConversationMetadata: (conversationId: string) => Promise<unknown>;
  };
  ui: {
    toggleAuxPane: (request?: { open?: boolean }) => void;
    toggleConversation: (conversationId: string) => void;
  };
}

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface StudioEmbedConfig {
  baseUrl: string;
  token: string;
  conversationId: string;
}

declare global {
  interface Window {
    sidecar?: SidecarBridge;
    __STUDIO_EMBED__?: StudioEmbedConfig;
  }
}

export type StudioMode = 'preview' | 'full';

const VALID_SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

let activeSessionId: string | null = null;
const sessionChangeListeners: Array<(sessionId: string) => void> = [];

/**
 * Check whether the studio is running inside an inline `<agent-embed>` chat artifact.
 */
export function isInlineEmbed(): boolean {
  return Boolean(window.__STUDIO_EMBED__?.baseUrl);
}

/**
 * Retrieve the Antigravity `window.sidecar` bridge injected by `/preload.js` or inline embed template.
 * Fails fast with a descriptive error if `window.sidecar` is not initialized.
 */
export function getSidecar(): SidecarBridge {
  if (!window.sidecar) {
    throw new Error(
      '[Paint Studio Fatal] window.sidecar bridge is not initialized. Ensure Paint Studio is served by the Antigravity Sidecar SDK (/preload.js).'
    );
  }
  return window.sidecar;
}

/**
 * Return the API base URL.
 * Returns the sidecar loopback origin when running inside an inline `<agent-embed>` widget,
 * and returns '' (relative path) inside the Aux Pane (`plugin://` origin) and Full Mode (`http://127.0.0.1:<port>`).
 */
export function getApiBaseUrl(): string {
  if (window.__STUDIO_EMBED__?.baseUrl) {
    return window.__STUDIO_EMBED__.baseUrl.replace(/\/+$/, '');
  }
  return '';
}

/**
 * Authenticated fetch wrapper that automatically includes the sidecar token via `window.sidecar.fetch`.
 */
export function sidecarFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const normalizedPath = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  return getSidecar().fetch(normalizedPath, options);
}

/**
 * Resolve the conversation's active workspace folder URIs (`file://...`) from the host bridge.
 */
export function getWorkspaceUris(): Promise<string[]> {
  if (window.location.protocol !== 'plugin:') {
    return Promise.resolve([]);
  }
  return getSidecar().getWorkspaceUris();
}

/**
 * Send a message directly to the active (or specified) Antigravity conversation via `window.sidecar.agent`.
 */
export function sendAgentMessage(message: string, conversationId?: string): Promise<unknown> {
  return getSidecar().agent.sendMessage(message, conversationId);
}

/**
 * Resolve the initial session ID from `window.sidecar.conversationId`, inline embed config, or URL query parameters.
 */
export function getInitialSessionId(): string {
  const sidecarConvId = window.sidecar?.conversationId?.trim();
  if (sidecarConvId && VALID_SESSION_ID_REGEX.test(sidecarConvId)) {
    return sidecarConvId;
  }

  const embedConvId = window.__STUDIO_EMBED__?.conversationId?.trim();
  if (embedConvId && VALID_SESSION_ID_REGEX.test(embedConvId)) {
    return embedConvId;
  }

  const params = new URLSearchParams(window.location.search);
  const querySessionId = (params.get('session_id') || params.get('conversationId'))?.trim();
  if (querySessionId && VALID_SESSION_ID_REGEX.test(querySessionId)) {
    return querySessionId;
  }

  return '';
}

/**
 * Get the currently active session ID.
 */
export function getActiveSessionId(): string {
  if (activeSessionId === null) {
    activeSessionId = getInitialSessionId();
  }
  return activeSessionId;
}

/**
 * Get the currently active session ID or null if not yet connected.
 */
export function getSessionId(): string | null {
  const current = getActiveSessionId();
  return current ? current : null;
}

/**
 * Update the active session ID and notify all registered listeners.
 */
export function setActiveSessionId(id: string): void {
  const trimmed = id.trim();
  if (!trimmed || !VALID_SESSION_ID_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid session_id "${id}". Must be 1-128 alphanumeric, underscore, or hyphen characters.`
    );
  }

  activeSessionId = trimmed;
  if (window.sidecar) {
    window.sidecar.conversationId = trimmed;
  }

  if (
    !isInlineEmbed() &&
    getStudioMode() === 'full' &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')
  ) {
    const url = new URL(window.location.href);
    url.searchParams.set('conversationId', trimmed);
    url.searchParams.set('session_id', trimmed);
    window.history.replaceState({}, '', url.toString());
  }

  for (const cb of sessionChangeListeners) {
    cb(trimmed);
  }
}

/**
 * Subscribe to active session ID changes.
 */
export function onSessionChange(cb: (sessionId: string) => void): void {
  sessionChangeListeners.push(cb);
}

/**
 * Determine whether the studio is running in compact 'preview' mode or 'full' studio mode.
 * Inline `<agent-embed>` widgets always use 'preview' mode to fit the 500px chat height budget.
 * Aux Pane embeds automatically switch to 'full' mode when widened/maximized (>= 760px).
 */
export function getStudioMode(): StudioMode {
  if (isInlineEmbed()) {
    return 'preview';
  }

  const modeParam = new URLSearchParams(window.location.search).get('mode');
  if (modeParam === 'preview') {
    return 'preview';
  }
  if (modeParam === 'full') {
    return 'full';
  }

  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }

  if (!inIframe) {
    return 'full';
  }

  return window.innerWidth >= 760 ? 'full' : 'preview';
}

/**
 * Construct the URL to open Full Mode in a top-level browser tab while preserving the sidecar token and conversation ID.
 */
export function getFullStudioUrl(): string {
  const sid = getActiveSessionId();

  if (window.__STUDIO_EMBED__?.baseUrl) {
    const url = new URL(window.__STUDIO_EMBED__.baseUrl);
    url.searchParams.set('mode', 'full');
    if (window.__STUDIO_EMBED__.token) {
      url.searchParams.set('token', window.__STUDIO_EMBED__.token);
    }
    if (sid) {
      url.searchParams.set('conversationId', sid);
      url.searchParams.set('session_id', sid);
    }
    return url.toString();
  }

  const currentParams = new URLSearchParams(window.location.search);
  let baseHref = window.location.href;

  if (window.location.protocol === 'plugin:') {
    const portMatch = window.location.hostname.match(/-(\d+)$/);
    if (portMatch) {
      baseHref = `http://127.0.0.1:${portMatch[1]}/`;
    }
  }

  const url = new URL(baseHref);
  for (const [k, v] of currentParams.entries()) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set('mode', 'full');
  if (sid) {
    url.searchParams.set('conversationId', sid);
    url.searchParams.set('session_id', sid);
  }
  return url.toString();
}

/**
 * Fetch the latest active session ID from the sidecar server.
 */
export async function fetchActiveSessionId(): Promise<string | null> {
  const res = await sidecarFetch('/api/session/active');
  if (!res.ok) {
    throw new Error(`Failed to fetch active session ID: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const resolved = typeof data.sessionId === 'string' && data.sessionId ? data.sessionId : null;
  if (resolved && !activeSessionId) {
    setActiveSessionId(resolved);
  }
  return resolved;
}

/**
 * Fetch the list of recent sessions discovered by the sidecar server.
 */
export async function fetchRecentSessions(): Promise<SessionSummary[]> {
  const res = await sidecarFetch('/api/sessions');
  if (!res.ok) {
    throw new Error(`Failed to fetch recent sessions: HTTP ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data.sessions) ? data.sessions : [];
}
