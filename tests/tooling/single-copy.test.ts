import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- 工具脚本为 .mjs，无类型声明；测试只消费它的导出。
import {
  assertSingleCopy,
  findPackageCopies,
  readConsumerRange,
  satisfiesCaret,
} from '../../tooling/verification/single-copy.mjs';

function writePackage(dir: string, version: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'echarts', version }));
}

describe('satisfiesCaret', () => {
  it('accepts versions at or above the caret floor within the same major', () => {
    expect(satisfiesCaret('6.1.0', '^6.1.0')).toBe(true);
    expect(satisfiesCaret('6.2.3', '^6.1.0')).toBe(true);
    expect(satisfiesCaret('6.1.4', '^6.1.0')).toBe(true);
  });

  it('rejects lower minors, lower patches and other majors', () => {
    expect(satisfiesCaret('6.0.9', '^6.1.0')).toBe(false);
    expect(satisfiesCaret('6.1.0', '^6.1.1')).toBe(false);
    expect(satisfiesCaret('5.6.0', '^6.1.0')).toBe(false);
    expect(satisfiesCaret('7.0.0', '^6.1.0')).toBe(false);
  });

  it('fails closed on ranges it does not model', () => {
    expect(() => satisfiesCaret('6.1.0', '~6.1.0')).toThrow(/UNSUPPORTED_RANGE_OR_VERSION/);
    expect(() => satisfiesCaret('6.1.0', 'latest')).toThrow(/UNSUPPORTED_RANGE_OR_VERSION/);
  });
});

describe('assertSingleCopy', () => {
  let consumer: string;

  beforeEach(() => {
    consumer = mkdtempSync(join(tmpdir(), 'single-copy-test-'));
  });

  afterEach(() => {
    rmSync(consumer, { recursive: true, force: true });
  });

  it('passes with one top-level copy inside the declared range', () => {
    writePackage(join(consumer, 'node_modules', 'echarts'), '6.1.0');
    expect(() => assertSingleCopy(consumer, 'echarts', '^6.1.0')).not.toThrow();
  });

  it('fails when the host and plugin each installed a copy (pnpm virtual store)', () => {
    writePackage(
      join(consumer, 'node_modules', '.pnpm', 'echarts@6.1.0', 'node_modules', 'echarts'),
      '6.1.0',
    );
    writePackage(
      join(consumer, 'node_modules', '.pnpm', 'echarts@6.2.0', 'node_modules', 'echarts'),
      '6.2.0',
    );
    expect(() => assertSingleCopy(consumer, 'echarts', '^6.1.0')).toThrow(
      /ECHARTS_TARBALL_DUPLICATE_COPIES: expected 1 copy, found 2/,
    );
  });

  it('fails when the single copy is outside the declared range', () => {
    writePackage(join(consumer, 'node_modules', 'echarts'), '5.6.0');
    expect(() => assertSingleCopy(consumer, 'echarts', '^6.1.0')).toThrow(
      /ECHARTS_TARBALL_VERSION_OUT_OF_RANGE: 5.6.0 not in \^6.1.0/,
    );
  });

  it('counts a symlinked top-level entry and its store target only once', () => {
    const store = join(
      consumer,
      'node_modules',
      '.pnpm',
      'echarts@6.1.0',
      'node_modules',
      'echarts',
    );
    writePackage(store, '6.1.0');
    mkdirSync(join(consumer, 'node_modules'), { recursive: true });
    symlinkSync(store, join(consumer, 'node_modules', 'echarts'), 'junction');
    expect(findPackageCopies(consumer, 'echarts')).toHaveLength(1);
    expect(() => assertSingleCopy(consumer, 'echarts', '^6.1.0')).not.toThrow();
  });

  it('reports zero copies as a failure', () => {
    mkdirSync(join(consumer, 'node_modules'), { recursive: true });
    expect(() => assertSingleCopy(consumer, 'echarts', '^6.1.0')).toThrow(
      /ECHARTS_TARBALL_DUPLICATE_COPIES: expected 1 copy, found 0/,
    );
  });
});

describe('readConsumerRange', () => {
  it('reads the range the consumer declares and fails when it is missing', () => {
    const consumer = mkdtempSync(join(tmpdir(), 'single-copy-range-'));
    try {
      writeFileSync(
        join(consumer, 'package.json'),
        JSON.stringify({ dependencies: { echarts: '^6.1.0' } }),
      );
      expect(readConsumerRange(consumer, 'echarts')).toBe('^6.1.0');
      expect(() => readConsumerRange(consumer, 'vue')).toThrow(/CONSUMER_DEPENDENCY_MISSING: vue/);
    } finally {
      rmSync(consumer, { recursive: true, force: true });
    }
  });
});
