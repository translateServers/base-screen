import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';

/**
 * 把单包分发所需的声明文件滚成自包含产物。
 *
 * 内部包只作为 devDependencies 参与构建、不再发布，因此 dist 里的 `.d.ts` 不能留下
 * `from '@base-screen/*'`——宿主装不到那些包。逐入口用 API Extractor 的 dtsRollup 内联，
 * 并强制校验结果没有残留内部引用，否则直接失败，避免打出「能安装但类型解析不了」的包。
 */
const packageFolder = process.cwd();
const manifest = JSON.parse(readFileSync(join(packageFolder, 'package.json'), 'utf8'));
const bundledPackages = Object.keys(manifest.devDependencies ?? {}).filter((name) =>
  name.startsWith('@base-screen/'),
);
const tempFolder = mkdtempSync(join(tmpdir(), 'base-screen-dts-'));
const failures = [];

function typesTarget(target) {
  return typeof target === 'object' && target !== null && typeof target.types === 'string'
    ? target.types
    : undefined;
}

const entries = Object.entries(manifest.exports ?? {})
  .map(([exportPath, target]) => ({ exportPath, types: typesTarget(target) }))
  .filter((entry) => entry.types !== undefined && entry.types.endsWith('.d.ts'));

if (entries.length === 0) {
  throw new Error('ROLLUP_DTS_NO_ENTRIES: package exports 中没有可滚动的 .d.ts');
}

try {
  for (const entry of entries) {
    const entryPath = resolve(packageFolder, entry.types);
    const outputName = entry.types.replace(/^\.\/dist\//, '').replaceAll('/', '-');
    const untrimmedFilePath = join(tempFolder, outputName);

    const config = ExtractorConfig.prepare({
      configObject: {
        projectFolder: packageFolder,
        mainEntryPointFilePath: entryPath,
        bundledPackages,
        compiler: { tsconfigFilePath: join(packageFolder, 'tsconfig.build.json') },
        apiReport: { enabled: false },
        docModel: { enabled: false },
        tsdocMetadata: { enabled: false },
        dtsRollup: { enabled: true, untrimmedFilePath },
      },
      configObjectFullPath: undefined,
      packageJsonFullPath: join(packageFolder, 'package.json'),
    });

    const result = Extractor.invoke(config, {
      localBuild: true,
      showVerboseMessages: false,
      messageCallback: (message) => {
        if (message.logLevel === 'error') {
          failures.push(`${entry.exportPath}: [${message.messageId}] ${message.text}`);
        }
        message.handled = true;
      },
    });

    if (!result.succeeded) {
      failures.push(`${entry.exportPath}: Extractor.invoke failed`);
      continue;
    }

    const rolled = readFileSync(untrimmedFilePath, 'utf8');
    const leaked = [...rolled.matchAll(/from '(@base-screen\/[^']+)'/g)].map((match) => match[1]);
    if (leaked.length > 0) {
      failures.push(`${entry.exportPath}: 声明仍引用内部包 ${[...new Set(leaked)].join(', ')}`);
      continue;
    }

    renameSync(untrimmedFilePath, entryPath);
    const mapPath = `${entryPath}.map`;
    if (existsSync(mapPath)) rmSync(mapPath, { force: true });
  }
} finally {
  rmSync(tempFolder, { force: true, recursive: true });
}

if (failures.length > 0) {
  throw new Error(`ROLLUP_DTS_FAILED:\n  ${failures.join('\n  ')}`);
}

console.log(`rolled ${entries.length} declaration entries in ${manifest.name ?? packageFolder}`);
