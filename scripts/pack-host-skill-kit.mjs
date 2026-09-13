import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * 把宿主 Skill 工具包（`skills/`）打成可交付制品。
 *
 * 存在的理由：`skills/` 只存在于源码仓库里，任何包 tarball 都不携带它，于是外部宿主想用
 * 智能体接入就必须先克隆 Base Screen 仓库。这个脚本把工具包摊平为一份自包含目录 + 一个
 * tarball，宿主侧解包后直接运行，不需要仓库其余部分。
 *
 * 与 docs/host-skill-manuals/06 的哲学一致：工具包只做"生成 Skill / 校验快照"，不含运行时
 * 物料加载、不联网。生成器解析 `@base-screen/*` 公开包时**优先从宿主 workspace 解析**，
 * 所以制品本身不内嵌这些包，只要求宿主装了同批次包。
 */

const SOURCE_SKILLS_ROOT = 'skills';
const SOURCE_MANUALS_ROOT = 'docs/host-skill-manuals';
const KIT_FILES = [
  'create-base-screen-host-skill',
  'create-base-screen-host-material-skill',
  'manage-base-screen-host-skills',
  'shared',
];

function listFiles(root, relativePath = '') {
  const absolute = relativePath === '' ? root : join(root, relativePath);
  const result = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const next = relativePath === '' ? entry.name : `${relativePath}/${entry.name}`;
    if (entry.isDirectory()) result.push(...listFiles(root, next));
    else result.push(next);
  }
  return result;
}

function digestKit(root) {
  const hash = createHash('sha256');
  const files = listFiles(root).sort();
  for (const name of files) {
    hash.update(name);
    hash.update(readFileSync(join(root, name)));
  }
  return { digest: hash.digest('hex'), fileCount: files.length };
}

function parseArgs(argv) {
  const options = { outDir: 'dist-host-skill-kit' };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--out') {
      options.outDir = argv[++index];
      if (options.outDir === undefined) throw new Error('--out requires a value.');
    } else if (argument !== '--help') {
      throw new Error(`Unknown argument ${argument}.`);
    }
  }
  return options;
}

function readmeText() {
  return `# Base Screen host Skill kit

Installs the host-side Base Screen Skills into a host repository. This is a standalone copy of
the \`skills/\` tree plus a manifest; it does not need the rest of the Base Screen repository.

## Prerequisite

The generators type-check host snapshots with the public Base Screen packages, so the **host
workspace must have the same-batch \`@base-screen/contracts\`, \`@base-screen/core\`,
\`@base-screen/plugin-core\` and \`@base-screen/plugin-sdk\` installed**; add
\`@base-screen/react\` or \`@base-screen/vue\` only when authoring React or Vue materials.
\`plugin-sdk\` is needed even for native materials because the generated material Skill tells
authors to call \`createMaterialDefinition\` from it. If a package is missing, the generator fails
with a message telling you to install it. This is deliberate: the kit never bundles or downloads
Base Screen packages itself.

## Install

From the host repository root:

\`\`\`text
node <kit>/skills/manage-base-screen-host-skills/scripts/vendor-host-skill-kit.mjs \\
  --host <host-root> --package-manager pnpm --snapshot-script export:base-screen-skill-context
\`\`\`

The command is idempotent and also refreshes both generated Skills. Afterwards run
\`pnpm base-screen:skills verify\` in the host repository; it is offline and needs no credentials.

See \`docs/host-skill-manuals/\` in this kit for the exporter contract, the snapshot reference and
troubleshooting: \`01-quick-start\`, \`02-daily-sync\`, \`03-configuration-reference\`,
\`04-troubleshooting\`, \`05-xj-datahub-landing\`, \`06-online-material-mcp\`.
`;
}

/**
 * 用 Node 内置 zlib 打 tar.gz，不 shell 出去调 `tar`：Windows/MSYS 下系统 tar 不认
 * Windows 绝对路径（会报 `Cannot connect to C:`），而这一步只是把目录无损打包，用
 * 最小 tar 头 + gzip 即可，且没有平台 PATH 依赖。
 */
function writeTarGz(outFile, root, relativeNames) {
  const blocks = [];
  for (const relativeName of relativeNames) {
    const absolute = join(root, relativeName);
    if (statSync(absolute).isDirectory()) continue;
    const content = readFileSync(absolute);
    const header = Buffer.alloc(512);
    let name = relativeName.split('\\').join('/');
    // USTAR 的 name 字段只有 100 字节；更深的路径必须拆进 prefix 字段（155 字节），
    // 否则工具包里的 assets/... 长路径无法入档。
    let prefix = '';
    if (Buffer.byteLength(name) > 100) {
      let splitAt = -1;
      for (let index = name.length - 1; index >= 0; index--) {
        if (name[index] !== '/') continue;
        if (Buffer.byteLength(name.slice(index + 1)) <= 100) splitAt = index;
        break;
      }
      if (splitAt <= 0 || Buffer.byteLength(name.slice(splitAt + 1)) > 100)
        throw new Error(`Tar entry path cannot be split into name/prefix: ${name}`);
      prefix = name.slice(0, splitAt);
      name = name.slice(splitAt + 1);
      if (Buffer.byteLength(prefix) > 155) throw new Error(`Tar entry prefix too long: ${prefix}`);
    }
    header.write(name, 0, 100, 'utf8');
    header.write('0000644\0', 100, 8, 'ascii'); // mode
    header.write('0000000\0', 108, 8, 'ascii'); // uid
    header.write('0000000\0', 116, 8, 'ascii'); // gid
    header.write(`${content.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write('00000000000\0', 136, 12, 'ascii'); // mtime
    header.write('        ', 148, 8, 'ascii'); // checksum placeholder
    header.write('0', 156, 1, 'ascii'); // typeflag: regular file
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    if (prefix !== '') header.write(prefix, 345, 155, 'utf8');
    let checksum = 0;
    for (const byte of header) checksum += byte;
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blocks.push(header, content);
    const padding = (512 - (content.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024)); // two zero blocks terminate the archive
  writeFileSync(outFile, gzipSync(Buffer.concat(blocks), { level: 9 }));
}

function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  if (!existsSync(SOURCE_SKILLS_ROOT)) {
    throw new Error(`Run this from the repository root; missing ${SOURCE_SKILLS_ROOT}.`);
  }
  const kitName = 'base-screen-host-skill-kit';
  const staging = mkdtempSync(join(tmpdir(), `${kitName}-`));
  const kitRoot = join(staging, kitName);
  try {
    mkdirSync(join(kitRoot, 'skills'), { recursive: true });
    for (const name of KIT_FILES) {
      cpSync(join(SOURCE_SKILLS_ROOT, name), join(kitRoot, 'skills', name), { recursive: true });
    }
    // 宿主手册随 kit 分发：外部宿主没有 Base Screen 仓库，README 若只指向 docs/ 就等于没给。
    // 这 6 份是接入/同步/配置/排障/落地/MCP 的全部消费者文档，体积很小。
    if (existsSync(SOURCE_MANUALS_ROOT)) {
      mkdirSync(join(kitRoot, 'docs', 'host-skill-manuals'), { recursive: true });
      cpSync(SOURCE_MANUALS_ROOT, join(kitRoot, 'docs', 'host-skill-manuals'), { recursive: true });
    }
    const { digest, fileCount } = digestKit(join(kitRoot, 'skills'));
    writeFileSync(
      join(kitRoot, 'KIT-MANIFEST.json'),
      `${JSON.stringify(
        {
          generator: 'base-screen-host-skill-kit',
          sourceRevision: process.env.BASE_SCREEN_KIT_REVISION ?? 'working-tree',
          skillsDigest: digest,
          fileCount,
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(join(kitRoot, 'README.md'), readmeText());

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const tarball = join(outDir, `${kitName}.tgz`);
    // listFiles(staging) 已包含 kitName 前缀；归档内路径形如
    // `base-screen-host-skill-kit/skills/...`，解包即得到工具包根目录。
    const entries = listFiles(staging).sort();
    writeTarGz(tarball, staging, entries);
    cpSync(kitRoot, join(outDir, kitName), { recursive: true });
    console.log(`Packed ${fileCount} kit files -> ${tarball}`);
    console.log(`skillsDigest: ${digest}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main();
