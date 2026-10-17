import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostMaterialSkill } from '../../skills/create-base-screen-host-material-skill/scripts/create-host-material-skill.mjs';
import { createHostSkill } from '../../skills/create-base-screen-host-skill/scripts/create-host-screen-skill.mjs';
import { canonicalizeSnapshot } from '../../skills/manage-base-screen-host-skills/scripts/snapshot-file.mjs';
import { createSnapshotMaterialProvider } from '../../tooling/material-mcp-server/provider.mjs';
import { makeSnapshot, writeSnapshotFile } from './host-snapshot-fixture';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function template(content = 'export const value = 1;'): Array<Record<string, unknown>> {
  return [
    {
      id: 'kpi-card',
      name: 'KPI Card',
      framework: 'native',
      description: 'Approved KPI material scaffold.',
      files: [{ path: 'src/materials/kpi-card.ts', content }],
    },
  ];
}

async function snapshotWithTemplate() {
  const result = await writeSnapshotFile({ materialTemplates: template() });
  await writeFile(result.file, canonicalizeSnapshot(result.snapshot).text);
  temporaryRoots.push(dirname(result.file));
  return result;
}

describe('host material MCP contract', () => {
  it('keeps old snapshots valid and canonicalizes guarded templates deterministically', async () => {
    const old = canonicalizeSnapshot(await makeSnapshot());
    expect(old.catalogDigest).toMatch(/^[a-f0-9]{64}$/u);
    const { snapshot } = await snapshotWithTemplate();
    const first = canonicalizeSnapshot(snapshot);
    const second = canonicalizeSnapshot({
      ...snapshot,
      materialTemplates: [...template()].reverse(),
    });
    expect(first.catalogDigest).toBe(second.catalogDigest);
    expect(first.canonical.materialTemplates).toHaveLength(1);
  });

  it('records the same snapshot and material catalog digests in both generated Skills', async () => {
    const { snapshot, file } = await snapshotWithTemplate();
    const canonical = canonicalizeSnapshot(snapshot);
    await writeFile(file, canonical.text);
    const [screen, material] = await Promise.all([
      createHostSkill({ snapshotFile: file, checkOnly: true }),
      createHostMaterialSkill({ snapshotFile: file, checkOnly: true }),
    ]);
    const screenManifest = JSON.parse(screen.files.get('generation-manifest.json') ?? '{}');
    const materialManifest = JSON.parse(material.files.get('generation-manifest.json') ?? '{}');
    expect(screenManifest.snapshotDigest).toBe(materialManifest.snapshotDigest);
    expect(screenManifest.catalogDigest).toBe(materialManifest.catalogDigest);
    expect(screenManifest.catalogDigest).toBe(canonical.catalogDigest);
  });

  it.each([
    ['outside path', [{ ...template()[0], files: [{ path: '../outside.ts', content: 'x' }] }]],
    ['credential', template('const token = "secret";')],
    ['remote module', template('import value from "https://example.invalid/x.js";')],
    ['executable marker', template('<script>alert(1)</script>')],
    [
      'lifecycle script',
      [{ ...template()[0], files: [{ path: 'src/materials/postinstall.js', content: 'x' }] }],
    ],
  ])('rejects unsafe material templates: %s', async (_name, materialTemplates) => {
    const snapshot = await makeSnapshot();
    expect(() => canonicalizeSnapshot({ ...snapshot, materialTemplates })).toThrow();
  });

  it('searches, reads, and validates through the read-only provider', async () => {
    const { file } = await snapshotWithTemplate();
    const provider = await createSnapshotMaterialProvider(file);
    const search = provider.searchMaterials({ query: 'chart', limit: 20 });
    expect(search.data.map((item: { type: string }) => item.type)).toEqual(['acme.chart']);
    expect(provider.getMaterial('acme.chart').ok).toBe(true);
    expect(provider.getMaterial('missing').diagnostics[0].code).toBe('MATERIAL_NOT_FOUND');
    expect(provider.getMaterial('missing').value).toMatchObject({
      hostId: 'acme',
      catalogDigest: provider.catalogDigest,
      data: { valid: false },
    });
    expect(provider.getTemplate('kpi-card').ok).toBe(true);
    expect(
      provider.validateMaterialConfig({
        type: 'acme.text',
        props: {},
        style: { color: '#fff' },
        events: ['unknown'],
      }).value.data.valid,
    ).toBe(false);
    expect(
      provider.validateMaterialCandidate({
        manifest: provider.getMaterial('acme.text').value.data,
        sourcePath: 'src/materials/text.ts',
        testPath: 'tests/materials/text.test.ts',
      }).value.data.valid,
    ).toBe(false);
  });

  it('serves resources and five strict tools over official-SDK stdio', async () => {
    const { snapshot, file } = await snapshotWithTemplate();
    const canonical = canonicalizeSnapshot(snapshot);
    await writeFile(file, canonical.text);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve('tooling/material-mcp-server/server.mjs'), '--snapshot', file],
      cwd: resolve('.'),
      stderr: 'pipe',
    });
    const client = new Client({ name: 'base-screen-mcp-test', version: '0.0.0' });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        'get_material',
        'get_material_template',
        'search_materials',
        'validate_material_candidate',
        'validate_material_config',
      ]);
      const resources = await client.listResources();
      expect(resources.resources.map((item) => item.uri).sort()).toEqual([
        'base-screen://material-authoring/context',
        'base-screen://materials/catalog',
      ]);
      const templates = await client.listResourceTemplates();
      expect(templates.resourceTemplates.map((item) => item.uriTemplate).sort()).toEqual([
        'base-screen://material-templates/{templateId}',
        'base-screen://materials/{type}',
      ]);
      const catalog = await client.readResource({ uri: 'base-screen://materials/catalog' });
      expect(catalog.contents[0]).toMatchObject({ mimeType: 'application/json' });
      const material = await client.readResource({ uri: 'base-screen://materials/acme.text' });
      expect(JSON.stringify(material.contents)).toContain('acme.text');
      const templateResource = await client.readResource({
        uri: 'base-screen://material-templates/kpi-card',
      });
      expect(JSON.stringify(templateResource.contents)).toContain('kpi-card');
      await expect(client.readResource({ uri: 'base-screen://materials/missing' })).rejects.toThrow(
        'MATERIAL_NOT_FOUND',
      );
      const search = await client.callTool({
        name: 'search_materials',
        arguments: { query: 'text' },
      });
      expect(search.isError).not.toBe(true);
      await expect(
        client.callTool({ name: 'get_material', arguments: { type: 'acme.text' } }),
      ).resolves.not.toMatchObject({ isError: true });
      await expect(
        client.callTool({
          name: 'get_material_template',
          arguments: { templateId: 'kpi-card' },
        }),
      ).resolves.not.toMatchObject({ isError: true });
      await expect(
        client.callTool({
          name: 'validate_material_config',
          arguments: { type: 'acme.text', props: {}, style: { color: '#fff' } },
        }),
      ).resolves.not.toMatchObject({ isError: true });
      const manifestEnvelope = JSON.parse((material.contents[0] as { text: string }).text) as {
        data: Record<string, unknown>;
      };
      await expect(
        client.callTool({
          name: 'validate_material_candidate',
          arguments: {
            manifest: { ...manifestEnvelope.data, type: 'acme.new', tagName: 'acme-new' },
            sourcePath: 'src/materials/new.ts',
            testPath: 'tests/materials/new.test.ts',
            templateId: 'kpi-card',
          },
        }),
      ).resolves.not.toMatchObject({ isError: true });
      await expect(
        client.callTool({ name: 'search_materials', arguments: { extra: true } }),
      ).resolves.toMatchObject({ isError: true });
      await expect(
        client.callTool({ name: 'search_materials', arguments: { limit: 51 } }),
      ).resolves.toMatchObject({ isError: true });
    } finally {
      await client.close();
    }
  });

  it('never executes template content or mutates the snapshot', async () => {
    const { file } = await snapshotWithTemplate();
    const before = await readFile(file, 'utf8');
    const provider = await createSnapshotMaterialProvider(file);
    provider.getTemplate('kpi-card');
    expect(await readFile(file, 'utf8')).toBe(before);
  });
});
