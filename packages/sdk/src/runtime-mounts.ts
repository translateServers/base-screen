import type { ScreenParseResult } from '@base-screen/contracts';
import type { BaseScreenDesignerElement } from '@base-screen/engine';
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
  type BaseScreenMountPhase,
  type BaseScreenMountResult,
  collectDiagnostics,
  collectFailureDiagnostics,
  nullResult,
  runtimeFailure,
  runtimeSuccess,
  withMountPhase,
} from './runtime-diagnostics.js';

interface MountCatalogOwnership {
  inherited: boolean;
  catalog: BaseScreenRuntimeCatalog;
}
const mountCatalogOwnership = new WeakMap<object, MountCatalogOwnership>();

/** 仅供 SDK 控制器同步目录归属，不属于发布入口。 */
export function setBaseScreenMountCatalogOwnership(
  handle: object,
  catalog: BaseScreenRuntimeCatalog | undefined,
  appliedCatalog: BaseScreenRuntimeCatalog,
): void {
  const ownership = mountCatalogOwnership.get(handle);
  if (ownership === undefined) return;
  ownership.inherited = catalog === undefined;
  ownership.catalog = appliedCatalog;
}

interface DisposableMountHandle {
  readonly disposed: boolean;
  dispose(): Promise<ScreenParseResult<null>>;
}

interface MountContext<TElement extends BaseScreenMountElement> {
  readonly element: TElement;
  readonly container: Element;
  readonly children: readonly Node[];
  readonly configure: () => ScreenParseResult<null>;
  readonly initializePhase: 'load' | 'document';
  readonly initialize: (
    handle: BaseScreenMountHandle<TElement>,
  ) => Promise<ScreenParseResult<null>>;
  readonly register: (handle: BaseScreenMountHandle<TElement>) => void;
  readonly unregister: (handle: DisposableMountHandle) => void;
  readonly onDetach: () => void;
  readonly isDisposed: () => boolean;
}

async function disposeFailedMount<TValue, TElement extends BaseScreenMountElement>(
  handle: BaseScreenMountHandle<TElement>,
  failures: readonly ScreenParseResult<unknown>[],
  phase: BaseScreenMountPhase,
): Promise<BaseScreenMountResult<TValue>> {
  const disposal = await handle.dispose();
  return { ok: false, diagnostics: collectDiagnostics([...failures, disposal]), mountPhase: phase };
}

async function mountWithHandle<TElement extends BaseScreenMountElement>(
  context: MountContext<TElement>,
): Promise<BaseScreenMountResult<BaseScreenMountHandle<TElement>>> {
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
    return disposeFailedMount(
      handle,
      [
        runtimeFailure<null>(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen element could not be appended to the host container.',
          ['mount', 'container'],
        ),
      ],
      'mount',
    );
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
  if (!configured.ok) return disposeFailedMount(handle, [configured], 'configure');

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
  if (!initialized.ok) return disposeFailedMount(handle, [initialized], context.initializePhase);
  if (context.isDisposed() || handle.disposed) {
    return disposeFailedMount(
      handle,
      [
        runtimeFailure<null>(
          'PLUGIN_CORE_LIFECYCLE_INVALID',
          'Base Screen runtime was disposed while mounting.',
          ['runtime'],
        ),
      ],
      'mount',
    );
  }
  return runtimeSuccess(handle);
}

function createDesignerElement(
  provided: BaseScreenDesignerElement | undefined,
  create: (() => BaseScreenDesignerElement) | undefined,
): ScreenParseResult<BaseScreenDesignerElement> {
  if (provided !== undefined) return runtimeSuccess(provided);
  if (create === undefined) {
    return runtimeFailure(
      'PLUGIN_CORE_LIFECYCLE_INVALID',
      'This runtime only supports Viewer mounts.',
      ['designer'],
    );
  }
  try {
    return runtimeSuccess(create());
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
  readonly createDesignerElement?: () => BaseScreenDesignerElement;
  readonly toolMaterialTypes?: Readonly<Record<string, string>>;
  readonly groupMaterialType?: string;
  readonly bindDesigner: (element: BaseScreenDesignerElement) => ScreenParseResult<null>;
  readonly releaseDesigner: (element: BaseScreenDesignerElement) => void;
  readonly isDisposed: () => boolean;
}

export interface BaseScreenRuntimeMounts {
  readonly mountDesigner: BaseScreenRuntime['mountDesigner'];
  readonly mountViewer: BaseScreenRuntime['mountViewer'];
  readonly designer: BaseScreenDesignerElement | undefined;
  refreshCatalog(
    previous: BaseScreenRuntimeCatalog,
    next: BaseScreenRuntimeCatalog,
  ): ScreenParseResult<null>;
  disposeAll(): Promise<ScreenParseResult<null>>;
}

export function createBaseScreenRuntimeMounts(
  context: BaseScreenRuntimeMountContext,
): BaseScreenRuntimeMounts {
  const handles = new Set<DisposableMountHandle>();
  const elements = new Map<
    DisposableMountHandle,
    BaseScreenDesignerElement | BaseScreenViewerElement
  >();
  let designerHandle: BaseScreenMountHandle<BaseScreenDesignerElement> | undefined;
  let viewerSequence = 0;

  const refreshElement = (
    element: BaseScreenDesignerElement | BaseScreenViewerElement,
    catalog: BaseScreenRuntimeCatalog,
  ): ScreenParseResult<unknown> => {
    try {
      return element.refreshCatalog(catalog);
    } catch {
      return runtimeFailure(
        'PLUGIN_CORE_LIFECYCLE_INVALID',
        'Base Screen catalog refresh threw an error.',
        ['catalog'],
      );
    }
  };
  const unregister = (handle: DisposableMountHandle): void => {
    handles.delete(handle);
    elements.delete(handle);
    mountCatalogOwnership.delete(handle);
    if (designerHandle === handle) designerHandle = undefined;
  };

  const mountDesigner = async (
    container: Element,
    mountOptions: BaseScreenDesignerMountOptions,
  ): Promise<BaseScreenMountResult<BaseScreenMountHandle<BaseScreenDesignerElement>>> => {
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
    const elementResult = createDesignerElement(providedElement, context.createDesignerElement);
    if (!elementResult.ok) return elementResult;
    const element = elementResult.value;
    if (designerHandle !== undefined) {
      return runtimeFailure(
        'PLUGIN_CORE_SESSION_INVALID',
        'Designer is already mounted by this runtime.',
        ['designer'],
      );
    }
    const bound = context.bindDesigner(element);
    if (!bound.ok) return bound;
    const activeCatalog = catalog ?? context.readCatalog();

    return mountWithHandle({
      element,
      container,
      children,
      configure: () =>
        element.configure({
          catalog: activeCatalog,
          toolMaterialTypes: Object.fromEntries(
            Object.entries(context.toolMaterialTypes ?? {}).filter(([, type]) =>
              activeCatalog.has(type),
            ),
          ),
          ...(context.groupMaterialType !== undefined &&
          activeCatalog.has(context.groupMaterialType)
            ? { groupMaterialType: context.groupMaterialType }
            : {}),
          runtimeContributions: context.runtimeContributions,
          pluginCatalog: context.pluginCatalog,
          pluginPanels: context.pluginPanels,
          inspectorControls: context.inspectorControls,
          pluginCommandPort: context.pluginCommandPort,
          ...configuration,
        }),
      initializePhase: projectId !== undefined ? 'load' : 'document',
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
      register: (handle) => {
        handles.add(handle);
        elements.set(handle, element);
        designerHandle = handle;
        mountCatalogOwnership.set(handle, {
          inherited: catalog === undefined,
          catalog: catalog ?? context.readCatalog(),
        });
      },
      unregister,
      onDetach: () => context.releaseDesigner(element),
      isDisposed: context.isDisposed,
    });
  };

  const mountViewer = async (
    container: Element,
    mountOptions: BaseScreenViewerMountOptions,
  ): Promise<BaseScreenMountResult<BaseScreenMountHandle<BaseScreenViewerElement>>> => {
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
      initializePhase: 'document',
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
      register: (handle) => {
        handles.add(handle);
        elements.set(handle, element);
        mountCatalogOwnership.set(handle, {
          inherited: catalog === undefined,
          catalog: catalog ?? context.readCatalog(),
        });
      },
      unregister,
      onDetach: () => undefined,
      isDisposed: context.isDisposed,
    });
  };

  return {
    async mountDesigner(container, options) {
      const result = await mountDesigner(container, options);
      return withMountPhase(result, result.mountPhase ?? 'mount');
    },
    async mountViewer(container, options) {
      const result = await mountViewer(container, options);
      return withMountPhase(result, result.mountPhase ?? 'mount');
    },
    get designer(): BaseScreenDesignerElement | undefined {
      return designerHandle?.element;
    },
    refreshCatalog(_previous, next): ScreenParseResult<null> {
      const refreshed: {
        handle: DisposableMountHandle;
        element: BaseScreenDesignerElement | BaseScreenViewerElement;
        previous: BaseScreenRuntimeCatalog;
      }[] = [];
      for (const [handle, element] of elements) {
        const ownership = mountCatalogOwnership.get(handle);
        const previous = element.catalog;
        if (
          handle.disposed ||
          ownership?.inherited !== true ||
          previous === undefined ||
          previous !== ownership.catalog ||
          previous === next
        )
          continue;
        const result = refreshElement(element, next);
        if (!result.ok) {
          const failures: ScreenParseResult<unknown>[] = [result];
          for (const applied of refreshed.reverse()) {
            const rollback = refreshElement(applied.element, applied.previous);
            failures.push(rollback);
            const ownership = mountCatalogOwnership.get(applied.handle);
            if (rollback.ok && ownership !== undefined) ownership.catalog = applied.previous;
          }
          return { ok: false, diagnostics: collectFailureDiagnostics(failures) };
        }
        ownership.catalog = next;
        refreshed.push({ handle, element, previous });
      }
      return runtimeSuccess(null);
    },
    async disposeAll(): Promise<ScreenParseResult<null>> {
      const results: ScreenParseResult<unknown>[] = [];
      for (const handle of [...handles]) results.push(await handle.dispose());
      handles.clear();
      return nullResult(collectFailureDiagnostics(results));
    },
  };
}
