import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * 在测试进程外把迁移应用到 e2e 专用库。
 *
 * 用 `pnpm exec prisma` 而不是拼 node 入口路径：Prisma 的 CLI 产物位置随版本变化，
 * 走包管理器解析更稳。DATABASE_URL 以子进程环境变量显式传入，优先级高于 .env
 * （dotenv 不覆盖已存在的环境变量），因此不会碰到开发库。
 *
 * **为什么还要三个附加库**：数据源用例会建/删 `DataSource` 行，而 `app.e2e-spec.ts`
 * 断言「目录恰好 4 条内置」（`items.length === 4`）。jest 默认并行跑测试文件，共用
 * `test.db` 会让那条断言偶发看到别人的 ready 行——所以每个写库的 spec 用独立文件。
 * 迁移只在 globalSetup 里跑一次（早于所有 worker），避免各 spec 各跑一遍 CLI。
 */
const TEST_DATABASE_URL = 'file:../data/test.db';

/** 与 `test.db` 隔离的附加库（各自对应一个 spec 文件，见文件头）。 */
const ISOLATED_DATABASE_URLS: readonly string[] = [
  'file:../data/test.ds-service.db',
  'file:../data/test.ds-api.db',
  'file:../data/test.ds-catalog.db',
];

export default function globalSetup(): void {
  const packageRoot = resolve(__dirname, '..');
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  for (const databaseUrl of [TEST_DATABASE_URL, ...ISOLATED_DATABASE_URLS]) {
    execFileSync(executable, ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
  }
}
