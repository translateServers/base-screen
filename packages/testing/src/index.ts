import type { ScreenDocument } from '@base-screen/contracts';

export {
  type HostResourceConformanceHarness,
  type HostResourceConformanceResult,
  runHostResourceConformance,
} from './host-resource.js';
export {
  type PluginManagerConformanceHarness,
  type PluginManagerConformanceResult,
  type PluginManagerConformanceSession,
  runPluginManagerConformance,
} from './plugin-manager.js';

export function createMinimalScreenDocument(): ScreenDocument {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { relations: [] },
  };
}

export function createSingleComponentDocument(
  overrides: { id?: string; type?: string; name?: string } = {},
): ScreenDocument {
  return {
    canvas: { width: 1920, height: 1080, backgroundColor: '#000000' },
    components: [
      {
        id: overrides.id ?? 'c1',
        type: overrides.type ?? 'acme.kpi-card',
        name: overrides.name ?? 'KPI Card',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 320, height: 160 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource: null,
      },
    ],
    variables: [],
    blueprint: { relations: [] },
  };
}
