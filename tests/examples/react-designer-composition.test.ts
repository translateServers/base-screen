import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EDITOR = 'examples/react-host/src/components/screen-editor.tsx';
const ADAPTER = 'examples/react-host/src/screen/composition-runtime.ts';
const SDK_ADAPTER = 'packages/sdk/src/runtime-adapter.ts';
const SDK_RUNTIME_MOUNTS = 'packages/sdk/src/runtime-mounts.ts';
const HOST_RUNTIMES = [
  'examples/vanilla-host/src/screen/host-runtime.ts',
  'examples/react-host/src/screen/host-runtime.ts',
  'examples/vue-host/src/screen/host-runtime.ts',
] as const;

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('React designer composition migration', () => {
  it('keeps the shared host runtime identical apart from INSTANCE_ID', () => {
    const normalize = (source: string): string =>
      source.replace(/const INSTANCE_ID = '[^']+';/, "const INSTANCE_ID = '<host>';");
    const baseline = normalize(read(HOST_RUNTIMES[0]));
    for (const path of HOST_RUNTIMES.slice(1)) {
      expect(normalize(read(path)), `${path} 与 vanilla 共享 runtime 漂移`).toBe(baseline);
    }
  });

  it('adapts the single host runtime without activating a second manager', () => {
    const source = read(ADAPTER);
    const sdkAdapter = read(SDK_ADAPTER);
    expect(source).toContain('loadHostRuntime()');
    expect(source).toContain('adoptBaseScreenRuntime(host)');
    expect(source).not.toContain('createBaseScreenRuntime(');
    expect(source).not.toContain('createBaseScreenPluginManager(');
    expect(source).not.toContain('createBaseScreenMountHandle');
    expect(sdkAdapter).toContain('createBaseScreenRuntimeMounts');
    expect(sdkAdapter).toContain('host.dispose()');
  });

  it('mounts through the designer component and keeps the load ordering', () => {
    const source = read(EDITOR);
    expect(source).toContain('<BaseScreenDesigner');
    expect(source).toContain('className="stage"');
    expect(source).toContain('projectId: screenId');
    expect(source).not.toContain('children: [setup.blueprintCanvas]');
    expect(source).toContain('onMounted={onMounted}');
    expect(source).toContain('onDiagnostics={onDiagnostics}');
    expect(source).toContain('setIntentHandler(undefined)');
    expect(source).not.toContain("document.createElement('base-screen-designer')");
    expect(source).not.toContain('await element.load(screenId)');
    expect(source).not.toContain('loadHostRuntime()');
  });

  it('keeps the React host dependency surface narrow', () => {
    const manifest: { dependencies?: Record<string, string> } = JSON.parse(
      read('examples/react-host/package.json'),
    );
    const baseScreenDependencies = Object.keys(manifest.dependencies ?? {})
      .filter((name) => name.startsWith('@base-screen/'))
      .sort();
    expect(baseScreenDependencies).toEqual([
      '@base-screen/plugin-board-materials',
      '@base-screen/plugin-echarts',
      '@base-screen/react',
      '@base-screen/sdk',
    ]);
  });

  it('configures before project load inside the shared SDK mount implementation', () => {
    const source = read(SDK_RUNTIME_MOUNTS);
    const configured = source.indexOf('element.configure({');
    const loaded = source.indexOf('await element.load(projectId)');
    expect(configured).toBeGreaterThan(-1);
    expect(loaded).toBeGreaterThan(configured);
  });
});
