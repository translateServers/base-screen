import type { ScreenDocument } from '@base-screen/contracts';
import type { BaseScreenMaterialManifest } from '@base-screen/plugin-core';
import { describe, expect, it } from 'vitest';
import {
  clipMaterialPositionToCanvas,
  createInitialMaterialDataSource,
  createMaterialComponent,
  nextMaterialComponentId,
  parseBaseScreenComponentInsertionIntent,
  validateInsertableMaterial,
} from '../../../../src/common/operations/material-component/material-component.js';

function manifest(overrides: Partial<BaseScreenMaterialManifest> = {}): BaseScreenMaterialManifest {
  return {
    type: 'acme.card',
    tagName: 'acme-card',
    name: 'Card',
    category: 'Test',
    keywords: [],
    defaultSize: { width: 200, height: 100 },
    defaultProps: { label: 'initial' },
    defaultStyle: { color: '#fff' },
    styleSchema: { kind: 'object', properties: {}, required: [] },
    stylePanel: [],
    propsSchema: { kind: 'object', properties: {}, required: [] },
    propertyPanel: [],
    events: [],
    dataCapabilities: ['static'],
    designCapabilities: { resize: true, rotate: false, children: false },
    ...overrides,
  };
}

function document(components: readonly Partial<ScreenDocument['components'][number]>[] = []) {
  return {
    canvas: { width: 640, height: 480, backgroundColor: '#000000' },
    components: components as ScreenDocument['components'],
    variables: [],
    blueprint: { relations: [] },
  } as ScreenDocument;
}

describe('material component factory', () => {
  it('derives ids from the material type without colliding with existing ids', () => {
    expect(nextMaterialComponentId(document(), 'acme.card')).toBe('acme-card-1');
    expect(
      nextMaterialComponentId(
        document([{ id: 'acme-card-1' }, { id: 'acme-card-2' }]),
        'acme.card',
      ),
    ).toBe('acme-card-3');
  });

  it('normalizes non-alphanumeric characters in the id base', () => {
    expect(nextMaterialComponentId(document(), 'acme.some-card')).toBe('acme-some-card-1');
  });

  it('builds the node from manifest defaults', () => {
    const node = createMaterialComponent(document(), manifest(), {
      position: { x: 12, y: 34 },
    });
    expect(node).toMatchObject({
      id: 'acme-card-1',
      type: 'acme.card',
      name: 'Card',
      parentId: null,
      position: { x: 12, y: 34 },
      size: { width: 200, height: 100 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: { label: 'initial' },
      style: { color: '#fff' },
      dataSource: null,
    });
  });

  it('stacks z-index above the highest existing component', () => {
    const node = createMaterialComponent(document([{ zIndex: 4 }, { zIndex: 9 }]), manifest(), {
      position: { x: 0, y: 0 },
    });
    expect(node.zIndex).toBe(10);
  });

  it('honours an explicit name and data source override', () => {
    const node = createMaterialComponent(document(), manifest(), {
      position: { x: 0, y: 0 },
      name: 'Renamed',
      dataSource: { type: 'static', value: 'x' },
    });
    expect(node.name).toBe('Renamed');
    expect(node.dataSource).toEqual({ type: 'static', value: 'x' });
  });

  it('derives the initial data source from defaultData only', () => {
    expect(createInitialMaterialDataSource(manifest())).toBeNull();
    expect(createInitialMaterialDataSource(manifest({ defaultData: 'hello' }))).toEqual({
      type: 'static',
      value: 'hello',
    });
    expect(
      createInitialMaterialDataSource(
        manifest({
          defaultData: { rows: [] },
          staticData: { kind: 'tabular', defaultBinding: { fields: { value: ['value'] } } },
        }),
      ),
    ).toEqual({
      type: 'static',
      value: { rows: [] },
      binding: { fields: { value: ['value'] } },
    });
  });
});

describe('clipMaterialPositionToCanvas', () => {
  it('clamps the node fully inside the canvas', () => {
    const doc = document();
    expect(clipMaterialPositionToCanvas(doc, manifest(), { x: 9999, y: 9999 })).toEqual({
      x: 440,
      y: 380,
    });
    expect(clipMaterialPositionToCanvas(doc, manifest(), { x: -50, y: -50 })).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe('parseBaseScreenComponentInsertionIntent', () => {
  it('accepts the strict minimal shape and an optional position', () => {
    expect(parseBaseScreenComponentInsertionIntent({ materialType: 'acme.card' })).toEqual({
      ok: true,
      value: { materialType: 'acme.card' },
      diagnostics: [],
    });
    expect(
      parseBaseScreenComponentInsertionIntent({
        materialType: 'acme.card',
        name: 'A',
        position: { x: 1, y: 2 },
      }),
    ).toMatchObject({ ok: true, value: { position: { x: 1, y: 2 } } });
  });

  it('rejects unknown fields, non-canonical types and bad positions', () => {
    expect(
      parseBaseScreenComponentInsertionIntent({ materialType: 'acme.card', extra: 1 }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_PAYLOAD_INVALID' }] });
    expect(parseBaseScreenComponentInsertionIntent({ materialType: 'NotAType' })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }],
    });
    expect(
      parseBaseScreenComponentInsertionIntent({
        materialType: 'acme.card',
        position: { x: Number.NaN, y: 0 },
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_PAYLOAD_INVALID' }] });
    expect(
      parseBaseScreenComponentInsertionIntent({ materialType: 'acme.card', name: '   ' }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_PAYLOAD_INVALID' }] });
  });
});

describe('validateInsertableMaterial', () => {
  it('requires a catalogued, visible material of the requested type', () => {
    expect(validateInsertableMaterial(manifest(), { materialType: 'acme.card' }).ok).toBe(true);
    expect(validateInsertableMaterial(undefined, { materialType: 'acme.card' })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }],
    });
    expect(
      validateInsertableMaterial(manifest({ libraryVisible: false }), {
        materialType: 'acme.card',
      }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }] });
    expect(
      validateInsertableMaterial(manifest({ type: 'other.card' }), { materialType: 'acme.card' }),
    ).toMatchObject({ ok: false, diagnostics: [{ code: 'AUTHORING_SOURCE_INVALID' }] });
  });
});
