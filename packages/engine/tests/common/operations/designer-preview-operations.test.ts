import type { ScreenDocument, ScreenProjectEnvelope } from '@base-screen/contracts';
import { describe, expect, it } from 'vitest';
import {
  createDesignerElementOperations,
  type DesignerElementOperationsHost,
} from '../../../src/common/operations/designer-element-operations.js';

function documentValue(): ScreenDocument {
  return {
    canvas: { width: 960, height: 540, backgroundColor: '#000000' },
    components: [],
    variables: [],
    blueprint: { rules: [] },
  };
}

function projectValue(): ScreenProjectEnvelope {
  return {
    projectId: '1',
    revision: '1',
    name: '测试大屏',
    description: null,
    document: documentValue(),
    metadata: {},
  };
}

function createHost(overrides: {
  getDocument?: () => ScreenDocument | undefined;
  getProject?: () => ScreenProjectEnvelope | undefined;
  hasPreviewHandler?: () => boolean;
}): DesignerElementOperationsHost {
  return {
    getDocument: overrides.getDocument ?? (() => documentValue()),
    canUndo: () => false,
    canRedo: () => false,
    getSelection: () => ({ selectedComponentIds: [], focusedComponentId: null }),
    getProject: overrides.getProject ?? (() => undefined),
    getProjectPhase: () => 'ready',
    hasPreviewHandler: overrides.hasPreviewHandler ?? (() => false),
    isDirty: () => false,
    canPublish: () => false,
    hasProjectWorkspace: () => false,
    hasClipboard: () => false,
    canGroup: () => false,
    canUngroup: () => false,
    canEnterGroupEditing: () => false,
    canExitGroupEditing: () => false,
    canAlign: () => false,
    canDistribute: () => false,
    getToolMaterialTypes: () => undefined,
    getCatalog: () => undefined,
    getZoom: () => 1,
    undo: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    redo: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    reduceSelection: () => undefined,
    executeCommand: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    executeTransaction: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    copy: () => undefined,
    paste: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    group: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    ungroup: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    enterGroupEditing: () => false,
    exitGroupEditing: () => false,
    align: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    distribute: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    duplicate: () => ({ ok: true, value: documentValue(), diagnostics: [] }),
    setZoomCentered: () => undefined,
    resetViewport: () => undefined,
    isCanvasAidEnabled: () => false,
    toggleCanvasAid: () => undefined,
    isGuidesVisible: () => false,
    toggleGuides: () => undefined,
    isBorderGuidesEnabled: () => false,
    toggleBorderGuides: () => undefined,
    cycleWorkbenchMode: () => undefined,
    openProjectWorkspace: () => undefined,
    save: async () => ({ ok: true, value: projectValue(), diagnostics: [] }),
    publish: async () => ({ ok: true, value: projectValue(), diagnostics: [] }),
    retryLastProjectOperation: async () => ({ ok: true, value: projectValue(), diagnostics: [] }),
    cancelProjectOperation: () => undefined,
    setActiveTool: () => undefined,
    cancelGesture: () => undefined,
    canMutateSelection: () => false,
    canSetSelectionStatus: () => false,
    deleteSelection: () => undefined,
    nudgeSelection: () => undefined,
    toggleSelectionStatus: () => undefined,
    reorderSelection: () => undefined,
    toggleHelpPanel: () => undefined,
    fitViewportToSelectionOrCanvas: () => undefined,
    exportFromOperation: () => undefined,
    openImportPicker: () => undefined,
    togglePreview: () => ({ ok: true, value: undefined, diagnostics: [] }),
    isProjectBusy: () => false,
    report: () => undefined,
    reportProject: () => undefined,
    reportPreview: () => undefined,
  };
}

function previewState(host: DesignerElementOperationsHost): {
  available: boolean;
  enabled: boolean;
} {
  const operations = createDesignerElementOperations(host);
  const state = operations.find((operation) => operation.id === 'preview');
  return {
    available: state?.isAvailable(undefined) ?? false,
    enabled: state?.isEnabled(undefined) ?? false,
  };
}

describe('designer preview operation availability (ADR-0038)', () => {
  it('is available in direct document mode without a host preview handler', () => {
    expect(previewState(createHost({}))).toEqual({ available: true, enabled: true });
  });

  it('is unavailable in project mode without a host preview handler', () => {
    const state = previewState(
      createHost({ getProject: () => projectValue(), hasPreviewHandler: () => false }),
    );
    expect(state.enabled).toBe(false);
  });

  it('is available in project mode when a host preview handler is configured', () => {
    const state = previewState(
      createHost({ getProject: () => projectValue(), hasPreviewHandler: () => true }),
    );
    expect(state).toEqual({ available: true, enabled: true });
  });

  it('is disabled when there is no document regardless of mode', () => {
    const state = previewState(createHost({ getDocument: () => undefined }));
    expect(state.enabled).toBe(false);
  });
});
