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

export class NotificationManager {
  private static container: HTMLElement | null = null;

  private static getContainer(): HTMLElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'notification-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  public static show(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 4000, detail?: string) {
    const container = this.getContainer();

    const toast = document.createElement('div');
    toast.className = `notification-toast toast-${type}`;
    if (type === 'error') {
      toast.style.borderColor = '#ef4444';
      toast.style.backgroundColor = '#1c1917';
      toast.style.boxShadow = '0 10px 15px -3px rgba(239, 68, 68, 0.2)';
    }

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    if (type === 'success') icon.textContent = '✓';
    else if (type === 'error') icon.textContent = '⚠️';
    else icon.textContent = 'ℹ';

    const content = document.createElement('div');
    content.className = 'toast-message';

    const titleEl = document.createElement('div');
    titleEl.style.fontWeight = '600';
    titleEl.textContent = message;
    content.appendChild(titleEl);

    if (detail) {
      const detailEl = document.createElement('pre');
      detailEl.style.margin = '4px 0 0 0';
      detailEl.style.fontSize = '11px';
      detailEl.style.fontFamily = 'monospace';
      detailEl.style.color = type === 'error' ? '#fca5a5' : '#9ca3af';
      detailEl.style.whiteSpace = 'pre-wrap';
      detailEl.style.wordBreak = 'break-word';
      detailEl.style.maxHeight = '140px';
      detailEl.style.overflow = 'auto';
      detailEl.style.userSelect = 'text';
      detailEl.textContent = detail;
      content.appendChild(detailEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Dismiss';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.onclick = () => toast.remove();

    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);

    container.appendChild(toast);

    // Fail-fast rule: Errors should be persistent until explicitly dismissed by user
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  public static error(message: string, detail?: string) {
    console.error('[NotificationManager Error]', message, detail || '');
    // Persistent (duration = 0) so critical failure is never hidden or auto-dismissed
    this.show(message, 'error', 0, detail);
  }

  public static success(message: string) {
    this.show(message, 'success', 3500);
  }

  public static info(message: string, duration = 3000) {
    this.show(message, 'info', duration);
  }

  public static fatal(title: string, error: unknown, context?: string) {
    console.error('[FATAL]', title, error, context ?? '');

    const existing = document.getElementById('fatal-error-overlay');
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'fatal-error-overlay';
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: #09090b;
      color: #fafafa;
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
    `;

    const errorMessage =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    const errorStack = error instanceof Error && error.stack ? error.stack : '';

    const iconEl = document.createElement('div');
    iconEl.style.fontSize = '40px';
    iconEl.style.marginBottom = '12px';
    iconEl.textContent = '🚨';

    const headingEl = document.createElement('h2');
    headingEl.style.cssText =
      'font-size: 20px; font-weight: 700; color: #ef4444; margin: 0 0 8px 0;';
    headingEl.textContent = title;

    const descEl = document.createElement('p');
    descEl.style.cssText =
      'font-size: 13px; color: #a1a1aa; max-width: 500px; margin: 0 0 16px 0;';
    descEl.textContent =
      'A critical error occurred in agy-paint. The system has failed fast to prevent data corruption.';

    overlay.appendChild(iconEl);
    overlay.appendChild(headingEl);
    overlay.appendChild(descEl);

    if (context) {
      const contextEl = document.createElement('div');
      contextEl.style.cssText =
        'font-size: 12px; color: #fca5a5; font-weight: 600; max-width: 600px; margin: 0 0 12px 0;';
      contextEl.textContent = `Context: ${context}`;
      overlay.appendChild(contextEl);
    }

    const preEl = document.createElement('pre');
    preEl.style.cssText = `
      background: #18181b;
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 11px;
      max-width: 90%;
      max-height: 200px;
      overflow: auto;
      text-align: left;
      white-space: pre-wrap;
      word-break: break-word;
      margin: 0 0 16px 0;
    `;
    preEl.style.userSelect = 'text';
    const detailLines = [
      context ? `[Context] ${context}` : '',
      errorMessage,
      errorStack && errorStack !== errorMessage ? errorStack : '',
    ].filter(Boolean);
    preEl.textContent = detailLines.join('\n\n');
    overlay.appendChild(preEl);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    };

    const cleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    };

    window.addEventListener('keydown', onKeyDown);

    const actionsEl = document.createElement('div');
    actionsEl.style.cssText =
      'display: flex; gap: 12px; align-items: center; justify-content: center;';

    const reloadBtn = document.createElement('button');
    reloadBtn.style.cssText =
      'background: #ef4444; color: #ffffff; border: none; padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;';
    reloadBtn.textContent = 'Reload Application';
    reloadBtn.addEventListener('click', () => {
      window.location.reload();
    });

    const dismissBtn = document.createElement('button');
    dismissBtn.style.cssText =
      'background: #27272a; color: #e4e4e7; border: 1px solid #3f3f46; padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;';
    dismissBtn.textContent = 'Dismiss (Esc)';
    dismissBtn.addEventListener('click', () => {
      cleanup();
    });

    actionsEl.appendChild(reloadBtn);
    actionsEl.appendChild(dismissBtn);
    overlay.appendChild(actionsEl);

    document.body.appendChild(overlay);
  }
}
