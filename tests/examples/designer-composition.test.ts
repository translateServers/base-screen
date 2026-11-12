import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SDK_ADAPTER = 'packages/sdk/src/runtime-adapter.ts';
const SDK_RUNTIME_MOUNTS = 'packages/sdk/src/runtime-mounts.ts';
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
  /** Base Screen 依赖面：只有 sdk、框架桥与实际使用的插件包。 */
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
    baseScreenDependencies: [
      '@base-screen/plugin-board-materials',
      '@base-screen/plugin-echarts',
      '@base-screen/react',
      '@base-screen/sdk',
    ],
  },
  {
    host: 'vue-host',
    editor: 'examples/vue-host/src/components/ScreenEditor.vue',
    adapter: 'examples/vue-host/src/screen/composition-runtime.ts',
    baseScreenDependencies: [
      '@base-screen/plugin-board-materials',
      '@base-screen/plugin-echarts',
      '@base-screen/sdk',
      '@base-screen/vue',
    ],
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
    'adapts the single host runtime without activating a second manager ($host)',
    ({ adapter }) => {
      const source = read(adapter);
      const sdkAdapter = read(SDK_ADAPTER);
      expect(source).toContain('loadHostRuntime()');
      expect(source).toContain('adoptBaseScreenRuntime(host)');
      expect(source).not.toContain('createBaseScreenRuntime(');
      expect(source).not.toContain('createBaseScreenPluginManager(');
      expect(source).not.toContain('createBaseScreenMountHandle');
      expect(sdkAdapter).toContain('createBaseScreenRuntimeMounts');
      expect(sdkAdapter).toContain('host.dispose()');
    },
  );

  it.each(HOSTS)(
    'mounts through the designer component and keeps the load ordering ($host)',
    ({ editor }) => {
      const source = read(editor);
      expect(source).toContain('<BaseScreenDesigner');
      // 挂载点沿用同一套布局契约：class 透传到组合层组件根节点，尺寸交给 .stage。
      expect(source).toMatch(/(className|class)="stage"/);
      expect(source).toMatch(/from '@base-screen\/(react|vue)'/);
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
      .filter((name) => name.startsWith('@base-screen/'))
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
