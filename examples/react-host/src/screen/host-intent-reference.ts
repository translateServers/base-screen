import type {
  ScreenIntentReferenceCatalogPort,
  ScreenIntentReferenceOption,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { api as HostApi } from '../lib/api.js';
import { resolveApiBase } from '../lib/api-base.js';
import type { HostAssetShape } from '../types.js';

/**
 * 意图引用目录：把「素材」与「数据集」拍平成引擎要的一份可选清单。
 *
 * 引擎只认 `kind` 与展示字段，不发请求、不解析 id 语义；这里负责把两类实体取回来、
 * 拼上展示用的副标题与缩略图地址。两类各自独立失败——素材接口挂了不该让数据集也消失。
 */
export interface HostIntentReferenceCatalogOptions {
  readonly api: Pick<typeof HostApi, 'listAssets' | 'listDatasets'>;
  readonly screenId: string;
  readonly logger?: { warn: (message: string, detail?: unknown) => void };
}

const DATASET_LIMIT = 50;

function assetOption(asset: HostAssetShape): ScreenIntentReferenceOption {
  const size = Math.max(1, Math.round(asset.byteSize / 1024));
  return {
    kind: 'asset',
    id: asset.id,
    label: asset.name,
    note: `${size} KB`,
    // 素材没有缩略图端点，直接拿内容地址按 CSS 缩小显示。
    thumbnailUrl: `${resolveApiBase()}${asset.contentPath}`,
  };
}

export function createHostIntentReferenceCatalog(
  options: HostIntentReferenceCatalogOptions,
): ScreenIntentReferenceCatalogPort {
  return {
    async catalog(request): Promise<ScreenParseResult<readonly ScreenIntentReferenceOption[]>> {
      const items: ScreenIntentReferenceOption[] = [];
      const wants = new Set(request.kinds);

      if (wants.has('asset')) {
        // 契约里的 signal 是引擎侧的窄类型，不能直接当 fetch 的 AbortSignal 用：
        // 目录只在打开选择器时拉一次，跟着选择器关闭作废即可。
        const assets = await options.api.listAssets({ screenId: options.screenId });
        if (assets.ok) items.push(...assets.data.assets.map(assetOption));
        else options.logger?.warn('intent reference assets unavailable', assets.error);
      }

      if (wants.has('dataset')) {
        const datasets = await options.api.listDatasets({ limit: DATASET_LIMIT });
        if (datasets.ok) {
          for (const item of datasets.data.items) {
            items.push({
              kind: 'dataset',
              id: item.datasetId,
              label: item.name,
              ...(item.description === null ? {} : { note: item.description }),
              ...(item.groupId === undefined ? {} : { groupId: item.groupId }),
            });
          }
        } else {
          options.logger?.warn('intent reference datasets unavailable', datasets.error);
        }
      }

      return { ok: true, value: items, diagnostics: [] };
    },
  };
}
