import { SCREEN_BLUEPRINT_CAPABILITY_IDS } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { PLUGIN_CAPABILITY_DESCRIPTORS } from '../src/resolver.js';

// 能力词汇唯一来源的守卫：resolver 的描述表由 contracts 派生，此处断言两者恒等，
// 使未来任一侧单独改动都会在测试期失败，而不是在运行期静默授权不到。
describe('plugin capability vocabulary', () => {
  it('derives the blueprint capabilities from the contracts vocabulary', () => {
    const blueprintIds = PLUGIN_CAPABILITY_DESCRIPTORS.filter(
      (descriptor) => descriptor.blueprint === true,
    ).map((descriptor) => descriptor.id);

    expect(blueprintIds).toEqual([...SCREEN_BLUEPRINT_CAPABILITY_IDS]);
  });

  it('keeps the port capabilities alongside the blueprint capabilities', () => {
    const byId = new Map(PLUGIN_CAPABILITY_DESCRIPTORS.map((item) => [item.id, item]));

    expect(byId.get('command.execute')?.port).toBe('command');
    expect(byId.get('design.read')?.port).toBe('design');
  });

  it('declares every capability id at most once', () => {
    const ids = PLUGIN_CAPABILITY_DESCRIPTORS.map((descriptor) => descriptor.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
