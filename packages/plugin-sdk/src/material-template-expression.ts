import type { ScreenJsonObject, ScreenJsonValue } from '@base-screen/contracts';

/**
 * L2 物料模板的绑定表达式（base-screen-docs ADR-0116 §2.3）。
 *
 * 设计取舍（调研：借鉴 CEL「非图灵完备、只读宿主数据」，不用它的实现）：
 * - 先解析成 AST，再逐节点求值；**不用 eval / Function，也不对任何对象做属性查找**——引用只能命中
 *   固定的白名单根（`value`、`row.<角色>`、`props.<键>`、`style.<键>`、`size.width` …），
 *   解析期就对照规格声明的字段与角色检查，未声明的一律拒绝；
 * - 运算只有算术、比较、逻辑、三元；函数是闭集；没有循环、递归、赋值、字符串索引、正则；
 * - `+` 只做数值加法，字符串拼接只能用 `concat()`，避免数据在任意位置被拼成属性串；
 * - 资源上限：源码长度、AST 深度与节点数在解析期卡住；一次渲染的总求值步数由调用方的预算卡住，
 *   超限即抛错，由物料骨架把这一个组件换成错误视图。
 */

export type BaseScreenMaterialTemplateRefRoot =
  | 'value'
  | 'index'
  | 'count'
  | 'rows'
  | 'row'
  | 'props'
  | 'style'
  | 'size';

export type BaseScreenMaterialTemplateBinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '=='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | '&&'
  | '||';

export type BaseScreenMaterialTemplateExpression =
  | { readonly k: 'lit'; readonly v: number | string | boolean | null }
  | {
      readonly k: 'ref';
      readonly root: BaseScreenMaterialTemplateRefRoot;
      readonly key?: string;
    }
  | { readonly k: 'un'; readonly op: '-' | '!'; readonly a: BaseScreenMaterialTemplateExpression }
  | {
      readonly k: 'bin';
      readonly op: BaseScreenMaterialTemplateBinaryOperator;
      readonly a: BaseScreenMaterialTemplateExpression;
      readonly b: BaseScreenMaterialTemplateExpression;
    }
  | {
      readonly k: 'cond';
      readonly t: BaseScreenMaterialTemplateExpression;
      readonly a: BaseScreenMaterialTemplateExpression;
      readonly b: BaseScreenMaterialTemplateExpression;
    }
  | {
      readonly k: 'call';
      readonly fn: string;
      readonly args: readonly BaseScreenMaterialTemplateExpression[];
    };

/** 解析期的引用范围：哪些字段、角色可用，当前是否在 `repeat` 里。 */
export interface BaseScreenMaterialTemplateScope {
  readonly props: ReadonlySet<string>;
  readonly style: ReadonlySet<string>;
  readonly roles: ReadonlySet<string>;
  readonly data: 'none' | 'scalar' | 'rows';
  /** 在 `repeat` 里：`index` / `count` 可用。 */
  readonly inRepeat: boolean;
  /** 在遍历 `rows` 的 `repeat` 里：`row.<角色>` 可用。 */
  readonly inRowRepeat: boolean;
}

export type BaseScreenMaterialTemplateScalar = number | string | boolean | null;

export interface BaseScreenMaterialTemplateEnv {
  readonly value: number | string | null;
  readonly rows: readonly Readonly<Record<string, ScreenJsonValue>>[];
  readonly row?: Readonly<Record<string, ScreenJsonValue>>;
  readonly index?: number;
  readonly count?: number;
  readonly props: ScreenJsonObject;
  readonly style: ScreenJsonObject;
  readonly size: { readonly width: number; readonly height: number };
  formatNumber(value: unknown): string;
  /** 本次渲染剩余的求值步数；用尽即抛错。 */
  readonly budget: { steps: number };
}

export const BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS = {
  sourceLength: 400,
  depth: 16,
  nodes: 64,
  concatLength: 256,
} as const;

/** 一次渲染的求值步数上限（ADR-0116 §2.3）。 */
export const BASE_SCREEN_MATERIAL_TEMPLATE_STEP_BUDGET = 20_000;

interface FunctionSpec {
  readonly min: number;
  readonly max: number;
  /** 首参必须是 `rows`、次参必须是角色名字面量（聚合）。 */
  readonly aggregate?: true;
  /** 参数个数必须是偶数（`pick(key, k1, v1, …, fallback)`）。 */
  readonly even?: true;
}

const FUNCTIONS: Readonly<Record<string, FunctionSpec>> = {
  min: { min: 2, max: 8 },
  max: { min: 2, max: 8 },
  clamp: { min: 3, max: 3 },
  abs: { min: 1, max: 1 },
  round: { min: 1, max: 2 },
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  sin: { min: 1, max: 1 },
  cos: { min: 1, max: 1 },
  scale: { min: 5, max: 5 },
  pct: { min: 1, max: 3 },
  format: { min: 1, max: 1 },
  fixed: { min: 2, max: 2 },
  concat: { min: 1, max: 8 },
  pick: { min: 4, max: 24, even: true },
  len: { min: 1, max: 1 },
  charAt: { min: 2, max: 2 },
  maxOf: { min: 2, max: 2, aggregate: true },
  minOf: { min: 2, max: 2, aggregate: true },
  sumOf: { min: 2, max: 2, aggregate: true },
};

/** 闭集函数名（体检与提示词列出用）。 */
export const BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS: readonly string[] = Object.keys(FUNCTIONS);

type Token =
  | { readonly t: 'num'; readonly v: number }
  | { readonly t: 'str'; readonly v: string }
  | { readonly t: 'id'; readonly v: string }
  | { readonly t: 'op'; readonly v: string }
  | { readonly t: 'end' };

const OPERATORS = [
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '!',
  '?',
  ':',
  '(',
  ')',
  ',',
  '.',
];

function tokenize(source: string): Token[] | string {
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length) {
    const char = source[at] as string;
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      at += 1;
      continue;
    }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[at + 1] ?? ''))) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(at));
      if (match === null) return `第 ${at + 1} 个字符不是合法的数字。`;
      tokens.push({ t: 'num', v: Number(match[0]) });
      at += match[0].length;
      continue;
    }
    if (char === "'" || char === '"') {
      let end = at + 1;
      let text = '';
      while (end < source.length && source[end] !== char) {
        if (source[end] === '\\') return '字符串里不支持转义。';
        text += source[end];
        end += 1;
      }
      if (end >= source.length) return '字符串缺少结束引号。';
      tokens.push({ t: 'str', v: text });
      at = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(at)) as RegExpExecArray;
      tokens.push({ t: 'id', v: match[0] });
      at += match[0].length;
      continue;
    }
    const op = OPERATORS.find((item) => source.startsWith(item, at));
    if (op === undefined) return `不认识的符号「${char}」。`;
    tokens.push({ t: 'op', v: op });
    at += op.length;
  }
  tokens.push({ t: 'end' });
  return tokens;
}

class ParseError extends Error {}

const BINARY_PRECEDENCE: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

class Parser {
  #at = 0;
  #nodes = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly scope: BaseScreenMaterialTemplateScope,
  ) {}

  parse(): BaseScreenMaterialTemplateExpression {
    const expression = this.#ternary(0);
    if (this.#peek().t !== 'end') throw new ParseError('表达式结尾有多余内容。');
    return expression;
  }

  #peek(): Token {
    return this.tokens[this.#at] as Token;
  }

  #next(): Token {
    const token = this.tokens[this.#at] as Token;
    this.#at += 1;
    return token;
  }

  #isOp(value: string): boolean {
    const token = this.#peek();
    return token.t === 'op' && token.v === value;
  }

  #expect(value: string): void {
    if (!this.#isOp(value)) throw new ParseError(`缺少「${value}」。`);
    this.#at += 1;
  }

  #node<T extends BaseScreenMaterialTemplateExpression>(node: T, depth: number): T {
    this.#nodes += 1;
    if (this.#nodes > BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.nodes) {
      throw new ParseError(
        `表达式过长（最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.nodes} 个节点）。`,
      );
    }
    if (depth > BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.depth) {
      throw new ParseError(
        `表达式嵌套过深（最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.depth} 层）。`,
      );
    }
    return node;
  }

  #ternary(depth: number): BaseScreenMaterialTemplateExpression {
    const test = this.#binary(1, depth);
    if (!this.#isOp('?')) return test;
    this.#at += 1;
    const a = this.#ternary(depth + 1);
    this.#expect(':');
    const b = this.#ternary(depth + 1);
    return this.#node({ k: 'cond', t: test, a, b }, depth);
  }

  #binary(minPrecedence: number, depth: number): BaseScreenMaterialTemplateExpression {
    let left = this.#unary(depth + 1);
    for (;;) {
      const token = this.#peek();
      if (token.t !== 'op') return left;
      const precedence = BINARY_PRECEDENCE[token.v];
      if (precedence === undefined || precedence < minPrecedence) return left;
      this.#at += 1;
      const right = this.#binary(precedence + 1, depth + 1);
      left = this.#node(
        {
          k: 'bin',
          op: token.v as BaseScreenMaterialTemplateBinaryOperator,
          a: left,
          b: right,
        },
        depth,
      );
    }
  }

  #unary(depth: number): BaseScreenMaterialTemplateExpression {
    if (this.#isOp('-') || this.#isOp('!')) {
      const op = (this.#next() as { v: string }).v as '-' | '!';
      return this.#node({ k: 'un', op, a: this.#unary(depth + 1) }, depth);
    }
    return this.#primary(depth);
  }

  #primary(depth: number): BaseScreenMaterialTemplateExpression {
    const token = this.#next();
    if (token.t === 'num') return this.#node({ k: 'lit', v: token.v }, depth);
    if (token.t === 'str') return this.#node({ k: 'lit', v: token.v }, depth);
    if (token.t === 'op' && token.v === '(') {
      const inner = this.#ternary(depth + 1);
      this.#expect(')');
      return inner;
    }
    if (token.t === 'id') {
      if (token.v === 'true' || token.v === 'false') {
        return this.#node({ k: 'lit', v: token.v === 'true' }, depth);
      }
      if (token.v === 'null') return this.#node({ k: 'lit', v: null }, depth);
      if (this.#isOp('(')) return this.#call(token.v, depth);
      return this.#reference(token.v, depth);
    }
    throw new ParseError('表达式不完整。');
  }

  #call(name: string, depth: number): BaseScreenMaterialTemplateExpression {
    const spec = FUNCTIONS[name];
    if (spec === undefined) {
      throw new ParseError(
        `不支持函数 ${name}（可用：${BASE_SCREEN_MATERIAL_TEMPLATE_FUNCTIONS.join('、')}）。`,
      );
    }
    this.#expect('(');
    const args: BaseScreenMaterialTemplateExpression[] = [];
    if (!this.#isOp(')')) {
      for (;;) {
        if (spec.aggregate === true && args.length === 0) {
          args.push(this.#rowsArgument(name, depth + 1));
        } else {
          args.push(this.#ternary(depth + 1));
        }
        if (!this.#isOp(',')) break;
        this.#at += 1;
      }
    }
    this.#expect(')');
    if (args.length < spec.min || args.length > spec.max) {
      throw new ParseError(
        spec.min === spec.max
          ? `${name} 需要 ${spec.min} 个参数。`
          : `${name} 需要 ${spec.min}–${spec.max} 个参数。`,
      );
    }
    if (spec.even === true && args.length % 2 !== 0) {
      throw new ParseError(`${name} 的参数是「取值, 键1, 值1, …, 缺省值」，个数应为偶数。`);
    }
    if (spec.aggregate === true) {
      const role = args[1];
      if (role?.k !== 'lit' || typeof role.v !== 'string' || !this.scope.roles.has(role.v)) {
        throw new ParseError(`${name} 的第二个参数必须是已声明的数据角色名（用引号写）。`);
      }
    }
    return this.#node({ k: 'call', fn: name, args }, depth);
  }

  #rowsArgument(name: string, depth: number): BaseScreenMaterialTemplateExpression {
    const token = this.#next();
    if (token.t !== 'id' || token.v !== 'rows') {
      throw new ParseError(`${name} 的第一个参数必须是 rows。`);
    }
    if (this.scope.data !== 'rows') throw new ParseError('组件不是多行数据，不能读 rows。');
    return this.#node({ k: 'ref', root: 'rows' }, depth);
  }

  #reference(root: string, depth: number): BaseScreenMaterialTemplateExpression {
    let key: string | undefined;
    if (this.#isOp('.')) {
      this.#at += 1;
      const next = this.#next();
      if (next.t !== 'id') throw new ParseError(`${root}. 后面缺少字段名。`);
      key = next.v;
      if (this.#isOp('.')) throw new ParseError('引用只能有一层（如 props.showLabel）。');
    }
    const scope = this.scope;
    switch (root) {
      case 'value':
        if (key !== undefined) throw new ParseError('value 后面不能再接字段。');
        if (scope.data !== 'scalar') throw new ParseError('组件不是单值数据，不能读 value。');
        return this.#node({ k: 'ref', root: 'value' }, depth);
      case 'index':
      case 'count':
        if (key !== undefined) throw new ParseError(`${root} 后面不能再接字段。`);
        if (!scope.inRepeat) throw new ParseError(`${root} 只能用在 repeat 里。`);
        return this.#node({ k: 'ref', root }, depth);
      case 'rows':
        throw new ParseError('rows 只能交给 maxOf / minOf / sumOf。');
      case 'row':
        if (!scope.inRowRepeat) throw new ParseError('row 只能用在遍历 rows 的 repeat 里。');
        if (key === undefined || !scope.roles.has(key)) {
          throw new ParseError(`row.${key ?? ''} 不是已声明的数据角色。`);
        }
        return this.#node({ k: 'ref', root: 'row', key }, depth);
      case 'props':
      case 'style': {
        const declared = root === 'props' ? scope.props : scope.style;
        if (key === undefined || !declared.has(key)) {
          throw new ParseError(
            `${root}.${key ?? ''} 不是规格里声明的${root === 'props' ? '参数' : '样式'}字段。`,
          );
        }
        return this.#node({ k: 'ref', root, key }, depth);
      }
      case 'size':
        if (key !== 'width' && key !== 'height') throw new ParseError('size 只有 width / height。');
        return this.#node({ k: 'ref', root: 'size', key }, depth);
      default:
        throw new ParseError(
          `不认识的名字 ${root}（可用：value、row.<角色>、index、count、props.<键>、style.<键>、size.width / height）。`,
        );
    }
  }
}

export type BaseScreenMaterialTemplateExpressionResult =
  | { readonly ok: true; readonly value: BaseScreenMaterialTemplateExpression }
  | { readonly ok: false; readonly message: string };

/** 解析一条表达式；失败返回给作者（与模型修复轮）看的中文原因。 */
export function parseBaseScreenMaterialTemplateExpression(
  source: string,
  scope: BaseScreenMaterialTemplateScope,
): BaseScreenMaterialTemplateExpressionResult {
  if (source.length > BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.sourceLength) {
    return {
      ok: false,
      message: `表达式最多 ${BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.sourceLength} 个字符。`,
    };
  }
  const tokens = tokenize(source);
  if (typeof tokens === 'string') return { ok: false, message: tokens };
  try {
    return { ok: true, value: new Parser(tokens, scope).parse() };
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, message: error.message };
    throw error;
  }
}

/** 求值超出步数预算（ADR-0116 §2.3）：调用方让该组件进入错误视图。 */
export class BaseScreenMaterialTemplateBudgetError extends Error {
  constructor() {
    super('模板求值超出步数上限。');
    this.name = 'BaseScreenMaterialTemplateBudgetError';
  }
}

export function evaluateBaseScreenMaterialTemplateExpression(
  expression: BaseScreenMaterialTemplateExpression,
  env: BaseScreenMaterialTemplateEnv,
): BaseScreenMaterialTemplateScalar {
  env.budget.steps -= 1;
  if (env.budget.steps < 0) throw new BaseScreenMaterialTemplateBudgetError();
  switch (expression.k) {
    case 'lit':
      return expression.v;
    case 'ref':
      return readReference(expression.root, expression.key, env);
    case 'un': {
      const value = evaluateBaseScreenMaterialTemplateExpression(expression.a, env);
      return expression.op === '-' ? -toNumber(value) : !truthy(value);
    }
    case 'cond':
      return truthy(evaluateBaseScreenMaterialTemplateExpression(expression.t, env))
        ? evaluateBaseScreenMaterialTemplateExpression(expression.a, env)
        : evaluateBaseScreenMaterialTemplateExpression(expression.b, env);
    case 'bin':
      return evaluateBinary(expression, env);
    case 'call':
      return evaluateCall(expression.fn, expression.args, env);
  }
}

function readReference(
  root: BaseScreenMaterialTemplateRefRoot,
  key: string | undefined,
  env: BaseScreenMaterialTemplateEnv,
): BaseScreenMaterialTemplateScalar {
  switch (root) {
    case 'value':
      return env.value;
    case 'index':
      return env.index ?? null;
    case 'count':
      return env.count ?? null;
    case 'row':
      return scalar(key === undefined ? undefined : env.row?.[key]);
    case 'props':
      return scalar(key === undefined ? undefined : env.props[key]);
    case 'style':
      return scalar(key === undefined ? undefined : env.style[key]);
    case 'size':
      return key === 'height' ? env.size.height : env.size.width;
    case 'rows':
      return null;
  }
}

function evaluateBinary(
  expression: Extract<BaseScreenMaterialTemplateExpression, { k: 'bin' }>,
  env: BaseScreenMaterialTemplateEnv,
): BaseScreenMaterialTemplateScalar {
  if (expression.op === '&&') {
    const left = evaluateBaseScreenMaterialTemplateExpression(expression.a, env);
    return truthy(left) ? evaluateBaseScreenMaterialTemplateExpression(expression.b, env) : left;
  }
  if (expression.op === '||') {
    const left = evaluateBaseScreenMaterialTemplateExpression(expression.a, env);
    return truthy(left) ? left : evaluateBaseScreenMaterialTemplateExpression(expression.b, env);
  }
  const a = evaluateBaseScreenMaterialTemplateExpression(expression.a, env);
  const b = evaluateBaseScreenMaterialTemplateExpression(expression.b, env);
  switch (expression.op) {
    case '==':
      return looseEquals(a, b);
    case '!=':
      return !looseEquals(a, b);
    case '<':
      return toNumber(a) < toNumber(b);
    case '<=':
      return toNumber(a) <= toNumber(b);
    case '>':
      return toNumber(a) > toNumber(b);
    case '>=':
      return toNumber(a) >= toNumber(b);
    case '+':
      return toNumber(a) + toNumber(b);
    case '-':
      return toNumber(a) - toNumber(b);
    case '*':
      return toNumber(a) * toNumber(b);
    case '/':
      return toNumber(a) / toNumber(b);
    case '%':
      return toNumber(a) % toNumber(b);
  }
}

function evaluateCall(
  name: string,
  args: readonly BaseScreenMaterialTemplateExpression[],
  env: BaseScreenMaterialTemplateEnv,
): BaseScreenMaterialTemplateScalar {
  if (name === 'maxOf' || name === 'minOf' || name === 'sumOf') {
    const role = (args[1] as { v: string }).v;
    const numbers = env.rows.map((row) => toNumber(scalar(row[role]))).filter(Number.isFinite);
    env.budget.steps -= env.rows.length;
    if (env.budget.steps < 0) throw new BaseScreenMaterialTemplateBudgetError();
    if (numbers.length === 0) return null;
    if (name === 'sumOf') return numbers.reduce((sum, item) => sum + item, 0);
    return name === 'maxOf' ? Math.max(...numbers) : Math.min(...numbers);
  }
  if (name === 'pick') {
    const key = evaluateBaseScreenMaterialTemplateExpression(
      args[0] as BaseScreenMaterialTemplateExpression,
      env,
    );
    // 参数形如 [取值, 键1, 值1, …, 键n, 值n, 缺省值]：成对的键值位于 1..length-2。
    for (let at = 1; at <= args.length - 3; at += 2) {
      const candidate = evaluateBaseScreenMaterialTemplateExpression(
        args[at] as BaseScreenMaterialTemplateExpression,
        env,
      );
      if (looseEquals(key, candidate)) {
        return evaluateBaseScreenMaterialTemplateExpression(
          args[at + 1] as BaseScreenMaterialTemplateExpression,
          env,
        );
      }
    }
    return evaluateBaseScreenMaterialTemplateExpression(
      args[args.length - 1] as BaseScreenMaterialTemplateExpression,
      env,
    );
  }
  const values = args.map((arg) => evaluateBaseScreenMaterialTemplateExpression(arg, env));
  const n = (index: number): number => toNumber(values[index] ?? null);
  switch (name) {
    case 'min':
      return Math.min(...values.map((value) => toNumber(value)));
    case 'max':
      return Math.max(...values.map((value) => toNumber(value)));
    case 'clamp':
      return Math.min(Math.max(n(0), n(1)), n(2));
    case 'abs':
      return Math.abs(n(0));
    case 'round': {
      const digits = values.length > 1 ? Math.max(0, Math.min(6, Math.trunc(n(1)))) : 0;
      const factor = 10 ** digits;
      return Math.round(n(0) * factor) / factor;
    }
    case 'floor':
      return Math.floor(n(0));
    case 'ceil':
      return Math.ceil(n(0));
    case 'sqrt':
      return Math.sqrt(n(0));
    case 'sin':
      return Math.sin((n(0) * Math.PI) / 180);
    case 'cos':
      return Math.cos((n(0) * Math.PI) / 180);
    case 'scale': {
      const [v, d0, d1, r0, r1] = [n(0), n(1), n(2), n(3), n(4)];
      if (d1 === d0) return r0;
      return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
    }
    case 'pct': {
      const low = values.length > 1 ? n(1) : 0;
      const high = values.length > 2 ? n(2) : 100;
      if (high === low) return 0;
      return Math.min(1, Math.max(0, (n(0) - low) / (high - low)));
    }
    case 'format':
      return env.formatNumber(values[0]);
    case 'fixed': {
      const value = n(0);
      if (!Number.isFinite(value)) return '--';
      return value.toFixed(Math.max(0, Math.min(6, Math.trunc(n(1)))));
    }
    case 'concat':
      return values
        .map((value) => (value === null ? '' : String(value)))
        .join('')
        .slice(0, BASE_SCREEN_MATERIAL_TEMPLATE_EXPRESSION_LIMITS.concatLength);
    case 'len':
      return values[0] === null ? 0 : [...String(values[0])].length;
    case 'charAt': {
      const chars = values[0] === null ? [] : [...String(values[0])];
      return chars[Math.trunc(n(1))] ?? '';
    }
    default:
      return null;
  }
}

function scalar(value: unknown): BaseScreenMaterialTemplateScalar {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

export function toTemplateNumber(value: BaseScreenMaterialTemplateScalar): number {
  return toNumber(value);
}

function toNumber(value: BaseScreenMaterialTemplateScalar): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

export function isTemplateTruthy(value: BaseScreenMaterialTemplateScalar): boolean {
  return truthy(value);
}

function truthy(value: BaseScreenMaterialTemplateScalar): boolean {
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return value !== null && value !== false && value !== '';
}

/** 相等：同类型严格比较；数字与数字字符串按数值比较（数据集里状态码常是字符串）。 */
function looseEquals(
  a: BaseScreenMaterialTemplateScalar,
  b: BaseScreenMaterialTemplateScalar,
): boolean {
  if (typeof a === typeof b) return a === b;
  if (
    (typeof a === 'number' && typeof b === 'string') ||
    (typeof a === 'string' && typeof b === 'number')
  ) {
    return toNumber(a) === toNumber(b);
  }
  return false;
}
