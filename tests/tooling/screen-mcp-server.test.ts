import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { exportHostScreen } from '../../tooling/screen-mcp-server/export-host-screen.mjs';
import { createScreenProvider } from '../../tooling/screen-mcp-server/provider.mjs';

const FIXTURE = fileURLToPath(
  new URL('../../tooling/screen-mcp-server/fixture-screen.json', import.meta.url),
);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function component(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'note',
    type: 'base.text',
    name: 'Note',
    parentId: null,
    position: { x: 64, y: 160 },
    size: { width: 320, height: 48 },
    rotation: 0,
    zIndex: 2,
    status: { locked: false, hidden: false },
    props: { text: 'Note' },
    style: {},
    dataSource: null,
    ...overrides,
  };
}

describe('check_a11y', () => {
  it('reports failures with a suggested color that clears the threshold', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const result = provider.checkA11y({
      samples: [
        { componentId: 'note', textColor: '#5c6675', backgroundColor: '#0d1117', fontSizePx: 14 },
        { componentId: 'ok', textColor: '#e9eef5', backgroundColor: '#0d1117', fontSizePx: 14 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.value.checked).toBe(2);
    expect(result.value.failed).toBe(1);
    expect(result.value.issues[0]?.componentId).toBe('note');
    expect(result.value.issues[0]?.requiredRatio).toBe(4.5);
    expect(result.value.issues[0]?.ratio).toBeLessThan(4.5);
    expect(result.value.issues[0]?.suggestedColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('applies the 3:1 threshold to large text instead of 4.5:1', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const small = provider.checkA11y({
      samples: [{ textColor: '#5c6675', backgroundColor: '#0d1117', fontSizePx: 14 }],
    });
    const large = provider.checkA11y({
      samples: [{ textColor: '#5c6675', backgroundColor: '#0d1117', fontSizePx: 28 }],
    });
    expect(small.value.failed).toBe(1);
    expect(large.value.failed).toBe(0);
  });

  it('flags unparseable colors instead of guessing', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const result = provider.checkA11y({
      samples: [{ textColor: 'rgba(0,0,0,0.5)', backgroundColor: '#ffffff' }],
    });
    expect(result.value.issues[0]?.code).toBe('A11Y_COLOR_UNPARSEABLE');
  });
});

describe('estimate_perf and fit_resolution', () => {
  it('counts structural cost and compares it with a budget', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const result = provider.estimatePerf({});
    expect(result.ok).toBe(true);
    expect(result.value.metrics.components).toBe(1);
    expect(result.value.metrics.dataBindings).toBeGreaterThanOrEqual(0);
    expect(result.value.budget.ok === undefined).toBe(true);
    expect(Array.isArray(result.value.budget.violations)).toBe(true);
  });

  it('returns fit commands without touching the snapshot', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const before = provider.getScreen({ view: 'summary' }).value.data.canvas;
    const result = provider.fitResolution({ target: { width: 960, height: 540 } });
    expect(result.ok).toBe(true);
    expect(result.value.commands[0]).toEqual({
      type: 'update-canvas',
      patch: { width: 960, height: 540 },
    });
    const after = provider.getScreen({ view: 'summary' }).value.data.canvas;
    expect(after).toEqual(before);
    expect(result.value.commands.length).toBeGreaterThan(1);
  });
});

describe('diff_against_baseline', () => {
  it('reports field-level rows against a baseline snapshot', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const baseline = provider.getScreen({ view: 'full' }).value.data;
    const candidate = JSON.parse(JSON.stringify(baseline)) as typeof baseline;
    candidate.components[0]!.name = 'Renamed';
    const result = provider.diffAgainstBaseline({ baseline, document: candidate });
    expect(result.ok).toBe(true);
    expect(result.value.equal).toBe(false);
    expect(result.value.rows[0]?.componentId).toBe(baseline.components[0]!.id);
    expect(result.value.rows[0]?.entries[0]?.path).toBe('name');
  });

  it('reports equality for the same document', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const baseline = provider.getScreen({ view: 'full' }).value.data;
    const result = provider.diffAgainstBaseline({ baseline });
    expect(result.value.equal).toBe(true);
    expect(result.value.rows).toEqual([]);
  });
});

describe('screen MCP provider', () => {
  it('reads the snapshot as a derived summary or the canonical document', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const summary = provider.getScreen({ view: 'summary' });
    expect(summary.ok).toBe(true);
    expect(summary.value.data.counts).toEqual({
      components: 1,
      dataSources: 1,
      variables: 0,
      blueprintRelations: 0,
    });
    expect(summary.value.data.components[0]).toMatchObject({
      id: 'title',
      depth: 0,
      hasDataSource: false,
    });
    expect(summary.value.data.dataSources).toEqual([
      { id: 'orders', name: 'Orders', sourceKind: 'dataset', readOnly: false },
    ]);
    const full = provider.getScreen({ view: 'full' });
    expect(full.value.data.canvas).toMatchObject({ width: 1920, height: 1080 });
  });

  it('validates the snapshot and rejects an invalid draft with stable diagnostics', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const snapshot = provider.validateScreen();
    expect(snapshot.value).toMatchObject({ valid: true, diagnostics: [] });
    const draft = provider.validateScreen({
      document: {
        canvas: { width: 0, height: 1080, backgroundColor: '#000000' },
        components: [],
        variables: [],
        blueprint: { relations: [] },
      },
    });
    expect(draft.ok).toBe(false);
    expect(draft.value.valid).toBe(false);
    expect(draft.value.diagnostics.length).toBeGreaterThan(0);
    expect(draft.value.diagnostics[0]).toHaveProperty('code');
    expect(draft.value.diagnostics[0]).toHaveProperty('path');
  });

  it('applies a command batch to the snapshot without persisting it', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const applied = provider.applyScreenCommands({
      commands: [
        { type: 'update-canvas', patch: { width: 2560 } },
        { type: 'add-component', component: component() },
      ],
    });
    expect(applied.ok).toBe(true);
    expect(applied.value.applied).toBe(true);
    expect(applied.value.changedComponentIds).toEqual(expect.arrayContaining(['note']));
    expect(applied.value.document.canvas.width).toBe(2560);
    expect(provider.getScreen({ view: 'summary' }).value.data.canvas.width).toBe(1920);
    const exported = provider.exportScreen({ document: applied.value.document });
    expect(JSON.parse(exported.value.text).canvas.width).toBe(2560);
  });

  it('rejects an unknown command at its index', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const rejected = provider.applyScreenCommands({
      commands: [{ type: 'update-canvas', patch: { width: 2560 } }, { type: 'drop-canvas' }],
    });
    expect(rejected.ok).toBe(false);
    expect(rejected.value.applied).toBe(false);
    expect(rejected.value.failedCommandIndex).toBe(1);
    expect(rejected.value.diagnostics.length).toBeGreaterThan(0);
  });

  it('imports a legacy document through the one-way migration', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const imported = provider.importScreen({
      document: {
        canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
        components: [
          component({
            dataSource: {
              type: 'static',
              value: { rows: [] },
              binding: { fields: { rows: ['id'] } },
            },
          }),
        ],
        variables: [],
        blueprint: { relations: [] },
      },
    });
    expect(imported.ok).toBe(true);
    expect(imported.value.migrated).toBe(true);
    expect(imported.value.document.components[0].dataSource).toBeNull();
    expect(imported.value.document.components[0].dataValue).toEqual({
      kind: 'inline',
      value: { rows: [] },
    });
  });

  it('diffs a candidate against the snapshot by id and field', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const base = provider.getScreen({ view: 'full' }).value.data;
    const candidate = {
      ...base,
      canvas: { ...base.canvas, width: 2560 },
      components: [
        { ...base.components[0], position: { x: 0, y: 0 }, style: { color: '#ffffff' } },
        component(),
      ],
    };
    const diff = provider.diffScreens({ after: candidate });
    expect(diff.value.equal).toBe(false);
    expect(diff.value.changes.canvas.changedFields).toEqual(['width']);
    expect(diff.value.changes.components.added).toEqual(['note']);
    expect(diff.value.changes.components.changed).toEqual([
      { id: 'title', fields: ['position', 'style'] },
    ]);
    expect(provider.diffScreens({ after: base }).value.equal).toBe(true);
  });

  it('audits geometry, target fit and complexity from the snapshot', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const audit = provider.auditScreen({ target: { width: 1280, height: 720 } });
    expect(audit.value.valid).toBe(true);
    expect(audit.value.geometry.outsideCanvas).toEqual([]);
    expect(audit.value.fit.fitScale).toBe(0.67);
    expect(audit.value.fit.letterbox).toEqual({ x: 0, y: 0 });
    expect(audit.value.complexity).toMatchObject({
      components: 1,
      maxDepth: 0,
      materialTypes: { 'base.text': 1 },
    });
  });

  it('reports components whose rotated bounds exceed the canvas', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const audit = provider.auditScreen({
      document: {
        canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
        components: [component({ position: { x: 1900, y: 0 }, size: { width: 200, height: 100 } })],
        variables: [],
        blueprint: { relations: [] },
      },
    });
    expect(audit.value.geometry.outsideCanvas).toEqual([
      { id: 'note', overflow: { left: 0, top: 0, right: 180, bottom: 0 } },
    ]);
  });

  it('proposes a constrained layout from the designer alignment math', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const base = provider.getScreen({ view: 'full' }).value.data;
    const candidate = { ...base, components: [...base.components, component()] };
    const proposed = provider.proposeLayout({
      document: candidate,
      componentIds: ['title', 'note'],
      operation: 'align-right',
    });
    expect(proposed.value.proposed).toBe(true);
    expect(proposed.value.commands).toHaveLength(1);
    expect(
      proposed.value.document.components.find((item: { id: string }) => item.id === 'note').position
        .x,
    ).toBe(384);
    expect(proposed.value.geometry.outsideCanvas).toEqual([]);
    const again = provider.proposeLayout({
      document: proposed.value.document,
      componentIds: ['title', 'note'],
      operation: 'align-right',
    });
    expect(again.value).toMatchObject({ proposed: false, reason: 'no-change' });
  });

  it('rejects layout proposals for missing components or unknown operations', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const missing = provider.proposeLayout({
      componentIds: ['title', 'ghost'],
      operation: 'align-left',
    });
    expect(missing.ok).toBe(false);
    expect(missing.value).toMatchObject({
      proposed: false,
      reason: 'component-not-found',
      missing: ['ghost'],
    });
    const unknown = provider.proposeLayout({
      componentIds: ['title', 'note'],
      operation: 'align-diagonal',
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.value.reason).toContain('unsupported-operation');
  });

  it('flags components below a target pixel policy', async () => {
    const provider = await createScreenProvider(FIXTURE);
    const audit = provider.auditScreen({
      target: { width: 640, height: 360 },
      minComponentPx: 30,
    });
    expect(audit.value.fit.belowMinComponentPx).toEqual({
      count: 1,
      items: [{ id: 'title', effective: { width: 213.33, height: 24 } }],
    });
    expect(audit.value.fit.targetMegapixels).toBe(0.23);
    expect(audit.value.complexity.canvasMegapixels).toBe(2.07);
  });

  it('exports a host screen by name into a snapshot file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'screen-mcp-'));
    temporaryRoots.push(root);
    const out = join(root, 'screen.json');
    const document = JSON.parse(await readFile(FIXTURE, 'utf8'));
    const fetchImpl = async (url: string): Promise<Response> =>
      url.endsWith('/api/screens')
        ? jsonResponse({ screens: [{ id: 's1', name: 'Demo', revision: 3, updatedAt: '' }] })
        : jsonResponse({
            screen: { id: 's1', name: 'Demo', revision: 3, document },
          });
    const exported = await exportHostScreen({
      baseUrl: 'http://host.test',
      screen: 'Demo',
      out,
      fetchImpl,
    });
    expect(exported.screen).toEqual({ id: 's1', name: 'Demo', revision: 3 });
    expect(JSON.parse(await readFile(out, 'utf8')).canvas.width).toBe(1920);
  });

  it('refuses to start on a fail-closed invalid snapshot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'screen-mcp-'));
    temporaryRoots.push(root);
    const file = join(root, 'screen.json');
    await writeFile(
      file,
      JSON.stringify({
        canvas: { width: 0, height: 1080, backgroundColor: '#000000' },
        components: [],
        variables: [],
        blueprint: { relations: [] },
      }),
    );
    await expect(createScreenProvider(file)).rejects.toThrow(/invalid/u);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
