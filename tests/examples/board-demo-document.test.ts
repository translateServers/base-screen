import { describe, expect, it } from 'vitest';
import { BOARD_DEMO_DOCUMENT } from '../../examples/shared-backend/src/screens/board-demo-document';
import { METRIC_VALUE_MANIFEST } from '../../examples/vue-host/src/screen/metric-value';
import type { ScreenDatasetField, ScreenDocument } from '../../packages/contracts/src/index.js';
import { parseScreenDocument } from '../../packages/contracts/src/index.js';
import { validateScreenHostResourceBinding } from '../../packages/core/src/index.js';
import {
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
} from '../../packages/material/src/index.js';
import {
  validateBaseScreenMaterialProps,
  validateBaseScreenMaterialStyle,
} from '../../packages/plugin-core/src/index.js';
import { PLUGIN_BOARD_BORDER_BOX_MANIFEST } from '../../plugins/plugin-board-materials/src/border-box.js';
import { PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST } from '../../plugins/plugin-board-materials/src/capsule-progress.js';
import { PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST } from '../../plugins/plugin-board-materials/src/digital-flop.js';
import { PLUGIN_BOARD_MARQUEE_MANIFEST } from '../../plugins/plugin-board-materials/src/marquee.js';
import { PLUGIN_BOARD_SCROLL_BOARD_MANIFEST } from '../../plugins/plugin-board-materials/src/scroll-board.js';
import { PLUGIN_BOARD_WATER_LEVEL_MANIFEST } from '../../plugins/plugin-board-materials/src/water-level.js';
import { PLUGIN_ECHARTS_MATERIAL_MANIFEST } from '../../plugins/plugin-echarts/src/manifest.js';

/**
 * 种子文档有两层校验，缺一层都会出现「canonical 能解析、画布却空白」：
 * 1) contracts 只校验文档结构，不知道每个物料的 props/style 必填键；
 * 2) manifest schema 才知道 required 与「未声明键一律拒绝」的规则。
 */
const MANIFESTS = [
  BASE_SCREEN_TEXT_MATERIAL_MANIFEST,
  BASE_SCREEN_RECTANGLE_MATERIAL_MANIFEST,
  BASE_SCREEN_ELLIPSE_MATERIAL_MANIFEST,
  BASE_SCREEN_RULE_MATERIAL_MANIFEST,
  PLUGIN_BOARD_BORDER_BOX_MANIFEST,
  PLUGIN_BOARD_DIGITAL_FLOP_MANIFEST,
  PLUGIN_BOARD_WATER_LEVEL_MANIFEST,
  PLUGIN_BOARD_SCROLL_BOARD_MANIFEST,
  PLUGIN_BOARD_CAPSULE_PROGRESS_MANIFEST,
  PLUGIN_BOARD_MARQUEE_MANIFEST,
  PLUGIN_ECHARTS_MATERIAL_MANIFEST,
  METRIC_VALUE_MANIFEST,
];

const FIELDS: Readonly<Record<string, readonly ScreenDatasetField[]>> = {
  demo_metric: [{ id: 'value', label: '当前值', valueType: 'number' }],
  demo_series: [
    { id: 't', label: '时间', valueType: 'string' },
    { id: 'value', label: '数值', valueType: 'number' },
  ],
  demo_ranking: [
    { id: 'name', label: '名称', valueType: 'string' },
    { id: 'value', label: '数值', valueType: 'number' },
  ],
};

describe('Board demo document', () => {
  const parsed = parseScreenDocument(BOARD_DEMO_DOCUMENT);

  it('parses as a canonical Screen Document', () => {
    if (!parsed.ok) {
      throw new Error(
        `DEMO_DOCUMENT_INVALID: ${parsed.diagnostics
          .map((item) => `${item.code}@${item.path.join('.')}: ${item.message}`)
          .join(' | ')}`,
      );
    }
    expect(parsed.value.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(parsed.value.components.length).toBeGreaterThan(40);
  });

  it('satisfies every material manifest schema', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const byType = new Map(MANIFESTS.map((manifest) => [manifest.type, manifest]));
    for (const component of parsed.value.components) {
      const manifest = byType.get(component.type);
      expect(manifest, `missing manifest for ${component.type}`).toBeDefined();
      if (manifest === undefined) continue;
      const props = validateBaseScreenMaterialProps(component.props, manifest.propsSchema);
      if (!props.ok) {
        throw new Error(
          `${component.id} props invalid: ${props.diagnostics.map((item) => item.code).join(',')}`,
        );
      }
      const style = validateBaseScreenMaterialStyle(component.style, manifest.styleSchema);
      if (!style.ok) {
        throw new Error(
          `${component.id} style invalid: ${style.diagnostics.map((item) => item.code).join(',')}`,
        );
      }
    }
  });

  it('binds every host resource to fields the demo channel actually returns', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    let hostResourceCount = 0;
    for (const component of parsed.value.components) {
      const source = component.dataSource;
      if (source === null || source.type !== 'host-resource') continue;
      hostResourceCount += 1;
      const fields = FIELDS[source.resourceType];
      expect(fields, `unknown resource type ${source.resourceType}`).toBeDefined();
      const manifest = MANIFESTS.find((item) => item.type === component.type);
      expect(manifest?.dataBinding, `${component.type} declares no data binding`).toBeDefined();
      if (fields === undefined || manifest?.dataBinding === undefined) continue;
      const binding = validateScreenHostResourceBinding(
        source.binding,
        fields,
        manifest.dataBinding.roles,
      );
      if (!binding.ok) {
        throw new Error(
          `${component.id} binding invalid: ${binding.diagnostics
            .map((item) => item.code)
            .join(',')}`,
        );
      }
    }
    // KPI 4 + 水位 1 + 胶囊 3 + 图表 3 + 轮播 1 = 12 个数据驱动组件。
    expect(hostResourceCount).toBe(12);
  });

  it('contains the signature components in the expected proportions', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const counts = new Map<string, number>();
    for (const component of parsed.value.components) {
      counts.set(component.type, (counts.get(component.type) ?? 0) + 1);
    }
    expect(counts.get('board.digital-flop')).toBe(4);
    expect(counts.get('board.capsule-progress')).toBe(3);
    expect(counts.get('board.border-box')).toBe(10);
    expect(counts.get('board.water-level')).toBe(1);
    expect(counts.get('board.scroll-board')).toBe(1);
    expect(counts.get('board.marquee')).toBe(1);
    expect(counts.get('plugin.echarts')).toBe(3);
  });

  it('keeps every component as a root node', () => {
    if (!parsed.ok) throw new Error('document did not parse');
    const document: ScreenDocument = parsed.value;
    expect(document.components.every((component) => component.parentId === null)).toBe(true);
  });
});
