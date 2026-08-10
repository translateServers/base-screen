import { createBaseScreenMaterialCatalog } from '../../packages/plugin-core/src/index.ts';
import { createBaseScreenPluginManager } from '../../packages/plugin-manager/src/index.ts';
import { createBaseScreenRemotePluginSandbox } from '../../packages/plugin-manager/src/remote-sandbox.ts';
import { createBaseScreenRenderer } from '../../packages/renderer/src/renderer.ts';
import { BaseScreenViewerElement } from '../../packages/renderer/src/viewer.ts';
import { runHostResourceConformance } from '../../packages/testing/src/host-resource.ts';

const target = document.querySelector<HTMLElement>('#sandbox-root');
if (target === null) throw new Error('Runtime harness target is missing.');

const remoteOrigin = 'http://127.0.0.1:4176';
const events: unknown[] = [];
const remoteCapabilityCanaries = {
  baseScreenMaterial: { name: 'material' },
  baseScreenCatalog: { name: 'catalog' },
  baseScreenDocument: { name: 'document' },
  baseScreenCommandPort: { name: 'command' },
  baseScreenResource: { name: 'resource' },
  baseScreenCredential: { name: 'credential' },
} as const;

const resourceManifest = {
  type: 'harness.resource',
  tagName: 'runtime-resource-material',
  name: 'Runtime resource material',
  category: 'Harness',
  keywords: [],
  defaultSize: { width: 100, height: 40 },
  defaultProps: {},
  defaultStyle: {},
  styleSchema: { kind: 'object' as const, properties: {}, required: [] },
  stylePanel: [],
  propsSchema: { kind: 'object' as const, properties: {}, required: [] },
  propertyPanel: [],
  events: ['fire'],
  dataCapabilities: ['static' as const, 'host-resource' as const],
  designCapabilities: { resize: true, rotate: false, children: false },
};

class RuntimeResourceMaterial extends HTMLElement {
  static readonly manifest = resourceManifest;
  declare model: {
    readonly dataState: { readonly status: string; readonly code?: string };
  };
}

if (customElements.get(resourceManifest.tagName) === undefined) {
  customElements.define(resourceManifest.tagName, RuntimeResourceMaterial);
}
if (customElements.get('runtime-harness-viewer') === undefined) {
  customElements.define('runtime-harness-viewer', BaseScreenViewerElement);
}

const resourceCatalog = createBaseScreenMaterialCatalog([
  { manifest: resourceManifest, constructor: RuntimeResourceMaterial },
]);

function createResourceDocument(dataSource: unknown) {
  return {
    canvas: { width: 100, height: 40, backgroundColor: '#000000' },
    components: [
      {
        id: 'resource',
        type: resourceManifest.type,
        name: 'Resource',
        parentId: null,
        position: { x: 0, y: 0 },
        size: { width: 100, height: 40 },
        rotation: 0,
        zIndex: 1,
        status: { locked: false, hidden: false },
        props: {},
        style: {},
        dataSource,
      },
    ],
    variables: [],
    blueprint: { rules: [] },
  };
}

Object.assign(window, {
  runtimeHarness: {
    async start(path: string, timeoutMs = 500) {
      const sandbox = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: `${remoteOrigin}${path}`,
        expectedOrigin: remoteOrigin,
        timeoutMs,
        onEvent: (event) => events.push(event),
      });
      const result = await sandbox.ready();
      return {
        result,
        status: sandbox.status,
        sandboxed: sandbox.element?.getAttribute('sandbox'),
        referrerPolicy: sandbox.element?.referrerPolicy,
      };
    },
    async runSandboxFailureMatrix() {
      const hostOrigin = window.location.origin;
      const hostWindow = window as unknown as Record<string, unknown>;
      const out: Record<string, unknown> = {};

      const sameOrigin = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: `${hostOrigin}/ready.html`,
        expectedOrigin: hostOrigin,
        timeoutMs: 500,
        onEvent: undefined,
      });
      out.sameOrigin = {
        code: (await sameOrigin.ready()).diagnostics[0]?.code,
        message: (await sameOrigin.ready()).diagnostics[0]?.message,
        element: sameOrigin.element,
      };

      const invalidUrl = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: 'not a valid URL',
        expectedOrigin: remoteOrigin,
        timeoutMs: 500,
        onEvent: undefined,
      });
      out.invalidUrl = {
        code: (await invalidUrl.ready()).diagnostics[0]?.code,
        message: (await invalidUrl.ready()).diagnostics[0]?.message,
        element: invalidUrl.element,
      };

      const mismatched = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: `${remoteOrigin}/ready.html`,
        expectedOrigin: 'http://127.0.0.1:4177',
        timeoutMs: 500,
        onEvent: undefined,
      });
      out.mismatchedOrigin = {
        code: (await mismatched.ready()).diagnostics[0]?.code,
        message: (await mismatched.ready()).diagnostics[0]?.message,
        element: mismatched.element,
      };

      const malformed = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: `${remoteOrigin}/malformed.html`,
        expectedOrigin: remoteOrigin,
        timeoutMs: 500,
        onEvent: undefined,
      });
      out.malformed = {
        code: (await malformed.ready()).diagnostics[0]?.code,
        message: (await malformed.ready()).diagnostics[0]?.message,
        status: malformed.status,
      };

      const repeated = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: `${remoteOrigin}/repeat-ready.html`,
        expectedOrigin: remoteOrigin,
        timeoutMs: 500,
        onEvent: undefined,
      });
      const repeatedReadyResult = await repeated.ready();
      await new Promise((resolve) => setTimeout(resolve, 25));
      out.repeatedReady = { ok: repeatedReadyResult.ok, status: repeated.status };

      const loadError = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: 'http://127.0.0.1:4177/load.html',
        expectedOrigin: 'http://127.0.0.1:4177',
        timeoutMs: 500,
        onEvent: undefined,
      });
      // Chromium does not fire the `error` event for iframe load failures, so dispatch
      // it manually to exercise the sandbox's load-error handling deterministically.
      loadError.element?.dispatchEvent(new Event('error'));
      const loadErrorResult = await loadError.ready();
      out.loadError = {
        code: loadErrorResult.diagnostics[0]?.code,
        status: loadError.status,
        message: loadErrorResult.diagnostics[0]?.message,
      };

      const disposed = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: `${remoteOrigin}/never-ready.html`,
        expectedOrigin: remoteOrigin,
        timeoutMs: 1000,
        onEvent: undefined,
      });
      disposed.dispose();
      out.dispose = {
        code: (await disposed.ready()).diagnostics[0]?.code,
        status: disposed.status,
        message: (await disposed.ready()).diagnostics[0]?.message,
      };

      Object.assign(hostWindow, remoteCapabilityCanaries);
      let capabilityProbe: unknown;
      const surveyed = createBaseScreenRemotePluginSandbox({
        target,
        entryUrl: `${remoteOrigin}/capability-probe.html`,
        expectedOrigin: remoteOrigin,
        timeoutMs: 500,
        onEvent: (event) => {
          if (event.name === 'capability_probe') {
            capabilityProbe = event.payload;
          }
        },
      });
      try {
        await surveyed.ready();
        await new Promise((resolve) => setTimeout(resolve, 25));
        out.remoteCapabilityProbe = capabilityProbe;
      } finally {
        surveyed.dispose();
        for (const key of Object.keys(remoteCapabilityCanaries)) {
          delete hostWindow[key];
        }
      }
      return out;
    },
    events,
    async runHostResourceConformance() {
      const root = document.createElement('div');
      document.body.appendChild(root);
      let lastRender: unknown;
      try {
        const result = await runHostResourceConformance({
          createRenderer: (resourcePort) => {
            const renderer = createBaseScreenRenderer({
              root,
              catalog: resourceCatalog,
              mode: 'viewer',
              interactive: false,
              onMaterialEvent: undefined,
              resourcePort,
              resourceTimeoutMs: 100,
            });
            return {
              clear: () => renderer.clear(),
              dispose: () => renderer.dispose(),
              render(document) {
                lastRender = renderer.render(document);
                return lastRender;
              },
            };
          },
          createDocument: createResourceDocument,
          readDataState: () => {
            const element = root.firstElementChild as RuntimeResourceMaterial | null;
            return element?.model.dataState;
          },
          flush: () => new Promise((resolve) => setTimeout(resolve, 20)),
          waitForTimeout: () => new Promise((resolve) => setTimeout(resolve, 150)),
        });
        return { scenarios: result.scenarios };
      } catch (error) {
        const element = root.firstElementChild as RuntimeResourceMaterial | null;
        return { error: String(error), lastRender, state: element?.model.dataState };
      } finally {
        root.remove();
      }
    },
    async runBlueprintPortRejection() {
      const viewer = document.createElement('runtime-harness-viewer') as BaseScreenViewerElement;
      let diagnostics = 0;
      viewer.addEventListener('base-screen-diagnostic', () => {
        diagnostics++;
      });
      viewer.catalog = resourceCatalog;
      viewer.blueprintRuntimePort = { emit: () => Promise.reject(new Error('canary secret')) };
      viewer.document = {
        ...createResourceDocument(null),
        blueprint: {
          rules: [
            {
              id: 'emit',
              trigger: { type: 'material-event', componentId: 'resource', eventName: 'fire' },
              actions: [
                {
                  type: 'emit-host-event',
                  eventName: 'host_event',
                  payload: { kind: 'literal', value: null },
                },
              ],
            },
          ],
        },
      };
      document.body.appendChild(viewer);
      try {
        await new Promise((resolve) => setTimeout(resolve));
        const material = viewer.shadowRoot?.querySelector('runtime-resource-material');
        material?.dispatchEvent(
          new CustomEvent('base-screen-material-event', {
            bubbles: true,
            composed: true,
            detail: { name: 'fire', payload: null },
          }),
        );
        await new Promise((resolve) => setTimeout(resolve));
        return diagnostics;
      } finally {
        viewer.remove();
      }
    },
    async runContributionAuthority() {
      const manager = createBaseScreenPluginManager({
        instanceId: 'runtime-authority',
        standaloneMaterialTagNames: [],
        plugins: [
          {
            manifest: {
              id: 'runtime_authority',
              dependencies: [],
              capabilities: ['blueprint.value.variable'],
              contributions: [
                {
                  kind: 'dataResourceType',
                  id: 'dataset',
                  name: 'Dataset',
                  configSchema: {
                    kind: 'object',
                    properties: { limit: { kind: 'number' } },
                    required: ['limit'],
                  },
                },
                {
                  kind: 'blueprintCapability',
                  id: 'blueprint.value.variable',
                  name: 'Blueprint variable',
                },
              ],
            },
            activate: () => undefined,
            deactivate: () => undefined,
            dispose: () => undefined,
          },
        ],
        grantedCapabilities: { runtime_authority: ['blueprint.value.variable'] },
        registry: { get: () => undefined },
        createCommandPort: undefined,
      });
      const activated = await manager.activate();
      if (!activated.ok) return false;
      const viewer = document.createElement('runtime-harness-viewer') as BaseScreenViewerElement;
      let diagnostics = 0;
      viewer.addEventListener('base-screen-diagnostic', () => {
        diagnostics++;
      });
      viewer.catalog = resourceCatalog;
      viewer.runtimeContributions = activated.value.contributions;
      viewer.document = {
        ...createResourceDocument({
          type: 'host-resource',
          resourceType: 'dataset',
          resourceId: 'orders',
          params: { limit: { kind: 'literal', value: 'invalid' } },
          binding: null,
        }),
        blueprint: {
          rules: [
            {
              id: 'requires_capability',
              trigger: { type: 'material-event', componentId: 'resource', eventName: 'fire' },
              requiredCapabilities: ['blueprint.value.variable'],
              actions: [],
            },
          ],
        },
      };
      document.body.appendChild(viewer);
      try {
        await new Promise((resolve) => setTimeout(resolve));
        const resource = viewer.shadowRoot?.querySelector(
          '[data-base-screen-component-id="resource"]',
        ) as
          | {
              readonly model?: {
                readonly dataState?: { readonly status?: string; readonly code?: string };
              };
            }
          | null
          | undefined;
        // 非法参数按 configSchema fail-closed：组件进入稳定错误终态（不触发宿主
        // 查询），且不产生任何诊断（error data state 是面向 material 的契约面）。
        return (
          diagnostics === 0 &&
          resource?.model?.dataState?.status === 'error' &&
          resource?.model?.dataState?.code === 'HOST_RESOURCE_FAILED' &&
          activated.value.contributions.hasBlueprintCapability('blueprint.value.variable') &&
          activated.value.contributions.getResourceType('dataset') !== undefined
        );
      } finally {
        viewer.remove();
        await manager.dispose();
      }
    },
  },
});
