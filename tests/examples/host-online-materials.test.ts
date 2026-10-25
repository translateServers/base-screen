import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ONLINE_MATERIAL_TYPE_PREFIX as BACKEND_PREFIX } from '../../examples/shared-backend/src/material-packages/material-package.types';
import {
  createOnlineMaterialDraft,
  createOnlineMaterialType,
  ONLINE_MATERIAL_TYPE_PREFIX,
  readOnlineMaterialCodeMeta,
  renameOnlineMaterialManifest,
} from '../../examples/vanilla-host/src/screen/online-materials';
import { parseBaseScreenMaterialManifest } from '../../packages/plugin-core/src/index.js';

const INPUT = {
  name: '在线 KPI 测试',
  value: '42',
  note: 'build-1',
  background: '#0f2438',
  accent: '#38bdf8',
  width: 320,
  height: 160,
};

const HOSTS = ['vanilla-host', 'react-host', 'vue-host'] as const;
const SHARED_FILES = [
  'src/screen/online-materials.ts',
  'src/styles/online-materials.css',
  'src/types.ts',
  'src/lib/api.ts',
] as const;

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
