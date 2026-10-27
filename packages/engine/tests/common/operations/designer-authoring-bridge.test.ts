import type { ScreenDocument } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildScreenAuthoringEditorContext,
  parseScreenComponentTextSource,
  validateScreenAuthoringCommitGuards,
} from '../../../src/common/operations/designer-authoring-bridge.js';

const document: ScreenDocument = {
  canvas: { width: 100, height: 100, backgroundColor: '#000000' },
  components: [
    {
      id: 'chart-1',
      type: 'base.chart',
      name: '图表',
      parentId: null,
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      rotation: 0,
      zIndex: 0,
      status: { locked: false, hidden: false },
      props: { title: { text: '标题' } },
      style: {},
      dataSource: null,
    },
  ],
  variables: [],
  blueprint: { relations: [] },
};

describe('AE-ED-C07 authoring commit guards', () => {
  it('accepts a current request with a matching revision and existing component', () => {
    const result = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: 'rev-2',
      currentRevision: 'rev-2',
      componentId: 'chart-1',
      componentExists: true,
      disposed: false,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects stale revisions fail closed', () => {
    const result = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: 'rev-1',
      currentRevision: 'rev-2',
      componentId: 'chart-1',
      componentExists: true,
      disposed: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('AUTHORING_STALE_REVISION');
  });

  it('rejects removed components and disposed designers', () => {
    const missing = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: null,
      currentRevision: null,
      componentId: 'gone',
      componentExists: false,
      disposed: false,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.diagnostics[0]?.code).toBe('AUTHORING_COMPONENT_MISSING');

    const disposed = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: null,
      currentRevision: null,
      componentId: 'chart-1',
      componentExists: true,
      disposed: true,
    });
    expect(disposed.ok).toBe(false);
    if (!disposed.ok) expect(disposed.diagnostics[0]?.code).toBe('AUTHORING_EXPIRED');
  });

  it('treats absent revisions as equivalent when both are null', () => {
    const result = validateScreenAuthoringCommitGuards({
      requestId: 'authoring-1',
      expectedRevision: null,
      currentRevision: null,
      componentId: 'chart-1',
      componentExists: true,
      disposed: false,
    });
    expect(result.ok).toBe(true);
  });
});

describe('AE-ED-C07 detached editor context', () => {
  it('builds a detached JSON context with component snapshot, manifest and blueprint', () => {
    const context = buildScreenAuthoringEditorContext({
      instanceId: 'designer-1',
      requestId: 'authoring-9',
      document,
      documentRevision: 'rev-2',
      focusedComponentId: 'chart-1',
      manifest: { name: '图表' } as never,
    });
    expect(context.instanceId).toBe('designer-1');
    expect(context.requestId).toBe('authoring-9');
    expect(context.componentId).toBe('chart-1');
    expect(context.componentSnapshot).not.toBeNull();
    expect(context.blueprint).toEqual({ relations: [] });
    expect(context.limits.maxJsonDepth).toBeGreaterThan(0);
    expect(JSON.stringify(context)).not.toContain('function');
  });
});

describe('AE-ED-C08 component text source limits', () => {
  it('parses valid JSON sources within limits', () => {
    const result = parseScreenComponentTextSource('{"title":{"text":"新标题"}}', 256 * 1024);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ title: { text: '新标题' } });
    }
  });

  it('rejects invalid JSON, oversized bytes and excessive depth', () => {
    const invalid = parseScreenComponentTextSource('{nope', 256 * 1024);
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.diagnostics[0]?.code).toBe('AUTHORING_SOURCE_INVALID');

    const oversized = parseScreenComponentTextSource(
      '{"x":"' + 'a'.repeat(400 * 1024) + '"}',
      256 * 1024,
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.diagnostics[0]?.code).toBe('AUTHORING_LIMIT_EXCEEDED');

    const deep = { level: {} };
    let current: Record<string, unknown> = deep;
    for (let index = 0; index < 40; index++) {
      current.level = { level: {} };
      current = current.level as Record<string, unknown>;
    }
    const result = parseScreenComponentTextSource(JSON.stringify(deep), 256 * 1024);
    expect(result.ok).toBe(false);
  });
});
