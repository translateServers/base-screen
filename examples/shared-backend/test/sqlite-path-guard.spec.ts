import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  assertManagedDirIsolated,
  hostDataDir,
  listDatabaseFiles,
  managedDatasourceDir,
  resolveDatabaseFile,
} from '../src/datasources/datasource-path';

/**
 * A17：受管目录路径守卫。
 *
 * 断言分两类：
 * 1. **拒绝**：`../`、绝对路径、盘符、URL 编码、符号链接出目录、宿主库名、非 `.db`；
 * 2. **不泄露**：所有错误文案里都不出现任何绝对路径（PRD A17/A35 用字符串断言）。
 */

jest.setTimeout(20_000);

let directory = '';

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'base-screen-dspath-'));
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

function rejectionMessage(result: ReturnType<typeof resolveDatabaseFile>): string {
  return result.ok ? '' : result.message;
}

describe('resolveDatabaseFile · 拒绝越界', () => {
  const rejections: readonly string[] = [
    '../screens.db',
    '../../data/screens.db',
    'C:\\Windows\\x.db',
    '/etc/passwd',
    '..%2Fscreens.db',
    'sub/workshop.db',
    '..\\workshop.db',
    '',
    '   ',
    'notes.txt',
    'workshop.db.bak',
    '.db',
  ];

  it.each(rejections)('rejects %s with PATH_NOT_ALLOWED', (name) => {
    const result = resolveDatabaseFile(name, directory);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PATH_NOT_ALLOWED');
    expect(result.message).toBe('只能选择受管目录内的数据库文件。');
  });

  it('rejects host database names even when they are valid file names (A16/A17)', () => {
    writeFileSync(join(directory, 'screens.db'), 'placeholder');
    try {
      for (const name of [
        'screens.db',
        'test.db',
        'smoke-react.db',
        'smoke-vanilla.db',
        'smoke-vue.db',
      ]) {
        const result = resolveDatabaseFile(name, directory);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.code).toBe('PATH_NOT_ALLOWED');
      }
    } finally {
      rmSync(join(directory, 'screens.db'), { force: true });
    }
  });

  it('rejects an absolute path that points inside the managed directory', () => {
    const absolute = join(directory, 'workshop.db');
    writeFileSync(absolute, 'placeholder');
    const result = resolveDatabaseFile(absolute, directory);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('PATH_NOT_ALLOWED');
  });

  it('never leaks an absolute path in the message', () => {
    const absoluteWindowsOrPosix = /[A-Za-z]:[\\/]|^\/(?:usr|etc|tmp|home)\//;
    for (const name of ['../screens.db', 'C:\\Windows\\x.db', '/etc/passwd', directory + '/x.db']) {
      const message = rejectionMessage(resolveDatabaseFile(name, directory));
      expect(message).not.toContain(directory);
      expect(absoluteWindowsOrPosix.test(message)).toBe(false);
    }
  });
});

describe('resolveDatabaseFile · 接受受管目录内的文件', () => {
  it('resolves a managed file to its real path', () => {
    const file = join(directory, 'workshop.db');
    writeFileSync(file, 'placeholder');
    const result = resolveDatabaseFile('workshop.db', directory);
    expect(result.ok).toBe(true);
    if (result.ok === false) return;
    expect(result.name).toBe('workshop.db');
    expect(dirname(result.absolutePath)).toBe(resolve(directory));
  });

  it('reports a missing file separately from a path violation', () => {
    const result = resolveDatabaseFile('missing.db', directory);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_SHAPE');
    expect(result.message).toContain('不存在');
    expect(result.message).not.toContain(directory);
  });

  it('rejects a symlink that points outside the managed directory', () => {
    const outside = mkdtempSync(join(tmpdir(), 'base-screen-outside-'));
    const target = join(outside, 'secret.db');
    writeFileSync(target, 'placeholder');
    const link = join(directory, 'linked.db');
    let linkWorks = false;
    try {
      // Windows 上创建符号链接需要开发者模式/管理员权限，且某些文件系统（含部分沙箱）
      // 会"报告成功但链接并不存在" —— 两种情况下都无法断言，跳过而不是让套件假红。
      symlinkSync(target, link, 'file');
      linkWorks = existsSync(link);
    } catch {
      linkWorks = false;
    }
    try {
      if (linkWorks === false) {
        expect(existsSync(link)).toBe(false);
        return;
      }
      const result = resolveDatabaseFile('linked.db', directory);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('PATH_NOT_ALLOWED');
    } finally {
      rmSync(link, { force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('listDatabaseFiles', () => {
  it('lists only .db files in the managed directory, sorted by name (A16)', () => {
    const nested = join(directory, 'nested');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(directory, 'workshop.db'), 'x');
    writeFileSync(join(directory, 'b.db'), 'x');
    writeFileSync(join(directory, 'a.db'), 'x');
    writeFileSync(join(directory, 'test.db'), 'x');
    writeFileSync(join(directory, 'readme.txt'), 'x');
    writeFileSync(join(nested, 'inner.db'), 'x');

    const names = listDatabaseFiles(directory).map((file) => file.name);
    expect(names).toEqual(['a.db', 'b.db', 'workshop.db']);
    const first = listDatabaseFiles(directory)[0];
    expect(first?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof first?.sizeBytes).toBe('number');
  });

  it('returns an empty list for a missing directory instead of throwing', () => {
    expect(listDatabaseFiles(join(directory, 'nope'))).toEqual([]);
  });
});

describe('受管目录恒等断言（F10）', () => {
  it('refuses the host data/ directory as the managed directory', () => {
    expect(() => {
      assertManagedDirIsolated(hostDataDir());
    }).toThrow(/data/);
    expect(() => {
      assertManagedDirIsolated(directory);
    }).not.toThrow();
  });

  it('defaults to <pkg>/data/datasources, which is not the host data/ directory', () => {
    const managed = managedDatasourceDir();
    expect(managed).not.toBe(hostDataDir());
    expect(managed.endsWith(join('data', 'datasources'))).toBe(true);
  });
});
