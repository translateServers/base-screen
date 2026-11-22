import type {
  BaseScreenMaterialEditorField,
  BaseScreenMaterialManifest,
} from '@base-screen/plugin-core';
import { auditBaseScreenMaterialEditorForm } from '@base-screen/plugin-sdk';
import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
} from '../src/index.js';

const OFFICIAL_MANIFESTS: readonly BaseScreenMaterialManifest[] = [
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
];

function appearanceFields(manifest: BaseScreenMaterialManifest): BaseScreenMaterialEditorField[] {
  return (manifest.editorDescriptor?.appearance ?? []).flatMap((section) => [...section.fields]);
}

describe('official material editor descriptors (ADR-0099 §2.4)', () => {
  it('every official material arranges its appearance with a descriptor', () => {
    for (const manifest of OFFICIAL_MANIFESTS) {
      expect(appearanceFields(manifest).length, manifest.type).toBeGreaterThan(0);
    }
  });

  it('conforms to the inspector form paradigm (ADR-0102 R9/R11–R14)', () => {
    expect(OFFICIAL_MANIFESTS.flatMap((manifest) => auditBaseScreenMaterialEditorForm(manifest))).toEqual(
      [],
    );
  });

  it('keeps the descriptor as the only form source (ADR-0102 D1)', () => {
    // 扁平面板为空：单选、多选批量与条件样式都从描述符识别字段，不会再出现两份声明漂移。
    for (const manifest of OFFICIAL_MANIFESTS) {
      expect(manifest.propertyPanel, manifest.type).toEqual([]);
      expect(manifest.stylePanel, manifest.type).toEqual([]);
    }
  });

  it('keeps reserved styles out of the descriptor and uses top-level keys only', () => {
    for (const manifest of OFFICIAL_MANIFESTS) {
      for (const field of appearanceFields(manifest)) {
        expect(['opacity', 'flipX', 'flipY'], manifest.type).not.toContain(field.path[0]);
        expect(field.path, `${manifest.type}:${field.id}`).toHaveLength(1);
        expect(field.id).toBe(field.path[0]);
      }
    }
  });

  it('collapses the shadow section of shapes and gives the ellipse no corner radius', () => {
    for (const manifest of [
      BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
      BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
    ]) {
      const shadow = manifest.editorDescriptor?.appearance?.find(
        (section) => section.id === 'shadow',
      );
      expect(shadow?.collapsed, manifest.type).toBe(true);
    }
    expect(
      appearanceFields(BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST).some(
        (field) => field.path[0] === 'borderRadius',
      ),
    ).toBe(false);
  });

  it('orders sections structure → text → surface → shadow', () => {
    const order = ['structure', 'text', 'surface', 'shadow'];
    for (const manifest of OFFICIAL_MANIFESTS) {
      const ids = (manifest.editorDescriptor?.appearance ?? []).map((section) => section.id);
      const positions = ids.map((id) => order.indexOf(id));
      expect(
        positions.every((position) => position >= 0),
        manifest.type,
      ).toBe(true);
      expect(
        [...positions].sort((left, right) => left - right),
        manifest.type,
      ).toEqual(positions);
    }
  });
});
