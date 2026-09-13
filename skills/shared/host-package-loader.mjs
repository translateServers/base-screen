import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 两个宿主 Skill 生成器共用的公开包加载器。
 *
 * 解析顺序刻意如此：**先按宿主 workspace 解析**（`BASE_SCREEN_HOST_WORKSPACE_ROOT`、
 * cwd、cwd/frontend），失败才回退到调用方给出的仓库内 `packages` 下的 dist 路径。
 *
 * 这条顺序让工具包能在**仓库外**运行——外部宿主只要在自己的 workspace 里装了同批次的
 * Base Screen 公开包即可，不要求克隆 Base Screen 仓库。若两条路径都失败，报错必须同时
 * 说清前置条件与两种修法，否则接入方只会看到一句 "Cannot load X" 而无从下手。
 */

export function resolveHostPackageEntry(packageName) {
  const roots = [
    process.env.BASE_SCREEN_HOST_WORKSPACE_ROOT,
    process.cwd(),
    join(process.cwd(), 'frontend'),
  ].filter((root) => typeof root === 'string' && root.length > 0);
  const seen = new Set();
  for (const root of roots) {
    const workspaceRoot = resolve(root);
    if (seen.has(workspaceRoot)) continue;
    seen.add(workspaceRoot);
    try {
      const require = createRequire(join(workspaceRoot, 'package.json'));
      return require.resolve(packageName, { conditions: new Set(['node', 'import']) });
    } catch {
      // Try the next workspace root, then let the caller fall back to the checkout.
    }
  }
  throw new Error(`Cannot resolve ${packageName} from the host workspace.`);
}

export async function loadBaseScreenModule(packageName, fallback) {
  let hostError;
  try {
    const entry = resolveHostPackageEntry(packageName);
    return await import(pathToFileURL(entry).href);
  } catch (error) {
    hostError = error;
  }
  try {
    return await import(pathToFileURL(fallback).href);
  } catch {
    throw new Error(
      `Cannot load ${packageName}. The host Skill kit needs the public Base Screen packages available to Node. Fix by either:\n` +
        `  1. installing the same-batch @base-screen/* packages into the host workspace (recommended for external hosts), then re-run; or\n` +
        `  2. running this kit from a Base Screen checkout that has built packages/*/dist.\n` +
        `Host resolution error: ${hostError instanceof Error ? hostError.message : String(hostError)}`,
    );
  }
}
