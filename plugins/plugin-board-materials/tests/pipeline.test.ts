import { describe, expect, it } from 'vitest';
import {
  layoutPipelineStages,
  PIPELINE_MIN_NODE_WIDTH,
  PIPELINE_NODE_GAP,
} from '../src/pipeline.js';
import { createBoardStateAdapter } from '../src/tabular-columns-adapter.js';

/**
 * 工序链的可见数与 `…+N` 都由宽度推导（不测量 DOM），因此"6 道工序在 604 px 内全部可见、
 * 12 道在 800 px 内必然收口"可以离线断言。
 */
describe('layoutPipelineStages', () => {
  const geometry = {
    height: 200,
    minNodeWidth: PIPELINE_MIN_NODE_WIDTH,
    gap: PIPELINE_NODE_GAP,
  };

  it('fits six stages of a 604px canvas without truncation', () => {
    const layout = layoutPipelineStages({ ...geometry, width: 604 - 16, count: 6 });

    expect(layout.visible).toBe(6);
    expect(layout.hidden).toBe(0);
    expect(layout.nodeWidth).toBeGreaterThanOrEqual(PIPELINE_MIN_NODE_WIDTH);
  });

  it('collapses twelve stages into a narrower set plus the overflow chip', () => {
    const layout = layoutPipelineStages({ ...geometry, width: 800, count: 12 });

    expect(layout.hidden).toBeGreaterThan(0);
    expect(layout.visible + layout.hidden).toBe(12);
    // 可见节点宽度必须仍在可读范围内：收口位不能换来一排 10 px 的碎片。
    expect(layout.nodeWidth).toBeGreaterThanOrEqual(PIPELINE_MIN_NODE_WIDTH);
  });

  it('never collapses a single stage', () => {
    // 宽度不足一个最小节点：保底等于最小宽度，宁可溢出也不隐藏唯一一条工序。
    expect(layoutPipelineStages({ ...geometry, width: 40, count: 1 })).toEqual({
      visible: 1,
      hidden: 0,
      nodeWidth: PIPELINE_MIN_NODE_WIDTH,
    });
    // 宽度充足时占满可用宽度（单节点不画连接线，也就不留间距）。
    expect(layoutPipelineStages({ ...geometry, width: 300, count: 1 })).toEqual({
      visible: 1,
      hidden: 0,
      nodeWidth: 300,
    });
  });

  it('returns an all-zero layout for an empty stage list', () => {
    expect(layoutPipelineStages({ ...geometry, width: 604, count: 0 })).toEqual({
      visible: 0,
      hidden: 0,
      nodeWidth: 0,
    });
  });

  it('keeps the overflow chip inside the canvas', () => {
    const width = 800;
    const layout = layoutPipelineStages({ ...geometry, width, count: 12 });
    // 槽位 = 可见节点 + 收口位；总宽（含间距）不得超过画布宽度。
    const used = layout.visible * layout.nodeWidth + PIPELINE_NODE_GAP * layout.visible;
    expect(used).toBeLessThanOrEqual(width);
  });

  it('is monotonic: more stages never yields more visible stages', () => {
    const few = layoutPipelineStages({ ...geometry, width: 604, count: 6 });
    const many = layoutPipelineStages({ ...geometry, width: 604, count: 20 });
    expect(many.visible).toBeLessThanOrEqual(few.visible);
  });

  /**
   * 算法自己的「保槽」不变量：`hidden > 0` 时它按 `visible + 1` 个槽位算节点宽度，
   * 多出来的那一个槽位就是 `…+N` 收口位。这条断言把该约定钉死——否则一旦有人改成
   * 按 `visible` 个槽位计算，收口标签就会把最后一个节点挤出画布（`overflow:hidden`
   * 会让它静默消失，视觉上等于少一道工序）。
   */
  it('reserves one node-width slot for the overflow chip when it collapses', () => {
    for (const [width, count] of [
      [604 - 16, 12],
      [800, 12],
      [1000, 40],
      [200, 6],
    ] as const) {
      const layout = layoutPipelineStages({ ...geometry, width, count });
      if (layout.hidden === 0) continue;

      const reserved = layout.nodeWidth * (layout.visible + 1) + PIPELINE_NODE_GAP * layout.visible;
      expect(reserved, `width=${width} count=${count}`).toBeLessThanOrEqual(width);
    }
  });
});

describe('pipeline adapter', () => {
  const nameField = { id: 'name', label: '工序', valueType: 'string' as const };
  const statusField = { id: 'status', label: '状态', valueType: 'string' as const };
  const throughputField = { id: 'throughput', label: '吞吐', valueType: 'number' as const };

  it('projects stages in binding order without sorting', () => {
    const result = createBoardStateAdapter('stages').adapt({
      dataset: {
        fields: [nameField, statusField, throughputField],
        // 服务端保序：这里故意给一个"非字典序/非数值序"的顺序，适配器必须原样保留。
        rows: [
          { name: '焊装', status: 'fault', throughput: 0 },
          { name: '下料', status: 'running', throughput: 120 },
          { name: '冲压', status: 'running', throughput: 96 },
        ],
      },
      fields: { stages: [nameField, statusField, throughputField] },
    });

    if (!result.ok) throw new Error('the adapter must accept a valid binding');
    expect(result.value).toMatchObject({
      stages: [
        { name: '焊装', status: 'fault', value: 0 },
        { name: '下料', status: 'running', value: 120 },
        { name: '冲压', status: 'running', value: 96 },
      ],
      total: 3,
    });
  });

  it('fails closed when the stages role is missing or too narrow', () => {
    const adapter = createBoardStateAdapter('stages');

    const missing = adapter.adapt({ dataset: { fields: [], rows: [] }, fields: {} });
    expect(missing.ok).toBe(false);
    expect(missing.ok === false ? missing.diagnostics[0]?.code : undefined).toBe(
      'HOST_DATASET_BINDING_INVALID',
    );

    const oneColumn = adapter.adapt({
      dataset: { fields: [nameField], rows: [{ name: '下料' }] },
      fields: { stages: [nameField] },
    });
    expect(oneColumn.ok).toBe(false);
  });
});
