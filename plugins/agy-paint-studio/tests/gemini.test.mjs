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

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as geminiModule from '../server/services/gemini.mjs';

const {
  GeminiRefineService,
  STYLE_PRESETS,
  getGoogleGenAIClient,
} = geminiModule;

describe('GeminiRefineService & STYLE_PRESETS Validation', () => {
  let validPngBase64;

  before(async () => {
    const buf = await sharp({
      create: {
        width: 128,
        height: 96,
        channels: 4,
        background: { r: 40, g: 80, b: 160, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    validPngBase64 = `data:image/png;base64,${buf.toString('base64')}`;
  });

  test('MODEL_MAP is removed and default model is gemini-3.1-flash-lite-image', () => {
    assert.strictEqual('MODEL_MAP' in geminiModule, false, 'MODEL_MAP must not be exported');
    assert.strictEqual(geminiModule.DEFAULT_MODEL, 'gemini-3.1-flash-lite-image');
    const service = new GeminiRefineService();
    assert.strictEqual(service.model, 'gemini-3.1-flash-lite-image');
  });

  test('STYLE_PRESETS contains all original artistic presets including beautify and watercolor', () => {
    assert.ok(STYLE_PRESETS, 'STYLE_PRESETS must be exported');
    const requiredKeys = [
      'auto',
      'beautify',
      'apply-notes',
      'watercolor',
      'concept-art',
      'vector',
      'pixel-art',
      '3d-clay',
      'anime',
    ];
    for (const key of requiredKeys) {
      assert.equal(
        typeof STYLE_PRESETS[key],
        'string',
        `STYLE_PRESETS["${key}"] must be a non-empty prompt string`
      );
      assert.ok(STYLE_PRESETS[key].length > 10, `STYLE_PRESETS["${key}"] must be descriptive`);
    }
  });

  test('refineImage fails fast when image is missing', async () => {
    const service = new GeminiRefineService();
    await assert.rejects(
      async () => {
        await service.refineImage({
          image: '',
          stylePreset: 'auto',
        });
      },
      /image/i
    );
  });

  test('refineImage fails fast when stylePreset is invalid', async () => {
    const service = new GeminiRefineService();
    await assert.rejects(
      async () => {
        await service.refineImage({
          image: validPngBase64,
          stylePreset: 'non_existent_preset',
          prompt: 'Refine this sketch',
        });
      },
      /preset|non_existent_preset|invalid|unknown/i
    );
  });

  test('refineImage fails fast when both stylePreset and prompt are empty', async () => {
    const service = new GeminiRefineService();
    await assert.rejects(
      async () => {
        await service.refineImage({
          image: validPngBase64,
          stylePreset: '',
          prompt: '   ',
        });
      },
      /prompt|stylePreset|preset|instruction|required/i
    );
  });

  test('refineImage fails fast when dimensions are out of range (> 4096 or <= 0)', async () => {
    const service = new GeminiRefineService();

    await assert.rejects(
      async () => {
        await service.refineImage({
          image: validPngBase64,
          prompt: 'Refine this sketch',
          width: 5000,
          height: 512,
        });
      },
      /dimension|width|height|4096/i
    );

    await assert.rejects(
      async () => {
        await service.refineImage({
          image: validPngBase64,
          prompt: 'Refine this sketch',
          width: 0,
          height: -10,
        });
      },
      /dimension|width|height/i
    );
  });

  test('Vertex AI ADC initialization fails fast with a rich error when project cannot be resolved', async () => {
    const backupProject = process.env.GOOGLE_CLOUD_PROJECT;
    const backupGcloud = process.env.GCLOUD_PROJECT;
    const backupCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/nonexistent/adc-credentials-path.json';

    try {
      await assert.rejects(
        async () => {
          await getGoogleGenAIClient({ authMode: 'vertex-adc', projectId: '' }, {});
        },
        /project|ADC|Vertex|Authentication/i
      );
    } finally {
      if (backupProject !== undefined) process.env.GOOGLE_CLOUD_PROJECT = backupProject;
      if (backupGcloud !== undefined) process.env.GCLOUD_PROJECT = backupGcloud;
      if (backupCreds !== undefined) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = backupCreds;
      } else {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
    }
  });
});
