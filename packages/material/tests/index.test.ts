import { parseBaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenContainerMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenTextMaterialElement,
} from '../src/index.js';

describe('official materials', () => {
  it('R3 publishes valid Chinese manifests and matching constructors without registration', () => {
    const materials = [
      [BASE_SCREEN_TEXT_MATERIAL_MANIFEST, BaseScreenTextMaterialElement],
      [BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST, BaseScreenRectangleMaterialElement],
      [BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST, BaseScreenEllipseMaterialElement],
      [BASE_SCREEN_IMAGE_MATERIAL_MANIFEST, BaseScreenImageMaterialElement],
      [BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST, BaseScreenContainerMaterialElement],
    ] as const;

    for (const [manifest, element] of materials) {
      expect(parseBaseScreenMaterialManifest(manifest).ok).toBe(true);
      expect(createMaterialDefinition({ manifest, element }).ok).toBe(true);
      expect(element.manifest).toBe(manifest);
      expect(manifest.name).toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('does not access or register custom elements at module import time', () => {
    expect('customElements' in globalThis).toBe(false);
  });

  it('R3 auto-registers exactly the official Material tags', async () => {
    const registrations = new Map<string, CustomElementConstructor>();
    vi.stubGlobal('customElements', {
      get: (name: string) => registrations.get(name),
      define: (name: string, constructor: CustomElementConstructor) =>
        registrations.set(name, constructor),
    });

    await import('../src/auto-register.js');

    expect([...registrations.keys()].sort()).toEqual([
      'base-screen-container',
      'base-screen-ellipse',
      'base-screen-image',
      'base-screen-rectangle',
      'base-screen-text',
    ]);
    vi.unstubAllGlobals();
  });
});
