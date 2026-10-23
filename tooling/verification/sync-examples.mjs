#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const USAGE = `用法：node tooling/verification/sync-examples.mjs [选项]

默认执行（快速同步）：
  1. pnpm build                 重建 workspace 包与示例产物
  2. 四端 typecheck             shared-backend / vanilla / react / vue
  3. tests/examples 根级单测

选项：
  --skip-build   跳过构建（迭代时用；需要已有 dist 声明）
  --with-smoke   额外执行 pnpm verify:examples（三端浏览器冒烟，分钟级）
  -h, --help     显示本帮助
`;

let options;
try {
  ({ values: options } = parseArgs({
    options: {
      'skip-build': { type: 'boolean', default: false },
      'with-smoke': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  }));
} catch (error) {
  console.error(`参数错误：${error instanceof Error ? error.message : String(error)}`);
  console.error(USAGE);
  process.exit(2);
}

if (options.help) {
  console.log(USAGE);
  process.exit(0);
}

const HOST_PACKAGES = [
  '@base-screen-example/shared-backend',
  '@base-screen-example/vanilla-host',
  '@base-screen-example/react-host',
  '@base-screen-example/vue-host',
];
const shell = process.platform === 'win32';
const completed = [];

function run(label, command, args) {
  console.log(`\n== ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell });
  if (result.error !== undefined) {
    console.error(`\n✖ ${label} 无法启动：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\n✖ ${label} 失败（exit ${result.status ?? 'unknown'}）`);
    process.exit(result.status ?? 1);
  }
  completed.push(label);
}

if (options['with-smoke'] && options['skip-build']) {
  console.warn('⚠ --skip-build 与 --with-smoke 同用：冒烟使用现有产物，缺失时会直接失败。');
}

if (!options['skip-build']) {
  run('构建 workspace 包与示例', 'pnpm', ['build']);
}

for (const packageName of HOST_PACKAGES) {
  run(`typecheck ${packageName}`, 'pnpm', ['--filter', packageName, 'typecheck']);
}

run('根级示例测试', 'pnpm', ['exec', 'vitest', 'run', 'tests/examples']);

if (options['with-smoke']) {
  run('三端浏览器冒烟', 'pnpm', ['verify:examples']);
}

console.log('\n示例同步检查通过');
for (const label of completed) console.log(`  ✓ ${label}`);
if (!options['with-smoke']) {
  console.log('  - 三端浏览器冒烟未运行（默认跳过；需要时加 --with-smoke）');
}
