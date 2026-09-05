import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  hash,
  json,
  SKILL,
  tarFiles,
} from '../../.agents/skills/base-screen-integration-workflow/scripts/files.mjs';
import { workflow } from '../../.agents/skills/base-screen-integration-workflow/scripts/workflow.mjs';

export function write(path: string, content: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function tarball(files: Record<string, string | Buffer>) {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(files)) {
    const content = Buffer.from(value);
    const header = Buffer.alloc(512);
    header.write('package/' + name);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(content.length.toString(8).padStart(11, '0') + '\0', 124);
    header.fill(32, 148, 156);
    header.write('0', 156);
    header.write('ustar\0', 257);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    chunks.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

export function makeIntegrationFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'base-screen-integration-'));
  const base = join(dir, 'supplier root');
  const host = join(dir, 'consumer root');
  mkdirSync(base);
  mkdirSync(host);
  const packageFile = 'frontend/vendor/base-screen/base-screen-contracts-0.0.0.tgz';
  const command = (id: string) => ({ cwd: '', tool: 'node', args: [id] });
  const adapter = {
    packages: ['contracts'],
    installations: [
      { cwd: '', packages: ['contracts'] },
      { cwd: 'frontend', packages: ['contracts'] },
    ],
    lockfiles: ['pnpm-lock.yaml', 'frontend/pnpm-lock.yaml'],
    managed: [
      packageFile,
      'frontend/vendor/base-screen/SOURCE.json',
      'pnpm-lock.yaml',
      'frontend/pnpm-lock.yaml',
      'generated',
      '.base-screen/integration-upstream.json',
    ],
    install: ['install'],
    repair: ['repair'],
    derive: ['derive'],
    validate: ['validate'],
    delivery: ['host-test'],
    commands: Object.fromEntries(
      ['install', 'repair', 'derive', 'validate', 'host-test'].map((id) => [id, command(id)]),
    ),
  };
  write(
    join(base, 'package.json'),
    json({ name: 'base-screen-monorepo', packageManager: 'pnpm@11.18.0' }),
  );
  write(join(host, 'package.json'), json({ name: 'fixture-host', packageManager: 'pnpm@11.15.1' }));
  write(
    join(host, '.base-screen/integration.json'),
    json({ role: 'consumer', peer: '../supplier root', adapter: 'scripts/adapter.mjs' }),
  );
  write(join(host, 'scripts/adapter.mjs'), 'export const integrationHost = ' + json(adapter));
  write(join(base, 'packages/contracts/src/index.ts'), 'export const value = 1;\n');
  write(
    join(base, '.base-screen/integration-capabilities.json'),
    json({
      capabilities: [
        {
          id: 'test',
          title: 'Test',
          owner: 'base-screen + host',
          availability: 'current',
          boundary: 'Current document behavior',
          publicApi: ['test'],
          references: ['packages/contracts/src/index.ts'],
          checks: ['workflow'],
        },
      ],
    }),
  );
  write(
    join(host, '.base-screen/integration-consumer.json'),
    json({
      capabilities: [
        {
          id: 'test',
          status: 'integrated',
          references: ['scripts/adapter.mjs'],
          focused: ['host-test'],
          delivery: [],
        },
      ],
      proposals: [{ id: 'event-style', state: 'needs-design', capabilities: ['test'] }],
    }),
  );
  write(join(host, 'pnpm-lock.yaml'), 'old root\n');
  write(join(host, 'frontend/pnpm-lock.yaml'), 'old frontend\n');
  write(join(host, 'generated/schema.json'), '{"old":true}\n');
  write(join(host, '.agents/skills/business/SKILL.md'), 'untouched business skill');
  cpSync(resolve(SKILL), join(base, SKILL), { recursive: true });
  for (const root of [base, host]) {
    write(join(root, '.gitignore'), 'node_modules/\ndist/\n.base-screen/local/\n');
    for (const args of [
      ['init', '-q'],
      ['config', 'core.autocrlf', 'false'],
      ['config', 'user.name', 'Fixture'],
      ['config', 'user.email', 'fixture@example.invalid'],
      ['add', '.'],
      ['commit', '-qm', 'fixture'],
    ])
      execFileSync('git', ['-C', root, ...args], { stdio: 'ignore', windowsHide: true });
  }
  const calls: string[] = [];
  let failing: string | undefined;
  let hook: ((id: string) => void) | undefined;
  const run = async (cmd: { id: string; args: string[] }, _log: string) => {
    calls.push(cmd.id);
    hook?.(cmd.id);
    if (cmd.id === 'pack-contracts') {
      const destination = cmd.args.at(-1) as string;
      write(
        join(destination, 'base-screen-contracts-0.0.0.tgz'),
        tarball({
          'package.json': json({ name: '@base-screen/contracts', version: '0.0.0' }),
          'dist/index.js': readFileSync(join(base, 'packages/contracts/src/index.ts')),
        }),
      );
    }
    if (cmd.id === 'install' || cmd.id === 'repair') {
      const packagePath = join(host, packageFile);
      if (cmd.id === 'install') {
        write(join(host, 'pnpm-lock.yaml'), 'root ' + hash(readFileSync(packagePath)));
        write(join(host, 'frontend/pnpm-lock.yaml'), 'frontend ' + hash(readFileSync(packagePath)));
      }
      if (cmd.id === 'install') {
        for (const [file, content] of tarFiles(packagePath)) {
          for (const cwd of ['', 'frontend'])
            write(join(host, cwd, 'node_modules/@base-screen/contracts', file), content);
        }
      }
    }
    if (cmd.id === 'derive') write(join(host, 'generated/schema.json'), '{"new":true}\n');
    if (failing === cmd.id) throw new Error('Injected failure: ' + cmd.id);
  };
  const invoke = (args: string[], cwd = base) =>
    workflow([...args, '--base', base, '--host', host], { cwd, run });
  return {
    dir,
    base,
    host,
    calls,
    adapter,
    packageFile,
    invoke,
    run,
    failAt: (id?: string) => {
      failing = id;
    },
    hook: (fn?: (id: string) => void) => {
      hook = fn;
    },
    async begin() {
      await invoke(['bootstrap']);
      return invoke([
        'begin',
        'work',
        '--capability',
        'test',
        '--route',
        'both',
        '--decision',
        'Supplier API and host consumption',
      ]);
    },
    cleanup() {
      if (
        dirname(resolve(dir)) !== resolve(tmpdir()) ||
        !dir.includes('base-screen-integration-')
      ) {
        throw new Error('Unexpected fixture cleanup target');
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
