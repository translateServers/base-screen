import type { ScreenParseResult } from '@base-screen/contracts';
import { BaseScreenDesignerElement } from '@base-screen/engine';
import { BaseScreenViewerElement } from '@base-screen/renderer';
import {
  type BaseScreenMountElement,
  type BaseScreenMountHandle,
  createBaseScreenMountHandle,
} from './mount-handle.js';
import type {
  BaseScreenDesignerMountOptions,
  BaseScreenRuntime,
  BaseScreenRuntimeCatalog,
  BaseScreenViewerMountOptions,
} from './runtime.js';
import {
  collectDiagnostics,
  collectFailureDiagnostics,
  nullResult,
  runtimeFailure,
  runtimeSuccess,
} from './runtime-diagnostics.js';

interface DisposableMountHandle {
  readonly disposed: boolean;
  dispose(): Promise<ScreenParseResult<null>>;
}

interface MountContext<TElement extends BaseScreenMountElement> {
  readonly element: TElement;
  readonly container: Element;
  readonly children: readonly Node[];
  readonly configure: () => ScreenParseResult<null>;
  readonly initialize: (
    handle: BaseScreenMountHandle<TElement>,
  ) => Promise<ScreenParseResult<null>>;
  readonly register: (handle: DisposableMountHandle) => void;
  readonly unregister: (handle: DisposableMountHandle) => void;
  readonly onDetach: () => void;
  readonly isDisposed: () => boolean;
}

async function disposeFailedMount<TValue, TElement extends BaseScreenMountElement>(
  handle: BaseScreenMountHandle<TElement>,
  failures: readonly ScreenParseResult<unknown>[],
): Promise<ScreenParseResult<TValue>> {
  const disposal = await handle.dispose();
  return { ok: false, diagnostics: collectDiagnostics([...failures, disposal]) };
}

async function mountWithHandle<TElement extends BaseScreenMountElement>(
  context: MountContext<TElement>,
): Promise<ScreenParseResult<BaseScreenMountHandle<TElement>>> {
  let handleReference: BaseScreenMountHandle<TElement> | undefined;
  const handle = createBaseScreenMountHandle({
    element: context.element,
    detach: () => {
      if (handleReference !== undefined) context.unregister(handleReference);
      context.onDetach();
    },
  });
  handleReference = handle;
  context.register(handle);

  try {
    if (context.children.length > 0) context.element.append(...context.children);
    context.container.append(context.element);
  } catch {
    return disposeFailedMount(handle, [
      runtimeFailure<null>(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen element could not be appended to the host container.',
        ['mount', 'container'],
      ),
    ]);
  }

  let configured: ScreenParseResult<null>;
  try {
    configured = context.configure();
  } catch {
    configured = runtimeFailure<null>(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Base Screen element configuration threw an error.',
      ['mount', 'configure'],
    );
  }
  if (!configured.ok) return disposeFailedMount(handle, [configured]);

  let initialized: ScreenParseResult<null>;
  try {
    initialized = await context.initialize(handle);
  } catch {
    initialized = runtimeFailure<null>(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Base Screen element initialization threw an error.',
      ['mount', 'initialize'],
    );
  }
  if (!initialized.ok) return disposeFailedMount(handle, [initialized]);
  if (context.isDisposed() || handle.disposed) {
    return disposeFailedMount(handle, [
      runtimeFailure<null>(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen runtime was disposed while mounting.',
        ['runtime'],
      ),
    ]);
  }
  return runtimeSuccess(handle);
}

function createDesignerElement(
  provided: BaseScreenDesignerElement | undefined,
): ScreenParseResult<BaseScreenDesignerElement> {
  if (provided !== undefined) return runtimeSuccess(provided);
  try {
    return runtimeSuccess(new BaseScreenDesignerElement());
  } catch {
    return runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Designer Custom Element could not be constructed.',
      ['designer'],
    );
  }
}

function createViewerElement(
  provided: BaseScreenViewerElement | undefined,
): ScreenParseResult<BaseScreenViewerElement> {
  if (provided !== undefined) return runtimeSuccess(provided);
  try {
    return runtimeSuccess(new BaseScreenViewerElement());
  } catch {
    return runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'Viewer Custom Element could not be constructed.',
      ['viewer'],
    );
  }
}

export interface BaseScreenRuntimeMountContext {
  readonly instanceId: string;
  readonly readCatalog: () => BaseScreenRuntimeCatalog;
  readonly pluginCatalog: BaseScreenRuntime['pluginCatalog'];
  readonly pluginPanels: BaseScreenRuntime['pluginPanels'];
  readonly inspectorControls: BaseScreenRuntime['inspectorControls'];
  readonly runtimeContributions: BaseScreenRuntime['runtimeContributions'];
  readonly pluginCommandPort: BaseScreenRuntime['pluginCommandPort'];
  readonly bindDesigner: (element: BaseScreenDesignerElement) => void;
  readonly releaseDesigner: (element: BaseScreenDesignerElement) => void;
  readonly isDisposed: () => boolean;
}

export interface BaseScreenRuntimeMounts {
  readonly mountDesigner: BaseScreenRuntime['mountDesigner'];
  readonly mountViewer: BaseScreenRuntime['mountViewer'];
  disposeAll(): Promise<ScreenParseResult<null>>;
}

export function createBaseScreenRuntimeMounts(
  context: BaseScreenRuntimeMountContext,
): BaseScreenRuntimeMounts {
  const handles = new Set<DisposableMountHandle>();
  let viewerSequence = 0;

  const mountDesigner = async (
    container: Element,
    mountOptions: BaseScreenDesignerMountOptions,
  ): Promise<ScreenParseResult<BaseScreenMountHandle<BaseScreenDesignerElement>>> => {
    if (context.isDisposed()) {
      return runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen runtime is already disposed.',
        ['runtime'],
      );
    }
    const {
      projectId,
      document: initialDocument,
      children = [],
      element: providedElement,
      catalog,
      ...configuration
    } = mountOptions;
    if (projectId !== undefined && initialDocument !== undefined) {
      return runtimeFailure(
        'PROJECT_ADAPTER_INVALID',
        'Project session mode and direct document mode cannot be combined.',
        ['projectId'],
      );
    }
    if (projectId !== undefined && configuration.projectAdapter === undefined) {
      return runtimeFailure(
        'PROJECT_ADAPTER_INVALID',
        'Project session mode requires a projectAdapter.',
        ['projectAdapter'],
      );
    }
    if (initialDocument !== undefined && configuration.projectAdapter !== undefined) {
      return runtimeFailure(
        'PROJECT_ADAPTER_INVALID',
        'Direct document mode cannot bind a projectAdapter.',
        ['projectAdapter'],
      );
    }
    const elementResult = createDesignerElement(providedElement);
    if (!elementResult.ok) return elementResult;
    const element = elementResult.value;
    context.bindDesigner(element);

    return mountWithHandle({
      element,
      container,
      children,
      configure: () =>
        element.configure({
          catalog: catalog ?? context.readCatalog(),
          runtimeContributions: context.runtimeContributions,
          pluginCatalog: context.pluginCatalog,
          pluginPanels: context.pluginPanels,
          inspectorControls: context.inspectorControls,
          pluginCommandPort: context.pluginCommandPort,
          ...configuration,
        }),
      initialize: async () => {
        if (projectId !== undefined) {
          try {
            const loaded = await element.load(projectId);
            return loaded.ok
              ? runtimeSuccess(null)
              : { ok: false, diagnostics: loaded.diagnostics };
          } catch {
            return runtimeFailure<null>(
              'PLUGIN_CORE_LIFECYCLE_INVALID',
              'Designer project load threw an error.',
              ['projectId'],
            );
          }
        }
        if (initialDocument !== undefined) {
          try {
            element.document = initialDocument;
          } catch {
            return runtimeFailure<null>(
              'PLUGIN_CORE_LIFECYCLE_INVALID',
              'Designer document assignment threw an error.',
              ['document'],
            );
          }
        }
        return runtimeSuccess(null);
      },
      register: (handle) => handles.add(handle),
      unregister: (handle) => handles.delete(handle),
      onDetach: () => context.releaseDesigner(element),
      isDisposed: context.isDisposed,
    });
  };

  const mountViewer = async (
    container: Element,
    mountOptions: BaseScreenViewerMountOptions,
  ): Promise<ScreenParseResult<BaseScreenMountHandle<BaseScreenViewerElement>>> => {
    if (context.isDisposed()) {
      return runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen runtime is already disposed.',
        ['runtime'],
      );
    }
    const {
      document: initialDocument,
      children = [],
      element: providedElement,
      catalog,
      ...configuration
    } = mountOptions;
    const elementResult = createViewerElement(providedElement);
    if (!elementResult.ok) return elementResult;
    const element = elementResult.value;
    viewerSequence += 1;

    return mountWithHandle({
      element,
      container,
      children,
      configure: () =>
        element.configure({
          catalog: catalog ?? context.readCatalog(),
          runtimeContributions: context.runtimeContributions,
          instanceId: `${context.instanceId}:viewer:${viewerSequence}`,
          ...configuration,
        }),
      initialize: async () => {
        if (initialDocument === undefined) return runtimeSuccess(null);
        try {
          element.document = initialDocument;
        } catch {
          return runtimeFailure<null>(
            'PLUGIN_CORE_LIFECYCLE_INVALID',
            'Viewer document assignment threw an error.',
            ['document'],
          );
        }
        return runtimeSuccess(null);
      },
      register: (handle) => handles.add(handle),
      unregister: (handle) => handles.delete(handle),
      onDetach: () => undefined,
      isDisposed: context.isDisposed,
    });
  };

  return {
    mountDesigner,
    mountViewer,
    async disposeAll(): Promise<ScreenParseResult<null>> {
      const results: ScreenParseResult<unknown>[] = [];
      for (const handle of [...handles]) results.push(await handle.dispose());
      handles.clear();
      return nullResult(collectFailureDiagnostics(results));
    },
  };
}
