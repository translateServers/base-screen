import type {
  ScreenDiagnostic,
  ScreenDiagnosticCode,
  ScreenDiagnosticPath,
} from '../types/diagnostics.js';

const MAX_DIAGNOSTICS = 100;

export type DiagnosticPhase = 'root' | 'document';

export type DiagnosticSegment = string | number;

const LIMIT_SENTINEL_PATH: ScreenDiagnosticPath = ['document'];

export class DiagnosticCollector {
  #items: ScreenDiagnostic[] = [];
  #fullPhase: DiagnosticPhase = 'root';

  get full(): boolean {
    return this.#items.length >= MAX_DIAGNOSTICS;
  }

  get count(): number {
    return this.#items.length;
  }

  add(
    code: ScreenDiagnosticCode,
    path: DiagnosticSegment[],
    phase: DiagnosticPhase,
    message: string,
  ): void {
    if (this.full) {
      return;
    }
    this.#items.push({ severity: 'error', code, path, message });
    if (this.#items.length >= MAX_DIAGNOSTICS) {
      this.#fullPhase = phase;
    }
  }

  done(): readonly ScreenDiagnostic[] {
    const sorted = sortScreenDiagnostics(this.#items);
    if (sorted.length < MAX_DIAGNOSTICS) {
      return sorted;
    }
    return [
      ...sorted.slice(0, MAX_DIAGNOSTICS - 1),
      {
        severity: 'error',
        code: 'DIAGNOSTIC_LIMIT_REACHED',
        path: this.#fullPhase === 'document' ? LIMIT_SENTINEL_PATH : [],
        message: 'Too many validation errors; further diagnostics were suppressed.',
      },
    ];
  }
}

function compareSegments(a: DiagnosticSegment, b: DiagnosticSegment): number {
  const aIsNumber = typeof a === 'number';
  const bIsNumber = typeof b === 'number';
  if (aIsNumber !== bIsNumber) {
    return aIsNumber ? -1 : 1;
  }
  if (aIsNumber) {
    return a - (b as number);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function comparePaths(a: ScreenDiagnosticPath, b: ScreenDiagnosticPath): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const bySegment = compareSegments(a[index]!, b[index]!);
    if (bySegment !== 0) {
      return bySegment;
    }
  }
  return a.length - b.length;
}

/**
 * 诊断规范序的唯一实现：先按路径（逐段比较，数字段先于字符串段），再按 code，最后按 message。
 *
 * 其它包不得再自定义排序——分歧的历史实现见 renderer 与 dataset 两处（按 path.join('/') 字符串比较，
 * 会使 ['components',10] 排在 ['components',2] 之前）。排序上限与哨兵不属于本函数职责：
 * Contracts 的收集器按阶段取路径，Plugin 侧的哨兵路径为 []，两者语义不同，各自保留。
 */
export function compareScreenDiagnostics(a: ScreenDiagnostic, b: ScreenDiagnostic): number {
  const byPath = comparePaths(a.path, b.path);
  if (byPath !== 0) {
    return byPath;
  }
  if (a.code < b.code) {
    return -1;
  }
  if (a.code > b.code) {
    return 1;
  }
  if (a.message < b.message) {
    return -1;
  }
  if (a.message > b.message) {
    return 1;
  }
  return 0;
}

/** 按规范序排序，不做条数上限或哨兵替换。需要上限的调用方自行截断。 */
export function sortScreenDiagnostics(
  diagnostics: readonly ScreenDiagnostic[],
): readonly ScreenDiagnostic[] {
  return [...diagnostics].sort(compareScreenDiagnostics);
}
