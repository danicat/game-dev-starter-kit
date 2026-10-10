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

import './style.css';
import { PlaytestStudioUI, StudioNotifier } from './ui/PlaytestStudioUI.ts';
import { getStudioMode } from './utils/api.ts';

function initPlaytestStudio(): void {
  try {
    const mode = getStudioMode();
    const modeClass = mode === 'preview' ? 'studio-mode-preview' : 'studio-mode-full';

    document.body.classList.remove('studio-mode-preview', 'studio-mode-full');
    document.body.classList.add('studio-container', modeClass);
    if (mode === 'preview') {
      document.body.classList.add('bg-transparent');
    } else {
      document.body.classList.remove('bg-transparent');
    }

    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.classList.remove('studio-mode-preview', 'studio-mode-full');
      appEl.classList.add('studio-container', modeClass);
    }

    const appRootEl = document.getElementById('app-root');
    if (appRootEl) {
      appRootEl.classList.remove('studio-mode-preview', 'studio-mode-full');
      appRootEl.classList.add('studio-container', modeClass);
    }

    const headerEl = document.getElementById('header-bar');
    const annotationBarEl = document.getElementById('annotation-bar');
    const viewportEl = document.getElementById('viewport-container');
    const bugBarEl = document.getElementById('bug-report-bar');

    if (!headerEl || !annotationBarEl || !viewportEl || !bugBarEl) {
      throw new Error(
        'Required DOM containers not found for Playtest Studio. Missing: ' +
          [
            !headerEl && '#header-bar',
            !annotationBarEl && '#annotation-bar',
            !viewportEl && '#viewport-container',
            !bugBarEl && '#bug-report-bar'
          ]
            .filter(Boolean)
            .join(', ')
      );
    }

    new PlaytestStudioUI({
      headerEl,
      annotationBarEl,
      viewportEl,
      bugBarEl
    });

    console.log(`[Playtest Studio] Initialized in "${mode}" mode`);
  } catch (err: any) {
    console.error('[Playtest Studio] Initialization error:', err);
    StudioNotifier.fatal('Playtest Studio Initialization Failed', err);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initPlaytestStudio, { once: true });
} else {
  initPlaytestStudio();
}

window.addEventListener('error', (event) => {
  console.error('[Playtest Studio] Uncaught Window Error:', event);
  StudioNotifier.fatal('Uncaught Runtime Error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Playtest Studio] Unhandled Promise Rejection:', event);
  StudioNotifier.fatal('Unhandled Promise Rejection', event.reason);
});
