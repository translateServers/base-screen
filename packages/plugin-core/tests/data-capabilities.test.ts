import type { ScreenValueRef } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { type BaseScreenDataCapability, screenValueRefAccepted } from '../src/index.js';

const INLINE: ScreenValueRef = { kind: 'inline', value: 1 };
const VARIABLE: ScreenValueRef = { kind: 'variable', variableId: 'region' };
const FIELD: ScreenValueRef = { kind: 'data-source-field', dataSourceId: 'ds', path: [] };

function accepts(
  capabilities: readonly BaseScreenDataCapability[],
  ref: ScreenValueRef,
  kind: 'dataset' | 'host-resource' | 'host-catalog' | 'url-query',
): boolean {
  const source =
    kind === 'dataset'
      ? ({ kind, datasetId: 'orders' } as const)
      : kind === 'host-resource'
        ? ({ kind, resourceType: 'dataset', resourceId: 'orders' } as const)
        : ({ kind, sourceId: 'tenant' } as const);
  return screenValueRefAccepted(capabilities, ref, source);
}

describe('data capability mapping', () => {
  it('maps inline to static and variable to variable', () => {
    expect(accepts(['static'], INLINE, 'dataset')).toBe(true);
    expect(accepts(['dataset'], INLINE, 'dataset')).toBe(false);
    expect(accepts(['variable'], VARIABLE, 'dataset')).toBe(true);
    expect(accepts(['static'], VARIABLE, 'dataset')).toBe(false);
  });

  it('maps a data-source-field by its source kind', () => {
    expect(accepts(['dataset'], FIELD, 'dataset')).toBe(true);
    expect(accepts(['host-resource'], FIELD, 'dataset')).toBe(false);
    expect(accepts(['host-resource'], FIELD, 'host-resource')).toBe(true);
    expect(accepts(['dataset'], FIELD, 'host-resource')).toBe(false);
  });

  it('treats catalog sources like variable sources (旧模型里它们就是变量来源)', () => {
    expect(accepts(['variable'], FIELD, 'host-catalog')).toBe(true);
    expect(accepts(['variable'], FIELD, 'url-query')).toBe(true);
    expect(accepts(['dataset', 'host-resource'], FIELD, 'host-catalog')).toBe(false);
  });

  it('rejects a data-source-field without a source', () => {
    expect(screenValueRefAccepted(['dataset', 'host-resource', 'variable'], FIELD, undefined)).toBe(
      false,
    );
  });
});
