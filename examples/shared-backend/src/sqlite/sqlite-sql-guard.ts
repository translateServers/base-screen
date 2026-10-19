/**
 * SQL 词法守卫：单语句 / 只读 / 命名参数校验（PRD §8.6 S1–S2、§4.3）。
 *
 * **为什么不用驱动来拦**（架构 §0.2 实验 2 的实测）：`node:sqlite` 对
 * `prepare('SELECT 1; DROP TABLE devices')` **成功**并且只执行第一条，静默吞掉写语句；
 * `better-sqlite3` 会拦，但「换驱动就换行为」，不能作为唯一防线。因此这里是一个
 * **纯函数状态机**（无 fs、无驱动、无 Nest 依赖），可以逐条单测。
 *
 * 实现方式：先把「字符串字面量 / 引号标识符 / 注释」里的字符**逐位替换成空格**（长度不变），
 * 再在掩码串上做分号、首 token、关键字、参数名分析。这样：
 * - `SELECT ';' AS x` 里的 `;` 不是分隔符；
 * - `SELECT 1 -- ; DROP` 里的 `;` 与 `DROP` 都被注释掉；
 * - `WHERE name = 'delete'` 里的 `delete` 不会被误判成写语句。
 *
 * 纵深防御：即便这里被绕过，连接本身以 `readOnly: true` 打开，SQLite 会拒绝一切写操作
 * （A20 的「文件 SHA-256 与 mtime 不变」由驱动保证）。
 */

export type SqlGuardErrorCode =
  | 'READONLY_VIOLATION'
  | 'MULTI_STATEMENT'
  | 'UNDECLARED_PARAMETER'
  | 'INVALID_SHAPE';

export interface SqlGuardRequest {
  readonly sql: string;
  /** 已声明的参数名（不含冒号）。未传等价于「一个都没声明」。 */
  readonly declaredParams?: readonly string[];
}

export interface SqlGuardSuccess {
  readonly ok: true;
  /** 交给驱动执行的语句（去掉首尾空白与结尾单个 `;`）。 */
  readonly statement: string;
  /** SQL 里实际用到的参数名，去重、保持出现顺序。 */
  readonly params: readonly string[];
}

export interface SqlGuardFailure {
  readonly ok: false;
  readonly code: SqlGuardErrorCode;
  readonly message: string;
}

export type SqlGuardResult = SqlGuardSuccess | SqlGuardFailure;

/** 面向用户的中文文案（错误码 → 文案的唯一来源）。 */
export const SQL_GUARD_MESSAGES = {
  readonly: '数据源只允许读取。请使用 SELECT 查询；写操作请在数据库客户端里执行。',
  multiStatement: '只允许一条语句，请删除 `;` 之后的内容。',
  unclosedComment: 'SQL 中的 `/*` 注释未闭合。',
  unclosedQuote: 'SQL 中的引号未闭合。',
  empty: '请填写 SQL 语句。',
  unsupportedParameter: '参数只支持 `:name` 写法，不支持 `?`、`$name`、`@name`。',
} as const;

/** 未声明参数的用户文案。 */
export function undeclaredParameterMessage(name: string): string {
  return `SQL 使用了未声明的参数 \`:${name}\`，请先在参数区声明。`;
}

/**
 * 只读关键字黑名单（`normal` 态的整词 token，大小写不敏感）。
 *
 * 覆盖 PRD S1 列举的全部；`WITH … DELETE/UPDATE/INSERT` 因为 `WITH` 之后仍会命中
 * `DELETE`/`UPDATE`/`INSERT` 而被拒。`REPLACE` 有例外：紧跟 `(` 时是字符串函数
 * （`replace(a, b, c)`），放行。
 */
const READONLY_KEYWORDS: ReadonlySet<string> = new Set([
  'INSERT',
  'UPDATE',
  'DELETE',
  'REPLACE',
  'CREATE',
  'DROP',
  'ALTER',
  'VACUUM',
  'REINDEX',
  'ATTACH',
  'DETACH',
  'PRAGMA',
  'TRANSACTION',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
]);

const KEYWORD_PATTERN = /[A-Za-z_][A-Za-z0-9_$]*/g;
const PARAM_PATTERN = /:([A-Za-z_][A-Za-z0-9_]*)/g;
/** 位置参数与其它命名风格一律拒绝（减少拼接歧义，PRD §8.5）。 */
const UNSUPPORTED_PARAM_PATTERN = /\?|[$@][A-Za-z_]/;

type MaskState =
  | 'normal'
  | 'single'
  | 'double'
  | 'backtick'
  | 'bracket'
  | 'lineComment'
  | 'blockComment';

interface MaskSuccess {
  readonly ok: true;
  readonly masked: string;
}

/**
 * 分析一条 SQL：是否单语句、是否只读、参数是否都已声明。
 *
 * 纯函数：同样的输入永远得到同样的结论，不读环境、不碰文件。
 */
export function inspectSql(request: SqlGuardRequest): SqlGuardResult {
  const sql = request.sql ?? '';
  const masked = maskSql(sql);
  if (masked.ok === false) return masked;
  const text = masked.masked;

  const segments = text.split(';');
  // 分号个数 = 段数 - 1；只有在 normal 态的分号才会进掩码串，字面量/注释内的分号已被抹掉。
  const semicolonCount = segments.length - 1;
  if (semicolonCount > 1) return failure('MULTI_STATEMENT', SQL_GUARD_MESSAGES.multiStatement);
  const head = segments[0] ?? '';
  const tail = segments[1] ?? '';
  if (semicolonCount === 1 && tail.trim() !== '') {
    return failure('MULTI_STATEMENT', SQL_GUARD_MESSAGES.multiStatement);
  }

  const trimmedHead = head.trim();
  if (trimmedHead === '') return failure('INVALID_SHAPE', SQL_GUARD_MESSAGES.empty);

  const firstToken = readFirstToken(trimmedHead);
  if (firstToken === null) return failure('READONLY_VIOLATION', SQL_GUARD_MESSAGES.readonly);
  if (firstToken !== 'SELECT' && firstToken !== 'WITH') {
    return failure('READONLY_VIOLATION', SQL_GUARD_MESSAGES.readonly);
  }

  if (findForbiddenKeyword(trimmedHead) !== null) {
    return failure('READONLY_VIOLATION', SQL_GUARD_MESSAGES.readonly);
  }

  if (UNSUPPORTED_PARAM_PATTERN.test(trimmedHead)) {
    return failure('UNDECLARED_PARAMETER', SQL_GUARD_MESSAGES.unsupportedParameter);
  }

  const declared = new Set(request.declaredParams ?? []);
  const usedParams: string[] = [];
  for (const match of trimmedHead.matchAll(PARAM_PATTERN)) {
    const name = match[1];
    if (name === undefined) continue;
    if (usedParams.includes(name)) continue;
    usedParams.push(name);
    if (declared.has(name) === false) {
      return failure('UNDECLARED_PARAMETER', undeclaredParameterMessage(name));
    }
  }

  return { ok: true, statement: statementForExecution(sql, text), params: usedParams };
}

/** 逐个字符扫描，把字面量/注释替换成空格（长度不变，因此掩码串与原文可逐位对齐）。 */
function maskSql(sql: string): MaskSuccess | SqlGuardFailure {
  const chars = sql.split('');
  let state: MaskState = 'normal';
  let index = 0;
  while (index < sql.length) {
    const current = sql.charAt(index);
    const next = sql.charAt(index + 1);
    if (state === 'normal') {
      if (current === "'") {
        chars[index] = ' ';
        state = 'single';
        index += 1;
      } else if (current === '"') {
        chars[index] = ' ';
        state = 'double';
        index += 1;
      } else if (current === '`') {
        chars[index] = ' ';
        state = 'backtick';
        index += 1;
      } else if (current === '[') {
        chars[index] = ' ';
        state = 'bracket';
        index += 1;
      } else if (current === '-' && next === '-') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        state = 'lineComment';
        index += 2;
      } else if (current === '/' && next === '*') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        state = 'blockComment';
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    chars[index] = ' ';
    if (state === 'single') {
      // SQL 的转义是两个连续引号；把它当"仍在字面量内"而不是结束
      if (current === "'" && next === "'") {
        chars[index + 1] = ' ';
        index += 2;
      } else if (current === "'") {
        state = 'normal';
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === 'double') {
      if (current === '"' && next === '"') {
        chars[index + 1] = ' ';
        index += 2;
      } else if (current === '"') {
        state = 'normal';
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }
    if (state === 'backtick') {
      if (current === '`') state = 'normal';
      index += 1;
      continue;
    }
    if (state === 'bracket') {
      if (current === ']') state = 'normal';
      index += 1;
      continue;
    }
    if (state === 'lineComment') {
      if (current === '\n') state = 'normal';
      index += 1;
      continue;
    }
    // blockComment
    if (current === '*' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      state = 'normal';
      index += 2;
    } else {
      index += 1;
    }
  }
  if (state === 'blockComment') {
    return failure('INVALID_SHAPE', SQL_GUARD_MESSAGES.unclosedComment);
  }
  if (state === 'single' || state === 'double' || state === 'backtick' || state === 'bracket') {
    return failure('INVALID_SHAPE', SQL_GUARD_MESSAGES.unclosedQuote);
  }
  return { ok: true, masked: chars.join('') };
}

/** 首个 token（跳过空白与前导括号）；不是标识符开头（如 `1 + 1`）时返回 null。 */
function readFirstToken(text: string): string | null {
  let index = 0;
  while (index < text.length) {
    const current = text.charAt(index);
    if (current === '(' || /\s/.test(current)) {
      index += 1;
      continue;
    }
    break;
  }
  const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index));
  return match === null ? null : (match[0] ?? '').toUpperCase();
}

/** 返回命中的第一个只读黑名单关键字（大写），没有则 null。 */
function findForbiddenKeyword(text: string): string | null {
  for (const match of text.matchAll(KEYWORD_PATTERN)) {
    const token = match[0].toUpperCase();
    if (READONLY_KEYWORDS.has(token) === false) continue;
    const tokenEnd = (match.index ?? 0) + match[0].length;
    // `replace(a, b, c)` 是常用字符串函数，不是写语句
    if (token === 'REPLACE' && nextSignificantChar(text, tokenEnd) === '(') continue;
    return token;
  }
  return null;
}

function nextSignificantChar(text: string, from: number): string {
  let index = from;
  while (index < text.length) {
    const current = text.charAt(index);
    if (/\s/.test(current) === false) return current;
    index += 1;
  }
  return '';
}

/**
 * 交给驱动的语句：去掉首尾空白与**结尾单个** `;`。
 *
 * 只在掩码串的最后一个有效字符是 `;` 时才切原文的最后一个字符（两者等长且逐位对齐），
 * 避免把 `SELECT 1 -- ;` 里注释中的分号当成语句分隔符来切。
 */
function statementForExecution(sql: string, masked: string): string {
  const trimmedSql = sql.trim();
  const trimmedMasked = masked.trim();
  if (trimmedMasked.endsWith(';')) return trimmedSql.slice(0, -1).trim();
  return trimmedSql;
}

function failure(code: SqlGuardErrorCode, message: string): SqlGuardFailure {
  return { ok: false, code, message };
}
