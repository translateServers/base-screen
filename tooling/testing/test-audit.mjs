#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { detectAll } from '../lib/audit-rules.mjs';
import { getRepoRoot } from '../lib/scope-graph.mjs';
import {
  createAuditReport,
  DEFAULT_AUDIT_OUT,
  readJsonFile,
  writeJsonFile,
  writeTextFile,
} from '../lib/scope-report.mjs';

export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_SCOPE_ERROR = 3;

const PR_TEMPLATE_PATH = 'tooling/fixtures/test-cleanup-pr-template.md';

function zoneLabel(zone) {
  if (zone === 'high') return '高置信候选';
  if (zone === 'observe') return '观察区';
  return '仅记录';
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# 冗余测试审计报告（test:audit）');
  lines.push('');
  lines.push(`- 生成时间：${report.generatedAt}`);
  lines.push(`- 扫描测试文件总数：${report.summary.totalTestFiles}`);
  lines.push(`- 无用测试候选：${report.summary.unusedCount}`);
  lines.push(`- 重复测试组：${report.summary.duplicateGroupCount}`);
  lines.push(`- 过期测试候选：${report.summary.staleCount}（占比 ${report.summary.staleRate}）`);
  lines.push('');
  lines.push('## 无用测试候选（文件级综合分 ≥ 0.7 进入高置信候选区）');
  lines.push('');
  if (report.unused.length === 0) {
    lines.push('（本轮无候选）');
  } else {
    lines.push('| 文件 | 规则 | 综合分 | 置信区 | 证据 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const entry of report.unused) {
      lines.push(
        `| ${entry.file} | ${entry.rule} | ${entry.score} | ${zoneLabel(entry.zone)} | ${entry.detail.replaceAll('|', '\\|')} |`,
      );
    }
  }
  lines.push('');
  lines.push('## 重复测试组');
  lines.push('');
  if (report.duplicates.length === 0) {
    lines.push('（本轮无重复组）');
  } else {
    for (const [index, group] of report.duplicates.entries()) {
      lines.push(
        `${index + 1}. 相似度 ${group.similarity}（${group.basis}）：${group.files.join(' / ')}`,
      );
    }
  }
  lines.push('');
  lines.push('## 过期测试候选');
  lines.push('');
  if (report.stale.length === 0) {
    lines.push('（本轮无候选）');
  } else {
    lines.push('| 文件 | 规则 | 综合分 | 置信区 | 证据 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const entry of report.stale) {
      lines.push(
        `| ${entry.file} | ${entry.rule} | ${entry.score} | ${zoneLabel(entry.zone)} | ${entry.detail.replaceAll('|', '\\|')} |`,
      );
    }
  }
  lines.push('');
  lines.push(
    '> 清理流程：候选需人工逐条确认；确认后 `pnpm test:audit --emit-pr` 渲染清理 PR 模板，',
  );
  lines.push('> 人工提 PR 并通过 verify:m0 全量门禁后合入。审计不自动删除任何测试文件。');
  lines.push('');
  return lines.join('\n');
}

function renderCleanupPr(report) {
  const template = readFileSync(join(getRepoRoot(), PR_TEMPLATE_PATH), 'utf8');
  const high = report.unused.filter((entry) => entry.zone === 'high').length;
  const observe = report.unused.filter((entry) => entry.zone === 'observe').length;
  const record = report.unused.filter((entry) => entry.zone === 'record').length;
  const candidateRows = [...report.unused, ...report.stale]
    .map(
      (entry) =>
        `| ${entry.file} | ${entry.rule} | ${entry.score} | ${zoneLabel(entry.zone)} | ${entry.detail.replaceAll('|', '\\|')} |`,
    )
    .join('\n');
  return template
    .replaceAll('{{GENERATED_AT}}', report.generatedAt)
    .replaceAll('{{TOTAL_TEST_FILES}}', String(report.summary.totalTestFiles))
    .replaceAll('{{HIGH_COUNT}}', String(high))
    .replaceAll('{{OBSERVE_COUNT}}', String(observe))
    .replaceAll('{{RECORD_COUNT}}', String(record))
    .replaceAll('{{CANDIDATE_TABLE}}', candidateRows || '（本轮无候选）')
    .replaceAll('{{BEFORE_FILES}}', String(report.summary.totalTestFiles))
    .replaceAll('{{AFTER_FILES}}', String(report.summary.totalTestFiles - high))
    .replaceAll('{{BEFORE_RESULT}}', '以最近一次全量门禁结果为准')
    .replaceAll('{{AFTER_RESULT}}', '清理 PR 合入前由 verify:m0 验证');
}

async function main(argv) {
  let values;
  try {
    values = parseArgs({
      options: {
        out: { type: 'string' },
        'emit-pr': { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    }).values;
  } catch (error) {
    console.error(`test:audit 参数解析失败（退出码 ${EXIT_USAGE}）：${error.message}`);
    return EXIT_USAGE;
  }

  const root = getRepoRoot();
  const config = readJsonFile(join(root, 'tooling', 'testing', 'test-scope.config.json'));
  if (!config) {
    console.error(
      `test:audit 配置缺失（退出码 ${EXIT_SCOPE_ERROR}）：tooling/testing/test-scope.config.json`,
    );
    return EXIT_SCOPE_ERROR;
  }

  let audit;
  try {
    audit = detectAll(root, config);
  } catch (error) {
    console.error(`test:audit 审计计算异常（退出码 ${EXIT_SCOPE_ERROR}）：${error.message}`);
    return EXIT_SCOPE_ERROR;
  }

  const report = createAuditReport(audit);
  const reportOut = values.out ? join(root, values.out) : join(root, DEFAULT_AUDIT_OUT);
  writeJsonFile(reportOut, report);
  const markdownOut = reportOut.replace(/\.json$/, '.md');
  writeTextFile(markdownOut, renderMarkdown(report));

  if (values['emit-pr']) {
    const prOut = markdownOut.replace(/\.md$/, '-cleanup-pr.md');
    writeTextFile(prOut, renderCleanupPr(report));
    if (!values.json) console.log(`清理 PR 草稿已落盘: ${prOut}`);
  }

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('test:audit 摘要');
    console.log(`  测试文件总数: ${report.summary.totalTestFiles}`);
    console.log(
      `  无用候选: ${report.summary.unusedCount}（高置信 ${report.unused.filter((entry) => entry.zone === 'high').length}）`,
    );
    console.log(`  重复组: ${report.summary.duplicateGroupCount}`);
    console.log(`  过期候选: ${report.summary.staleCount}`);
    console.log(`  报告已落盘: ${reportOut}（同名 .md 为人类摘要）`);
  }
  return EXIT_OK;
}

if (import.meta.main) {
  const exitCode = await main(process.argv.slice(2));
  process.exitCode = exitCode;
}
