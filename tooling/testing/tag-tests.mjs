#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { PACKAGE_DEFINITIONS } from '../checks/packages.mjs';
import { getRepoRoot, listPackageTestFiles } from '../lib/scope-graph.mjs';
import { DEFAULT_TAG_OUT, writeJsonFile } from '../lib/scope-report.mjs';

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;

const TAG_PATTERN = /\btags\s*:/;

function listRootTestFiles(rootDir) {
  const files = [];
  for (const entry of readdirSync(join(rootDir, 'tests'), { withFileTypes: true })) {
    // 兼容不同 fs 实现：Dirent 或纯文件名字符串。
    const name = typeof entry === 'string' ? entry : entry.name;
    if (name.endsWith('.test.ts')) files.push(name);
  }
  return files.sort();
}

/**
 * 收集仓库全部测试文件（包级 + 根级治理 + examples），repo 相对 posix 路径。
 */
export function collectAllTestFiles(rootDir) {
  const files = [];
  for (const packageDir of Object.keys(PACKAGE_DEFINITIONS)) {
    for (const file of listPackageTestFiles(rootDir, packageDir)) {
      files.push(`packages/${packageDir}/tests/${file}`);
    }
  }
  for (const file of listRootTestFiles(rootDir)) {
    files.push(`tests/${file}`);
  }
  return files.sort();
}

/**
 * 目录启发式（§5.4）：根级 tests/ → governance；默认 unit。
 */
export function suggestTags(repoRelativeFile) {
  if (repoRelativeFile.startsWith('tests/')) {
    return { tags: ['@layer:governance'], reason: '根级跨包治理测试，天然整层 governance' };
  }
  return { tags: ['@layer:unit'], reason: '默认层：未打标测试归入 unit 且必跑' };
}

async function main(argv) {
  let values;
  try {
    values = parseArgs({
      options: {
        out: { type: 'string' },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    }).values;
  } catch (error) {
    console.error(`test:tag 参数解析失败（退出码 ${EXIT_USAGE}）：${error.message}`);
    return EXIT_USAGE;
  }

  const root = getRepoRoot();
  const allFiles = collectAllTestFiles(root);
  const suggestions = [];
  let tagged = 0;
  for (const file of allFiles) {
    const source = readFileSync(join(root, file), 'utf8');
    if (TAG_PATTERN.test(source)) {
      tagged += 1;
      continue;
    }
    const suggestion = suggestTags(file);
    suggestions.push({ file, suggestedTags: suggestion.tags, reason: suggestion.reason });
  }
  const result = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFiles: allFiles.length,
      tagged,
      untagged: suggestions.length,
      coveragePct: allFiles.length === 0 ? 0 : Math.round((tagged / allFiles.length) * 100),
    },
    suggestions,
  };

  const outPath = values.out ? join(root, values.out) : join(root, DEFAULT_TAG_OUT);
  writeJsonFile(outPath, result);

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('test:tag 打标建议（渐进补齐，目标标签覆盖率 ≥ 80%）');
    console.log(
      `  总文件 ${result.summary.totalFiles}，已打标 ${result.summary.tagged}，` +
        `未打标 ${result.summary.untagged}（覆盖率 ${result.summary.coveragePct}%）`,
    );
    for (const suggestion of suggestions.slice(0, 50)) {
      console.log(`  - ${suggestion.file} → ${suggestion.suggestedTags.join(', ')}`);
    }
    if (suggestions.length > 50)
      console.log(`  ...（其余 ${suggestions.length - 50} 条见落盘文件）`);
    console.log(`  建议已落盘: ${outPath}`);
  }
  return EXIT_OK;
}

if (import.meta.main) {
  const exitCode = await main(process.argv.slice(2));
  process.exitCode = exitCode;
}
