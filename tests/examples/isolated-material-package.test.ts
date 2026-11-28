import { describe, expect, it } from 'vitest';
import {
  buildIsolatedMaterialModule,
  buildIsolatedMaterialPackage,
  buildSpecMaterialModule,
  importSpecMaterialModule,
  loadSpecMaterialEntry,
  readIsolatedMaterialModule,
  readSpecMaterialModule,
  readTemplateMaterialModule,
} from '../../examples/vanilla-host/src/screen/component-workshop';
import type { BaseScreenMaterialSpec } from '../../packages/plugin-sdk/src/index';

/**
 * L3 隔离代码组件的在线包格式（ADR-0117 §3.6 / S2）：两个字面量导出、按标记回读、
 * 规范格式校验、宿主页面拒绝加载组件代码。沙箱里的运行由 browser-harness 测量页验证。
 */
const SPEC: BaseScreenMaterialSpec = {
  type: 'host.online.isolated-pkg-test',
  name: '隔离包测试',
  category: '测试',
  keywords: ['测试'],
  defaultSize: { width: 160, height: 120 },
  fields: [{ key: 'color', label: '文字色', section: 'text', kind: 'color', default: '#e2e8f0' }],
  data: { kind: 'scalar', valueType: 'number', sample: 42 },
  isolated: { libraries: [] },
};
// 刻意带上标记、换行、引号与 `</script>`：回读不能被源码内容干扰。
const SOURCE = [
  '// /*spec:end*/ /*source:end*/ //render:begin',
  'export function create(env) {',
  '  const label = "</script>\\n";',
  '  return { frame() { return label.length > 0; } };',
  '}',
].join('\n');

describe('isolated material package format', () => {
  it('round-trips spec and source without executing anything', () => {
    const code = buildIsolatedMaterialModule(SPEC, SOURCE);
    const read = readIsolatedMaterialModule(code);
    expect(read?.ok).toBe(true);
    if (read?.ok !== true) return;
    expect(read.value.source).toBe(SOURCE);
    expect(read.value.spec).toEqual(SPEC);
    // 同 realm 的读取函数都不把它当成自己的包。
    expect(readSpecMaterialModule(code)).toBeUndefined();
    expect(readTemplateMaterialModule(code)).toBeUndefined();
  });

  it('is what buildSpecMaterialModule produces for an isolated spec', () => {
    expect(buildSpecMaterialModule(SPEC, SOURCE)).toBe(buildIsolatedMaterialModule(SPEC, SOURCE));
  });

  it('ignores packages that are not isolated', () => {
    const { isolated: _isolated, ...plain } = SPEC;
    expect(
      readIsolatedMaterialModule(buildSpecMaterialModule(plain, 'root.textContent = "x";')),
    ).toBeUndefined();
    expect(readIsolatedMaterialModule('export default class X {}')).toBeUndefined();
  });

  it('fails closed when anything is appended or the source is missing', () => {
    const code = buildIsolatedMaterialModule(SPEC, SOURCE);
    const tampered = [
      `${code}export function render() { fetch('/steal'); }\n`,
      code.replace('export const source', 'export let source'),
      code.replace(
        /\/\*source:begin\*\/[\s\S]*\/\*source:end\*\//,
        '/*source:begin*/42/*source:end*/',
      ),
      code.slice(0, code.indexOf('export const source')),
    ];
    for (const item of tampered) {
      const read = readIsolatedMaterialModule(item);
      expect(read?.ok).toBe(false);
    }
  });

  it('is never loaded in the host realm', async () => {
    const code = buildIsolatedMaterialModule(SPEC, SOURCE);
    const imported = await importSpecMaterialModule(code);
    expect(imported.ok).toBe(false);
    expect(imported.diagnostics[0]?.message).toContain('沙箱');
    // 夹带了同 realm 渲染段的变体同样拒绝（规范格式校验先失败）。
    const smuggled = `${code}export function render(context) {\n  const { root } = context;\n//render:begin\nroot.textContent = 'x';\n//render:end\n}\n`;
    expect((await importSpecMaterialModule(smuggled)).ok).toBe(false);
  });

  it('builds a save input whose manifest matches the loader compile', async () => {
    const built = buildIsolatedMaterialPackage(SPEC, SOURCE, {
      tagName: 'host-online-isolated-pkg-1',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.type).toBe(SPEC.type);
    expect(built.value.manifest.tagName).toBe('host-online-isolated-pkg-1');
    expect(readIsolatedMaterialModule(built.value.code)?.ok).toBe(true);
    // 改过的 Manifest 与规格编译结果不一致：加载失败关闭（不进 define）。
    const loaded = await loadSpecMaterialEntry(built.value.code, {
      ...built.value.manifest,
      name: '被改过的名字',
    });
    expect(loaded.ok).toBe(false);
  });

  it('refuses unknown preset libraries before defining anything', async () => {
    const spec = {
      ...SPEC,
      type: 'host.online.isolated-pkg-lib',
      isolated: { libraries: ['three'] },
    };
    const built = buildIsolatedMaterialPackage(spec, SOURCE, {
      tagName: 'host-online-isolated-pkg-2',
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const loaded = await loadSpecMaterialEntry(built.value.code, built.value.manifest);
    expect(loaded.ok).toBe(false);
    expect(loaded.diagnostics[0]?.message).toContain('three');
  });

  it('rejects a spec without isolated', () => {
    const { isolated: _isolated, ...plain } = SPEC;
    expect(
      buildIsolatedMaterialPackage(plain, SOURCE, { tagName: 'host-online-isolated-pkg-3' }).ok,
    ).toBe(false);
  });
});
