import {
  parseBaseScreenChartData,
  parseBaseScreenMaterialManifest,
  parseBaseScreenTableData,
} from '@base-screen/plugin-core';
import { createMaterialDefinition } from '@base-screen/plugin-sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BaseScreenChartMaterialElement,
  BaseScreenContainerMaterialElement,
  BaseScreenEllipseMaterialElement,
  BaseScreenImageMaterialElement,
  BaseScreenRectangleMaterialElement,
  BaseScreenTableMaterialElement,
  BaseScreenTextMaterialElement,
} from '../src/index.js';

describe('official materials', () => {
  it('R3 publishes valid Chinese manifests and matching constructors without registration', () => {
    const materials = [
      [BASE_SCREEN_TEXT_MATERIAL_MANIFEST, BaseScreenTextMaterialElement],
      [BASE_SCREEN_CHART_MATERIAL_MANIFEST, BaseScreenChartMaterialElement],
      [BASE_SCREEN_TABLE_MATERIAL_MANIFEST, BaseScreenTableMaterialElement],
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

  it('R5 drives official material content through data, not prop forms', () => {
    for (const manifest of [
      BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
      BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
      BASE_SCREEN_CHART_MATERIAL_MANIFEST,
      BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
    ]) {
      expect(manifest.propertyPanel).toEqual([]);
      expect(manifest.propsSchema).toEqual({ kind: 'object', properties: {}, required: [] });
      expect(manifest.defaultProps).toEqual({});
    }
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.defaultData).toBe('文本');
  });

  it('R7 declares default sample data that satisfies the official data contracts', () => {
    expect(parseBaseScreenTableData(BASE_SCREEN_TABLE_MATERIAL_MANIFEST.defaultData).ok).toBe(true);
    expect(parseBaseScreenChartData(BASE_SCREEN_CHART_MATERIAL_MANIFEST.defaultData).ok).toBe(true);
  });

  it('R3 declares the container as hidden from the material library', () => {
    expect(BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST.libraryVisible).toBe(false);
    expect(BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST.libraryVisible).toBeUndefined();
    expect(BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST.libraryVisible).toBeUndefined();
    expect(BASE_SCREEN_TEXT_MATERIAL_MANIFEST.libraryVisible).toBeUndefined();
    expect(BASE_SCREEN_IMAGE_MATERIAL_MANIFEST.libraryVisible).toBeUndefined();
  });

  it('R3 projects selected tabular fields for official table and chart materials', () => {
    const dataset = {
      fields: [
        { id: 'name', label: '名称', valueType: 'string' as const },
        { id: 'amount', label: '金额', valueType: 'number' as const },
      ],
      rows: [
        { name: '北区', amount: 12 },
        { name: '南区', amount: null },
      ],
    };
    expect(
      BASE_SCREEN_TABLE_TABULAR_DATA_ADAPTER.adapt({
        dataset,
        fields: { columns: dataset.fields },
      }),
    ).toMatchObject({ ok: true, value: { rows: dataset.rows } });
    expect(
      BASE_SCREEN_CHART_TABULAR_DATA_ADAPTER.adapt({
        dataset,
        fields: { dimension: [dataset.fields[0]!], measures: [dataset.fields[1]!] },
      }),
    ).toMatchObject({
      ok: true,
      value: { series: [{ id: 'amount', points: [{ x: '北区', y: 12 }] }] },
    });
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
      'base-screen-chart',
      'base-screen-container',
      'base-screen-ellipse',
      'base-screen-image',
      'base-screen-rectangle',
      'base-screen-table',
      'base-screen-text',
    ]);
    vi.unstubAllGlobals();
  });
});
