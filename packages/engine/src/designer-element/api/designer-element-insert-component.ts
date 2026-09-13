import type { ScreenDiagnostic, ScreenDocument, ScreenParseResult } from '@base-screen/contracts';
import {
  type BaseScreenComponentInsertionIntent,
  clipMaterialPositionToCanvas,
  createMaterialComponent,
  parseBaseScreenComponentInsertionIntent,
  validateInsertableMaterial,
} from '../../common/operations/material-component/material-component.js';
import {
  type DesignerElementHost,
  getDesignerElementState,
} from '../runtime/designer-element-state.js';

export type { BaseScreenComponentInsertionIntent };

/**
 * 按物料类型插入一个组件实例的公开入口。
 *
 * 存在的理由：此前宿主只能 `executeCommand({type:'add-component', component})` 并自己把
 * manifest 的默认值（size/props/style/dataSource）重新展开一遍，或去驱动私有拖放 MIME——
 * 后者文档明确禁止宿主使用。于是自动化测试、AI 生成大屏、模板实例化都没有合规入口。
 *
 * 语义边界：
 * - 只按 manifest 默认值建节点，不接受自定义 props/style（需要时改完再 `executeCommand`）；
 * - `position` 省略时放在可见画布中心，并保证整体落在画布内；
 * - 一次事务提交，因此可撤销；成功后新组件成为唯一选中项。
 */
export function insertComponent(
  element: DesignerElementHost,
  intent: BaseScreenComponentInsertionIntent,
): ScreenParseResult<ScreenDocument> {
  const state = getDesignerElementState(element);
  const document = state.session.document;
  if (document === undefined) {
    return failure('AUTHORING_SOURCE_INVALID', 'Component insertion requires a document.');
  }
  const parsed = parseBaseScreenComponentInsertionIntent(intent);
  if (!parsed.ok) return parsed;

  const manifest = state.catalog?.get(parsed.value.materialType)?.manifest;
  const validated = validateInsertableMaterial(manifest, parsed.value);
  if (!validated.ok) return validated;

  const center = state.viewportController.visibleCanvasCenter() ?? {
    x: document.canvas.width / 2,
    y: document.canvas.height / 2,
  };
  const requested = parsed.value.position ?? center;
  const component = createMaterialComponent(document, validated.value, {
    position: clipMaterialPositionToCanvas(document, validated.value, requested),
    ...(parsed.value.name === undefined ? {} : { name: parsed.value.name }),
  });
  return commitComponentInsertion(element, component);
}

function commitComponentInsertion(
  element: DesignerElementHost,
  component: ReturnType<typeof createMaterialComponent>,
): ScreenParseResult<ScreenDocument> {
  const state = getDesignerElementState(element);
  const result = element.executeTransaction({
    commands: [{ type: 'add-component', component }],
  });
  if (result.ok) {
    // 新组件成为唯一选中项，与拖放/面板添加一致。
    state.session.reduceSelection({
      type: 'replace-selection',
      componentIds: [component.id],
      focusedComponentId: component.id,
    });
  }
  return result;
}

export function parseInsertionIntent(
  input: unknown,
): ScreenParseResult<BaseScreenComponentInsertionIntent> {
  return parseBaseScreenComponentInsertionIntent(input);
}

function failure<T>(
  code: ScreenDiagnostic['code'],
  message: string,
  path: ScreenDiagnostic['path'] = [],
): ScreenParseResult<T> {
  return { ok: false, diagnostics: [{ severity: 'error', code, path, message }] };
}
