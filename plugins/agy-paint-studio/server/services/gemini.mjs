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

import { GoogleGenAI } from '@google/genai';
import { GoogleAuth } from 'google-auth-library';

export const DEFAULT_MODEL = 'gemini-3.1-flash-lite-image';

export const SUPPORTED_INPUT_FORMATS = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export const STYLE_PRESETS = {
  'auto': 'Creatively interpret this sketch or doodle and bring the concept to life as a polished, beautifully crafted illustration. If the user drew a rough sketch or abstract lines (e.g. a stick figure, rough animal, basic shapes, diagram, or object), recognize what subject is being depicted and render it with appealing professional artistic style, clean geometry, charming expressive character, and vibrant details (for example, rough doodle lines of a cat should become a delightful cartoon cat). Strictly preserve the subject matter, approximate layout, primary colors, and proportions of what is drawn. DO NOT add extraneous backgrounds, scenic environments, or unprompted scene elements that are not present in the user sketch—keep the focus solely on beautifully rendering the drawn subjects themselves. Upgrade the drawing from crude/minimalist to charming, polished, and aesthetically delightful.',
  'beautify': 'Creatively interpret this sketch or doodle and bring the concept to life as a polished, beautifully crafted illustration. If the user drew a rough sketch or abstract lines (e.g. a stick figure, rough animal, basic shapes, diagram, or object), recognize what subject is being depicted and render it with appealing professional artistic style, clean geometry, charming expressive character, and vibrant details (for example, rough doodle lines of a cat should become a delightful cartoon cat). Strictly preserve the subject matter, approximate layout, primary colors, and proportions of what is drawn. DO NOT add extraneous backgrounds, scenic environments, or unprompted scene elements that are not present in the user sketch—keep the focus solely on beautifully rendering the drawn subjects themselves. Upgrade the drawing from crude/minimalist to charming, polished, and aesthetically delightful.',
  'apply-notes': 'Carefully inspect this image for visual annotations, drawings, sketches, circled areas, arrows, and written or typed text notes/cues describing edits or modifications. Execute the requested changes and modifications precisely on the underlying scene or subjects, while completely removing all annotations, markings, and note text. Maintain the original art style, composition, lighting, and palette of the image.',
  'notes': 'Carefully inspect this image for visual annotations, drawings, sketches, circled areas, arrows, and written or typed text notes/cues describing edits or modifications. Execute the requested changes and modifications precisely on the underlying scene or subjects, while completely removing all annotations, markings, and note text. Maintain the original art style, composition, lighting, and palette of the image.',
  'watercolor': 'Create an expressive, beautiful, artistic watercolour interpretation of this drawing on textured paper. Use soft wet-in-wet watercolor bleeding, delicate pigment pooling, subtle paint splashes, artistic paper textures, and organic brush strokes while honoring the subjects and silhouette.',
  'banana': 'Create an expressive, beautiful, artistic watercolour interpretation of this drawing. Use soft wet-in-wet watercolor bleeding, delicate pigment pooling, artistic paper textures, and organic brush strokes while honoring the subjects and silhouette.',
  'concept-art': 'Turn this sketch into a polished, high-resolution digital concept art illustration with cinematic lighting and deep shadows.',
  'vector': 'Convert this drawing into a sharp, minimalist vector graphic with bold outlines, smooth gradients, and modern palette.',
  'pixel-art': 'Render this sketch as a clean 16-bit retro pixel art sprite with crisp pixel clusters and nostalgic arcade color palette.',
  'claymation': 'Render this sketch as a tactile 3D clay model or miniature toy figure with soft studio lighting and depth of field.',
  '3d-clay': 'Render this sketch as a tactile 3D clay model or miniature toy figure with soft studio lighting and depth of field.',
  'anime': 'Transform this drawing into a lush, hand-painted anime background scene in the style of classic studio animation.',
  'sketch': 'Refine this rough drawing into a clean, expressive hand-drawn illustration with crisp ink linework, subtle hatching, and balanced shading.',
  'realistic': 'Render this sketch as a high-detail photorealistic image with natural studio lighting, accurate materials, and realistic depth of field while preserving the exact composition.',
  'ui_mockup': 'Transform this wireframe or sketch into a clean, modern application user interface mockup with crisp typography, balanced spacing, and polished UI components while preserving the exact layout.',
  'diagram': 'Convert this rough drawing into a structured, high-clarity technical architecture or flow diagram with crisp geometric nodes, legible labels, and clean connector arrows.',
  'icon': 'Convert this drawing into a sharp, minimalist vector-style application icon with balanced geometry, bold outlines, and smooth modern gradients.',
};

function validateDimension(value, name) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 4096
  ) {
    throw new Error(
      `Invalid ${name} "${value}": must be a finite integer between 1 and 4096.`
    );
  }
}

export function parseImageHeader(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) {
    throw new Error('Failed to decode input canvas image: buffer is too small or corrupted.');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR chunk
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { format: 'png', mimeType: 'image/png', width, height };
  }

  // JPEG: FF D8
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        (marker >= 0xd0 && marker <= 0xd7) ||
        marker === 0x01
      ) {
        offset += 2;
        continue;
      }
      const segLength = buf.readUInt16BE(offset + 2);
      if (segLength < 2 || offset + 2 + segLength > buf.length) {
        break;
      }
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && offset + 9 <= buf.length) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { format: 'jpeg', mimeType: 'image/jpeg', width, height };
      }
      offset += 2 + segLength;
    }
    throw new Error('Failed to decode JPEG dimensions: missing SOF marker.');
  }

  // WebP: RIFF....WEBP
  if (
    buf.length >= 30 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunkType = buf.toString('ascii', 12, 16);
    if (chunkType === 'VP8 ') {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { format: 'webp', mimeType: 'image/webp', width, height };
    }
    if (chunkType === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { format: 'webp', mimeType: 'image/webp', width, height };
    }
    if (chunkType === 'VP8X') {
      const width = 1 + buf.readUIntLE(24, 3);
      const height = 1 + buf.readUIntLE(27, 3);
      return { format: 'webp', mimeType: 'image/webp', width, height };
    }
  }

  throw new Error(
    `Unsupported input image format. Supported formats are: ${Object.keys(SUPPORTED_INPUT_FORMATS).join(', ')}.`
  );
}

function extractBase64Payload(image) {
  if (typeof image !== 'string' || !image.trim()) {
    throw new Error(
      'Invalid or missing "image" in AI refinement request: must be a non-empty base64 string or data URL.'
    );
  }

  const trimmed = image.trim();
  let rawBase64 = trimmed;

  if (trimmed.startsWith('data:')) {
    const commaIndex = trimmed.indexOf(',');
    if (commaIndex === -1) {
      throw new Error(
        'Invalid data URL in "image": missing comma separator in data URL.'
      );
    }
    const header = trimmed.slice(0, commaIndex);
    if (!header.includes(';base64')) {
      throw new Error(
        'Invalid data URL in "image": data URL must be base64-encoded.'
      );
    }
    rawBase64 = trimmed.slice(commaIndex + 1);
  } else if (trimmed.includes(',')) {
    throw new Error(
      'Invalid "image" string: unexpected comma in raw base64 payload without "data:" prefix.'
    );
  }

  const cleanBase64 = rawBase64.replace(/\s+/g, '');
  if (!cleanBase64 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(cleanBase64)) {
    throw new Error(
      'Invalid "image" in AI refinement request: payload is not valid base64 data.'
    );
  }

  return cleanBase64;
}

/**
 * Detects Vertex AI Application Default Credentials (ADC) status and project resolution.
 *
 * @param {object} [options={}]
 * @returns {Promise<{ hasGoogleCloudProject: boolean, googleCloudProject: string, googleCloudLocation: string, authMode: string }>}
 */
export async function detectAuthStatus(options = {}) {
  const service = new GeminiRefineService(options);
  const project = await service.resolveProject();
  return {
    hasGoogleCloudProject: true,
    googleCloudProject: project,
    googleCloudLocation: service.location,
    authMode: 'vertex-adc',
  };
}

/**
 * Instantiates a Vertex AI ADC-authenticated GoogleGenAI client.
 * Fails fast if Vertex AI ADC or Google Cloud Project cannot be resolved.
 *
 * @param {object} [options={}]
 * @param {object} [config={}]
 * @returns {Promise<GoogleGenAI>}
 */
export async function getGoogleGenAIClient(options = {}, config = {}) {
  const service = new GeminiRefineService({ ...config, ...options });
  return service.getClient();
}

/**
 * Service class for Gemini Nano Banana AI Image Refinement using Vertex AI ADC.
 */
export class GeminiRefineService {
  constructor(options = {}) {
    this.project =
      options.project ||
      options.googleCloudProject ||
      options.projectId ||
      null;
    this.location =
      options.location ||
      options.googleCloudLocation ||
      process.env.GOOGLE_CLOUD_LOCATION ||
      'global';
    this.model = options.model || process.env.MODEL || DEFAULT_MODEL;
    this.auth = options.auth || null;
    this.client = options.client || null;
  }

  /**
   * Resolves the Google Cloud Project ID via instance configuration, environment, or Vertex AI ADC.
   * Throws a descriptive fail-fast error if project resolution fails.
   *
   * @returns {Promise<string>}
   */
  async resolveProject() {
    let authError = null;
    let project =
      this.project ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      '';

    if (typeof project === 'string') {
      project = project.trim();
    }

    if (!project) {
      try {
        const auth = this.auth || new GoogleAuth();
        const detectedProject = await auth.getProjectId();
        project = typeof detectedProject === 'string' ? detectedProject.trim() : '';
      } catch (err) {
        authError = err;
      }
    }

    if (!project) {
      const errorDetail = authError?.message
        ? ` Underlying error: ${authError.message}`
        : ' No project ID was returned by Application Default Credentials.';
      throw new Error(
        'Vertex AI authentication failed: Vertex AI Application Default Credentials (ADC) and a Google Cloud Project ' +
        '(set via GOOGLE_CLOUD_PROJECT or `gcloud config set project <ID>`) are required.' +
        errorDetail
      );
    }

    this.project = project;
    return project;
  }

  /**
   * Returns a cached Vertex AI GoogleGenAI client instance, initializing it on first use.
   *
   * @returns {Promise<GoogleGenAI>}
   */
  async getClient() {
    if (this.client) {
      return this.client;
    }

    const project = await this.resolveProject();
    const location =
      (this.location || process.env.GOOGLE_CLOUD_LOCATION || 'global').trim() ||
      'global';

    this.location = location;
    this.client = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });

    return this.client;
  }

  /**
   * Refines a canvas image using Gemini image models over Vertex AI ADC,
   * preserving exact target dimensions with sharp.
   *
   * @param {object} params
   * @param {string} params.image Base64 string or data URL of the canvas image
   * @param {string} [params.prompt=''] Custom user prompt
   * @param {string} [params.stylePreset=''] Style preset key from STYLE_PRESETS
   * @param {number} [params.width] Optional target width (1..4096)
   * @param {number} [params.height] Optional target height (1..4096)
   * @param {string} [params.model] Optional model override
   * @param {string} [params.scope] Optional layer scope ('composite' | 'active-layer')
   * @returns {Promise<{ success: boolean, modelUsed: string, mimeType: string, imageBase64: string, image: string, width: number, height: number }>}
   */
  async refineImage({
    image,
    prompt = '',
    stylePreset = '',
    width,
    height,
    model,
    scope,
  } = {}) {
    const cleanBase64 = extractBase64Payload(image);

    if (typeof stylePreset !== 'string') {
      throw new Error('Invalid "stylePreset": must be a string.');
    }
    if (typeof prompt !== 'string') {
      throw new Error('Invalid "prompt": must be a string.');
    }

    const normalizedPreset = stylePreset.trim();
    const normalizedPrompt = prompt.trim();

    if (normalizedPrompt.length > 8000) {
      throw new Error('Invalid "prompt": exceeds maximum length of 8000 characters.');
    }

    if (
      normalizedPreset &&
      !Object.prototype.hasOwnProperty.call(STYLE_PRESETS, normalizedPreset)
    ) {
      const validPresets = Object.keys(STYLE_PRESETS).join(', ');
      throw new Error(
        `Invalid stylePreset "${stylePreset}". Valid style presets are: ${validPresets}`
      );
    }

    if (!normalizedPreset && !normalizedPrompt) {
      throw new Error('Either stylePreset or prompt must be provided for image refinement.');
    }

    if (width !== undefined && width !== null) {
      validateDimension(width, 'width');
    }
    if (height !== undefined && height !== null) {
      validateDimension(height, 'height');
    }

    const inputBuffer = Buffer.from(cleanBase64, 'base64');
    const inputMetadata = parseImageHeader(inputBuffer);
    const inputMimeType = inputMetadata.mimeType;

    validateDimension(inputMetadata.width, 'input image width');
    validateDimension(inputMetadata.height, 'input image height');

    const targetWidth = width ?? inputMetadata.width;
    const targetHeight = height ?? inputMetadata.height;

    validateDimension(targetWidth, 'width');
    validateDimension(targetHeight, 'height');

    const rawModel = model !== undefined && model !== null ? model : (this.model || DEFAULT_MODEL);
    if (typeof rawModel !== 'string' || !/^[a-zA-Z0-9._-]{1,128}$/.test(rawModel.trim())) {
      throw new Error(`Invalid model identifier "${String(rawModel)}".`);
    }
    const activeModel = rawModel.trim();
    const presetPrompt = normalizedPreset ? STYLE_PRESETS[normalizedPreset] : '';

    let finalPrompt = '';
    if (presetPrompt && normalizedPrompt) {
      finalPrompt = `${presetPrompt}\n\nAdditional user instructions: ${normalizedPrompt}`;
    } else if (presetPrompt) {
      finalPrompt = presetPrompt;
    } else {
      finalPrompt = normalizedPrompt;
    }

    if (scope === 'active-layer') {
      finalPrompt +=
        '\n\nNote: This is an isolated artwork layer. Maintain transparent or clean boundaries where appropriate.';
    }

    const ai = await this.getClient();

    console.log(
      `[GeminiRefine] Invoking model "${activeModel}" (input: ${inputMimeType}, target: ${targetWidth}x${targetHeight})...`
    );

    const abortController = new AbortController();
    let timeoutId = null;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error('AI refine request timed out after 90 seconds.'));
      }, 90000);
    });

    let response;
    try {
      const generatePromise = ai.models.generateContent({
        model: activeModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: inputMimeType,
                  data: cleanBase64,
                },
              },
              {
                text: finalPrompt,
              },
            ],
          },
        ],
        config: {
          responseModalities: ['IMAGE'],
          systemInstruction:
            'You are a master digital artist and illustrator. Your task is to take the provided user sketch/image and produce a refined, polished artwork layer matching the instructions.',
          temperature: 0.7,
          abortSignal: abortController.signal,
        },
      });

      response = await Promise.race([generatePromise, timeoutPromise]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }

    const blockReason = response?.promptFeedback?.blockReason ?? null;
    const candidate = response?.candidates?.[0] ?? null;
    const finishReason = candidate?.finishReason ?? null;
    const safetyRatings =
      candidate?.safetyRatings ?? response?.promptFeedback?.safetyRatings ?? [];
    const parts = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : [];

    let generatedBase64 = null;
    let outputMimeType = 'image/png';
    for (const part of parts) {
      if (part?.inlineData?.data) {
        generatedBase64 = part.inlineData.data;
        if (typeof part.inlineData.mimeType === 'string' && part.inlineData.mimeType.trim()) {
          outputMimeType = part.inlineData.mimeType.trim();
        }
        break;
      }
    }

    const textPart =
      parts
        .filter((p) => typeof p?.text === 'string' && p.text.trim())
        .map((p) => p.text.trim())
        .join(' ') || null;

    const hasInvalidFinishReason =
      candidate?.finishReason !== undefined && candidate.finishReason !== 'STOP';

    if (blockReason || !candidate || hasInvalidFinishReason || !generatedBase64) {
      throw new Error(
        `Gemini image refinement failed: ` +
        `model="${activeModel}", ` +
        `finishReason="${finishReason ?? 'NONE'}", ` +
        `blockReason="${blockReason ?? 'NONE'}", ` +
        `safetyRatings=${JSON.stringify(safetyRatings)}, ` +
        `text="${textPart ?? 'None'}"`
      );
    }

    const outputBase64 = generatedBase64.replace(/\s+/g, '');
    const dataUrl = `data:${outputMimeType};base64,${outputBase64}`;

    return {
      success: true,
      modelUsed: activeModel,
      mimeType: outputMimeType,
      imageBase64: dataUrl,
      image: outputBase64,
      width: targetWidth,
      height: targetHeight,
    };
  }

  async getAuthStatus() {
    return detectAuthStatus({
      project: this.project,
      location: this.location,
      model: this.model,
      auth: this.auth,
    });
  }
}

