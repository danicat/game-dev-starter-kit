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

import type { CanvasEngine } from '../engine/CanvasEngine.ts';
import { serializePsd, parsePsd } from '../utils/psd.ts';
import { sidecarFetch, getApiBaseUrl, getSessionId } from '../utils/api.ts';
import { NotificationManager } from './Notification.ts';

export class ArtifactModal {
  private engine: CanvasEngine;
  private modalEl: HTMLElement | null = null;
  private sessionId: string | null = null;
  private boundEscHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(engine: CanvasEngine) {
    this.engine = engine;
    this.sessionId = getSessionId();
  }

  public setSessionId(id: string | null) {
    this.sessionId = id;
  }

  public open() {
    if (!this.sessionId) {
      this.sessionId = getSessionId();
    }
    if (!this.sessionId) {
      NotificationManager.error(
        'No session_id connected',
        'Cannot access session artifacts because no session_id parameter is currently active.'
      );
      return;
    }

    this.createModal();
    this.fetchArtifacts();
  }

  private createModal() {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) this.close();
    };

    const modal = document.createElement('div');
    modal.className = 'modal-dialog artifact-modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `
      <div class="modal-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <span>Session Artifacts</span>
      </div>
      <button class="modal-close-btn" title="Close (Esc)">✕</button>
    `;
    header.querySelector('.modal-close-btn')?.addEventListener('click', () => this.close());

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.innerHTML = `
      <!-- Save to Artifacts Section -->
      <div class="artifact-save-box">
        <div class="section-subtitle">Save Current Canvas to Session Artifacts</div>
        <div class="artifact-save-controls">
          <input type="text" id="artifact-save-name" class="input-text" placeholder="filename (e.g. artwork)" value="artwork-${Date.now()}">
          <select id="artifact-save-format" class="select-box">
            <option value="psd">Photoshop PSD (With Layers)</option>
            <option value="png">PNG Image</option>
            <option value="jpg">JPEG Image</option>
            <option value="webp">WebP Image</option>
          </select>
          <button id="artifact-save-btn" class="btn btn-primary">Save to Artifacts</button>
        </div>
      </div>

      <div class="section-divider"></div>

      <!-- Browse Artifacts Section -->
      <div class="section-subtitle">Artifacts in Current Session</div>
      <div id="artifact-list-container" class="artifact-list">
        <div class="artifact-loading">Loading session artifacts...</div>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.modalEl = overlay;

    this.boundEscHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this.boundEscHandler);

    // Bind save button
    const saveBtn = body.querySelector('#artifact-save-btn');
    saveBtn?.addEventListener('click', () => this.handleSaveToArtifacts());
  }

  public close() {
    if (this.boundEscHandler) {
      window.removeEventListener('keydown', this.boundEscHandler);
      this.boundEscHandler = null;
    }
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
  }

  private async fetchArtifacts() {
    const listContainer = document.getElementById('artifact-list-container');
    if (!listContainer || !this.sessionId) return;

    try {
      const res = await sidecarFetch(`/api/artifacts?session_id=${encodeURIComponent(this.sessionId)}`);
      if (!res.ok) {
        const bodyText = await res.text();
        let errMsg = `HTTP ${res.status}: ${res.statusText}`;
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText);
            if (parsed.error) errMsg = parsed.error;
          } catch {
            errMsg = bodyText;
          }
        }
        throw new Error(errMsg);
      }
      const data = await res.json();
      const artifacts = data.artifacts || [];

      listContainer.textContent = '';

      if (artifacts.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'artifact-empty';
        emptyEl.textContent = 'No image or PSD artifacts in this session yet.';
        listContainer.appendChild(emptyEl);
        return;
      }

      for (const art of artifacts) {
        const card = document.createElement('div');
        card.className = 'artifact-card artifact-item';

        const artName = art.name || art.displayName || art.filename || 'unnamed';
        const artRelativePath = art.relativePath || art.filename || artName;
        const artSize = typeof art.size === 'number' ? art.size : 0;
        const isPsd = (art.ext && art.ext.toLowerCase() === '.psd') || artRelativePath.toLowerCase().endsWith('.psd');

        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'artifact-item-thumb';

        if (isPsd) {
          const psdBadge = document.createElement('span');
          psdBadge.className = 'psd-badge';
          psdBadge.textContent = 'PSD';
          thumbWrap.appendChild(psdBadge);
        } else {
          const img = document.createElement('img');
          img.className = 'thumb-img';
          img.alt = artName;
          img.src = `${getApiBaseUrl()}/api/artifact?session_id=${encodeURIComponent(this.sessionId)}&filename=${encodeURIComponent(artRelativePath)}`;
          thumbWrap.appendChild(img);
        }

        const infoWrap = document.createElement('div');
        infoWrap.className = 'artifact-item-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'artifact-item-name';
        nameEl.title = artRelativePath;
        nameEl.textContent = artName;

        const pathEl = document.createElement('div');
        pathEl.className = 'artifact-item-path';
        pathEl.style.cssText = 'font-size: 10px; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        pathEl.textContent = artRelativePath;

        const metaEl = document.createElement('div');
        metaEl.className = 'artifact-item-meta';
        const timeStr = art.modifiedTime ? ` • ${new Date(art.modifiedTime).toLocaleTimeString()}` : '';
        metaEl.textContent = `${this.formatSize(artSize)}${timeStr}`;

        infoWrap.appendChild(nameEl);
        if (artRelativePath !== artName) {
          infoWrap.appendChild(pathEl);
        }
        infoWrap.appendChild(metaEl);

        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'artifact-item-actions';

        const loadDocBtn = document.createElement('button');
        loadDocBtn.className = 'btn btn-sm btn-outline load-as-doc-btn';
        loadDocBtn.textContent = 'Open as Canvas';
        loadDocBtn.addEventListener('click', () => this.loadArtifact(artRelativePath, false));

        const loadLayerBtn = document.createElement('button');
        loadLayerBtn.className = 'btn btn-sm btn-outline load-as-layer-btn';
        loadLayerBtn.textContent = 'Insert as Layer';
        loadLayerBtn.addEventListener('click', () => this.loadArtifact(artRelativePath, true));

        actionsWrap.appendChild(loadDocBtn);
        actionsWrap.appendChild(loadLayerBtn);

        card.appendChild(thumbWrap);
        card.appendChild(infoWrap);
        card.appendChild(actionsWrap);

        listContainer.appendChild(card);
      }
    } catch (err: any) {
      console.error('[ArtifactModal] Error fetching artifacts:', err);
      listContainer.textContent = '';
      const errEl = document.createElement('div');
      errEl.className = 'artifact-error';
      errEl.textContent = `Failed to load artifacts: ${err instanceof Error ? err.message : String(err)}`;
      listContainer.appendChild(errEl);
    }
  }

  private async loadArtifact(filename: string, asNewLayer: boolean) {
    if (!this.sessionId) return;

    try {
      NotificationManager.info(`Loading artifact "${filename}"...`);
      const fileUrl = `/api/artifact?session_id=${encodeURIComponent(this.sessionId)}&filename=${encodeURIComponent(filename)}`;
      const res = await fetch(fileUrl);
      if (!res.ok) {
        throw new Error(`Failed to download artifact "${filename}": HTTP ${res.status} ${res.statusText}`);
      }

      const isPsd = filename.toLowerCase().endsWith('.psd');

      if (isPsd) {
        const buffer = await res.arrayBuffer();
        parsePsd(buffer, this.engine);
        NotificationManager.success(`Loaded PSD artifact "${filename}" with layers`);
        this.close();
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Failed to decode image artifact "${filename}".`));
          image.src = objectUrl;
        });

        if (asNewLayer) {
          const layer = this.engine.addLayer(filename);
          layer.ctx.drawImage(img, 0, 0);
          this.engine.render();
          this.engine.commitHistory();
          NotificationManager.success(`Inserted "${filename}" as new layer`);
        } else {
          this.engine.resizeDocument(img.naturalWidth, img.naturalHeight);
          this.engine.initDefaultDocument();
          const active = this.engine.getActiveLayer();
          if (active) {
            active.ctx.drawImage(img, 0, 0);
            this.engine.render();
            this.engine.commitHistory();
          }
          NotificationManager.success(`Opened "${filename}" (${img.naturalWidth}×${img.naturalHeight})`);
        }
        this.close();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err: any) {
      console.error('[ArtifactModal] Error loading artifact:', err);
      NotificationManager.fatal('Load Artifact Failed', err);
    }
  }

  private async handleSaveToArtifacts() {
    if (!this.sessionId) return;

    const nameInput = document.getElementById('artifact-save-name') as HTMLInputElement;
    const formatSelect = document.getElementById('artifact-save-format') as HTMLSelectElement;

    let baseName = nameInput.value.trim() || `drawing-${Date.now()}`;
    const format = formatSelect.value;
    const ext = `.${format}`;

    if (!baseName.toLowerCase().endsWith(ext)) {
      baseName += ext;
    }

    try {
      NotificationManager.info(`Saving "${baseName}" to session artifacts...`);

      let base64Data = '';

      if (format === 'psd') {
        const psdBuffer = serializePsd(this.engine);
        const psdBytes = new Uint8Array(psdBuffer);
        let binary = '';
        const len = psdBytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(psdBytes[i]);
        }
        base64Data = btoa(binary);
      } else {
        const comp = this.engine.getCompositeCanvas();
        const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
        base64Data = comp.toDataURL(mime, 0.95);
      }

      const res = await sidecarFetch('/api/artifact', {
        method: 'POST',
        body: JSON.stringify({
          session_id: this.sessionId,
          filename: baseName,
          data: base64Data
        })
      });

      if (!res.ok) {
        const bodyText = await res.text();
        let errMsg = `HTTP ${res.status}: ${res.statusText}`;
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText);
            if (parsed.error) errMsg = parsed.error;
          } catch {
            errMsg = bodyText;
          }
        }
        throw new Error(errMsg);
      }

      const result = await res.json();
      NotificationManager.success(`Successfully saved "${result.filename}" to artifacts!`);
      this.fetchArtifacts();
    } catch (err: any) {
      console.error('[ArtifactModal] Save artifact failed:', err);
      NotificationManager.error('Save to Artifacts Failed', err instanceof Error ? err.message : String(err));
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
