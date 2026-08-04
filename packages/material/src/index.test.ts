import { parseBaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { BASE_SCREEN_TEXT_MATERIAL_MANIFEST, BaseScreenTextMaterialElement } from './index.js';

describe('official text material', () => {
  it('publishes a valid manifest and a matching element constructor without registration', () => {
    const manifest = parseBaseScreenMaterialManifest(BASE_SCREEN_TEXT_MATERIAL_MANIFEST);
    const definition = createMaterialDefinition({
      manifest: BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
      element: BaseScreenTextMaterialElement,
    });

    expect(manifest.ok).toBe(true);
    expect(definition.ok).toBe(true);
    expect(BaseScreenTextMaterialElement.manifest).toBe(BASE_SCREEN_TEXT_MATERIAL_MANIFEST);
  });

  it('does not access or register custom elements at module import time', () => {
    expect('customElements' in globalThis).toBe(false);
  });
});
