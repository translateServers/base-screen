import type {
  ScreenIntentReferenceCatalogPort,
  ScreenIntentReferenceOption,
  ScreenParseResult,
} from '@base-screen/contracts';
import type { api as HostApi } from '../lib/api.js';
import { resolveApiBase } from '../lib/api-base.js';
import type { HostAssetShape } from '../types.js';

/**
 * 意图引用目录：把「素材」与「数据集」拍平成引擎要的一份分页清单。
 *
 * 引擎从不要求全量：它带 `query` / `limit` / `offset` 来问，这里按页回答。
 * 两类各自独立失败——素材接口挂了不该让数据集也消失。
 */
export interface HostIntentReferenceCatalogOptions {
  readonly api: Pick<typeof HostApi, 'listAssets' | 'listDatasets'>;
  readonly screenId: string;
  readonly logger?: { warn: (message: string, detail?: unknown) => void };
}

/** 与引擎侧 `INTENT_REFERENCE_PAGE` 保持一致；请求里没带时用它兜底。 */
const DEFAULT_PAGE = 20;

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
    async catalog(
      request,
    ): Promise<
      ScreenParseResult<{ items: readonly ScreenIntentReferenceOption[]; total: number }>
    > {
      const limit = request.limit ?? DEFAULT_PAGE;
      const offset = Math.max(0, request.offset ?? 0);
      const query = request.query?.trim() ?? '';
      const wants = new Set(request.kinds);
      const items: ScreenIntentReferenceOption[] = [];
      let total = 0;

      if (wants.has('asset')) {
        // 素材走服务端分页 + 名称搜索：`/api/assets?q=&limit=&offset=`。
        const assets = await options.api.listAssets({
          screenId: options.screenId,
          ...(query === '' ? {} : { q: query }),
          limit,
          offset,
        });
        if (assets.ok) {
          items.push(...assets.data.assets.map(assetOption));
          // 后端还没升级到这个版本时不带 total：退化成「本页条数」，不影响翻页判断。
          total += assets.data.total ?? assets.data.assets.length;
        } else {
          options.logger?.warn('intent reference assets unavailable', assets.error);
        }
      }

      if (wants.has('dataset')) {
        // 数据集目录接口只有 query + limit，没有 offset：按 offset+limit 取一窗再就地切片。
        // total 因此只代表「本窗口内可见的条数」，用来判断还有没有下一页足够。
        const datasets = await options.api.listDatasets({
          ...(query === '' ? {} : { query }),
          limit: Math.min(200, offset + limit),
        });
        if (datasets.ok) {
          const window = datasets.data.items;
          total += window.length;
          for (const item of window.slice(offset, offset + limit)) {
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

      return { ok: true, value: { items, total }, diagnostics: [] };
    },
  };
}
