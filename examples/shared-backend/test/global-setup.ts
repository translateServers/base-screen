import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * 在测试进程外把迁移应用到 e2e 专用库。
 *
 * 用 `pnpm exec prisma` 而不是拼 node 入口路径：Prisma 的 CLI 产物位置随版本变化，
 * 走包管理器解析更稳。DATABASE_URL 以子进程环境变量显式传入，优先级高于 .env
 * （dotenv 不覆盖已存在的环境变量），因此不会碰到开发库。
 */
const TEST_DATABASE_URL = 'file:../data/test.db';

export default function globalSetup(): void {
  const packageRoot = resolve(__dirname, '..');
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  execFileSync(executable, ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}
