/**
 * 作者面体检的一条结论（base-screen-docs ADR-0105 §2.5）。
 *
 * `rule` 沿用范式文档里的编号：T*（ADR-0099 原子判定）、R*（ADR-0099 / ADR-0102 门禁规则）、
 * F*（ADR-0100 分片规则）；`SPEC` 是规格本身的形状错误，`RENDER` 是渲染代码的静态检查。
 * `error` 阻止发布，`warning` 只提示。
 */
export interface BaseScreenAuthoringFinding {
  readonly rule: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  /** 指向规格 / 分片里的位置（例如 `['fields', 2, 'key']`）；整体性结论省略。 */
  readonly path?: readonly (string | number)[];
}

/** 先错误后警告，同级保持原顺序：界面与发布门禁都按这个顺序读。 */
export function sortBaseScreenAuthoringFindings(
  findings: readonly BaseScreenAuthoringFinding[],
): readonly BaseScreenAuthoringFinding[] {
  return [
    ...findings.filter((finding) => finding.severity === 'error'),
    ...findings.filter((finding) => finding.severity === 'warning'),
  ];
}

/** 是否有阻止发布的结论。 */
export function hasBaseScreenAuthoringErrors(
  findings: readonly BaseScreenAuthoringFinding[],
): boolean {
  return findings.some((finding) => finding.severity === 'error');
}
