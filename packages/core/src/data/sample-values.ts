import type { ScreenDiagnosticPath, ScreenDocument, ScreenValueRef } from '@base-screen/contracts';

/** 一处示例数据取值：在文档里的位置，以及它挂在谁身上。 */
export interface ScreenSampleValueRef {
  readonly path: ScreenDiagnosticPath;
  readonly owner:
    | { readonly kind: 'component'; readonly id: string }
    | { readonly kind: 'data-source-param'; readonly id: string; readonly param: string }
    | { readonly kind: 'variable'; readonly id: string };
}

/**
 * 列出文档里全部带 `sample: true` 的 `inline` 取值（ADR-0112 §2.3）。
 *
 * 只看取值引用的三个位置：组件 `dataValue`、数据源实例 `params`、变量 `value`。不深扫 props /
 * style——那里的任意 JSON 恰好长成 `{ kind: 'inline', sample: true }` 也不是取值引用。
 * 设计器发布前据此拦截；结果按文档顺序排列，便于逐个定位。
 */
export function listSampleValueRefs(document: ScreenDocument): readonly ScreenSampleValueRef[] {
  const found: ScreenSampleValueRef[] = [];
  document.components.forEach((component, index) => {
    if (isSample(component.dataValue)) {
      found.push({
        path: ['components', index, 'dataValue'],
        owner: { kind: 'component', id: component.id },
      });
    }
  });
  (document.dataSources ?? []).forEach((dataSource, index) => {
    for (const [param, ref] of Object.entries(dataSource.params)) {
      if (isSample(ref)) {
        found.push({
          path: ['dataSources', index, 'params', param],
          owner: { kind: 'data-source-param', id: dataSource.id, param },
        });
      }
    }
  });
  document.variables.forEach((variable, index) => {
    const value =
      'value' in variable ? (variable as { readonly value?: unknown }).value : undefined;
    if (isSample(value)) {
      found.push({
        path: ['variables', index, 'value'],
        owner: { kind: 'variable', id: variable.id },
      });
    }
  });
  return found;
}

function isSample(ref: unknown): ref is Extract<ScreenValueRef, { kind: 'inline' }> {
  return (
    typeof ref === 'object' &&
    ref !== null &&
    (ref as { readonly kind?: unknown }).kind === 'inline' &&
    (ref as { readonly sample?: unknown }).sample === true
  );
}
