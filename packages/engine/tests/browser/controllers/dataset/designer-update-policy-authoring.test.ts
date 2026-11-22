import type { ScreenDataSource, ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import { createDatasetAuthoringView } from '../../../../src/browser/controllers/dataset/designer-dataset-controller-context.js';
import {
  authoringToUpdatePolicy,
  authoringUpdatePolicyForNewInstance,
  createUpdatePolicyTransaction,
  readUpdatePolicyTarget,
  reconcileAuthoringWithPolicy,
  sameUpdatePolicy,
} from '../../../../src/browser/controllers/dataset/designer-update-policy-authoring.js';

const instance: ScreenDataSource = {
  id: 'live',
  name: 'live',
  source: { kind: 'host-resource', resourceType: 'demo_series', resourceId: 'output' },
  params: {},
};

function documentWith(dataSources: readonly ScreenDataSource[], dataValue = true): ScreenDocument {
  return {
    canvas: { width: 100, height: 100, backgroundColor: '#000000' },
    components: [
      {
        id: 'c1',
        type: 'base.text',
        name: 'c1',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 10, height: 10 },
        rotation: 0,
        zIndex: 0,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: dataValue
          ? null
          : { type: 'host-resource', resourceType: 'demo_series', resourceId: 'output' },
        ...(dataValue
          ? { dataValue: { kind: 'data-source-field' as const, dataSourceId: 'live', path: [] } }
          : {}),
      },
    ],
    variables: [],
    blueprint: { relations: [] },
    dataSources,
  } as ScreenDocument;
}

describe('authoringToUpdatePolicy', () => {
  it('maps once / manual / auto', () => {
    const base = createDatasetAuthoringView();
    expect(authoringToUpdatePolicy({ ...base, refreshStrategy: 'once' }, undefined, undefined)).toEqual({
      mode: 'once',
    });
    expect(authoringToUpdatePolicy(base, undefined, undefined)).toEqual({ mode: 'manual' });
    expect(
      authoringToUpdatePolicy({ ...base, refreshStrategy: 'auto', refreshInterval: 12 }, undefined, undefined),
    ).toEqual({ mode: 'auto', intervalSeconds: 12 });
  });

  it('maps push: 0 fallback means none; retain rows only for append sources; keeps time window', () => {
    const view = {
      ...createDatasetAuthoringView(),
      refreshStrategy: 'push' as const,
      pushFallbackInterval: 0,
      pushRetainRows: 24,
    };
    const previous = { mode: 'push' as const, retain: { seconds: 60, timeField: 't' } };
    expect(authoringToUpdatePolicy(view, previous, { append: true })).toEqual({
      mode: 'push',
      retain: { seconds: 60, timeField: 't', rows: 24 },
    });
    expect(authoringToUpdatePolicy(view, previous, { append: false })).toEqual({
      mode: 'push',
      retain: { seconds: 60, timeField: 't' },
    });
    expect(
      authoringToUpdatePolicy({ ...view, pushFallbackInterval: 15 }, undefined, undefined),
    ).toEqual({ mode: 'push', fallbackIntervalSeconds: 15 });
  });
});

describe('sameUpdatePolicy', () => {
  it('treats a missing policy as manual and ignores key order', () => {
    expect(sameUpdatePolicy(undefined, { mode: 'manual' })).toBe(true);
    expect(
      sameUpdatePolicy(
        { mode: 'push', retain: { rows: 3 }, fallbackIntervalSeconds: 5 },
        { fallbackIntervalSeconds: 5, mode: 'push', retain: { rows: 3 } },
      ),
    ).toBe(true);
    expect(sameUpdatePolicy({ mode: 'auto', intervalSeconds: 5 }, { mode: 'auto', intervalSeconds: 6 })).toBe(
      false,
    );
  });
});

describe('readUpdatePolicyTarget', () => {
  it('only document instances are writable', () => {
    expect(readUpdatePolicyTarget(documentWith([instance]), 'c1').kind).toBe('document');
    expect(
      readUpdatePolicyTarget(documentWith([{ ...instance, readOnly: true }]), 'c1').kind,
    ).toBe('read-only');
    // 旧形态内联数据源：派生实例不在 dataSources 里。
    expect(readUpdatePolicyTarget(documentWith([], false), 'c1').kind).toBe('inline');
    expect(readUpdatePolicyTarget(documentWith([instance]), 'missing').kind).toBe('inline');
  });
});

describe('createUpdatePolicyTransaction', () => {
  it('is a no-op when the policy is unchanged', () => {
    const result = createUpdatePolicyTransaction(documentWith([instance]), instance, { mode: 'manual' }, undefined);
    expect(result).toEqual({ ok: true, value: null, diagnostics: [] });
  });

  it('replaces only the target instance and omits manual', () => {
    const other: ScreenDataSource = { ...instance, id: 'other', updatePolicy: { mode: 'once' } };
    const document = documentWith([{ ...instance, updatePolicy: { mode: 'once' } }, other]);
    const result = createUpdatePolicyTransaction(
      document,
      document.dataSources![0]!,
      { mode: 'manual' },
      undefined,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) return;
    const command = result.value.commands[0];
    expect(command?.type).toBe('replace-data-sources');
    if (command?.type !== 'replace-data-sources') return;
    expect(command.dataSources[0]).not.toHaveProperty('updatePolicy');
    expect(command.dataSources[1]).toBe(other);
  });

  it('rejects switching to push when the source cannot push, but keeps existing push instances editable', () => {
    const rejected = createUpdatePolicyTransaction(documentWith([instance]), instance, { mode: 'push' }, undefined);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.diagnostics[0]?.code).toBe('DATA_SOURCE_UPDATE_POLICY_INVALID');
    const pushing = { ...instance, updatePolicy: { mode: 'push' as const } };
    const kept = createUpdatePolicyTransaction(
      documentWith([pushing]),
      pushing,
      { mode: 'push', fallbackIntervalSeconds: 5 },
      undefined,
    );
    expect(kept.ok && kept.value !== null).toBe(true);
  });
});

describe('reconcileAuthoringWithPolicy', () => {
  it('returns the same object when equivalent and only rewrites refresh fields otherwise', () => {
    const view = { ...createDatasetAuthoringView(), controlled: true, refreshInterval: 45 };
    expect(reconcileAuthoringWithPolicy(view, undefined, undefined)).toBe(view);
    const reseeded = reconcileAuthoringWithPolicy(
      view,
      { mode: 'push', fallbackIntervalSeconds: 9, retain: { rows: 7 } },
      { append: true },
    );
    expect(reseeded).toMatchObject({
      controlled: true,
      refreshStrategy: 'push',
      refreshInterval: 45,
      pushFallbackInterval: 9,
      pushRetainRows: 7,
    });
    const back = reconcileAuthoringWithPolicy(reseeded, { mode: 'auto', intervalSeconds: 3 }, undefined);
    expect(back).toMatchObject({ refreshStrategy: 'auto', refreshInterval: 3 });
    expect(back).not.toHaveProperty('pushFallbackInterval');
    expect(back).not.toHaveProperty('pushRetainRows');
  });
});

describe('authoringUpdatePolicyForNewInstance', () => {
  it('carries once / auto, skips manual and push (dataset sources cannot push)', () => {
    const base = createDatasetAuthoringView();
    expect(authoringUpdatePolicyForNewInstance(base)).toBeUndefined();
    expect(authoringUpdatePolicyForNewInstance({ ...base, refreshStrategy: 'push' })).toBeUndefined();
    expect(
      authoringUpdatePolicyForNewInstance({ ...base, refreshStrategy: 'auto', refreshInterval: 20 }),
    ).toEqual({ mode: 'auto', intervalSeconds: 20 });
  });
});
