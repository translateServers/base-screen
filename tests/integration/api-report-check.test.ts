import { describe, expect, it } from 'vitest';
import { apiReportBaseName, collectApiEntrypoints } from '../../tooling/build/api-reports.mjs';
import {
  consumedChangesetPackages,
  missingChangesetPackages,
  parseChangesetPackages,
  requiredChangesetPackages,
} from '../../tooling/checks/api-changesets.mjs';

describe('API report checks', () => {
  it('assigns stable report names to root and nested public entries', () => {
    expect(apiReportBaseName('sdk', '.')).toBe('sdk');
    expect(apiReportBaseName('sdk', './viewer/auto-register')).toBe('sdk--viewer-auto-register');
  });

  it('collects declaration exports while excluding non-TypeScript entries', () => {
    const entries = collectApiEntrypoints('sample', {
      name: '@base-screen/sample',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
        './nested': { import: { types: './dist/nested.d.ts', default: './dist/nested.js' } },
        './schema.json': { import: './dist/schema.json', default: './dist/schema.json' },
      },
    });

    expect(entries.map(({ exportPath, reportBaseName }) => [exportPath, reportBaseName])).toEqual([
      ['.', 'sample'],
      ['./nested', 'sample--nested'],
    ]);
  });

  it('parses quoted and unquoted Changeset package declarations', () => {
    expect([
      ...parseChangesetPackages(
        "---\n'@base-screen/engine': minor\n@base-screen/sdk: patch\n---\n",
      ),
    ]).toEqual(['@base-screen/engine', '@base-screen/sdk']);
    expect([
      ...parseChangesetPackages("---\nbase-screen: patch\n'@base-screen/sdk': patch\n---\n"),
    ]).toEqual(['base-screen', '@base-screen/sdk']);
    expect(parseChangesetPackages('No frontmatter')).toEqual(new Set());
  });

  it('requires SDK coverage for APIs re-exported through SDK subpaths', () => {
    const required = requiredChangesetPackages([
      'packages/contracts/etc/contracts.api.md',
      'packages/react/etc/react.api.md',
    ]);

    expect([...required]).toEqual([
      '@base-screen/contracts',
      '@base-screen/react',
      '@base-screen/sdk',
    ]);
    expect(
      missingChangesetPackages(required, new Set(['@base-screen/contracts', '@base-screen/sdk'])),
    ).toEqual(['@base-screen/react']);
  });

  it('ignores reports of packages that no longer exist in the workspace', () => {
    expect([
      ...requiredChangesetPackages(['packages/retired-package/etc/retired-package.api.md']),
    ]).toEqual([]);
  });

  it('counts a consumed changeset only when the package version actually moved', () => {
    const source = "---\n'@base-screen/engine': minor\nbase-screen: minor\n---\n\n说明\n";

    // 发布提交：`changeset version` 删掉 changeset 的同时抬高版本 —— 声明已折进版本号。
    expect([...consumedChangesetPackages(source, () => true)]).toEqual([
      '@base-screen/engine',
      'base-screen',
    ]);
    // 普通 PR 删掉 changeset 但没有版本变化 —— 不能靠删文件绕过门禁。
    expect([...consumedChangesetPackages(source, () => false)]).toEqual([]);
    expect([...consumedChangesetPackages(source, (name) => name === 'base-screen')]).toEqual([
      'base-screen',
    ]);
  });
});
