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

import { fetchRecentSessions } from '../utils/api.ts';
import { NotificationManager } from './Notification.ts';

export type ConversationModalMode = 'set' | 'send';

export class ConversationModal {
  private modalEl: HTMLElement | null = null;
  private currentSessionId: string | null = null;
  private onConfirmCallback: ((sessionId: string) => Promise<void> | void) | null = null;
  private boundEscHandler: ((e: KeyboardEvent) => void) | null = null;

  public open(
    mode: ConversationModalMode,
    currentSessionId: string | null,
    onConfirm: (sessionId: string) => Promise<void> | void
  ) {
    this.currentSessionId = currentSessionId;
    this.onConfirmCallback = onConfirm;
    this.createModal(mode);
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

  private async createModal(mode: ConversationModalMode) {
    this.close();

    const isSetMode = mode === 'set';
    const titleText = isSetMode ? 'Set Active Conversation' : 'Send Artwork to Conversation';
    const actionBtnText = isSetMode ? 'Set Conversation' : 'Send to Conversation';
    const descriptionText = isSetMode
      ? 'Set the active Antigravity conversation ID for Paint Studio. This controls where "Send to Chat" delivers your artwork.'
      : 'Choose or enter a destination Antigravity conversation ID to deliver the current canvas artwork.';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) this.close();
    };

    const modal = document.createElement('div');
    modal.className = 'modal-dialog conversation-modal';
    modal.style.maxWidth = '520px';

    const header = document.createElement('div');
    header.className = 'modal-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'modal-title';
    titleWrap.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    const titleSpan = document.createElement('span');
    titleSpan.textContent = titleText;
    titleWrap.appendChild(titleSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close-btn';
    closeBtn.title = 'Close (Esc)';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '14px';

    const descEl = document.createElement('p');
    descEl.style.cssText = 'font-size: 13px; color: var(--text-secondary); margin: 0;';
    descEl.textContent = descriptionText;

    const inputSection = document.createElement('div');
    inputSection.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';

    const inputLabel = document.createElement('label');
    inputLabel.setAttribute('for', 'input-conversation-id');
    inputLabel.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--text-primary);';
    inputLabel.textContent = 'Conversation / Session ID';

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display: flex; gap: 8px;';

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.id = 'input-conversation-id';
    inputEl.className = 'input-text';
    inputEl.placeholder = 'Enter session UUID...';
    inputEl.value = this.currentSessionId || '';
    inputEl.style.cssText =
      'flex: 1; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-panel); color: var(--text-primary); font-size: 13px; font-family: monospace;';

    const submitBtn = document.createElement('button');
    submitBtn.id = 'btn-submit-action';
    submitBtn.className = 'btn btn-sm btn-primary';
    submitBtn.style.whiteSpace = 'nowrap';
    submitBtn.textContent = actionBtnText;

    inputRow.appendChild(inputEl);
    inputRow.appendChild(submitBtn);
    inputSection.appendChild(inputLabel);
    inputSection.appendChild(inputRow);

    const sessionsSection = document.createElement('div');
    sessionsSection.style.cssText = 'display: flex; flex-direction: column; gap: 6px; margin-top: 4px;';

    const sessionsHeader = document.createElement('div');
    sessionsHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

    const sessionsTitle = document.createElement('span');
    sessionsTitle.style.cssText = 'font-size: 12px; font-weight: 600; color: var(--text-primary);';
    sessionsTitle.textContent = 'Recent Active Sessions';

    const loadingEl = document.createElement('span');
    loadingEl.id = 'sessions-loading';
    loadingEl.style.cssText = 'font-size: 11px; color: var(--text-muted);';
    loadingEl.textContent = 'Loading...';

    sessionsHeader.appendChild(sessionsTitle);
    sessionsHeader.appendChild(loadingEl);

    const listEl = document.createElement('div');
    listEl.id = 'recent-sessions-list';
    listEl.style.cssText =
      'max-height: 180px; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg-panel); padding: 4px;';

    sessionsSection.appendChild(sessionsHeader);
    sessionsSection.appendChild(listEl);

    body.appendChild(descEl);
    body.appendChild(inputSection);
    body.appendChild(sessionsSection);

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

    inputEl.focus();
    inputEl.select();

    const doSubmit = async () => {
      const val = inputEl.value.trim();
      if (!val) {
        NotificationManager.error('Conversation ID required', 'Please enter or select a valid conversation ID.');
        return;
      }
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(val)) {
        NotificationManager.error('Invalid ID format', 'Conversation ID contains invalid characters.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      try {
        if (this.onConfirmCallback) {
          await this.onConfirmCallback(val);
        }
        this.close();
      } catch (err: any) {
        submitBtn.disabled = false;
        submitBtn.textContent = actionBtnText;
        NotificationManager.error('Operation Failed', err instanceof Error ? err.message : String(err));
      }
    };

    submitBtn.addEventListener('click', doSubmit);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSubmit();
      }
    });

    try {
      const sessions = await fetchRecentSessions();
      loadingEl.textContent = `${sessions.length} discovered`;
      listEl.textContent = '';

      if (sessions.length === 0) {
        const emptyEl = document.createElement('div');
        emptyEl.style.cssText = 'padding: 12px; text-align: center; font-size: 12px; color: var(--text-muted);';
        emptyEl.textContent = 'No past sessions found';
        listEl.appendChild(emptyEl);
      } else {
        for (const s of sessions) {
          const isCurrent = s.id === this.currentSessionId;
          const timeFormatted = s.updatedAt
            ? new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '';

          const row = document.createElement('div');
          row.className = 'session-item session-item-row';
          row.dataset.id = s.id;
          row.style.cssText =
            'display: flex; align-items: center; justify-content: space-between; padding: 6px 8px; border-radius: 4px; cursor: pointer; transition: background 0.15s; font-size: 12px;';

          const leftWrap = document.createElement('div');
          leftWrap.style.cssText = 'display: flex; align-items: center; gap: 6px; overflow: hidden;';

          const dotSpan = document.createElement('span');
          dotSpan.style.cssText = `color: ${isCurrent ? '#10b981' : '#64748b'}; font-size: 10px;`;
          dotSpan.textContent = '●';

          const titleSpanEl = document.createElement('span');
          titleSpanEl.className = 'session-item-title';
          titleSpanEl.style.cssText =
            'font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 140px;';
          titleSpanEl.textContent = s.title || s.id.slice(0, 8);

          const idSpanEl = document.createElement('span');
          idSpanEl.className = 'session-item-id';
          idSpanEl.style.cssText =
            'font-family: monospace; font-weight: 500; color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 220px;';
          idSpanEl.textContent = s.id;

          leftWrap.appendChild(dotSpan);
          leftWrap.appendChild(titleSpanEl);
          leftWrap.appendChild(idSpanEl);

          if (isCurrent) {
            const activeBadge = document.createElement('span');
            activeBadge.style.cssText =
              'font-size: 10px; background: rgba(16,185,129,0.15); color: #10b981; padding: 1px 4px; border-radius: 3px;';
            activeBadge.textContent = 'Active';
            leftWrap.appendChild(activeBadge);
          }

          const timeSpan = document.createElement('span');
          timeSpan.style.cssText = 'color: var(--text-muted); font-size: 11px; flex-shrink: 0;';
          timeSpan.textContent = timeFormatted;

          row.appendChild(leftWrap);
          row.appendChild(timeSpan);

          row.addEventListener('mouseenter', () => {
            row.style.background = 'var(--surface-hover)';
          });
          row.addEventListener('mouseleave', () => {
            row.style.background = 'transparent';
          });
          row.addEventListener('click', () => {
            inputEl.value = s.id;
            inputEl.focus();
          });
          row.addEventListener('dblclick', () => {
            inputEl.value = s.id;
            doSubmit();
          });

          listEl.appendChild(row);
        }
      }
    } catch (err: any) {
      console.error('[ConversationModal] Failed to load recent sessions:', err);
      loadingEl.textContent = 'Error';
      const errEl = document.createElement('div');
      errEl.style.cssText = 'padding: 10px; font-size: 12px; color: var(--danger-color);';
      errEl.textContent = `Failed to load recent sessions: ${err instanceof Error ? err.message : String(err)}`;
      listEl.appendChild(errEl);
    }
  }
}
