import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONLINE_MATERIAL_TYPE_PREFIX as BACKEND_PREFIX } from '../../examples/shared-backend/src/material-packages/material-package.types';
import {
  createOnlineMaterialDraft,
  createOnlineMaterialType,
  ONLINE_MATERIAL_TYPE_PREFIX,
  readOnlineMaterialCodeMeta,
  renameOnlineMaterialManifest,
} from '../../examples/vanilla-host/src/screen/online-materials';
import type { ScreenParseResult } from '../../packages/contracts/src/index';
import type { BaseScreenMaterialCatalogEntry } from '../../packages/plugin-core/src/index';
import { parseBaseScreenMaterialManifest } from '../../packages/plugin-core/src/index.js';
import type { BaseScreenRuntime } from '../../packages/sdk/src/runtime';

const fetchPackages = vi.fn();

const INPUT = {
  name: '在线 KPI 测试',
  value: '42',
  note: 'build-1',
  background: '#0f2438',
  accent: '#38bdf8',
  width: 320,
  height: 160,
};

function materialPackage(buildToken = 'build1') {
  const draft = createOnlineMaterialDraft(INPUT, {
    type: 'host.online.runtime-test',
    tagName: `host-online-runtime-test-${buildToken}`,
    buildToken,
  });
  return {
    id: 'runtime-test',
    type: draft.type,
    name: INPUT.name,
    code: draft.code,
    manifest: draft.manifest as unknown as Record<string, unknown>,
    revision: 1,
    createdAt: '',
    updatedAt: '',
  };
}

function installRuntime() {
  const registrations = new Map<string, CustomElementConstructor>();
  vi.stubGlobal('HTMLElement', class {});
  vi.stubGlobal('window', { __HOST_APP_CONFIG__: { apiBaseUrl: '/api' } });
  vi.stubGlobal('customElements', {
    get: (tagName: string) => registrations.get(tagName),
    define: (tagName: string, constructor: CustomElementConstructor) => {
      registrations.set(tagName, constructor);
    },
  });
  fetchPackages.mockResolvedValue({ ok: true, json: async () => ({ packages: [] }) });
  vi.stubGlobal('fetch', fetchPackages);
  let moduleSequence = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    moduleSequence += 1;
    return `data:text/javascript,${encodeURIComponent(
      `export default class extends HTMLElement { static tabularDataAdapter = { adapt() {} }; static token = ${moduleSequence}; }`,
    )}`;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
}

async function loadRuntime() {
  const { loadHostRuntime } = await import('../../examples/vanilla-host/src/screen/host-runtime');
  const runtime = await loadHostRuntime();
  runtimes.push(runtime);
  return runtime;
}

const runtimes: BaseScreenRuntime[] = [];

const REFRESH_FAILURE = {
  ok: false as const,
  diagnostics: [
    {
      severity: 'error' as const,
      code: 'PLUGIN_CORE_LIFECYCLE_INVALID' as const,
      path: [],
      message: '模拟刷新失败',
    },
  ],
};

const HOSTS = ['vanilla-host', 'react-host', 'vue-host'] as const;
const SHARED_FILES = [
  'src/screen/online-materials.ts',
  'src/styles/online-materials.css',
  'src/types.ts',
  'src/lib/api.ts',
] as const;

describe('standard host runtime online material integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    installRuntime();
  });

  afterEach(async () => {
    for (const runtime of runtimes.splice(0)) await runtime.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shares one standard runtime and keeps catalog and disposal getters live', async () => {
    const { loadHostRuntime } = await import('../../examples/vanilla-host/src/screen/host-runtime');
    const pending = loadHostRuntime();
    expect(loadHostRuntime()).toBe(pending);
    const runtime = await pending;
    runtimes.push(runtime);
    expect(runtime.manager.status).toBe('active');
    expect(runtime.mountDesigner).toBeTypeOf('function');
    expect(runtime.runtimeContributions.getResourceType('host_image')).toBeDefined();
    for (const type of ['base.text', 'base.chart', 'base.table', 'host-app.metric-value']) {
      expect(runtime.catalog.get(type)?.tabularDataAdapter).toBeDefined();
    }
    const pkg = materialPackage();
    expect((await runtime.applyOnlineMaterialPackage(pkg, 'code')).ok).toBe(true);
    expect(runtime.catalog).not.toBe(runtime.manager.snapshot?.materials);
    expect(runtime.catalog.get(pkg.type)).toBeDefined();
    await runtime.dispose();
    expect(runtime.disposed).toBe(true);
    expect((await runtime.applyOnlineMaterialPackage(pkg, 'manifest')).ok).toBe(false);
  });

  it('loads published online packages at startup and isolates bad manifests and builtin conflicts', async () => {
    const pkg = materialPackage();
    fetchPackages.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        packages: [
          pkg,
          { ...pkg, name: '坏包', manifest: {} },
          {
            ...pkg,
            name: '冲突包',
            type: 'base.text',
            manifest: { ...pkg.manifest, type: 'base.text' },
          },
        ],
      }),
    });
    const runtime = await loadRuntime();
    expect(runtime.catalog.get(pkg.type)?.manifest.tagName).toBe(pkg.manifest.tagName);
    expect(runtime.catalog.get('base.text')?.manifest.tagName).toBe('base-screen-text');
    expect(runtime.onlineMaterialErrors).toHaveLength(2);
    expect(runtime.onlineMaterialErrors.join(',')).toContain('坏包');
    expect(runtime.onlineMaterialErrors.join(',')).toContain('冲突包');
  });

  it('keeps manifest-only constructor and adapter identity and hot-swaps code at stable type', async () => {
    const pkg = materialPackage();
    const runtime = await loadRuntime();
    expect((await runtime.applyOnlineMaterialPackage(pkg, 'code')).ok).toBe(true);
    const entry = runtime.catalog.get(pkg.type)!;
    const adapter = entry.tabularDataAdapter;
    const renamed = { ...pkg, manifest: { ...pkg.manifest, name: '更新名称' } };
    expect((await runtime.applyOnlineMaterialPackage(renamed, 'manifest')).ok).toBe(true);
    const updated = runtime.catalog.get(pkg.type);
    expect(updated?.constructor).toBe(entry.constructor);
    expect(updated?.tabularDataAdapter).toBe(adapter);
    expect(updated?.manifest.name).toBe('更新名称');
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    const rebuilt = materialPackage('build2');
    expect((await runtime.applyOnlineMaterialPackage(rebuilt, 'code')).ok).toBe(true);
    const replaced = runtime.catalog.get(pkg.type);
    expect(replaced?.constructor).not.toBe(entry.constructor);
    expect(replaced?.manifest.tagName).toBe(rebuilt.manifest.tagName);
    expect(runtime.catalog.list().filter((item) => item.manifest.type === pkg.type)).toHaveLength(
      1,
    );
  });

  it('fails closed on builtin type conflicts and manifest identity changes', async () => {
    const runtime = await loadRuntime();
    const pkg = materialPackage();
    const conflict = {
      ...pkg,
      type: 'base.text',
      manifest: { ...pkg.manifest, type: 'base.text' },
    };
    expect((await runtime.applyOnlineMaterialPackage(conflict, 'code')).ok).toBe(false);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await runtime.applyOnlineMaterialPackage(pkg, 'code');
    const catalog = runtime.catalog;
    expect(
      (await runtime.applyOnlineMaterialPackage(materialPackage('build2'), 'manifest')).ok,
    ).toBe(false);
    expect(runtime.catalog).toBe(catalog);
  });

  it('rolls back failed manifest, code and removal changes before the next successful update', async () => {
    const runtime = await loadRuntime();
    const element = {
      append: vi.fn(),
      remove: vi.fn(),
      unload: vi.fn(),
      catalog: runtime.catalog,
      configure: vi.fn((options: { catalog: BaseScreenRuntime['catalog'] }) => {
        element.catalog = options.catalog;
        return { ok: true as const, value: null, diagnostics: [] };
      }),
      refreshCatalog: vi.fn((catalog: BaseScreenRuntime['catalog']): ScreenParseResult<null> => {
        element.catalog = catalog;
        return { ok: true as const, value: null, diagnostics: [] };
      }),
    };
    const mounted = await runtime.mountDesigner({ append: vi.fn() } as unknown as Element, {
      element: element as unknown as NonNullable<Parameters<BaseScreenRuntime['bindDesigner']>[0]>,
    });
    expect(mounted.ok).toBe(true);
    const pkg = materialPackage();
    await runtime.applyOnlineMaterialPackage(pkg, 'code');
    const catalog = runtime.catalog;
    const entry = catalog.get(pkg.type);
    const descriptor = Object.getOwnPropertyDescriptor(entry!.constructor, 'manifest');
    element.refreshCatalog.mockReturnValueOnce(REFRESH_FAILURE);
    expect(
      (
        await runtime.applyOnlineMaterialPackage(
          { ...pkg, manifest: { ...pkg.manifest, name: '应当回滚' } },
          'manifest',
        )
      ).ok,
    ).toBe(false);
    expect(runtime.catalog).toBe(catalog);
    expect(Object.getOwnPropertyDescriptor(entry!.constructor, 'manifest')).toEqual(descriptor);
    element.refreshCatalog.mockReturnValueOnce(REFRESH_FAILURE);
    expect((await runtime.applyOnlineMaterialPackage(materialPackage('build2'), 'code')).ok).toBe(
      false,
    );
    expect(runtime.catalog).toBe(catalog);
    element.refreshCatalog.mockReturnValueOnce(REFRESH_FAILURE);
    expect((await runtime.removeOnlineMaterialPackage(pkg.type)).ok).toBe(false);
    expect(runtime.catalog).toBe(catalog);
    expect((await runtime.removeOnlineMaterialPackage(pkg.type)).ok).toBe(true);
    expect(runtime.catalog.get(pkg.type)).toBeUndefined();
  });

  it('keeps official and host materials available when online package fetching fails', async () => {
    fetchPackages.mockRejectedValueOnce(new Error('读取失败'));
    const runtime = await loadRuntime();
    expect(runtime.manager.status).toBe('active');
    expect(runtime.onlineMaterialErrors).toHaveLength(1);
    expect(runtime.catalog.has('base.text')).toBe(true);
    expect(runtime.catalog.has('host-app.metric-value')).toBe(true);
    expect(fetchPackages).toHaveBeenCalledOnce();
  });
});

describe('online material package contract (ADR-0090)', () => {
  it('uses the host.online namespace on both sides', () => {
    expect(ONLINE_MATERIAL_TYPE_PREFIX).toBe('host.online.');
    expect(BACKEND_PREFIX).toBe(ONLINE_MATERIAL_TYPE_PREFIX);
    expect(createOnlineMaterialType(INPUT.name)).toMatch(
      /^host\.online\.[a-z0-9]+(?:-[a-z0-9]+)*-?[a-z0-9]+$/,
    );
  });

  it('builds a strict manifest with stable type and build-scoped tagName', () => {
    const draft = createOnlineMaterialDraft(INPUT, {
      type: 'host.online.kpi-test',
      tagName: 'host-online-kpi-test-build1',
      buildToken: 'build1',
    });
    expect(draft.type).toBe('host.online.kpi-test');
    expect(draft.tagName).toBe('host-online-kpi-test-build1');
    expect(draft.manifest).toMatchObject({
      type: 'host.online.kpi-test',
      tagName: 'host-online-kpi-test-build1',
      name: INPUT.name,
      category: '在线物料',
      defaultSize: { width: 320, height: 160 },
      defaultData: '42',
      defaultProps: {},
      dataCapabilities: ['static', 'variable'],
    });
    expect(draft.manifest.propertyPanel).toEqual([]);
    expect(draft.manifest.stylePanel).toEqual([
      { style: 'background', label: '背景色', control: 'color' },
      { style: 'accent', label: '强调色', control: 'color' },
      { style: 'opacity', label: '不透明度', control: 'number' },
    ]);
    const parsed = parseBaseScreenMaterialManifest(draft.manifest);
    expect(parsed.ok).toBe(true);
  });

  it('emits a default-exported ESM module without self-registering the tag', () => {
    const draft = createOnlineMaterialDraft(INPUT, {
      type: 'host.online.kpi-test',
      tagName: 'host-online-kpi-test-build1',
      buildToken: 'build1',
    });
    expect(draft.code).toContain('export default OnlineMaterial;');
    expect(draft.code).toContain('const BUILD = "build1";');
    expect(draft.code).toContain('const NOTE = "build-1";');
    expect(draft.code).not.toContain('customElements.define');
    expect(readOnlineMaterialCodeMeta(draft.code)).toEqual({
      buildToken: 'build1',
      note: 'build-1',
    });
  });

  it('keeps identity on manifest-only updates and allows downlisting', () => {
    const draft = createOnlineMaterialDraft(INPUT, {
      type: 'host.online.kpi-test',
      tagName: 'host-online-kpi-test-build1',
      buildToken: 'build1',
      libraryVisible: false,
    });
    expect(draft.manifest.libraryVisible).toBe(false);
    const renamed = renameOnlineMaterialManifest(draft.manifest, '在线 KPI 重命名');
    expect(renamed).toMatchObject({
      type: draft.type,
      tagName: draft.tagName,
      name: '在线 KPI 重命名',
      libraryVisible: false,
    });
    expect(
      createOnlineMaterialDraft(INPUT, {
        type: draft.type,
        tagName: 'host-online-kpi-test-build2',
        buildToken: 'build2',
      }).tagName,
    ).not.toBe(draft.tagName);
  });

  it('keeps the shared online material implementation byte-identical across hosts', () => {
    for (const file of SHARED_FILES) {
      const baseline = readFileSync(`examples/vanilla-host/${file}`, 'utf8');
      for (const host of HOSTS.slice(1)) {
        expect(
          readFileSync(`examples/${host}/${file}`, 'utf8'),
          `${host}/${file} 必须与 vanilla 逐字一致`,
        ).toBe(baseline);
      }
    }
  });
});
