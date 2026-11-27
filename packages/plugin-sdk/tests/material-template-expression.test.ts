import { describe, expect, it } from 'vitest';
import {
  BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS,
  BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS,
  BASE_SCREEN_MATERIAL_TEMPLATE_STEP_BUDGET,
  BaseScreenMaterialTemplateBudgetError,
  type BaseScreenMaterialTemplateEnv,
  type BaseScreenMaterialTemplateExpression,
  type BaseScreenMaterialTemplateScope,
  evaluateBaseScreenMaterialTemplateExpression,
  parseBaseScreenMaterialTemplateExpression,
} from '../src/index.js';

/**
 * 绑定表达式（ADR-0116 §2.3）：非图灵完备、引用只能命中白名单根、资源有上限。
 * 后半部分是模糊测试（ADR-0116 §7「表达式求值器本身是攻击面」）：固定种子的伪随机输入，
 * 不新增依赖；失败时按种子与输入原样复现。
 */
const SCALAR_SCOPE: BaseScreenMaterialTemplateScope = {
  props: new Set(['min', 'max', 'showLabel']),
  style: new Set(['color', 'fontSize']),
  roles: new Set(),
  data: 'scalar',
  inRepeat: false,
  inRowRepeat: false,
};
const ROWS_SCOPE: BaseScreenMaterialTemplateScope = {
  props: new Set(['limit']),
  style: new Set(['color']),
  roles: new Set(['name', 'amount']),
  data: 'rows',
  inRepeat: true,
  inRowRepeat: true,
};

function env(
  patch: Partial<BaseScreenMaterialTemplateEnv> = {},
  steps = BASE_SCREEN_MATERIAL_TEMPLATE_STEP_BUDGET,
): BaseScreenMaterialTemplateEnv {
  const row = { name: '二号线', amount: 64 };
  const rows = [{ name: '一号线', amount: 82 }, row, { name: '三号线', amount: 91 }];
  return {
    value: 42,
    rows,
    row,
    index: 1,
    count: rows.length,
    props: { min: 0, max: 100, showLabel: true, limit: 5 },
    style: { color: '#e2e8f0', fontSize: 24 },
    size: { width: 220, height: 120 },
    formatNumber: (value) => `${String(value)}%`,
    budget: { steps },
    ...patch,
  };
}

function evaluate(
  source: string,
  scope: BaseScreenMaterialTemplateScope = SCALAR_SCOPE,
  context: BaseScreenMaterialTemplateEnv = env(),
) {
  const parsed = parseBaseScreenMaterialTemplateExpression(source, scope);
  if (!parsed.ok) throw new Error(`parse failed: ${parsed.message}`);
  return evaluateBaseScreenMaterialTemplateExpression(parsed.value, context);
}

describe('template expressions', () => {
  it('evaluates arithmetic, comparison, ternary and the closed function set', () => {
    expect(evaluate('-135 + pct(value, props.min, props.max) * 270')).toBeCloseTo(-21.6);
    expect(evaluate('value >= 40 ? style.color : "none"')).toBe('#e2e8f0');
    expect(evaluate("pick(value, 41, 'a', 42, 'b', 'c')")).toBe('b');
    expect(evaluate('concat(format(value), " / ", round(value / 3, 2))')).toBe('42% / 14');
    expect(evaluate("charAt(format(value), 1) == '2'")).toBe(true);
    expect(evaluate('clamp(value, 0, 10) + size.width')).toBe(230);
    expect(evaluate("maxOf(rows, 'amount') - minOf(rows, 'amount')", ROWS_SCOPE)).toBe(27);
    expect(evaluate('row.name', ROWS_SCOPE)).toBe('二号线');
    expect(evaluate('index / max(count - 1, 1)', ROWS_SCOPE)).toBe(0.5);
  });

  it.each([
    ['props.secret', '不是规格里声明的'],
    ['style.color.length', '引用只能有一层'],
    ['constructor', '不认识的名字'],
    ['value.constructor', 'value 后面不能再接字段'],
    ['fetch(value)', '不支持函数'],
    ['eval("1")', '不支持函数'],
    ['row.name', 'row 只能用在遍历 rows 的 repeat 里'],
    ['rows', 'rows 只能交给'],
    ["'a\\'b'", '不支持转义'],
    ['value[0]', '不认识的符号'],
    ['value = 1', '不认识的符号'],
    ['`x`', '不认识的符号'],
  ])('rejects %s', (source, message) => {
    const parsed = parseBaseScreenMaterialTemplateExpression(source, SCALAR_SCOPE);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? '' : parsed.message).toContain(message);
  });

  it('enforces source length, depth and node limits at parse time', () => {
    const limits = BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS;
    expect(
      parseBaseScreenMaterialTemplateExpression(
        '1+'.repeat(limits.sourceLength) + '1',
        SCALAR_SCOPE,
      ).ok,
    ).toBe(false);
    const deep = `${'abs('.repeat(limits.depth + 2)}1${')'.repeat(limits.depth + 2)}`;
    expect(parseBaseScreenMaterialTemplateExpression(deep, SCALAR_SCOPE).ok).toBe(false);
    const wide = Array.from({ length: limits.nodes + 1 }, () => '1').join('+');
    expect(parseBaseScreenMaterialTemplateExpression(wide, SCALAR_SCOPE).ok).toBe(false);
  });

  it('throws the budget error when a render runs out of steps', () => {
    const parsed = parseBaseScreenMaterialTemplateExpression("sumOf(rows, 'amount')", ROWS_SCOPE);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(() =>
      evaluateBaseScreenMaterialTemplateExpression(parsed.value, env({}, 2)),
    ).toThrowError(BaseScreenMaterialTemplateBudgetError);
  });

  it('caps concat output', () => {
    const long = evaluate(
      `concat(${Array.from({ length: 8 }, () => `'${'x'.repeat(40)}'`).join(', ')})`,
    );
    expect(String(long)).toHaveLength(BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.concatLength);
  });

  it('never reads inherited properties of host data', () => {
    const scope = { ...ROWS_SCOPE, roles: new Set(['constructor', 'toString']) };
    expect(evaluate('row.constructor', scope)).toBeNull();
    expect(evaluate("concat(row.toString, 'x')", scope)).toBe('x');
  });
});

// ———————————————————————————— 模糊测试 ————————————————————————————

/** mulberry32：确定性伪随机，种子固定即可复现。 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const HOSTILE_TOKENS = [
  'value',
  'row',
  'rows',
  'index',
  'count',
  'props',
  'style',
  'size',
  'width',
  'height',
  '.',
  'min',
  'max',
  'limit',
  'color',
  'name',
  'amount',
  'showLabel',
  'fontSize',
  'constructor',
  '__proto__',
  'prototype',
  'toString',
  'valueOf',
  'globalThis',
  'window',
  'document',
  'this',
  'eval',
  'Function',
  'fetch',
  'import',
  'require',
  'process',
  'new',
  '(',
  ')',
  ',',
  '+',
  '-',
  '*',
  '/',
  '%',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
  '!',
  '?',
  ':',
  '[',
  ']',
  '{',
  '}',
  '=',
  '=>',
  ';',
  '`',
  '\\',
  '$',
  '#',
  '@',
  "'a'",
  '"b"',
  "''",
  "'",
  '0',
  '1',
  '-1',
  '1e309',
  '.5',
  '9007199254740993',
  'NaN',
  'Infinity',
  ...BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS,
];

function hostileSource(next: () => number): string {
  const length = 1 + Math.floor(next() * 14);
  const parts: string[] = [];
  for (let at = 0; at < length; at += 1) {
    parts.push(HOSTILE_TOKENS[Math.floor(next() * HOSTILE_TOKENS.length)] as string);
  }
  return parts.join(next() < 0.5 ? ' ' : '');
}

/** 闭集函数的合法参数个数（聚合函数另行生成）。 */
const ARITY: Readonly<Record<string, readonly number[]>> = {
  min: [2, 3],
  max: [2, 3],
  clamp: [3],
  abs: [1],
  round: [1, 2],
  floor: [1],
  ceil: [1],
  sqrt: [1],
  sin: [1],
  cos: [1],
  scale: [5],
  pct: [1, 2, 3],
  format: [1],
  fixed: [2],
  concat: [1, 2, 3],
  pick: [4, 6],
  len: [1],
  charAt: [2],
};

/** 按语法生成大体合法的表达式：只用声明过的引用与闭集函数，参数个数随机（可能不合法）。 */
function grammarSource(
  next: () => number,
  scope: BaseScreenMaterialTemplateScope,
  depth = 0,
): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T;
  const leaves = [
    ...(scope.data === 'scalar' ? ['value'] : []),
    ...(scope.inRowRepeat ? [...scope.roles].map((role) => `row.${role}`) : []),
    ...(scope.inRepeat ? ['index', 'count'] : []),
    ...[...scope.props].map((key) => `props.${key}`),
    ...[...scope.style].map((key) => `style.${key}`),
    'size.width',
    String(Math.round(next() * 200 - 100)),
    `'${pick(['a', '', '12', '#fff'])}'`,
  ];
  if (depth > 4 || next() < 0.3) return pick(leaves);
  const roll = next();
  if (roll < 0.35) {
    return `(${grammarSource(next, scope, depth + 1)} ${pick(['+', '-', '*', '/', '%', '==', '<', '>=', '&&', '||'])} ${grammarSource(next, scope, depth + 1)})`;
  }
  if (roll < 0.45) {
    return `(${grammarSource(next, scope, depth + 1)} ? ${grammarSource(next, scope, depth + 1)} : ${grammarSource(next, scope, depth + 1)})`;
  }
  if (roll < 0.5) return `${pick(['-', '!'])}${grammarSource(next, scope, depth + 1)}`;
  if (scope.data === 'rows' && roll < 0.55) {
    return `${pick(['maxOf', 'minOf', 'sumOf'])}(rows, '${pick([...scope.roles])}')`;
  }
  const fn = pick(Object.keys(ARITY));
  const counts = ARITY[fn] as readonly number[];
  const count = pick(counts);
  return `${fn}(${Array.from({ length: count }, () => grammarSource(next, scope, depth + 1)).join(', ')})`;
}

/** AST 里所有带键的引用都必须落在声明集合里（解析期白名单的不变式）。 */
function refsAreDeclared(
  expression: BaseScreenMaterialTemplateExpression,
  scope: BaseScreenMaterialTemplateScope,
): boolean {
  switch (expression.k) {
    case 'lit':
      return true;
    case 'ref':
      if (expression.root === 'props') return scope.props.has(expression.key ?? '');
      if (expression.root === 'style') return scope.style.has(expression.key ?? '');
      if (expression.root === 'row') return scope.roles.has(expression.key ?? '');
      if (expression.root === 'size') return ['width', 'height'].includes(expression.key ?? '');
      return expression.key === undefined;
    case 'un':
      return refsAreDeclared(expression.a, scope);
    case 'bin':
      return refsAreDeclared(expression.a, scope) && refsAreDeclared(expression.b, scope);
    case 'cond':
      return [expression.t, expression.a, expression.b].every((item) =>
        refsAreDeclared(item, scope),
      );
    case 'call':
      return (
        BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS.includes(expression.fn) &&
        expression.args.every((item) => refsAreDeclared(item, scope))
      );
  }
}

function fuzz(
  label: string,
  scope: BaseScreenMaterialTemplateScope,
  generate: (next: () => number) => string,
  seeds: readonly number[],
  runs: number,
): { parsed: number; evaluated: number } {
  let parsed = 0;
  let evaluated = 0;
  for (const seed of seeds) {
    const next = random(seed);
    for (let run = 0; run < runs; run += 1) {
      const source = generate(next);
      const where = `${label} seed=${seed} run=${run} source=${JSON.stringify(source)}`;
      let result: ReturnType<typeof parseBaseScreenMaterialTemplateExpression>;
      try {
        result = parseBaseScreenMaterialTemplateExpression(source, scope);
      } catch (error) {
        throw new Error(`parser threw (${String(error)}): ${where}`);
      }
      if (!result.ok) {
        expect(typeof result.message, where).toBe('string');
        continue;
      }
      parsed += 1;
      expect(refsAreDeclared(result.value, scope), where).toBe(true);
      const context = env(scope.data === 'rows' ? { value: null } : {});
      let value: unknown;
      try {
        value = evaluateBaseScreenMaterialTemplateExpression(result.value, context);
      } catch (error) {
        if (error instanceof BaseScreenMaterialTemplateBudgetError) continue;
        throw new Error(`evaluator threw (${String(error)}): ${where}`);
      }
      evaluated += 1;
      expect(value === null || ['number', 'string', 'boolean'].includes(typeof value), where).toBe(
        true,
      );
      if (typeof value === 'string') {
        expect(value.length, where).toBeLessThanOrEqual(
          Math.max(
            BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.concatLength,
            BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.sourceLength,
          ),
        );
      }
      expect(context.budget.steps, where).toBeGreaterThanOrEqual(0);
      // 同一输入两次求值结果相同（无隐藏状态）。
      const again = evaluateBaseScreenMaterialTemplateExpression(
        result.value,
        env(scope.data === 'rows' ? { value: null } : {}),
      );
      expect(Object.is(again, value), where).toBe(true);
    }
  }
  return { parsed, evaluated };
}

describe('template expression fuzzing (ADR-0116 §7)', () => {
  const SEEDS = [1, 7, 42, 2026, 0xbeef];

  it('covers every closed-set function in the generator', () => {
    expect([...Object.keys(ARITY), 'maxOf', 'minOf', 'sumOf'].sort()).toEqual(
      [...BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS].sort(),
    );
  });

  it('never throws on hostile token soup and keeps the reference whitelist', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    fuzz('hostile/scalar', SCALAR_SCOPE, hostileSource, SEEDS, 800);
    fuzz('hostile/rows', ROWS_SCOPE, hostileSource, SEEDS, 800);
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('evaluates grammar-shaped expressions to scalars within the step budget', () => {
    const scalar = fuzz(
      'grammar/scalar',
      SCALAR_SCOPE,
      (next) => grammarSource(next, SCALAR_SCOPE),
      SEEDS,
      400,
    );
    const rows = fuzz(
      'grammar/rows',
      ROWS_SCOPE,
      (next) => grammarSource(next, ROWS_SCOPE),
      SEEDS,
      400,
    );
    // 生成器要真的走到求值器，否则这组测试只是在测解析失败。
    expect(scalar.evaluated).toBeGreaterThan(200);
    expect(rows.evaluated).toBeGreaterThan(200);
  });
});
