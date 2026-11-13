import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SDK_RUNTIME = 'packages/sdk/src/runtime.ts';
const SDK_RUNTIME_MOUNTS = 'packages/sdk/src/runtime-mounts.ts';
const SDK_RUNTIME_LIFECYCLE = 'packages/sdk/src/runtime-lifecycle.ts';
const HOST_RUNTIMES = [
  'examples/vanilla-host/src/screen/host-runtime.ts',
  'examples/react-host/src/screen/host-runtime.ts',
  'examples/vue-host/src/screen/host-runtime.ts',
] as const;

interface CompositionHost {
  readonly host: string;
  /** 框架编辑页：只允许出现组合层组件，不再手工 createElement / configure / load。 */
  readonly editor: string;
  /** 组合层适配器：复用宿主 runtime，不新建 manager。 */
  readonly adapter: string;
  /** Base Screen 依赖面：只有单包 base-screen 与实际使用的外围插件。 */
  readonly baseScreenDependencies: readonly string[];
}

/**
 * React 与 Vue 编辑页走同一条组合层路径：各自的桥接包提供 `BaseScreenDesigner`，
 * 挂载、configure、load 与销毁由 SDK 挂载控制器编排，宿主只留下端口与业务接线。
 * 两端共用同一份断言——哪一端偷偷退回命令式装配，这里就会失败。
 */
const HOSTS: readonly CompositionHost[] = [
  {
    host: 'react-host',
    editor: 'examples/react-host/src/components/screen-editor.tsx',
    adapter: 'examples/react-host/src/screen/composition-runtime.ts',
    baseScreenDependencies: ['@base-screen/plugin-materials', 'base-screen'],
  },
  {
    host: 'vue-host',
    editor: 'examples/vue-host/src/components/ScreenEditor.vue',
    adapter: 'examples/vue-host/src/screen/composition-runtime.ts',
    baseScreenDependencies: ['@base-screen/plugin-materials', 'base-screen'],
  },
];

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('designer composition migration', () => {
  it('keeps the shared host runtime identical apart from INSTANCE_ID', () => {
    const normalize = (source: string): string =>
      source.replace(/const INSTANCE_ID = '[^']+';/, "const INSTANCE_ID = '<host>';");
    const baseline = normalize(read(HOST_RUNTIMES[0]));
    for (const path of HOST_RUNTIMES.slice(1)) {
      expect(normalize(read(path)), `${path} 与 vanilla 共享 runtime 漂移`).toBe(baseline);
    }
  });

  it.each(HOSTS)(
    'returns the standard host runtime without a second manager or adoption ($host)',
    ({ adapter }) => {
      const source = read(adapter);
      expect(source).toContain('return loadHostRuntime()');
      expect(source).not.toContain('adoptBaseScreenRuntime');
      expect(source).not.toContain('createBaseScreenRuntime(');
      expect(source).not.toContain('createBaseScreenPluginManager(');
      expect(source).not.toContain('createBaseScreenMountHandle');
    },
  );

  it.each(HOST_RUNTIMES)('assembles the full host through the standard SDK entry (%s)', (path) => {
    const source = read(path);
    expect(source).toContain('HostRuntime extends BaseScreenRuntime, OnlineMaterialRuntime');
    expect(source.match(/createBaseScreenRuntime\(/g)).toHaveLength(1);
    expect(source).toContain('materials: registerHostMaterials()');
    expect(source).toContain('createPluginMaterialsRuntime()');
    expect(source).toContain('createHostResourceRuntime()');
    expect(source).toContain("[PLUGIN_MATERIALS_ID]: ['command.execute', 'design.read']");
    expect(source).toContain('blueprintCapabilities: SCREEN_BLUEPRINT_CAPABILITY_IDS');
    expect(source).toContain('base.setCatalog(buildCatalog(next))');
    expect(source).not.toContain('createBaseScreenPluginManager');
    expect(source).not.toContain('createBaseScreenCorePluginCommandPort');
    expect(source).not.toContain('createBaseScreenCorePluginDesignReadPort');
    expect(read(SDK_RUNTIME)).toContain('createBaseScreenRuntimeLifecycle');
    expect(read(SDK_RUNTIME_LIFECYCLE)).toContain('createBaseScreenRuntimeMounts');
  });

  it.each([
    'examples/vanilla-host/src/screen/register.ts',
    'examples/react-host/src/screen/register.tsx',
    'examples/vue-host/src/screen/register.ts',
  ])('provides host material entries instead of a parallel registration plan (%s)', (path) => {
    const source = read(path);
    expect(source).toContain('readonly BaseScreenMaterialCatalogEntry[]');
    expect(source).not.toContain('defineBaseScreenDesigner');
    expect(source).not.toContain('defineBaseScreenViewer');
    expect(source).not.toContain('defineBaseScreenTextMaterial');
    expect(source).not.toContain('registerPluginMaterials');
    expect(source).not.toContain('customElements.define');
  });

  it.each(HOSTS)(
    'mounts through the designer component and keeps the load ordering ($host)',
    ({ editor }) => {
      const source = read(editor);
      expect(source).toContain('<BaseScreenDesigner');
      // 挂载点沿用同一套布局契约：class 透传到组合层组件根节点，尺寸交给 .stage。
      expect(source).toMatch(/(className|class)="stage"/);
      expect(source).toMatch(/from 'base-screen\/(react|vue)'/);
      // 项目会话模式：load 由组合层按 projectId 触发，宿主不再自己调 element.load()。
      expect(source).toContain('projectId: screenId');
      expect(source).not.toContain('children: [setup.blueprintCanvas]');
      expect(source).toMatch(/onMounted=|:on-mounted=/);
      expect(source).toMatch(/onDiagnostics=|:on-diagnostics=/);
      // 装配未就绪交给组合层：宿主只表达 null，不再自己 v-if / 早返回占位节点。
      expect(source).toContain('?? null');
      expect(source).not.toMatch(/v-if="stage"|return <div className="stage" \/>/);
      expect(source).toContain('setIntentHandler(undefined)');
      expect(source).not.toContain("document.createElement('base-screen-designer')");
      expect(source).not.toContain('await element.load(screenId)');
      expect(source).not.toContain('loadHostRuntime()');
    },
  );

  it.each(HOSTS)('keeps the $host dependency surface narrow', (host) => {
    const manifest: { dependencies?: Record<string, string> } = JSON.parse(
      read(`examples/${host.host}/package.json`),
    );
    const baseScreenDependencies = Object.keys(manifest.dependencies ?? {})
      .filter((name) => name === 'base-screen' || name.startsWith('@base-screen/'))
      .sort();
    expect(baseScreenDependencies).toEqual([...host.baseScreenDependencies].sort());
  });

  it('configures before project load inside the shared SDK mount implementation', () => {
    const source = read(SDK_RUNTIME_MOUNTS);
    const configured = source.indexOf('element.configure({');
    const loaded = source.indexOf('await element.load(projectId)');
    expect(configured).toBeGreaterThan(-1);
    expect(loaded).toBeGreaterThan(configured);
  });
});
