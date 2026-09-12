import { describe, expect, it } from 'vitest';
import {
  SCREEN_BLUEPRINT_CAPABILITIES,
  SCREEN_BLUEPRINT_CAPABILITY_IDS,
  SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY,
  SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY,
} from '../../src/document/blueprint-capabilities.js';

// 词汇唯一来源的内部一致性：语义键映射与单点常量都必须落在 id 列表内，
// 否则消费方（授权判定、规则归一化）会各自持有列表外的能力。
describe('blueprint capability vocabulary', () => {
  it('lists every blueprint capability id exactly once', () => {
    expect(new Set(SCREEN_BLUEPRINT_CAPABILITY_IDS).size).toBe(
      SCREEN_BLUEPRINT_CAPABILITY_IDS.length,
    );
  });

  it('keeps every named mapping inside the id list', () => {
    const ids = new Set<string>(SCREEN_BLUEPRINT_CAPABILITY_IDS);
    for (const value of Object.values(SCREEN_BLUEPRINT_CAPABILITIES)) {
      expect(ids.has(value)).toBe(true);
    }
  });

  it('keeps the single-point constants inside the id list', () => {
    const ids = new Set<string>(SCREEN_BLUEPRINT_CAPABILITY_IDS);
    expect(ids.has(SCREEN_BLUEPRINT_MATERIAL_EVENT_CAPABILITY)).toBe(true);
    expect(ids.has(SCREEN_BLUEPRINT_COMPONENT_VISIBILITY_CAPABILITY)).toBe(true);
  });

  it('maps every named key to a distinct capability', () => {
    const values = Object.values(SCREEN_BLUEPRINT_CAPABILITIES);
    expect(new Set(values).size).toBe(values.length);
  });
});
