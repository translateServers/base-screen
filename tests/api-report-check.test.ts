import { describe, expect, it } from 'vitest';
import { apiReportBaseName, collectApiEntrypoints } from '../scripts/api-reports.mjs';
import {
  missingChangesetPackages,
  parseChangesetPackages,
  requiredChangesetPackages,
} from '../scripts/check-api-changesets.mjs';

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
});
