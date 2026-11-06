import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGE_DEFINITIONS } from '../../tooling/checks/packages.mjs';
import {
  assertionSkeleton,
  groupDuplicateBlocks,
  normalizeChunk,
  splitTestBlocks,
} from '../../tooling/lib/audit-rules.mjs';
import {
  buildEngineFileMap,
  collectEngineImports,
  downstreamClosure,
  getRepoRoot,
  globToRegExp,
  mapToPackages,
  resolveGovernance,
  reverseDependencyGraph,
  workspaceDependencyGraph,
} from '../../tooling/lib/scope-graph.mjs';
import {
  createScopePlan,
  SCHEMA_VERSION,
  validateExecutionReport,
  validateScopePlan,
} from '../../tooling/lib/scope-report.mjs';
import { buildScopePlan, parseScopeArgs } from '../../tooling/testing/test-scope.mjs';

const ROOT = getRepoRoot();
const CONFIG = JSON.parse(
  readFileSync(join(ROOT, 'tooling', 'testing', 'test-scope.config.json'), 'utf8'),
);

function readTestScript(packageDir) {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'packages', packageDir, 'package.json'), 'utf8'),
  );
  return manifest.scripts?.test ?? '';
}

describe('test:scope CLI 参数契约', () => {
  it('缺变更来源时报参数错误（退出码 2）', () => {
    const parsed = parseScopeArgs(['--json']);
    expect(parsed.error).toBeTruthy();
    expect(parsed.exitCode).toBe(2);
  });

  it('未知包名报参数错误（退出码 2）', () => {
    const parsed = parseScopeArgs(['--package', '@base-screen/nope']);
    expect(parsed.exitCode).toBe(2);
  });

  it('不存在的 --changed 路径报参数错误（退出码 2），绝不静默落入 skipped', () => {
    const parsed = parseScopeArgs([
      '--dry-run',
      '--json',
      '--changed',
      'packages/__nope__/src/x.ts',
    ]);
    expect(parsed.error).toContain('--changed 路径不存在');
    expect(parsed.exitCode).toBe(2);
  });

  it('--since 与 --changed/--full 互斥', () => {
    expect(parseScopeArgs(['--since', 'HEAD', '--full']).exitCode).toBe(2);
    expect(parseScopeArgs(['--since', 'HEAD', '--changed', 'AGENTS.md']).exitCode).toBe(2);
  });

  it('合法参数解析为目录名（兼容 @base-screen/* 全名）', () => {
    const parsed = parseScopeArgs(['--package', '@base-screen/contracts', '--dry-run', '--json']);
    expect(parsed.error).toBeUndefined();
    expect(parsed.packages).toEqual(['contracts']);
  });
});

describe('test:scope 计划 JSON 契约自洽', () => {
  it('--dry-run 对治理文件变更产出合法计划并触发根级测试', () => {
    const parsed = parseScopeArgs(['--dry-run', '--json', '--changed', 'AGENTS.md']);
    expect(parsed.error).toBeUndefined();
    const plan = buildScopePlan(parsed.values, parsed.packages, { root: ROOT, config: CONFIG });

    expect(plan.schemaVersion).toBe(SCHEMA_VERSION);
    expect(plan.mode).toBe('dry-run');
    expect(validateScopePlan(plan)).toEqual([]);
    expect(plan.diff.changedFiles).toEqual(['AGENTS.md']);
    expect(plan.governance.runRootTests).toBe(true);
    expect(plan.selection.rootGovernanceTests).toEqual(['tests/**']);
    expect(plan.selection.packages).toEqual([]);
    // 无包受影响时，跳过清单必须给出原因（消解"漏跑"疑虑）
    expect(plan.selection.skipped.length).toBe(0);
  });

  it('包级变更闭包：engine src 变更经 sdk 传递到 React/Vue 桥接包，且引擎文件映射生效', () => {
    const parsed = parseScopeArgs([
      '--dry-run',
      '--json',
      '--changed',
      'packages/engine/src/common/ui-text/designer-ui-text.ts',
    ]);
    const plan = buildScopePlan(parsed.values, parsed.packages, { root: ROOT, config: CONFIG });
    // react/vue 薄封装单向依赖 sdk，engine 的变更闭包会沿 sdk 继续传递。
    expect(plan.closure.affectedPackages).toEqual(['engine', 'react', 'sdk', 'vue']);
    expect(plan.closure.engineFileScope.precision).toBe('file');
    expect(plan.closure.engineFileScope.testFiles.length).toBeGreaterThan(0);
    // 文件级映射生效时 engine 已从 turbo 包级执行中移出，下游包仍按闭包执行。
    expect(plan.selection.packages).not.toContain('engine');
    expect(plan.selection.packages).toEqual(expect.arrayContaining(['react', 'sdk', 'vue']));
    expect(validateScopePlan(plan)).toEqual([]);
  });

  it('非 src 的 engine 变更回退全包并标记原因', () => {
    const parsed = parseScopeArgs([
      '--dry-run',
      '--json',
      '--changed',
      'packages/engine/package.json',
    ]);
    const plan = buildScopePlan(parsed.values, parsed.packages, { root: ROOT, config: CONFIG });
    expect(plan.closure.engineFileScope.precision).toBe('package');
    expect(plan.closure.engineFileScope.fallbackReason).toContain('ENGINE_NON_SOURCE_CHANGES');
    expect(plan.selection.packages).toContain('engine');
  });

  it('非门禁分区（examples）记入跳过清单并给出原因', () => {
    const parsed = parseScopeArgs([
      '--dry-run',
      '--json',
      '--changed',
      'examples/shared-backend/src/main.ts',
    ]);
    const plan = buildScopePlan(parsed.values, parsed.packages, { root: ROOT, config: CONFIG });
    expect(plan.selection.packages).toEqual([]);
    const entry = plan.selection.skipped.find(
      (item) => item.target === 'examples/shared-backend/src/main.ts',
    );
    expect(entry?.reason).toContain('非门禁分区');
  });

  it('手工构造的执行报告可过契约校验', () => {
    const issues = validateExecutionReport({
      schemaVersion: SCHEMA_VERSION,
      planPath: '.base-screen/local/scratch/test-scope/plan.json',
      exitCode: 0,
      wallClockMs: 1234,
      turbo: { tasks: [{ package: '@base-screen/contracts', cached: true, durationMs: 12 }] },
      vitest: { testFiles: 3, tests: 10, failed: 0, durationMs: 900 },
      metrics: { fullBaselineMs: null, scopedMs: 1234, reductionPct: null, cacheHitRate: 1 },
    });
    expect(issues).toEqual([]);
  });

  it('createScopePlan 产物可过契约校验', () => {
    const plan = createScopePlan({
      mode: 'dry-run',
      trigger: 'agent',
      diff: { sinceRef: 'HEAD', changedFiles: [], byPackage: {} },
      closure: {
        affectedPackages: [],
        engineFileScope: {
          sourceFiles: [],
          testFiles: [],
          precision: 'package',
          fallbackReason: 'X',
        },
      },
      governance: { runRootTests: false, reasons: [] },
      selection: {
        packages: [],
        engineTestFiles: [],
        rootGovernanceTests: [],
        vitestArgs: [],
        estimatedFiles: 0,
        skipped: [],
      },
    });
    expect(validateScopePlan(plan)).toEqual([]);
  });
});

describe('test:scope 配置与 12 包清单对账', () => {
  it('allowEmptyPackages ⊆ 固定包清单', () => {
    for (const dir of CONFIG.allowEmptyPackages) {
      expect(PACKAGE_DEFINITIONS[dir]).toBeTruthy();
    }
  });

  it('非 allowEmptyPackages 的包 test script 已移除 --passWithNoTests，清单内保留', () => {
    for (const dir of Object.keys(PACKAGE_DEFINITIONS)) {
      const script = readTestScript(dir);
      if (CONFIG.allowEmptyPackages.includes(dir)) {
        expect(script).toBe('vitest run --passWithNoTests');
      } else {
        expect(script).toBe('vitest run');
      }
    }
  });

  it('审计阈值齐备且取值合理', () => {
    const { noSelectionDays, duplicateJaccard, longSkipDays } = CONFIG.auditThresholds;
    expect(noSelectionDays).toBeGreaterThan(0);
    expect(duplicateJaccard).toBeGreaterThan(0.5);
    expect(duplicateJaccard).toBeLessThanOrEqual(1);
    expect(longSkipDays).toBeGreaterThan(0);
  });

  it('治理触发清单可编译为合法正则', () => {
    for (const trigger of CONFIG.governanceTriggers) {
      expect(() => globToRegExp(trigger.pattern)).not.toThrow();
    }
    expect(globToRegExp('docs/plans/**').test('docs/plans/x/y.md')).toBe(true);
    expect(globToRegExp('AGENTS.md').test('docs/AGENTS.md')).toBe(false);
  });
});

describe('审计词法分析守护（QA round2 根因 a-d）', () => {
  it('(a) 泛型 expectTypeOf<T>(...) 计为断言，不再误判空断言', () => {
    const normalized = normalizeChunk('expectTypeOf<Foo>(value).toEqualTypeOf<Foo>();');
    expect(normalized).toMatch(/expect(TypeOf)?\s*[<(]/);
  });

  it('(b) /regex/.test(x) 方法调用不构成块起点', () => {
    const source = [
      "it('first', () => { expect(1).toBe(1); });",
      "const ok = /x/.test('yx');",
      "it('second', () => { expect(2).toBe(2); });",
    ].join('\n');
    const blocks = splitTestBlocks(source);
    expect(blocks).toHaveLength(2);
  });

  it('(c) 标题字符串内的 "it (…)" 不构成块起点，真实块不被腰斩', () => {
    const source = [
      "describe('scale', () => {",
      "  it('grows beyond it (×1.0) factor', () => {",
      '    expect(1).toBe(1);',
      '  });',
      '});',
    ].join('\n');
    expect(splitTestBlocks(source)).toHaveLength(1);
  });

  it('(d) 双引号串内撇号不再吞掉后续 expect 文本', () => {
    const normalized = normalizeChunk('const q = { key: "\'" }; expect(q.key).toBe("\'");');
    expect(normalized).toMatch(/expect\(q\.key\)/);
  });

  it('(b/d 组合) 残片块不会产生空断言骨架，重复检测不受引号错序影响', () => {
    const normalized = normalizeChunk('expect(a).toBe(true); expect(b).toBe(false);');
    expect(assertionSkeleton(normalized)).toContain('toBe(false)');
  });

  function auditBlock(file: string, body: string) {
    const normalized = normalizeChunk(body, { preserveStrings: true });
    return { file, skeleton: assertionSkeleton(normalized), normalized };
  }

  it('(e) 字符串期望值参与骨架：不同期望值不成组', () => {
    const left = auditBlock(
      'a.test.ts',
      "it('x', () => { const value = parse(1); expect(value.status).toBe('alpha'); expect(value.ready).toBe('alpha'); });",
    );
    const right = auditBlock(
      'b.test.ts',
      "it('x', () => { const value = parse(1); expect(value.status).toBe('beta'); expect(value.ready).toBe('beta'); });",
    );
    expect(left.skeleton).not.toBe(right.skeleton);
    expect(groupDuplicateBlocks([left, right], { duplicateJaccard: 0.85 })).toEqual([]);
  });

  it('(f) 断言形状相同但夹具不同不成组', () => {
    const left = auditBlock(
      'a.test.ts',
      "it('x', () => { const value = parseAlpha(snapshotOne); expect(value.ok).toBe(false); expect(value.code).toBe('E_ONE'); });",
    );
    const right = auditBlock(
      'b.test.ts',
      "it('x', () => { const value = parseBeta(snapshotTwo); expect(value.ok).toBe(false); expect(value.code).toBe('E_ONE'); });",
    );
    expect(left.skeleton).toBe(right.skeleton);
    expect(groupDuplicateBlocks([left, right], { duplicateJaccard: 0.85 })).toEqual([]);
  });

  it('(g) 逐字复制的用例块成组，且记录最小相似度', () => {
    const body =
      "it('copied', () => { const value = buildValue(); expect(value.id).toBe('alpha'); expect(value.ready).toBe(true); });";
    const groups = groupDuplicateBlocks(
      [auditBlock('a.test.ts', body), auditBlock('b.test.ts', body)],
      { duplicateJaccard: 0.85 },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      files: ['a.test.ts', 'b.test.ts'],
      similarity: 1,
      basis: 'assertion-hash',
    });
  });

  it('(h) 同一文件对的多个重复块只输出一组', () => {
    const bodyOne =
      "it('one', () => { const a = first(); expect(a.ok).toBe(true); expect(a.id).toBe('one'); });";
    const bodyTwo =
      "it('two', () => { const b = second(); expect(b.ok).toBe(false); expect(b.id).toBe('two'); });";
    const groups = groupDuplicateBlocks(
      [
        auditBlock('a.test.ts', bodyOne),
        auditBlock('b.test.ts', bodyOne),
        auditBlock('a.test.ts', bodyTwo),
        auditBlock('b.test.ts', bodyTwo),
      ],
      { duplicateJaccard: 0.85 },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.files).toEqual(['a.test.ts', 'b.test.ts']);
  });
});

describe('engine 文件级映射守护', () => {
  it('每个 engine 测试文件的 src 相对导入均可解析', () => {
    const { issues } = collectEngineImports(ROOT);
    expect(issues).toEqual([]);
  });

  it('import 边与目录镜像非空且相互覆盖', () => {
    const map = buildEngineFileMap(ROOT);
    expect(map.testFiles.length).toBeGreaterThan(0);
    expect(map.importEdges.size).toBeGreaterThan(0);
    expect(map.dirMirrors.size).toBeGreaterThan(0);
  });
});

describe('包依赖闭包图', () => {
  it('反向图覆盖 12 个固定包', () => {
    const reverse = reverseDependencyGraph(workspaceDependencyGraph(ROOT));
    expect([...reverse.keys()].sort()).toEqual(Object.keys(PACKAGE_DEFINITIONS).sort());
  });

  it('contracts 变更闭包覆盖核心下游', () => {
    const reverse = reverseDependencyGraph(workspaceDependencyGraph(ROOT));
    const closure = downstreamClosure(['contracts'], reverse);
    for (const expected of ['contracts', 'core', 'engine', 'sdk', 'testing']) {
      expect(closure).toContain(expected);
    }
  });

  it('testing 自身变更不影响他包（testing 被依赖方向为出边）', () => {
    const reverse = reverseDependencyGraph(workspaceDependencyGraph(ROOT));
    expect(downstreamClosure(['testing'], reverse)).toEqual(['testing']);
  });

  it('变更路径映射到正确的包', () => {
    const { byPackage, other } = mapToPackages([
      'packages/engine/src/index.ts',
      'packages/contracts/tests/document/document.test.ts',
      'AGENTS.md',
    ]);
    expect(byPackage.get('engine')).toEqual(['packages/engine/src/index.ts']);
    expect(byPackage.get('contracts')).toEqual([
      'packages/contracts/tests/document/document.test.ts',
    ]);
    expect(other).toEqual(['AGENTS.md']);
  });

  it('治理解析：根级测试引用的 tooling 文件变更触发治理', () => {
    const governance = resolveGovernance(['tooling/lib/scope-graph.mjs'], CONFIG, ROOT);
    expect(governance.runRootTests).toBe(true);
    expect(governance.reasons.join('\n')).toContain('tooling/lib/scope-graph.mjs');
  });
});
