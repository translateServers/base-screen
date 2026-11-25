import { describe, expect, it, vi } from 'vitest';

// harness fixture 在 import 期就声明 Custom Element 类；本测试只读清单，不渲染。
vi.hoisted(() => {
  (globalThis as { HTMLElement?: unknown }).HTMLElement ??= class {};
});

import {
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
} from '../packages/material/src/index.js';
import { PLUGIN_BOARD_BORDER_BOX_MANIFEST } from '../plugins/plugin-materials/src/board/border-box.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFESTS } from '../plugins/plugin-materials/src/echarts/manifest.js';
import { harnessInspectorDemoMaterialManifest } from '../tooling/verification/browser-harness/inspector-control-fixture.js';
import { HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST } from '../tooling/verification/browser-harness/semantic-chart-material.js';

/**
 * 属性预算门禁（竞品调研 COMPONENTS §6 的「≤15 平铺」判据的可执行化）。
 *
 * 口径：一个 zone 里「默认可见」= section 既非 advanced 也非 collapsed；字段数按
 * section.fields 计（group / array 容器算 1 个，其 itemFields 不计）。超预算的作者
 * 必须把字段折进 advanced/collapsed 分区，而不是把 ECharts option 全铺在检查器里。
 *
 * 存量超额登记在 BASELINE：只允许下调，不允许上调；新清单不得超额。
 */
const DEFAULT_VISIBLE_FIELD_BUDGET = 15;

const BASELINE: Readonly<Record<string, number>> = {
  // harness 演示物料故意铺满作者面，供检查器滚动连续性探针使用；只允许下调。
  'harness.semantic-chart:appearance': 22,
};

const MANIFESTS = [
  // 官方物料（ADR-0099 §2.4 迁移到描述符）同样受预算约束。
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_CONTAINER_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_IMAGE_MATERIAL_MANIFEST,
  BASE_SCREEN_CHART_MATERIAL_MANIFEST,
  BASE_SCREEN_TABLE_MATERIAL_MANIFEST,
  ...PLUGIN_ECHARTS_MATERIAL_MANIFESTS,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  harnessInspectorDemoMaterialManifest,
  HARNESS_SEMANTIC_CHART_MATERIAL_MANIFEST,
];

function visibleFieldCounts(manifest: (typeof MANIFESTS)[number]): Record<string, number> {
  const counts: Record<string, number> = {};
  const descriptor = manifest.editorDescriptor;
  if (descriptor === undefined) return counts;
  for (const zone of ['appearance', 'data', 'interaction'] as const) {
    const sections = descriptor[zone];
    if (sections === undefined) continue;
    counts[zone] = sections
      .filter((section) => section.advanced !== true && section.collapsed !== true)
      .reduce((total, section) => total + section.fields.length, 0);
  }
  return counts;
}

describe('editor attribute budget', () => {
  it('keeps default-visible fields per zone within budget or a lowering-only baseline', () => {
    const offenders: string[] = [];
    for (const manifest of MANIFESTS) {
      for (const [zone, count] of Object.entries(visibleFieldCounts(manifest))) {
        const key = `${manifest.type}:${zone}`;
        const allowed = BASELINE[key] ?? DEFAULT_VISIBLE_FIELD_BUDGET;
        if (count > allowed) offenders.push(`${key}=${count}>${allowed}`);
      }
    }
    expect(offenders, `default-visible field budget exceeded: ${offenders.join(', ')}`).toEqual([]);
  });

  it('does not keep stale baseline entries', () => {
    const live = new Set<string>();
    for (const manifest of MANIFESTS) {
      for (const [zone, count] of Object.entries(visibleFieldCounts(manifest))) {
        if (count > DEFAULT_VISIBLE_FIELD_BUDGET) live.add(`${manifest.type}:${zone}`);
      }
    }
    expect(Object.keys(BASELINE).filter((key) => !live.has(key))).toEqual([]);
  });
});
