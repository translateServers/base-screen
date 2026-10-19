import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { DatabaseFileInfo } from './datasource.types';

/**
 * 受管目录与库文件路径守卫（PRD §8.7、S5；架构 D5）。
 *
 * 三层防线，缺一不可：
 * 1. **basename 白名单**：只接受 `^[\w.-]+\.db$`，因此 `../`、绝对路径、盘符、
 *    URL 编码（`..%2Fscreens.db`）在执行层之前就被拒——它们都含 `/`、`\`、`:`、`%`。
 * 2. **realpath 父目录比较**：挡住「受管目录内放一个指向目录外的符号链接」这种
 *    basename 完全合法的绕过。
 * 3. **宿主库黑名单**：`screens.db` / `test.db` / `smoke-*.db` 就躺在 `data/` 下，
 *    一旦受管目录被误配成 `data/` 本身，用户就能把 `Screen` 表（含全部大屏文档）
 *    SELECT 出来。`assertManagedDirIsolated` 在启动时把这个误配变成硬失败。
 *
 * 错误信息一律不含绝对路径（PRD A17 用字符串断言）：只用 basename 与固定中文文案。
 */

/** 受管目录内的合法文件名：只有 basename，只有 `.db`，字符集不含路径分隔符。 */
export const DATABASE_FILE_PATTERN: RegExp = /^[\w.-]+\.db$/;

/** 演示库文件名（`WorkshopSeedService` 生成，`GET /database-files` 会列出来）。 */
export const WORKSHOP_DATABASE_FILE = 'workshop.db';

/**
 * 宿主自己的库文件：即使它们出现在受管目录里也不列、不可选。
 *
 * 这是**纵深防御**而不是主要防线：主要防线是「受管目录必须是 `data/` 的独立子目录」。
 * 两者都要有，因为 `DATASOURCE_DIR` 是环境变量，配错的成本极高。
 */
export const HOST_DATABASE_FILE_NAMES: readonly string[] = [
  'screens.db',
  'test.db',
  'smoke-react.db',
  'smoke-vanilla.db',
  'smoke-vue.db',
];

export type DatabasePathErrorCode = 'PATH_NOT_ALLOWED' | 'INVALID_SHAPE';

export interface DatabasePathFailure {
  readonly ok: false;
  readonly code: DatabasePathErrorCode;
  readonly message: string;
}

export interface DatabasePathSuccess {
  readonly ok: true;
  /** 原始文件名（basename）。 */
  readonly name: string;
  /** 绝对路径——**只在服务端内部使用**，绝不进响应/错误/日志。 */
  readonly absolutePath: string;
}

export type DatabasePathResult = DatabasePathSuccess | DatabasePathFailure;

const PATH_MESSAGES = {
  notAllowed: '只能选择受管目录内的数据库文件。',
  missing: '数据库文件不存在，请刷新文件列表后重试。',
  notAFile: '所选路径不是一个数据库文件。',
} as const;

/**
 * 受管目录的绝对路径。
 *
 * 默认 `<pkg>/data/datasources`（`__dirname` 在 `src/datasources` 与 `dist/datasources`
 * 下都指向包内的同名目录，因此 dev / build / ts-jest 三种运行方式一致）。
 * `DATASOURCE_DIR` 可覆盖，便于测试隔离。
 */
export function managedDatasourceDir(): string {
  const configured = process.env.DATASOURCE_DIR;
  if (typeof configured === 'string' && configured.trim() !== '') return resolve(configured.trim());
  return resolve(__dirname, '..', '..', 'data', 'datasources');
}

/** 宿主 Prisma 库所在目录（`<pkg>/data`）。 */
export function hostDataDir(): string {
  return resolve(__dirname, '..', '..', 'data');
}

/**
 * 启动断言：受管目录不能是宿主 `data/` 本身（F10）。
 *
 * 故意**抛错而不是 warn**：这不是配置偏好，而是「把宿主库暴露成可选数据源」的安全
 * 缺陷；带病启动会让用户在大屏里看到 `Screen` 表。失败关闭（fail fast）比降级正确。
 */
export function assertManagedDirIsolated(directory: string = managedDatasourceDir()): void {
  const isolated = resolve(directory);
  if (samePath(isolated, hostDataDir())) {
    throw new Error(
      '受管数据源目录不能是宿主 data/ 目录本身（那会把 screens.db 等宿主库暴露成可选数据源）。',
    );
  }
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => {
    const resolved = resolve(value).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function isHostDatabase(fileName: string): boolean {
  const lowered = fileName.toLowerCase();
  return HOST_DATABASE_FILE_NAMES.some((name) => name === lowered);
}

/**
 * 把「用户提交的文件名」解析成可安全打开的绝对路径。
 *
 * 顺序很重要：先做纯字符串的白名单判断（`PATH_NOT_ALLOWED`），再做文件系统检查
 * （`INVALID_SHAPE`）。这样 `../screens.db` 永远不会走到 `existsSync`。
 */
export function resolveDatabaseFile(
  name: string,
  directory: string = managedDatasourceDir(),
): DatabasePathResult {
  const raw = typeof name === 'string' ? name.trim() : '';
  if (raw === '' || raw !== basename(raw) || DATABASE_FILE_PATTERN.test(raw) === false) {
    return { ok: false, code: 'PATH_NOT_ALLOWED', message: PATH_MESSAGES.notAllowed };
  }
  if (isHostDatabase(raw)) {
    return { ok: false, code: 'PATH_NOT_ALLOWED', message: PATH_MESSAGES.notAllowed };
  }
  const candidate = join(resolve(directory), raw);
  if (existsSync(candidate) === false) {
    return { ok: false, code: 'INVALID_SHAPE', message: PATH_MESSAGES.missing };
  }
  let realCandidate: string;
  let realDirectory: string;
  try {
    realCandidate = realpathSync(candidate);
    realDirectory = realpathSync(resolve(directory));
  } catch {
    return { ok: false, code: 'PATH_NOT_ALLOWED', message: PATH_MESSAGES.notAllowed };
  }
  // 符号链接可以做到"basename 合法、实体在目录外"，父目录比较是唯一可靠的判定
  if (samePath(dirname(realCandidate), realDirectory) === false) {
    return { ok: false, code: 'PATH_NOT_ALLOWED', message: PATH_MESSAGES.notAllowed };
  }
  try {
    if (statSync(realCandidate).isFile() === false) {
      return { ok: false, code: 'INVALID_SHAPE', message: PATH_MESSAGES.notAFile };
    }
  } catch {
    return { ok: false, code: 'INVALID_SHAPE', message: PATH_MESSAGES.notAFile };
  }
  return { ok: true, name: raw, absolutePath: realCandidate };
}

/**
 * 枚举受管目录内的库文件（只给文件名，不给目录）。
 *
 * 目录不存在时返回空数组而不是抛错：受管目录由 `onModuleInit` 创建，空态文案由管理页
 * 兜底（「受管目录内没有可用的 .db 文件……请重启后端」）。
 */
export function listDatabaseFiles(
  directory: string = managedDatasourceDir(),
): readonly DatabaseFileInfo[] {
  const target = resolve(directory);
  if (existsSync(target) === false) return [];
  let entries: readonly string[];
  try {
    entries = readdirSync(target);
  } catch {
    return [];
  }
  const files: DatabaseFileInfo[] = [];
  for (const entry of entries) {
    if (DATABASE_FILE_PATTERN.test(entry) === false) continue;
    if (isHostDatabase(entry)) continue;
    try {
      const stats = statSync(join(target, entry));
      if (stats.isFile() === false) continue;
      files.push({
        name: entry,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
    } catch {
      // 单个文件读不到（权限/竞态）不应让整份列表失败
      continue;
    }
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}
