import { describe, expect, it } from 'vitest';
import type { BaseScreenPluginContribution } from '../src/contracts.js';
import {
  CONTRIBUTION_KIND_DESCRIPTORS,
  contributionHandlerField,
  contributionKindDescriptor,
  declaredContributionIds,
  listContributionHandlerKinds,
} from '../src/contribution-kind.js';

/**
 * 贡献词汇唯一来源的守卫。
 *
 * `CONTRIBUTION_KIND_DESCRIPTORS` 是每种 kind 的唯一实现落点；此处把 kind 清单显式钉住，
 * 使新增一种贡献类型必须**有意识地**同时更新描述表与本文件。漏了描述符会在运行期表现为
 * 校验/投影各行其是，这里让它在测试期失败。
 */
const EXPECTED_KINDS = [
  'material',
  'command',
  'dataResourceType',
  'blueprintAction',
  'dataProcessor',
  'blueprintCapability',
  'panel',
  'inspectorControl',
] as const;

function contribution(value: Record<string, unknown>): BaseScreenPluginContribution {
  return value as unknown as BaseScreenPluginContribution;
}

describe('plugin contribution kind vocabulary', () => {
  it('declares exactly one descriptor for every contribution kind', () => {
    const kinds = CONTRIBUTION_KIND_DESCRIPTORS.map((descriptor) => descriptor.kind);

    expect([...kinds].sort()).toEqual([...EXPECTED_KINDS].sort());
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('keeps every descriptor resolvable by its own kind', () => {
    for (const descriptor of CONTRIBUTION_KIND_DESCRIPTORS) {
      expect(contributionKindDescriptor(descriptor.kind)).toBe(descriptor);
    }
    expect(contributionKindDescriptor('not-a-kind')).toBeUndefined();
  });

  it('uses a unique identity prefix and names the kind itself, except material', () => {
    const prefixes = CONTRIBUTION_KIND_DESCRIPTORS.map((descriptor) => descriptor.identityPrefix);

    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const descriptor of CONTRIBUTION_KIND_DESCRIPTORS) {
      if (descriptor.kind === 'material') {
        // 物料的身份是规范物料类型，没有 `id` 字段。
        expect(descriptor.identityPrefix).toBe('material');
        expect(descriptor.identityField).toBe('type');
      } else {
        expect(descriptor.identityPrefix).toBe(descriptor.kind);
        expect(descriptor.identityField).toBe('id');
      }
    }
  });

  it('declares the identity field as a required field of the contribution', () => {
    for (const descriptor of CONTRIBUTION_KIND_DESCRIPTORS) {
      expect(descriptor.requiredFields).toContain('kind');
      expect(descriptor.requiredFields).toContain(descriptor.identityField);
    }
  });

  it('assigns each runtime handler record field to at most one kind', () => {
    const fields = CONTRIBUTION_KIND_DESCRIPTORS.map(
      (descriptor) => descriptor.handlerField,
    ).filter((field) => field !== undefined);

    expect(new Set(fields).size).toBe(fields.length);
  });

  it('agrees with the public handler-field accessors', () => {
    const expected = CONTRIBUTION_KIND_DESCRIPTORS.filter(
      (descriptor) => descriptor.handlerField !== undefined,
    ).map((descriptor) => descriptor.kind);

    expect([...listContributionHandlerKinds()]).toEqual(expected);
    for (const descriptor of CONTRIBUTION_KIND_DESCRIPTORS) {
      expect(contributionHandlerField(descriptor.kind)).toBe(descriptor.handlerField);
    }
  });

  it('expands declared ids through the identity field, keeping declaration order', () => {
    const contributions = [
      contribution({ kind: 'command', id: 'second', name: 'Second', requiredCapability: 'a' }),
      contribution({ kind: 'material', type: 'acme.widget', tagName: 'acme-widget' }),
      contribution({ kind: 'command', id: 'first', name: 'First', requiredCapability: 'a' }),
    ];

    expect(declaredContributionIds('command', contributions)).toEqual(['second', 'first']);
    expect(declaredContributionIds('material', contributions)).toEqual(['acme.widget']);
    expect(declaredContributionIds('panel', contributions)).toEqual([]);
  });
});
